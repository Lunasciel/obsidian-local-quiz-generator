import { Quiz, Question } from "../utils/types";
import { QuizSettings } from "../settings/config";
import {
	ConsensusSettings,
	ConsensusResult,
	ConsensusAuditTrail,
	QuestionConsensusTrail,
	ProgressCallback,
	ConsensusPhase,
	ConsensusProgress,
	SourceValidationResult,
	ConsensusFailureReason,
	PartialConsensusResult,
	PartialResultCallback,
	ModelErrorCallback,
	ConsensusModelConfig,
} from "./types";
import { ModelCoordinator, ModelResponse, ResolvedConsensusModel } from "./modelCoordinator";
import { ConsensusEngine, QuestionResponseSet, ConsensusQuestionResult } from "./consensusEngine";
import { SourceValidator } from "./sourceValidator";
import { RateLimitManager } from "./rateLimitManager";
import { ConsensusCache, hashContent, hashConsensusSettings } from "./consensusCache";
import { Plugin } from "obsidian";
import GeneratorFactory from "../generators/generatorFactory";
import { Provider } from "../generators/providers";
import {
	ModelResolver,
	ModelNotFoundError,
	createModelResolver,
	isModelNotFoundError,
	ConsensusModelReference,
	ModelConfiguration,
} from "../settings/modelRegistry";

/**
 * Main coordinator for the multi-model consensus process.
 *
 * The ConsensusOrchestrator is the entry point for consensus-based quiz generation.
 * It orchestrates the entire process:
 *
 * 1. **Source Validation Phase**: Validates source material through multiple models
 *    to ensure accurate fact extraction before quiz generation
 *
 * 2. **Initial Generation Phase**: Invokes all configured models in parallel to
 *    independently generate quiz questions from the source material
 *
 * 3. **Consensus Building Phase**: Uses the ConsensusEngine to iteratively compare
 *    answers across models until consensus is reached or max iterations exceeded
 *
 * 4. **Finalization Phase**: Compiles the final quiz with validated answers and
 *    builds a complete audit trail for transparency
 *
 * The orchestrator handles:
 * - Progress reporting to UI via callbacks
 * - Error handling and graceful degradation
 * - Fallback to single-model generation when consensus fails
 * - Building comprehensive audit trails
 */
export class ConsensusOrchestrator {
	/** Consensus configuration settings */
	private readonly settings: ConsensusSettings;

	/** Quiz generation settings */
	private readonly quizSettings: QuizSettings;

	/** Model coordinator for parallel invocation */
	private readonly modelCoordinator: ModelCoordinator;

	/** Consensus engine for iterative consensus building */
	private readonly consensusEngine: ConsensusEngine;

	/** Source validator for multi-model fact checking */
	private readonly sourceValidator: SourceValidator;

	/** Optional callback for progress updates */
	private readonly progressCallback?: ProgressCallback;

	/** Optional callback for progressive result streaming */
	private readonly partialResultCallback?: PartialResultCallback;

	/** Optional callback for model-level error reporting */
	private readonly modelErrorCallback?: ModelErrorCallback;

	/** Optional cache for consensus results */
	private readonly cache?: ConsensusCache;

	/** Start time for duration tracking */
	private startTime: number = 0;

	/** Models that failed during execution */
	private failedModels: string[] = [];

	/** Model IDs that failed resolution */
	private resolutionErrors: string[] = [];

	/** Resolved model configurations (after registry lookup) */
	private readonly resolvedModels: ResolvedConsensusModel[];

	/**
	 * Create a new consensus orchestrator
	 *
	 * This constructor now supports both the legacy format (consensusModels with
	 * embedded settings) and the new registry-based format (models with references
	 * to the central ModelRegistry).
	 *
	 * When using the new format:
	 * 1. Model references are resolved from the registry using ModelResolver
	 * 2. Resolution errors are collected and reported
	 * 3. Only successfully resolved models are used for consensus
	 *
	 * @param settings - Consensus configuration
	 * @param quizSettings - Quiz generation settings (contains model registry)
	 * @param progressCallback - Optional callback for UI progress updates
	 * @param partialResultCallback - Optional callback for progressive result streaming
	 * @param modelErrorCallback - Optional callback for model-level error reporting
	 * @param rateLimitManager - Optional rate limit manager (creates default if not provided)
	 * @param cache - Optional cache for consensus results
	 * @throws Error if consensus mode is not enabled or insufficient models
	 *
	 * Requirements: 1.4, 9.3, 9.7
	 */
	constructor(
		settings: ConsensusSettings,
		quizSettings: QuizSettings,
		progressCallback?: ProgressCallback,
		partialResultCallback?: PartialResultCallback,
		modelErrorCallback?: ModelErrorCallback,
		rateLimitManager?: RateLimitManager,
		cache?: ConsensusCache
	) {
		// Validate that consensus is enabled
		if (!settings.enabled) {
			throw new Error("Consensus mode is not enabled in settings");
		}

		this.settings = settings;
		this.quizSettings = quizSettings;
		this.progressCallback = progressCallback;
		this.partialResultCallback = partialResultCallback;
		this.modelErrorCallback = modelErrorCallback;
		this.cache = cache;

		// Resolve model references to full configurations
		// This supports both new format (models) and legacy format (consensusModels)
		// Initialize to empty array first to prevent undefined access in case of errors
		this.resolvedModels = this.resolveModelReferences(settings, quizSettings) ?? [];

		// Validate minimum models requirement after resolution
		const enabledModels = this.resolvedModels.filter(m => m.enabled);
		if (enabledModels.length < settings.minModelsRequired) {
			const errorMessage = this.resolutionErrors.length > 0
				? `Insufficient models enabled: ${enabledModels.length} enabled, ` +
				  `${settings.minModelsRequired} required. ` +
				  `Failed to resolve: ${this.resolutionErrors.join(", ")}`
				: `Insufficient models enabled: ${enabledModels.length} enabled, ` +
				  `${settings.minModelsRequired} required`;
			throw new Error(errorMessage);
		}

		// Initialize components with resolved models
		const rateLimiter = rateLimitManager || new RateLimitManager();
		this.modelCoordinator = new ModelCoordinator(
			this.resolvedModels,
			quizSettings,
			rateLimiter,
			undefined, // performanceMonitor
			modelErrorCallback
		);
		this.consensusEngine = new ConsensusEngine(settings, this.modelCoordinator, undefined);
		this.sourceValidator = new SourceValidator(this.modelCoordinator);
	}

	/**
	 * Resolve model references to full configurations.
	 *
	 * This method supports both:
	 * 1. New format: settings.models contains ConsensusModelReference[] with model IDs
	 * 2. Legacy format: settings.consensusModels contains ConsensusModelConfig[] with embedded settings
	 *
	 * For the new format, it uses ModelResolver to look up full configurations from
	 * the central ModelRegistry. Resolution errors are collected but don't fail the
	 * entire operation - only successfully resolved models are returned.
	 *
	 * @param settings - Consensus settings with model references or configs
	 * @param quizSettings - Quiz settings containing the model registry
	 * @returns Array of resolved model configurations ready for use
	 *
	 * Requirements: 1.4, 9.3, 9.7
	 */
	private resolveModelReferences(
		settings: ConsensusSettings,
		quizSettings: QuizSettings
	): ResolvedConsensusModel[] {
		this.resolutionErrors = [];

		// Resolve models from the registry (models array with references)
		if (settings.models && settings.models.length > 0) {
			return this.resolveFromRegistry(settings.models, quizSettings);
		}

		// No models configured
		return [];
	}

	/**
	 * Resolve model references from the central registry.
	 *
	 * Uses ModelResolver to look up each model ID and extract the full
	 * configuration. Models that can't be resolved are logged and skipped.
	 *
	 * @param references - Array of model references with IDs
	 * @param quizSettings - Quiz settings containing the model registry
	 * @returns Array of resolved models
	 *
	 * Requirements: 1.4, 9.3
	 */
	private resolveFromRegistry(
		references: ConsensusModelReference[],
		quizSettings: QuizSettings
	): ResolvedConsensusModel[] {
		const resolver = createModelResolver(quizSettings);
		const resolved: ResolvedConsensusModel[] = [];

		for (const ref of references) {
			try {
				const modelConfig = resolver.resolve(ref.modelId);

				// Create a resolved consensus model that combines registry config with consensus settings
				resolved.push({
					id: ref.modelId,
					modelConfig,
					weight: ref.weight,
					enabled: ref.enabled,
					provider: modelConfig.providerConfig.provider,
				});
			} catch (error) {
				// Log resolution error but continue with other models
				if (isModelNotFoundError(error)) {
					console.error(`Consensus model resolution failed: ${error.getUserFriendlyMessage()}`);
					this.resolutionErrors.push(ref.modelId);

					// Report to UI if callback available
					if (this.modelErrorCallback) {
						this.modelErrorCallback(
							ref.modelId,
							`Model not found in registry: ${ref.modelId}. Please reconfigure in settings.`,
							"error",
							false
						);
					}
				} else {
					console.error(`Unexpected error resolving model ${ref.modelId}:`, error);
					this.resolutionErrors.push(ref.modelId);
				}
			}
		}

		return resolved;
	}

	/**
	 * Convert ConsensusModelConfig to ResolvedConsensusModel format.
	 *
	 * Now uses ProviderConfig directly from the ConsensusModelConfig.
	 *
	 * @param models - Model configurations with ProviderConfig
	 * @param quizSettings - Base quiz settings for fallback values
	 * @returns Array of resolved models in the new format
	 *
	 * Requirements: 6.2 (simplified settings mapping)
	 */
	private convertLegacyModels(
		models: ConsensusModelConfig[],
		quizSettings: QuizSettings
	): ResolvedConsensusModel[] {
		return models.map(model => {
			// Create ModelConfiguration from ProviderConfig
			const modelConfig: ModelConfiguration = this.createModelConfigFromConsensus(model);

			return {
				id: model.id,
				modelConfig,
				weight: model.weight,
				enabled: model.enabled,
				provider: model.provider,
			};
		});
	}

	/**
	 * Create a ModelConfiguration from ConsensusModelConfig.
	 *
	 * Uses the ProviderConfig directly from the consensus config.
	 *
	 * @param model - Model configuration with ProviderConfig
	 * @returns ModelConfiguration suitable for GeneratorFactory
	 *
	 * Requirements: 6.2 (simplified settings mapping)
	 */
	private createModelConfigFromConsensus(model: ConsensusModelConfig): ModelConfiguration {
		const now = Date.now();

		return {
			id: model.id,
			displayName: `${model.provider} Model`,
			isAutoGeneratedName: true,
			providerConfig: model.providerConfig,
			createdAt: now,
			modifiedAt: now,
		};
	}

	/**
	 * Get the list of model IDs that failed resolution.
	 *
	 * This can be used by callers to display warnings about missing models.
	 *
	 * @returns Array of model IDs that couldn't be resolved
	 */
	public getResolutionErrors(): string[] {
		return [...this.resolutionErrors];
	}

	/**
	 * Get the count of successfully resolved models.
	 *
	 * @returns Number of models that were successfully resolved
	 */
	public getResolvedModelCount(): number {
		return this.resolvedModels.length;
	}

	/**
	 * Get the count of enabled resolved models.
	 *
	 * @returns Number of enabled models ready for consensus
	 */
	public getEnabledModelCount(): number {
		return this.resolvedModels.filter(m => m.enabled).length;
	}

	/**
	 * Generate a quiz with multi-model consensus validation
	 *
	 * This is the main entry point for consensus-based quiz generation.
	 * It orchestrates all phases of the consensus process and returns
	 * a complete result with the validated quiz and audit trail.
	 *
	 * @param contents - Source content for quiz generation (note text)
	 * @returns Consensus result with quiz and audit trail
	 * @throws Error if consensus cannot be established and fallback is disabled
	 */
	public async generateQuizWithConsensus(
		contents: string[]
	): Promise<ConsensusResult> {
		this.startTime = Date.now();
		this.failedModels = [];

		try {
			// Phase 1: Source Validation (optional)
			let sourceValidation: SourceValidationResult | undefined;
			if (this.settings.enableSourceValidation) {
				sourceValidation = await this.executeSourceValidation(contents);
			}

			// Phase 2: Initial Generation
			const modelResponses = await this.executeInitialGeneration(contents);

			// Check if we have enough successful responses
			if (modelResponses.filter(r => r.success).length < this.settings.minModelsRequired) {
				return await this.handleInsufficientModels(modelResponses);
			}

			// Phase 3: Consensus Building
			const consensusResults = await this.executeConsensusBuild(modelResponses);

			// Phase 4: Finalization
			return await this.executeFinalization(consensusResults, sourceValidation);

		} catch (error) {
			// Handle any unexpected errors
			return this.handleFatalError(error);
		}
	}

	/**
	 * Generate a quiz with caching support
	 *
	 * This method checks the cache for existing consensus results before
	 * initiating a new consensus process. If a valid cached result exists,
	 * it is returned immediately. Otherwise, it generates a new result and
	 * caches it for future use.
	 *
	 * Caching is only enabled if:
	 * 1. Settings.enableCaching is true
	 * 2. A cache instance was provided to the constructor
	 *
	 * Cache keys are based on:
	 * - Content hash: hash of the source material
	 * - Settings hash: hash of consensus settings
	 *
	 * Cache invalidation occurs when:
	 * - Content changes (different source material)
	 * - Settings change (model configs, thresholds, etc.)
	 * - TTL expires (default: 7 days)
	 *
	 * @param contents - Source content for quiz generation (note text)
	 * @returns Consensus result with quiz and audit trail
	 * @throws Error if consensus cannot be established and fallback is disabled
	 */
	public async generateWithCache(
		contents: string[]
	): Promise<ConsensusResult> {
		// Check if caching is enabled
		if (!this.settings.enableCaching || !this.cache) {
			// Caching disabled - fall through to normal generation
			return this.generateQuizWithConsensus(contents);
		}

		// Generate cache keys
		const contentHash = hashContent(contents);
		const settingsHash = hashConsensusSettings(this.settings);

		this.reportProgress({
			phase: ConsensusPhase.SOURCE_VALIDATION,
			phaseProgress: 0,
			overallProgress: 0,
			statusMessage: "Checking cache for existing consensus result...",
		});

		try {
			// Check cache
			const cachedResult = await this.cache.get(contentHash, settingsHash);

			if (cachedResult) {
				// Cache HIT - return cached result
				console.log("Consensus cache HIT - returning cached result");

				this.reportProgress({
					phase: ConsensusPhase.FINALIZATION,
					phaseProgress: 1,
					overallProgress: 1,
					statusMessage: `Quiz loaded from cache! ${cachedResult.quiz.questions.length} questions retrieved.`,
				});

				return cachedResult;
			}

			// Cache MISS - generate new result
			console.log("Consensus cache MISS - generating new result");

			this.reportProgress({
				phase: ConsensusPhase.SOURCE_VALIDATION,
				phaseProgress: 0,
				overallProgress: 0,
				statusMessage: "No cached result found. Starting consensus generation...",
			});

			const result = await this.generateQuizWithConsensus(contents);

			// Cache the result if generation was successful
			if (result.success && result.quiz.questions.length > 0) {
				try {
					await this.cache.set(contentHash, settingsHash, result);
					console.log("Consensus result cached for future use");
				} catch (cacheError) {
					// Cache storage failed - log but don't fail the request
					console.error("Failed to cache consensus result:", cacheError);
				}
			}

			return result;

		} catch (error) {
			// Handle cache errors gracefully
			console.error("Cache operation failed:", error);
			console.log("Falling back to uncached generation");

			// Fall through to normal generation
			return this.generateQuizWithConsensus(contents);
		}
	}

	/**
	 * Execute Phase 1: Source Validation
	 *
	 * Validates source material through multiple models to ensure
	 * accurate fact extraction before quiz generation begins.
	 *
	 * @param contents - Source content to validate
	 * @returns Source validation result
	 */
	private async executeSourceValidation(
		contents: string[]
	): Promise<SourceValidationResult> {
		this.reportProgress({
			phase: ConsensusPhase.SOURCE_VALIDATION,
			phaseProgress: 0,
			overallProgress: 0,
			statusMessage: "Validating source material through multiple models...",
		});

		// Combine all contents into a single source document
		const sourceContent = contents.join("\n\n");

		try {
			const validationResult = await this.sourceValidator.validateSource(
				sourceContent,
				"Quiz generation - extracting facts for question creation"
			);

			this.reportProgress({
				phase: ConsensusPhase.SOURCE_VALIDATION,
				phaseProgress: 1,
				overallProgress: 0.25,
				statusMessage: `Source validation complete (confidence: ${(validationResult.validationConfidence * 100).toFixed(0)}%)`,
			});

			return validationResult;

		} catch (error) {
			// Source validation is non-critical - log and continue
			console.error("Source validation failed:", error);

			this.reportProgress({
				phase: ConsensusPhase.SOURCE_VALIDATION,
				phaseProgress: 1,
				overallProgress: 0.25,
				statusMessage: "Source validation failed, continuing with generation...",
			});

			// Return empty validation result
			return {
				sourceContent,
				extractions: [],
				factConsensus: {
					agreedFacts: [],
					partialAgreementFacts: [],
					disagreedFacts: [],
				},
				discrepancies: [],
				validationConfidence: 0,
			};
		}
	}

	/**
	 * Execute Phase 2: Initial Generation
	 *
	 * Invokes all configured models in parallel to independently
	 * generate quiz questions from the source material.
	 *
	 * @param contents - Source content for quiz generation
	 * @returns Array of model responses
	 */
	private async executeInitialGeneration(
		contents: string[]
	): Promise<ModelResponse[]> {
		this.reportProgress({
			phase: ConsensusPhase.INITIAL_GENERATION,
			phaseProgress: 0,
			overallProgress: 0.25,
			statusMessage: `Generating quizzes from ${this.resolvedModels.filter(m => m.enabled).length} models...`,
		});

		try {
			const responses = await this.modelCoordinator.invokeModels(contents, {
				continueOnError: true,
			});

			// Track failed models
			this.failedModels = responses
				.filter(r => !r.success)
				.map(r => r.modelId);

			const successCount = responses.filter(r => r.success).length;
			const totalCount = responses.length;

			this.reportProgress({
				phase: ConsensusPhase.INITIAL_GENERATION,
				phaseProgress: 1,
				overallProgress: 0.5,
				statusMessage: `Initial generation complete (${successCount}/${totalCount} models succeeded)`,
			});

			return responses;

		} catch (error) {
			console.error("Initial generation failed:", error);
			throw new Error(`Failed to generate quizzes: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Execute Phase 3: Consensus Building
	 *
	 * Uses the ConsensusEngine to iteratively compare answers across
	 * models until consensus is reached or max iterations exceeded.
	 *
	 * @param modelResponses - Responses from all models
	 * @returns Array of consensus results for each question
	 */
	private async executeConsensusBuild(
		modelResponses: ModelResponse[]
	): Promise<ConsensusQuestionResult[]> {
		this.reportProgress({
			phase: ConsensusPhase.CONSENSUS_BUILDING,
			phaseProgress: 0,
			overallProgress: 0.5,
			statusMessage: "Building consensus across model responses...",
		});

		// Group responses by question
		const questionResponseSets = this.groupResponsesByQuestion(modelResponses);

		this.reportProgress({
			phase: ConsensusPhase.CONSENSUS_BUILDING,
			phaseProgress: 0.1,
			overallProgress: 0.55,
			statusMessage: `Comparing answers for ${questionResponseSets.length} questions...`,
			totalQuestions: questionResponseSets.length,
			questionsResolved: 0,
		});

		try {
			// Build consensus with progress reporting and optional progressive streaming
			const consensusResults = this.partialResultCallback
				? await this.consensusEngine.buildConsensus(
					questionResponseSets,
					(resolved, total) => {
						this.reportProgress({
							phase: ConsensusPhase.CONSENSUS_BUILDING,
							phaseProgress: resolved / total,
							overallProgress: 0.55 + (0.2 * resolved / total),
							statusMessage: `Consensus reached for ${resolved}/${total} questions`,
							totalQuestions: total,
							questionsResolved: resolved,
						});
					},
					this.partialResultCallback
				)
				: await this.consensusEngine.buildConsensus(
					questionResponseSets,
					(resolved, total) => {
						this.reportProgress({
							phase: ConsensusPhase.CONSENSUS_BUILDING,
							phaseProgress: resolved / total,
							overallProgress: 0.55 + (0.2 * resolved / total),
							statusMessage: `Consensus reached for ${resolved}/${total} questions`,
							totalQuestions: total,
							questionsResolved: resolved,
						});
					}
				);

			this.reportProgress({
				phase: ConsensusPhase.CONSENSUS_BUILDING,
				phaseProgress: 1,
				overallProgress: 0.75,
				statusMessage: `Consensus building complete (${consensusResults.length} questions validated)`,
			});

			return consensusResults;

		} catch (error) {
			console.error("Consensus building failed:", error);
			throw new Error(`Failed to build consensus: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Execute Phase 4: Finalization
	 *
	 * Compiles the final quiz with validated answers and builds
	 * a complete audit trail for transparency.
	 *
	 * @param consensusResults - Results from consensus building
	 * @param sourceValidation - Optional source validation results
	 * @returns Complete consensus result
	 */
	private async executeFinalization(
		consensusResults: ConsensusQuestionResult[],
		sourceValidation?: SourceValidationResult
	): Promise<ConsensusResult> {
		this.reportProgress({
			phase: ConsensusPhase.FINALIZATION,
			phaseProgress: 0,
			overallProgress: 0.75,
			statusMessage: "Finalizing quiz and building audit trail...",
		});

		// Extract validated questions
		const questions: Question[] = consensusResults.map(result => result.question);

		// Build audit trail
		const questionTrails: QuestionConsensusTrail[] = consensusResults.map(result => result.trail);

		const totalDuration = Date.now() - this.startTime;

		const participatingModels = this.resolvedModels
			.filter(m => m.enabled && !this.failedModels.includes(m.id))
			.map(m => m.id);

		const auditTrail: ConsensusAuditTrail = {
			totalDuration,
			questionTrails,
			sourceValidation,
			participatingModels,
			failedModels: this.failedModels,
		};

		const quiz: Quiz = {
			questions,
		};

		// Check if we have any questions
		if (questions.length === 0) {
			this.reportProgress({
				phase: ConsensusPhase.FINALIZATION,
				phaseProgress: 1,
				overallProgress: 1,
				statusMessage: "Consensus failed - no questions could be validated",
			});

			return {
				quiz,
				auditTrail,
				success: false,
				failureReason: "No questions reached consensus threshold",
			};
		}

		this.reportProgress({
			phase: ConsensusPhase.FINALIZATION,
			phaseProgress: 1,
			overallProgress: 1,
			statusMessage: `Quiz generation complete! ${questions.length} questions validated.`,
		});

		return {
			quiz,
			auditTrail,
			success: true,
		};
	}

	/**
	 * Group model responses by question for consensus comparison
	 *
	 * This creates a QuestionResponseSet for each question that appears
	 * in any model's response, collecting all models' answers to that question.
	 *
	 * @param modelResponses - All model responses
	 * @returns Array of question response sets
	 */
	private groupResponsesByQuestion(
		modelResponses: ModelResponse[]
	): QuestionResponseSet[] {
		const questionMap = new Map<number, QuestionResponseSet>();

		// Get successful responses only
		const successfulResponses = modelResponses.filter(r => r.success && r.quiz);

		if (successfulResponses.length === 0) {
			return [];
		}

		// Find the maximum number of questions across all responses
		const maxQuestions = Math.max(
			...successfulResponses.map(r => r.quiz?.questions.length || 0)
		);

		// For each question index, collect responses from all models
		for (let i = 0; i < maxQuestions; i++) {
			const modelResponses: any[] = [];

			for (const response of successfulResponses) {
				if (response.quiz && i < response.quiz.questions.length) {
					const question = response.quiz.questions[i];

					modelResponses.push({
						modelId: response.modelId,
						answer: this.extractAnswer(question),
						reasoning: `Model ${response.modelId} initial response`,
						confidence: 0.8, // Default confidence for initial responses
						changed: false,
					});

					// Store the question if this is the first response for this index
					if (!questionMap.has(i)) {
						questionMap.set(i, {
							question,
							questionIndex: i,
							modelResponses: [],
						});
					}
				}
			}

			// Add all model responses to the question set
			const questionSet = questionMap.get(i);
			if (questionSet) {
				questionSet.modelResponses = modelResponses;
			}
		}

		return Array.from(questionMap.values());
	}

	/**
	 * Extract the answer from a question object
	 *
	 * @param question - The question object
	 * @returns The answer value
	 */
	private extractAnswer(question: Question): any {
		return (question as any).answer;
	}

	/**
	 * Handle insufficient models scenario
	 *
	 * When not enough models succeed, either fallback to single-model
	 * generation or fail based on settings.
	 *
	 * @param modelResponses - All model responses (mostly failed)
	 * @returns Consensus result (fallback or failure)
	 */
	private async handleInsufficientModels(
		modelResponses: ModelResponse[]
	): Promise<ConsensusResult> {
		const successCount = modelResponses.filter(r => r.success).length;

		if (this.settings.fallbackToSingleModel && successCount > 0) {
			// Fallback to single model generation
			console.warn(
				`Insufficient models for consensus (${successCount}/${this.settings.minModelsRequired}), ` +
				`falling back to single model`
			);

			// Use the first successful response
			const successfulResponse = modelResponses.find(r => r.success && r.quiz);
			if (successfulResponse && successfulResponse.quiz) {
				const totalDuration = Date.now() - this.startTime;

				return {
					quiz: successfulResponse.quiz,
					auditTrail: {
						totalDuration,
						questionTrails: [],
						participatingModels: [successfulResponse.modelId],
						failedModels: this.failedModels,
					},
					success: true,
				};
			}
		}

		// Cannot proceed
		const totalDuration = Date.now() - this.startTime;

		return {
			quiz: { questions: [] },
			auditTrail: {
				totalDuration,
				questionTrails: [],
				participatingModels: [],
				failedModels: this.failedModels,
			},
			success: false,
			failureReason: `Insufficient models available: ${successCount}/${this.settings.minModelsRequired} succeeded`,
		};
	}

	/**
	 * Handle fatal errors during consensus process
	 *
	 * @param error - The error that occurred
	 * @returns Consensus result indicating failure
	 */
	private handleFatalError(error: unknown): ConsensusResult {
		const totalDuration = Date.now() - this.startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);

		console.error("Fatal error during consensus:", errorMessage);

		return {
			quiz: { questions: [] },
			auditTrail: {
				totalDuration,
				questionTrails: [],
				participatingModels: [],
				failedModels: this.failedModels,
			},
			success: false,
			failureReason: `Fatal error: ${errorMessage}`,
		};
	}

	/**
	 * Report progress to the UI via callback
	 *
	 * @param progress - Progress information
	 */
	private reportProgress(progress: ConsensusProgress): void {
		if (this.progressCallback) {
			this.progressCallback(progress);
		}
	}
}
