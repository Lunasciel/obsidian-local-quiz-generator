import { ModelConsensusResponse, ConsensusRound } from "./types";
import { compareAnswers, getQuestionType } from "./answerComparator";
import { Question } from "../utils/types";

/**
 * Result of early termination analysis
 */
export interface EarlyTerminationResult {
	/** Whether early termination is recommended */
	shouldTerminate: boolean;

	/** Reason for termination recommendation */
	reason: string;

	/** Confidence in termination decision (0-1) */
	confidence: number;

	/** Type of early termination detected */
	type?: "unanimous" | "impossibility" | "convergence_stalled" | "high_confidence_majority";
}

/**
 * Analyzer for determining when consensus rounds can be terminated early
 */
export class EarlyTerminationAnalyzer {
	/**
	 * Analyze whether consensus building can be terminated early
	 *
	 * This checks for several conditions that indicate further rounds won't help:
	 * 1. Unanimous agreement - all models agree
	 * 2. Mathematical impossibility - can't reach threshold
	 * 3. Convergence stalled - answers stopped changing
	 * 4. High confidence majority - strong consensus with high confidence
	 *
	 * @param rounds - Consensus rounds completed so far
	 * @param currentResponses - Current model responses
	 * @param question - The question being evaluated
	 * @param consensusThreshold - Required agreement threshold (0-1)
	 * @returns Early termination analysis result
	 */
	public analyzeEarlyTermination(
		rounds: ConsensusRound[],
		currentResponses: ModelConsensusResponse[],
		question: Question,
		consensusThreshold: number
	): EarlyTerminationResult {
		// Check for unanimous agreement
		const unanimousResult = this.checkUnanimousAgreement(currentResponses, question);
		if (unanimousResult.shouldTerminate) {
			return unanimousResult;
		}

		// Check for mathematical impossibility
		const impossibilityResult = this.checkMathematicalImpossibility(
			currentResponses,
			question,
			consensusThreshold
		);
		if (impossibilityResult.shouldTerminate) {
			return impossibilityResult;
		}

		// Check for convergence stall (only if we have multiple rounds)
		if (rounds.length >= 2) {
			const stalledResult = this.checkConvergenceStalled(rounds, question);
			if (stalledResult.shouldTerminate) {
				return stalledResult;
			}
		}

		// Check for high confidence majority
		const highConfidenceResult = this.checkHighConfidenceMajority(
			currentResponses,
			question,
			consensusThreshold
		);
		if (highConfidenceResult.shouldTerminate) {
			return highConfidenceResult;
		}

		// No early termination condition met
		return {
			shouldTerminate: false,
			reason: "Continue consensus rounds",
			confidence: 0,
		};
	}

	/**
	 * Check if all models unanimously agree on the answer
	 *
	 * @param responses - Current model responses
	 * @param question - The question being evaluated
	 * @returns Early termination result
	 */
	private checkUnanimousAgreement(
		responses: ModelConsensusResponse[],
		question: Question
	): EarlyTerminationResult {
		if (responses.length === 0) {
			return { shouldTerminate: false, reason: "", confidence: 0 };
		}

		const firstAnswer = responses[0].answer;
		const questionType = getQuestionType(question);

		// Check if all responses match the first answer
		const allAgree = responses.every(response =>
			compareAnswers(response.answer, firstAnswer, questionType).similarity === 1.0
		);

		if (allAgree) {
			return {
				shouldTerminate: true,
				reason: `All ${responses.length} models unanimously agree`,
				confidence: 1.0,
				type: "unanimous",
			};
		}

		return { shouldTerminate: false, reason: "", confidence: 0 };
	}

	/**
	 * Check if it's mathematically impossible to reach consensus threshold
	 *
	 * For example, if we have 5 models and need 66% agreement (4 models),
	 * but 3 models say A and 2 say B, and models never change their answers,
	 * we can't reach 4 agreeing models.
	 *
	 * @param responses - Current model responses
	 * @param question - The question being evaluated
	 * @param consensusThreshold - Required agreement threshold (0-1)
	 * @returns Early termination result
	 */
	private checkMathematicalImpossibility(
		responses: ModelConsensusResponse[],
		question: Question,
		consensusThreshold: number
	): EarlyTerminationResult {
		if (responses.length === 0) {
			return { shouldTerminate: false, reason: "", confidence: 0 };
		}

		const questionType = getQuestionType(question);
		const requiredCount = Math.ceil(responses.length * consensusThreshold);

		// Group responses by answer
		const answerGroups = this.groupResponsesByAnswer(responses, questionType);

		// Find the largest group
		const largestGroupSize = Math.max(...answerGroups.map(g => g.responses.length));

		// Check if we have a "super majority" that indicates strong entrenchment
		// If the largest group is very close to required but confidence is declining,
		// it might be impossible to reach consensus
		const superMajorityThreshold = 0.75; // 75% of required count
		const hasStrongMajority = largestGroupSize >= requiredCount * superMajorityThreshold;

		if (hasStrongMajority && answerGroups.length >= 3) {
			// Multiple factions with strong majority suggests impossibility
			// Only terminate if confidence is uniformly high (models are certain)
			const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;

			if (avgConfidence >= 0.8) {
				return {
					shouldTerminate: true,
					reason: `Strong factions with high confidence (${answerGroups.length} groups, largest: ${largestGroupSize}/${responses.length})`,
					confidence: 0.7,
					type: "impossibility",
				};
			}
		}

		return { shouldTerminate: false, reason: "", confidence: 0 };
	}

	/**
	 * Check if convergence has stalled (answers stopped changing)
	 *
	 * If answers haven't changed in the last 2 rounds, further rounds
	 * are unlikely to help.
	 *
	 * @param rounds - Consensus rounds completed so far
	 * @param question - The question being evaluated
	 * @returns Early termination result
	 */
	private checkConvergenceStalled(
		rounds: ConsensusRound[],
		question: Question
	): EarlyTerminationResult {
		if (rounds.length < 2) {
			return { shouldTerminate: false, reason: "", confidence: 0 };
		}

		const questionType = getQuestionType(question);
		const lastRound = rounds[rounds.length - 1];
		const secondLastRound = rounds[rounds.length - 2];

		// Count how many models changed their answers in the last round
		let changedCount = 0;

		for (const response of lastRound.modelResponses) {
			// Find the same model's response in the previous round
			const previousResponse = secondLastRound.modelResponses.find(
				r => r.modelId === response.modelId
			);

			if (previousResponse) {
				const comparisonResult = compareAnswers(
					response.answer,
					previousResponse.answer,
					questionType
				);

				// If answers are different (similarity < 1.0), count as changed
				if (comparisonResult.similarity < 1.0) {
					changedCount++;
				}
			}
		}

		// If no models changed their answers, convergence has stalled
		if (changedCount === 0) {
			return {
				shouldTerminate: true,
				reason: `Convergence stalled: No models changed answers in last round`,
				confidence: 0.9,
				type: "convergence_stalled",
			};
		}

		// If very few models changed (less than 20%), convergence is slowing
		const changeRate = changedCount / lastRound.modelResponses.length;
		if (changeRate < 0.2 && rounds.length >= 3) {
			return {
				shouldTerminate: true,
				reason: `Convergence stalled: Only ${changedCount}/${lastRound.modelResponses.length} models changed answers`,
				confidence: 0.75,
				type: "convergence_stalled",
			};
		}

		return { shouldTerminate: false, reason: "", confidence: 0 };
	}

	/**
	 * Check if there's a high-confidence majority
	 *
	 * If a majority of models agree with high confidence (>0.85),
	 * it's unlikely additional rounds will change the outcome.
	 *
	 * @param responses - Current model responses
	 * @param question - The question being evaluated
	 * @param consensusThreshold - Required agreement threshold (0-1)
	 * @returns Early termination result
	 */
	private checkHighConfidenceMajority(
		responses: ModelConsensusResponse[],
		question: Question,
		consensusThreshold: number
	): EarlyTerminationResult {
		if (responses.length === 0) {
			return { shouldTerminate: false, reason: "", confidence: 0 };
		}

		const questionType = getQuestionType(question);
		const answerGroups = this.groupResponsesByAnswer(responses, questionType);

		// Check each answer group for high-confidence majority
		for (const group of answerGroups) {
			const groupSize = group.responses.length;
			const agreementPercentage = groupSize / responses.length;

			// Check if this group meets or exceeds consensus threshold
			if (agreementPercentage >= consensusThreshold) {
				// Calculate average confidence for this group
				const avgConfidence = group.responses.reduce(
					(sum, r) => sum + r.confidence,
					0
				) / groupSize;

				// If average confidence is very high (>0.9), terminate
				if (avgConfidence >= 0.9) {
					return {
						shouldTerminate: true,
						reason: `High-confidence majority: ${groupSize}/${responses.length} models agree with ${(avgConfidence * 100).toFixed(0)}% confidence`,
						confidence: 0.85,
						type: "high_confidence_majority",
					};
				}
			}
		}

		return { shouldTerminate: false, reason: "", confidence: 0 };
	}

	/**
	 * Group responses by their answers
	 *
	 * @param responses - Model responses to group
	 * @param questionType - Type of question
	 * @returns Array of answer groups
	 */
	private groupResponsesByAnswer(
		responses: ModelConsensusResponse[],
		questionType: string
	): Array<{ answer: any; responses: ModelConsensusResponse[] }> {
		const groups: Array<{ answer: any; responses: ModelConsensusResponse[] }> = [];

		for (const response of responses) {
			// Find existing group with matching answer
			let matchingGroup = groups.find(group =>
				compareAnswers(group.answer, response.answer, questionType).similarity >= 0.95 // Allow slight fuzzy matching
			);

			if (matchingGroup) {
				matchingGroup.responses.push(response);
			} else {
				// Create new group
				groups.push({
					answer: response.answer,
					responses: [response],
				});
			}
		}

		// Sort groups by size (largest first)
		groups.sort((a, b) => b.responses.length - a.responses.length);

		return groups;
	}

	/**
	 * Estimate whether consensus is trending towards success
	 *
	 * This analyzes the trend across rounds to predict if consensus
	 * is likely to be reached in future rounds.
	 *
	 * @param rounds - Consensus rounds completed so far
	 * @param question - The question being evaluated
	 * @param consensusThreshold - Required agreement threshold (0-1)
	 * @returns Trend analysis
	 */
	public analyzeConvergenceTrend(
		rounds: ConsensusRound[],
		question: Question,
		consensusThreshold: number
	): {
		trending: "improving" | "declining" | "stable";
		likelihood: number; // 0-1 probability of reaching consensus
		estimatedRoundsNeeded: number;
	} {
		if (rounds.length < 2) {
			return {
				trending: "stable",
				likelihood: 0.5,
				estimatedRoundsNeeded: 3,
			};
		}

		const questionType = getQuestionType(question);

		// Calculate agreement percentages for each round
		const agreementPercentages: number[] = [];

		for (const round of rounds) {
			const answerGroups = this.groupResponsesByAnswer(round.modelResponses, questionType);
			const largestGroupSize = Math.max(...answerGroups.map(g => g.responses.length));
			const agreementPercentage = largestGroupSize / round.modelResponses.length;
			agreementPercentages.push(agreementPercentage);
		}

		// Calculate trend
		const firstAgreement = agreementPercentages[0];
		const lastAgreement = agreementPercentages[agreementPercentages.length - 1];
		const improvement = lastAgreement - firstAgreement;

		let trending: "improving" | "declining" | "stable";
		if (improvement > 0.05) {
			trending = "improving";
		} else if (improvement < -0.05) {
			trending = "declining";
		} else {
			trending = "stable";
		}

		// Calculate likelihood
		let likelihood = 0.5;
		if (lastAgreement >= consensusThreshold) {
			likelihood = 1.0; // Already reached
		} else if (trending === "improving") {
			// Estimate based on improvement rate
			const improvementRate = improvement / (rounds.length - 1);
			const gap = consensusThreshold - lastAgreement;
			const roundsToClose = gap / Math.max(improvementRate, 0.01);

			if (roundsToClose <= 2) {
				likelihood = 0.8;
			} else if (roundsToClose <= 4) {
				likelihood = 0.6;
			} else {
				likelihood = 0.3;
			}
		} else if (trending === "declining") {
			likelihood = 0.2;
		}

		// Estimate rounds needed
		let estimatedRoundsNeeded = 3;
		if (lastAgreement >= consensusThreshold) {
			estimatedRoundsNeeded = 0;
		} else if (trending === "improving") {
			const improvementRate = improvement / (rounds.length - 1);
			const gap = consensusThreshold - lastAgreement;
			estimatedRoundsNeeded = Math.ceil(gap / Math.max(improvementRate, 0.01));
		} else {
			estimatedRoundsNeeded = 5; // Unlikely to converge
		}

		return {
			trending,
			likelihood,
			estimatedRoundsNeeded: Math.min(estimatedRoundsNeeded, 10),
		};
	}
}
