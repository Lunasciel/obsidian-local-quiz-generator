import { Question, Quiz } from "../utils/types";
import {
	ConsensusSettings,
	QuestionConsensusTrail,
	ConsensusRound,
	ModelConsensusResponse,
	AnonymizedAnswer,
	PartialConsensusResult,
	PartialResultCallback,
} from "./types";
import { ModelCoordinator, ModelResponse } from "./modelCoordinator";
import { compareAnswers, getQuestionType } from "./answerComparator";
import { EarlyTerminationAnalyzer } from "./earlyTermination";
import { PerformanceMonitor } from "./performanceMonitor";

/**
 * Result of checking consensus for a set of responses
 */
export interface ConsensusCheck {
	/** Whether consensus was reached */
	reached: boolean;

	/** Agreement percentage (0-1) */
	agreementPercentage: number;

	/** The consensus answer (if reached) */
	consensusAnswer?: any;

	/** IDs of models that agreed with consensus */
	agreeingModels: string[];

	/** IDs of models that disagreed */
	disagreeingModels: string[];

	/** Details about the consensus check */
	details: string;
}

/**
 * Grouped responses for a single question from multiple models
 */
export interface QuestionResponseSet {
	/** The question being evaluated */
	question: Question;

	/** Question index in the quiz */
	questionIndex: number;

	/** Responses from each model for this question */
	modelResponses: ModelConsensusResponse[];
}

/**
 * Result of a consensus round
 */
export interface ConsensusRoundResult {
	/** Whether consensus was reached in this round */
	consensusReached: boolean;

	/** Updated model responses after this round */
	modelResponses: ModelConsensusResponse[];

	/** Consensus check result */
	consensusCheck: ConsensusCheck;

	/** Duration of this round (milliseconds) */
	duration: number;
}

/**
 * Final result for a single question after all consensus rounds
 */
export interface ConsensusQuestionResult {
	/** The final question with consensus answer */
	question: Question;

	/** Full consensus trail for transparency */
	trail: QuestionConsensusTrail;
}

/**
 * Implements the iterative consensus algorithm for multi-model quiz validation.
 *
 * The ConsensusEngine is responsible for:
 * - Grouping and comparing answers from multiple models
 * - Detecting when consensus threshold is met
 * - Executing iterative re-evaluation rounds when needed
 * - Preventing circular reasoning patterns
 * - Calculating adaptive model weights based on performance
 */
export class ConsensusEngine {
	/** Consensus configuration settings */
	private readonly settings: ConsensusSettings;

	/** Model coordinator for invoking models */
	private readonly modelCoordinator: ModelCoordinator;

	/** Model accuracy history for adaptive weighting */
	private modelAccuracyHistory: Map<string, number[]> = new Map();

	/** Early termination analyzer */
	private readonly earlyTerminationAnalyzer: EarlyTerminationAnalyzer = new EarlyTerminationAnalyzer();

	/** Performance monitor (optional) */
	private performanceMonitor?: PerformanceMonitor;

	/** Configuration for adaptive weighting */
	private readonly weightingConfig = {
		/** Minimum weight a model can have */
		minWeight: 0.3,
		/** Maximum weight a model can have */
		maxWeight: 2.0,
		/** Decay rate for disagreeing models (0-1) */
		decayRate: 0.95,
		/** Number of recent results to consider for weighting */
		historyWindow: 100,
		/** Weight boost for consistently accurate models */
		accuracyBoost: 1.5,
		/** Threshold for "high accuracy" (percentage) */
		highAccuracyThreshold: 0.85,
		/** Threshold for "low accuracy" triggering decay (percentage) */
		lowAccuracyThreshold: 0.4,
	};

	/**
	 * Create a new consensus engine
	 *
	 * @param settings - Consensus configuration
	 * @param modelCoordinator - Coordinator for model invocation
	 * @param performanceMonitor - Optional performance monitor for tracking metrics
	 */
	constructor(
		settings: ConsensusSettings,
		modelCoordinator: ModelCoordinator,
		performanceMonitor?: PerformanceMonitor
	) {
		this.settings = settings;
		this.modelCoordinator = modelCoordinator;
		this.performanceMonitor = performanceMonitor;
	}

	/**
	 * Build consensus for a set of questions from multiple model responses.
	 *
	 * This is the main entry point for the consensus algorithm. It:
	 * 1. Groups responses by question
	 * 2. For each question, checks if initial consensus exists
	 * 3. If no consensus, executes iterative re-evaluation rounds
	 * 4. Builds complete audit trail
	 *
	 * @param modelResponses - Responses from all models
	 * @returns Array of consensus results (one per question)
	 */
	public async buildConsensus(
		modelResponses: ModelResponse[]
	): Promise<ConsensusQuestionResult[]>;

	/**
	 * Build consensus for a set of questions from pre-grouped question response sets.
	 *
	 * This overload accepts already-grouped question responses and an optional
	 * progress callback for UI updates.
	 *
	 * @param questionResponseSets - Pre-grouped question response sets
	 * @param progressCallback - Optional callback for progress updates (resolved, total)
	 * @returns Array of consensus results (one per question)
	 */
	public async buildConsensus(
		questionResponseSets: QuestionResponseSet[],
		progressCallback?: (resolved: number, total: number) => void
	): Promise<ConsensusQuestionResult[]>;

	/**
	 * Build consensus for a set of questions with progressive result streaming.
	 *
	 * This overload emits partial results as individual questions reach consensus,
	 * allowing the UI to display results progressively before the entire quiz is complete.
	 *
	 * Requirements:
	 * - 7.2: Allow questions that reached consensus early to be displayed immediately
	 * - 7.3: Ensure state consistency when streaming results
	 *
	 * @param questionResponseSets - Pre-grouped question response sets
	 * @param progressCallback - Optional callback for progress updates (resolved, total)
	 * @param partialResultCallback - Callback for streaming individual question results
	 * @returns Array of consensus results (one per question)
	 */
	public async buildConsensus(
		questionResponseSets: QuestionResponseSet[],
		progressCallback: ((resolved: number, total: number) => void) | undefined,
		partialResultCallback: PartialResultCallback
	): Promise<ConsensusQuestionResult[]>;

	/**
	 * Implementation of buildConsensus with support for all signatures
	 */
	public async buildConsensus(
		input: ModelResponse[] | QuestionResponseSet[],
		progressCallback?: (resolved: number, total: number) => void,
		partialResultCallback?: PartialResultCallback
	): Promise<ConsensusQuestionResult[]> {
		// Handle empty input case
		if (input.length === 0) {
			throw new Error("Cannot build consensus with empty input");
		}

		let questionResponseSets: QuestionResponseSet[];

		// Determine which overload was called and prepare question response sets
		// Check if input is ModelResponse[] by looking for 'quiz' property
		if ('quiz' in input[0]) {
			// Called with ModelResponse[] - need to group by question
			const modelResponses = input as ModelResponse[];

			// Filter out failed responses
			const successfulResponses = modelResponses.filter(r => r.success && r.quiz);

			if (successfulResponses.length < this.settings.minModelsRequired) {
				throw new Error(
					`Insufficient successful model responses. Required: ${this.settings.minModelsRequired}, Got: ${successfulResponses.length}`
				);
			}

			// Group responses by question
			questionResponseSets = this.groupResponsesByQuestion(successfulResponses);
		} else {
			// Called with QuestionResponseSet[] - already grouped
			questionResponseSets = input as QuestionResponseSet[];
		}

		// Build consensus for each question
		const results: ConsensusQuestionResult[] = [];
		const total = questionResponseSets.length;

		for (let i = 0; i < questionResponseSets.length; i++) {
			const responseSet = questionResponseSets[i];
			const result = await this.buildQuestionConsensus(responseSet);
			results.push(result);

			// Emit partial result if streaming callback provided
			if (partialResultCallback) {
				const partialResult: PartialConsensusResult = {
					question: result.question,
					trail: result.trail,
					questionIndex: i,
					totalQuestions: total,
				};
				partialResultCallback(partialResult);
			}

			// Report progress if callback provided
			if (progressCallback) {
				progressCallback(i + 1, total);
			}
		}

		return results;
	}

	/**
	 * Group model responses by question index
	 *
	 * This creates aligned question sets where each set contains all models'
	 * responses for the same question position.
	 *
	 * @param modelResponses - Responses from all models
	 * @returns Array of question response sets
	 */
	private groupResponsesByQuestion(
		modelResponses: ModelResponse[]
	): QuestionResponseSet[] {
		// Find the minimum number of questions across all models
		const questionCounts = modelResponses.map(r => r.quiz?.questions.length || 0);
		const minQuestions = Math.min(...questionCounts);

		const questionResponseSets: QuestionResponseSet[] = [];

		// For each question index, collect responses from all models
		for (let i = 0; i < minQuestions; i++) {
			const modelConsensusResponses: ModelConsensusResponse[] = [];

			for (const modelResponse of modelResponses) {
				if (modelResponse.quiz && modelResponse.quiz.questions[i]) {
					const question = modelResponse.quiz.questions[i];
					const answer = this.extractAnswer(question);

					modelConsensusResponses.push({
						modelId: modelResponse.modelId,
						answer,
						reasoning: "", // Initial generation doesn't include reasoning
						confidence: 1.0, // Default confidence
						changed: false,
					});
				}
			}

			// Use the first model's question as the base
			// (we'll update it with the consensus answer later)
			const baseQuestion = modelResponses[0].quiz!.questions[i];

			questionResponseSets.push({
				question: baseQuestion,
				questionIndex: i,
				modelResponses: modelConsensusResponses,
			});
		}

		return questionResponseSets;
	}

	/**
	 * Build consensus for a single question through iterative rounds
	 *
	 * @param responseSet - Responses from all models for this question
	 * @returns Consensus result with full audit trail
	 */
	private async buildQuestionConsensus(
		responseSet: QuestionResponseSet
	): Promise<ConsensusQuestionResult> {
		const rounds: ConsensusRound[] = [];
		let currentResponses = responseSet.modelResponses;
		let consensusReached = false;
		let roundNumber = 1;

		// Check initial consensus
		const initialCheck = this.checkConsensusThreshold(currentResponses);

		rounds.push({
			roundNumber: 1,
			modelResponses: currentResponses,
			consensusReached: initialCheck.reached,
			duration: 0,
		});

		if (initialCheck.reached) {
			consensusReached = true;
			// Track immediate resolution for performance monitoring
			if (this.performanceMonitor) {
				this.performanceMonitor.recordQuestionResolvedImmediately();
			}
		} else {
			// Track question requiring rounds for performance monitoring
			if (this.performanceMonitor) {
				this.performanceMonitor.recordQuestionRequiringRounds();
			}

			// Execute iterative consensus rounds
			let circularReasoningDetected = false;
			let circularReasoningType = "";
			let earlyTerminated = false;

			while (
				!consensusReached &&
				roundNumber < this.settings.maxIterations &&
				!circularReasoningDetected &&
				!earlyTerminated
			) {
				roundNumber++;

				// Check for circular reasoning before continuing
				const circularCheck = this.detectCircularReasoningWithDetails(rounds);
				if (circularCheck.detected) {
					// Circular reasoning detected - abort consensus for this question
					circularReasoningDetected = true;
					circularReasoningType = circularCheck.description || "Circular reasoning detected";
					console.warn(
						`Circular reasoning detected in round ${roundNumber}: ${circularCheck.description}`
					);
					break;
				}

				// Check for early termination conditions
				const earlyTerminationResult = this.earlyTerminationAnalyzer.analyzeEarlyTermination(
					rounds,
					currentResponses,
					responseSet.question,
					this.settings.consensusThreshold
				);

				if (earlyTerminationResult.shouldTerminate) {
					earlyTerminated = true;
					console.log(
						`Early termination (${earlyTerminationResult.type}): ${earlyTerminationResult.reason}`
					);

					// Track early termination for performance monitoring
					if (this.performanceMonitor) {
						this.performanceMonitor.recordEarlyTermination();
					}
					break;
				}

				// Execute consensus round
				const roundResult = await this.executeConsensusRound(
					responseSet.question,
					currentResponses,
					roundNumber
				);

				rounds.push({
					roundNumber,
					modelResponses: roundResult.modelResponses,
					consensusReached: roundResult.consensusReached,
					duration: roundResult.duration,
				});

				if (roundResult.consensusReached) {
					consensusReached = true;
				}

				currentResponses = roundResult.modelResponses;
			}
		}

		// Get final consensus check
		const finalCheck = this.checkConsensusThreshold(currentResponses);

		// Create final question with consensus answer
		const finalQuestion = this.createQuestionWithAnswer(
			responseSet.question,
			finalCheck.consensusAnswer
		);

		// Build audit trail
		const trail: QuestionConsensusTrail = {
			question: finalQuestion,
			roundsRequired: rounds.length,
			rounds,
			consensusReached,
			agreementPercentage: finalCheck.agreementPercentage,
			agreeingModels: finalCheck.agreeingModels,
			disagreeingModels: finalCheck.disagreeingModels,
		};

		return {
			question: finalQuestion,
			trail,
		};
	}

	/**
	 * Execute a single consensus round
	 *
	 * In a consensus round:
	 * 1. Anonymize alternative answers from other models
	 * 2. Request each model to re-evaluate given the alternatives
	 * 3. Collect updated responses with reasoning
	 * 4. Check if consensus was reached
	 *
	 * @param question - The question being evaluated
	 * @param responses - Current responses from all models
	 * @param roundNumber - Current round number
	 * @returns Result of this consensus round
	 */
	private async executeConsensusRound(
		question: Question,
		responses: ModelConsensusResponse[],
		roundNumber: number
	): Promise<ConsensusRoundResult> {
		const startTime = Date.now();

		// TODO(consensus-rounds): Implement multi-round re-evaluation logic
		// Blocked by: ModelCoordinator.requestReEvaluation() not yet implemented
		// When implemented, this should:
		// 1. Create anonymized answers from responses for unbiased re-evaluation
		// 2. Call ModelCoordinator.requestReEvaluation() for each participating model
		// 3. Parse updated responses with updated reasoning and confidence scores
		// 4. Track which models changed their answers between rounds

		// Placeholder: just return current responses
		// Real implementation will be added when requestReEvaluation is implemented
		const updatedResponses = responses.map(r => ({
			...r,
			changed: false,
		}));

		const consensusCheck = this.checkConsensusThreshold(updatedResponses);
		const duration = Date.now() - startTime;

		return {
			consensusReached: consensusCheck.reached,
			modelResponses: updatedResponses,
			consensusCheck,
			duration,
		};
	}

	/**
	 * Check if consensus threshold is met for a set of responses
	 *
	 * Groups responses by answer and calculates agreement percentage.
	 * Applies model weights if available.
	 *
	 * @param responses - Model responses to check
	 * @returns Consensus check result
	 */
	private checkConsensusThreshold(
		responses: ModelConsensusResponse[]
	): ConsensusCheck {
		if (responses.length === 0) {
			return {
				reached: false,
				agreementPercentage: 0,
				agreeingModels: [],
				disagreeingModels: [],
				details: "No responses to check",
			};
		}

		// Get model weights
		const modelWeights = this.calculateModelWeights(this.modelAccuracyHistory);

		// Determine question type from the first response
		// We need to infer this from the answer structure
		const questionType = this.inferQuestionTypeFromAnswer(responses[0].answer);

		// Group responses by answer similarity
		const answerGroups = this.groupResponsesByAnswer(responses, questionType);

		// Find the largest group
		let largestGroup: ModelConsensusResponse[] = [];
		let largestWeightedSize = 0;

		for (const group of answerGroups) {
			// Calculate weighted size
			const weightedSize = group.reduce((sum, response) => {
				const weight = modelWeights.get(response.modelId) || 1.0;
				return sum + weight;
			}, 0);

			if (weightedSize > largestWeightedSize) {
				largestWeightedSize = weightedSize;
				largestGroup = group;
			}
		}

		// Calculate total weighted responses
		const totalWeightedSize = responses.reduce((sum, response) => {
			const weight = modelWeights.get(response.modelId) || 1.0;
			return sum + weight;
		}, 0);

		// Calculate agreement percentage
		const agreementPercentage = totalWeightedSize > 0
			? largestWeightedSize / totalWeightedSize
			: 0;

		// Check if threshold is met
		const reached = agreementPercentage >= this.settings.consensusThreshold;

		// Get model IDs
		const agreeingModels = largestGroup.map(r => r.modelId);
		const disagreeingModels = responses
			.filter(r => !agreeingModels.includes(r.modelId))
			.map(r => r.modelId);

		return {
			reached,
			agreementPercentage,
			consensusAnswer: reached ? largestGroup[0].answer : undefined,
			agreeingModels,
			disagreeingModels,
			details: `${largestGroup.length}/${responses.length} models agree (${(agreementPercentage * 100).toFixed(1)}%)`,
		};
	}

	/**
	 * Group responses by answer similarity
	 *
	 * Responses with similar answers are grouped together.
	 * Similarity is determined by the answer comparator.
	 *
	 * @param responses - Responses to group
	 * @param questionType - Type of question
	 * @returns Array of answer groups
	 */
	private groupResponsesByAnswer(
		responses: ModelConsensusResponse[],
		questionType: string
	): ModelConsensusResponse[][] {
		const groups: ModelConsensusResponse[][] = [];

		for (const response of responses) {
			// Try to find an existing group that matches this answer
			let foundGroup = false;

			for (const group of groups) {
				// Compare with the first answer in the group
				const comparison = compareAnswers(
					response.answer,
					group[0].answer,
					questionType
				);

				if (comparison.match) {
					group.push(response);
					foundGroup = true;
					break;
				}
			}

			// If no matching group found, create a new one
			if (!foundGroup) {
				groups.push([response]);
			}
		}

		return groups;
	}

	/**
	 * Detect circular reasoning in consensus rounds
	 *
	 * Circular reasoning occurs when models oscillate between answers
	 * without converging (e.g., A→B→A→B).
	 *
	 * This method tracks answer stability using hashing and detects
	 * multiple types of oscillation patterns:
	 * 1. Individual model oscillation (A→B→A)
	 * 2. Group oscillation (multiple models switching together)
	 * 3. Multi-cycle oscillation (A→B→C→A)
	 * 4. Answer stagnation (no changes across multiple rounds)
	 *
	 * @param rounds - History of consensus rounds
	 * @returns True if circular reasoning is detected
	 */
	private detectCircularReasoning(rounds: ConsensusRound[]): boolean {
		return this.detectCircularReasoningWithDetails(rounds).detected;
	}

	/**
	 * Detect circular reasoning with detailed information
	 *
	 * @param rounds - History of consensus rounds
	 * @returns Object containing detection status and type
	 */
	private detectCircularReasoningWithDetails(rounds: ConsensusRound[]): {
		detected: boolean;
		type?: string;
		description?: string;
	} {
		if (rounds.length < 3) {
			// Need at least 3 rounds to detect oscillation
			return { detected: false };
		}

		// Check for individual model oscillation (A→B→A pattern)
		if (this.detectIndividualModelOscillation(rounds)) {
			return {
				detected: true,
				type: "individual_oscillation",
				description: "Individual model oscillating between answers (A→B→A pattern)",
			};
		}

		// Check for group-level oscillation (multiple models switching together)
		if (this.detectGroupOscillation(rounds)) {
			return {
				detected: true,
				type: "group_oscillation",
				description: "Group oscillation detected - consensus state cycling between configurations",
			};
		}

		// Check for multi-cycle oscillation (A→B→C→A pattern)
		if (rounds.length >= 4 && this.detectMultiCycleOscillation(rounds)) {
			return {
				detected: true,
				type: "multi_cycle_oscillation",
				description: "Multi-cycle oscillation detected (A→B→C→A or A→B→A→B pattern)",
			};
		}

		// Check for answer stagnation (no progress being made)
		if (this.detectAnswerStagnation(rounds)) {
			return {
				detected: true,
				type: "answer_stagnation",
				description: "Answer stagnation detected - models stopped changing but no consensus reached",
			};
		}

		return { detected: false };
	}

	/**
	 * Detect if any individual model is oscillating between answers
	 *
	 * @param rounds - History of consensus rounds
	 * @returns True if individual model oscillation is detected
	 */
	private detectIndividualModelOscillation(rounds: ConsensusRound[]): boolean {
		if (rounds.length < 3) {
			return false;
		}

		// Get the last 3 rounds
		const recentRounds = rounds.slice(-3);

		// For each model, check if answers oscillate
		const modelIds = recentRounds[0].modelResponses.map(r => r.modelId);

		for (const modelId of modelIds) {
			// Get answers from this model across the last 3 rounds
			const answers = recentRounds.map(round => {
				const response = round.modelResponses.find(r => r.modelId === modelId);
				return response?.answer;
			});

			// Check for A→B→A pattern (oscillation)
			if (answers.length === 3) {
				const hash0 = this.hashAnswer(answers[0]);
				const hash1 = this.hashAnswer(answers[1]);
				const hash2 = this.hashAnswer(answers[2]);

				// Oscillation detected if first and third are same, but second is different
				if (hash0 === hash2 && hash0 !== hash1) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Detect if groups of models are oscillating together
	 *
	 * This detects when the overall consensus state oscillates between
	 * the same configurations (e.g., Group A wins → Group B wins → Group A wins)
	 *
	 * @param rounds - History of consensus rounds
	 * @returns True if group oscillation is detected
	 */
	private detectGroupOscillation(rounds: ConsensusRound[]): boolean {
		if (rounds.length < 3) {
			return false;
		}

		// Get the last 3 rounds
		const recentRounds = rounds.slice(-3);

		// Create a hash representing the overall answer distribution in each round
		const roundHashes = recentRounds.map(round => {
			// Group answers by similarity
			const answerCounts = new Map<string, number>();

			for (const response of round.modelResponses) {
				const answerHash = this.hashAnswer(response.answer);
				answerCounts.set(answerHash, (answerCounts.get(answerHash) || 0) + 1);
			}

			// Sort by count to create a consistent hash
			const sortedCounts = Array.from(answerCounts.entries())
				.sort((a, b) => b[1] - a[1]);

			return this.hashAnswer(sortedCounts);
		});

		// Check for A→B→A pattern in round configurations
		if (roundHashes.length === 3) {
			if (roundHashes[0] === roundHashes[2] && roundHashes[0] !== roundHashes[1]) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Detect multi-cycle oscillation (A→B→C→A)
	 *
	 * This detects when models cycle through multiple answer states
	 * before returning to an earlier state.
	 *
	 * @param rounds - History of consensus rounds
	 * @returns True if multi-cycle oscillation is detected
	 */
	private detectMultiCycleOscillation(rounds: ConsensusRound[]): boolean {
		if (rounds.length < 4) {
			return false;
		}

		// Check the last 4 rounds for each model
		const recentRounds = rounds.slice(-4);
		const modelIds = recentRounds[0].modelResponses.map(r => r.modelId);

		for (const modelId of modelIds) {
			// Get answers from this model across the last 4 rounds
			const answers = recentRounds.map(round => {
				const response = round.modelResponses.find(r => r.modelId === modelId);
				return response?.answer;
			});

			if (answers.length === 4) {
				const hashes = answers.map(a => this.hashAnswer(a));

				// Check for A→B→C→A pattern
				if (hashes[0] === hashes[3] && hashes[0] !== hashes[1] && hashes[0] !== hashes[2]) {
					return true;
				}

				// Check for A→B→A→B pattern (two-step oscillation)
				if (hashes[0] === hashes[2] && hashes[1] === hashes[3] && hashes[0] !== hashes[1]) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Detect answer stagnation (no progress across multiple rounds)
	 *
	 * This detects when models have stopped changing their answers
	 * but consensus has not been reached, indicating a deadlock.
	 *
	 * @param rounds - History of consensus rounds
	 * @returns True if answer stagnation is detected
	 */
	private detectAnswerStagnation(rounds: ConsensusRound[]): boolean {
		if (rounds.length < 3) {
			return false;
		}

		// Check the last 3 rounds
		const recentRounds = rounds.slice(-3);

		// If consensus was reached in any of these rounds, not stagnating
		if (recentRounds.some(r => r.consensusReached)) {
			return false;
		}

		// Check if any model changed their answer in the recent rounds
		const modelIds = recentRounds[0].modelResponses.map(r => r.modelId);

		for (const modelId of modelIds) {
			// Get answers from this model across the last 3 rounds
			const answers = recentRounds.map(round => {
				const response = round.modelResponses.find(r => r.modelId === modelId);
				return response?.answer;
			});

			if (answers.length === 3) {
				const hash0 = this.hashAnswer(answers[0]);
				const hash1 = this.hashAnswer(answers[1]);
				const hash2 = this.hashAnswer(answers[2]);

				// If any model changed their answer, not stagnating
				if (hash0 !== hash1 || hash1 !== hash2) {
					return false;
				}
			}
		}

		// All models have the same answers across 3 rounds but no consensus
		// This indicates a deadlock situation
		return true;
	}

	/**
	 * Calculate adaptive weights for models based on historical accuracy
	 *
	 * This method implements a sophisticated weighting algorithm that:
	 * 1. Calculates weighted moving average (recent performance weighted more)
	 * 2. Applies decay to models with consistently low accuracy
	 * 3. Boosts weights for models with consistently high accuracy
	 * 4. Enforces min/max weight bounds for stability
	 *
	 * Models that consistently agree with consensus get higher weights.
	 * Models that consistently disagree get progressively lower weights (decay).
	 *
	 * @param accuracyHistory - Map of model ID to accuracy scores (0-1)
	 * @returns Map of model ID to weight
	 */
	private calculateModelWeights(
		accuracyHistory: Map<string, number[]>
	): Map<string, number> {
		const weights = new Map<string, number>();

		for (const [modelId, accuracyScores] of accuracyHistory.entries()) {
			if (accuracyScores.length === 0) {
				// No history - use default weight of 1.0
				weights.set(modelId, 1.0);
				continue;
			}

			// Calculate weighted moving average (recent scores weighted more heavily)
			const weightedAvgAccuracy = this.calculateWeightedAverage(accuracyScores);

			// Calculate base weight from accuracy
			// Linear mapping: 0% accuracy → minWeight, 100% accuracy → maxWeight
			let weight = this.weightingConfig.minWeight +
				weightedAvgAccuracy * (this.weightingConfig.maxWeight - this.weightingConfig.minWeight);

			// Apply accuracy boost for consistently high-performing models
			if (weightedAvgAccuracy >= this.weightingConfig.highAccuracyThreshold) {
				const boostFactor = 1 + (weightedAvgAccuracy - this.weightingConfig.highAccuracyThreshold) *
					(this.weightingConfig.accuracyBoost - 1);
				weight *= boostFactor;
			}

			// Apply decay for consistently low-performing models
			if (weightedAvgAccuracy < this.weightingConfig.lowAccuracyThreshold) {
				// Count consecutive low-accuracy results
				const consecutiveLowAccuracy = this.countConsecutiveLowAccuracy(accuracyScores);

				// Apply exponential decay based on consecutive failures
				const decayFactor = Math.pow(this.weightingConfig.decayRate, consecutiveLowAccuracy);
				weight *= decayFactor;
			}

			// Enforce weight bounds
			weight = Math.max(this.weightingConfig.minWeight,
				Math.min(this.weightingConfig.maxWeight, weight));

			weights.set(modelId, weight);
		}

		return weights;
	}

	/**
	 * Calculate weighted moving average where recent values are weighted more heavily
	 *
	 * Uses exponential weighting: more recent values get higher weight.
	 * This makes the system responsive to recent model performance changes.
	 *
	 * @param scores - Array of accuracy scores (0-1)
	 * @returns Weighted average (0-1)
	 */
	private calculateWeightedAverage(scores: number[]): number {
		if (scores.length === 0) {
			return 0;
		}

		// Use only recent history (within window)
		const recentScores = scores.slice(-this.weightingConfig.historyWindow);

		// Calculate exponential weights (more recent = higher weight)
		// Weight formula: w[i] = e^(i / length) where i is position
		let weightedSum = 0;
		let weightSum = 0;

		for (let i = 0; i < recentScores.length; i++) {
			// Exponential weight: older scores get less weight
			const weight = Math.exp(i / recentScores.length);
			weightedSum += recentScores[i] * weight;
			weightSum += weight;
		}

		return weightSum > 0 ? weightedSum / weightSum : 0;
	}

	/**
	 * Count consecutive low-accuracy results at the end of history
	 *
	 * This is used to apply progressive decay to models that are
	 * consistently performing poorly.
	 *
	 * @param accuracyScores - Array of accuracy scores (0-1)
	 * @returns Count of consecutive low-accuracy scores
	 */
	private countConsecutiveLowAccuracy(accuracyScores: number[]): number {
		let count = 0;

		// Count backwards from most recent
		for (let i = accuracyScores.length - 1; i >= 0; i--) {
			if (accuracyScores[i] < this.weightingConfig.lowAccuracyThreshold) {
				count++;
			} else {
				break; // Stop at first non-low accuracy
			}
		}

		return count;
	}

	/**
	 * Update model accuracy history based on consensus results
	 *
	 * This should be called after each question to track which models
	 * agreed with the final consensus.
	 *
	 * @param modelId - Model to update
	 * @param agreed - Whether the model agreed with consensus
	 */
	public updateModelAccuracy(modelId: string, agreed: boolean): void {
		if (!this.modelAccuracyHistory.has(modelId)) {
			this.modelAccuracyHistory.set(modelId, []);
		}

		const history = this.modelAccuracyHistory.get(modelId)!;
		history.push(agreed ? 1.0 : 0.0);

		// Keep only the last 100 accuracy scores
		if (history.length > 100) {
			history.shift();
		}
	}

	/**
	 * Prepare anonymized answers for re-evaluation
	 *
	 * Creates a list of anonymized alternative answers to present to models
	 * during consensus rounds.
	 *
	 * @param responses - Current model responses
	 * @param excludeModelId - Model ID to exclude (don't show its own answer)
	 * @returns Array of anonymized answers
	 */
	private prepareAnonymizedAnswers(
		responses: ModelConsensusResponse[],
		excludeModelId: string
	): AnonymizedAnswer[] {
		const anonymized: AnonymizedAnswer[] = [];
		let answerIdCounter = 1;

		for (const response of responses) {
			// Don't include the model's own answer
			if (response.modelId === excludeModelId) {
				continue;
			}

			anonymized.push({
				answerId: `answer_${answerIdCounter}`,
				answer: response.answer,
				reasoning: response.reasoning,
			});

			answerIdCounter++;
		}

		return anonymized;
	}

	/**
	 * Extract the answer from a question object
	 *
	 * @param question - Question object
	 * @returns The answer value
	 */
	private extractAnswer(question: Question): any {
		// All question types have an 'answer' property
		return (question as any).answer;
	}

	/**
	 * Create a new question object with a consensus answer
	 *
	 * @param baseQuestion - Original question
	 * @param consensusAnswer - The consensus answer to use
	 * @returns New question with consensus answer
	 */
	private createQuestionWithAnswer(
		baseQuestion: Question,
		consensusAnswer: any
	): Question {
		return {
			...baseQuestion,
			answer: consensusAnswer,
		} as Question;
	}

	/**
	 * Infer question type from answer structure
	 *
	 * @param answer - Answer value
	 * @returns Question type string
	 */
	private inferQuestionTypeFromAnswer(answer: any): string {
		if (typeof answer === "boolean") {
			return "TrueFalse";
		}
		if (typeof answer === "number") {
			return "MultipleChoice";
		}
		if (Array.isArray(answer)) {
			if (answer.length > 0 && typeof answer[0] === "number") {
				return "SelectAllThatApply";
			}
			if (answer.length > 0 && typeof answer[0] === "string") {
				return "FillInTheBlank";
			}
			if (
				answer.length > 0 &&
				typeof answer[0] === "object" &&
				"leftOption" in answer[0]
			) {
				return "Matching";
			}
		}
		if (typeof answer === "string") {
			return "ShortOrLongAnswer";
		}

		return "Unknown";
	}

	/**
	 * Hash an answer for equality checking
	 *
	 * @param answer - Answer to hash
	 * @returns Hash string
	 */
	private hashAnswer(answer: any): string {
		try {
			return JSON.stringify(answer);
		} catch {
			return String(answer);
		}
	}

	/**
	 * Get model accuracy history
	 *
	 * @returns Map of model ID to accuracy scores
	 */
	public getModelAccuracyHistory(): Map<string, number[]> {
		return new Map(this.modelAccuracyHistory);
	}

	/**
	 * Reset model accuracy history
	 */
	public resetModelAccuracyHistory(): void {
		this.modelAccuracyHistory.clear();
	}

	/**
	 * Get current weights for all models
	 *
	 * @returns Map of model ID to current weight
	 */
	public getCurrentModelWeights(): Map<string, number> {
		return this.calculateModelWeights(this.modelAccuracyHistory);
	}

	/**
	 * Get detailed statistics for a specific model
	 *
	 * @param modelId - Model identifier
	 * @returns Statistics object or undefined if no history
	 */
	public getModelStatistics(modelId: string): {
		totalQuestions: number;
		averageAccuracy: number;
		weightedAccuracy: number;
		currentWeight: number;
		recentAccuracy: number; // Last 10 questions
		consecutiveLowAccuracy: number;
	} | undefined {
		const accuracyScores = this.modelAccuracyHistory.get(modelId);

		if (!accuracyScores || accuracyScores.length === 0) {
			return undefined;
		}

		const totalQuestions = accuracyScores.length;
		const averageAccuracy = accuracyScores.reduce((sum, score) => sum + score, 0) / totalQuestions;
		const weightedAccuracy = this.calculateWeightedAverage(accuracyScores);
		const currentWeight = this.calculateModelWeights(this.modelAccuracyHistory).get(modelId) || 1.0;

		// Calculate recent accuracy (last 10 questions)
		const recentScores = accuracyScores.slice(-10);
		const recentAccuracy = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;

		const consecutiveLowAccuracy = this.countConsecutiveLowAccuracy(accuracyScores);

		return {
			totalQuestions,
			averageAccuracy,
			weightedAccuracy,
			currentWeight,
			recentAccuracy,
			consecutiveLowAccuracy,
		};
	}

	/**
	 * Get statistics for all models
	 *
	 * @returns Map of model ID to statistics
	 */
	public getAllModelStatistics(): Map<string, ReturnType<typeof this.getModelStatistics>> {
		const stats = new Map();

		for (const modelId of this.modelAccuracyHistory.keys()) {
			stats.set(modelId, this.getModelStatistics(modelId));
		}

		return stats;
	}

	/**
	 * Set model accuracy history (useful for loading persisted state)
	 *
	 * @param history - Map of model ID to accuracy scores
	 */
	public setModelAccuracyHistory(history: Map<string, number[]>): void {
		this.modelAccuracyHistory.clear();

		// Deep copy to prevent external modifications
		for (const [modelId, scores] of history.entries()) {
			this.modelAccuracyHistory.set(modelId, [...scores]);
		}
	}

	/**
	 * Export model accuracy history to JSON-serializable format
	 *
	 * @returns Object that can be JSON.stringify'd
	 */
	public exportModelAccuracyHistory(): Record<string, number[]> {
		const exported: Record<string, number[]> = {};

		for (const [modelId, scores] of this.modelAccuracyHistory.entries()) {
			exported[modelId] = [...scores];
		}

		return exported;
	}

	/**
	 * Import model accuracy history from JSON-serializable format
	 *
	 * @param exported - Object from exportModelAccuracyHistory()
	 */
	public importModelAccuracyHistory(exported: Record<string, number[]>): void {
		this.modelAccuracyHistory.clear();

		for (const [modelId, scores] of Object.entries(exported)) {
			this.modelAccuracyHistory.set(modelId, [...scores]);
		}
	}
}
