import { ModelCoordinator, ModelResponse as ConsensusModelResponse, ResolvedConsensusModel } from "../consensus/modelCoordinator";
import {
	CouncilSettings,
	AnonymizedResponse,
	CritiqueResult,
	ModelRanking,
	RankingResult,
	ParsedRanking,
	CouncilPhase,
	CouncilErrorCategory,
	ErrorAction
} from "./types";
import { QuizSettings } from "../settings/config";
import { RateLimitManager } from "../consensus/rateLimitManager";
import Generator from "../generators/generator";
import GeneratorFactory from "../generators/generatorFactory";

/**
 * Manages the ranking phase of the LLM Council process
 *
 * Responsibilities:
 * - Orchestrate ranking requests to all models
 * - Build ranking prompts with anonymized responses and critiques
 * - Parse and validate ranking responses
 * - Aggregate individual rankings using Borda count algorithm
 * - Handle errors and partial failures gracefully
 *
 * Requirements: 2.4, 2.5, 2.6, 6.1
 */
export class RankingEngine {
	private readonly settings: CouncilSettings;
	private readonly quizSettings: QuizSettings;
	private readonly modelCoordinator: ModelCoordinator;
	private readonly rateLimitManager: RateLimitManager;
	private readonly resolvedModels: ResolvedConsensusModel[];
	private generatorCache: Map<string, Generator> = new Map();

	/**
	 * Create a new ranking engine
	 *
	 * @param settings - Council configuration settings
	 * @param quizSettings - Quiz settings for generator creation
	 * @param resolvedModels - Resolved model configurations from the registry
	 * @param modelCoordinator - Coordinator for parallel model invocation
	 * @param rateLimitManager - Rate limit manager (optional, creates default if not provided)
	 */
	constructor(
		settings: CouncilSettings,
		quizSettings: QuizSettings,
		resolvedModels: ResolvedConsensusModel[],
		modelCoordinator: ModelCoordinator,
		rateLimitManager?: RateLimitManager
	) {
		this.settings = settings;
		this.quizSettings = quizSettings;
		this.resolvedModels = resolvedModels;
		this.modelCoordinator = modelCoordinator;
		this.rateLimitManager = rateLimitManager || new RateLimitManager();
	}

	/**
	 * Request rankings from all models
	 *
	 * Each model orders responses from best to worst based on the initial
	 * responses and critiques. Models consider accuracy, clarity, difficulty,
	 * formatting, and coverage when ranking.
	 *
	 * @param anonymizedResponses - Responses to rank
	 * @param critiques - Critiques to inform rankings
	 * @param sourceContent - Original source material for context
	 * @returns Individual rankings from each model
	 *
	 * Requirements: 2.4, 2.5, 6.1
	 */
	public async requestRankings(
		anonymizedResponses: AnonymizedResponse[],
		critiques: CritiqueResult[],
		sourceContent: string[]
	): Promise<ModelRanking[]> {
		const enabledModels = this.resolvedModels.filter(model => model.enabled);
		const rankingPromises = enabledModels
			.map(model => this.requestRankingFromModel(
				model,
				anonymizedResponses,
				critiques,
				sourceContent
			));

		// Use allSettled to continue even if some rankings fail
		const results = await Promise.allSettled(rankingPromises);

		return results.map((result, index) => {
			const modelId = enabledModels[index].id;

			if (result.status === "fulfilled") {
				return result.value;
			} else {
				// Return error response for failed ranking
				return {
					modelId,
					ranking: [],
					reasoning: "",
					success: false,
					error: result.reason?.message || "Unknown error during ranking"
				};
			}
		});
	}

	/**
	 * Request ranking from a single model
	 *
	 * @param model - Resolved model configuration from the registry
	 * @param anonymizedResponses - All anonymized responses
	 * @param critiques - All critiques to inform ranking
	 * @param sourceContent - Source material
	 * @returns Ranking result from this model
	 */
	private async requestRankingFromModel(
		model: ResolvedConsensusModel,
		anonymizedResponses: AnonymizedResponse[],
		critiques: CritiqueResult[],
		sourceContent: string[]
	): Promise<ModelRanking> {
		const startTime = Date.now();

		try {
			// Build ranking prompt
			const rankingPrompt = this.buildRankingPrompt(
				model.id,
				anonymizedResponses,
				critiques,
				sourceContent
			);

			// Acquire rate limit permission
			await this.rateLimitManager.acquire(model.id);

			// Get or create generator for this model
			const generator = this.getOrCreateGenerator(model);

			// Invoke model with timeout
			const timeout = this.settings.phaseTimeouts.ranking;
			const rawResponse = await this.invokeWithTimeout(
				generator,
				rankingPrompt,
				timeout
			);

			// Extract token usage from generator if available
			const tokenUsage = this.extractTokenUsage(generator);

			// Release rate limit
			this.rateLimitManager.release(model.id);

			const duration = Date.now() - startTime;

			// Parse ranking response
			const parsedRanking = this.parseRankingResponse(
				rawResponse || "",
				anonymizedResponses
			);

			return {
				modelId: model.id,
				ranking: parsedRanking.ranking,
				reasoning: parsedRanking.reasoning,
				success: parsedRanking.success,
				error: parsedRanking.error,
				tokenUsage
			};
		} catch (error) {
			this.rateLimitManager.release(model.id);

			return {
				modelId: model.id,
				ranking: [],
				reasoning: "",
				success: false,
				error: (error as Error).message
			};
		}
	}

	/**
	 * Aggregate rankings using Borda count algorithm
	 *
	 * Borda count is a ranked voting system where each position in a ranking
	 * receives a score. For N responses:
	 * - 1st place receives N-1 points
	 * - 2nd place receives N-2 points
	 * - ...
	 * - Nth place receives 0 points
	 *
	 * The response with the highest total score is ranked first.
	 *
	 * @param modelRankings - Rankings from all models
	 * @returns Consensus ranking with scores
	 *
	 * Requirements: 2.5, 2.6
	 */
	public aggregateRankings(modelRankings: ModelRanking[]): RankingResult {
		// Filter to only successful rankings
		const successfulRankings = modelRankings.filter(r => r.success && r.ranking.length > 0);

		if (successfulRankings.length === 0) {
			// No successful rankings - return empty result
			return {
				consensusRanking: [],
				scores: new Map<string, number>(),
				individualRankings: modelRankings
			};
		}

		// Collect all unique response IDs
		const allResponseIds = new Set<string>();
		successfulRankings.forEach(ranking => {
			ranking.ranking.forEach(responseId => allResponseIds.add(responseId));
		});

		// Calculate Borda count scores
		const scores = new Map<string, number>();
		allResponseIds.forEach(id => scores.set(id, 0));

		// Calculate scores based on positions
		successfulRankings.forEach(ranking => {
			const n = ranking.ranking.length;

			ranking.ranking.forEach((responseId, index) => {
				// Position 0 gets (n-1) points, position 1 gets (n-2) points, etc.
				const points = n - 1 - index;
				const currentScore = scores.get(responseId) || 0;
				scores.set(responseId, currentScore + points);
			});
		});

		// Sort response IDs by score (highest first)
		const consensusRanking = Array.from(scores.entries())
			.sort((a, b) => {
				// Sort by score descending
				if (b[1] !== a[1]) {
					return b[1] - a[1];
				}
				// Tie-breaker: alphabetical order
				return a[0].localeCompare(b[0]);
			})
			.map(entry => entry[0]);

		return {
			consensusRanking,
			scores,
			individualRankings: modelRankings
		};
	}

	/**
	 * Build ranking prompt for a model
	 *
	 * Creates a structured prompt that asks the model to rank all responses
	 * from best to worst based on the initial responses and critiques.
	 *
	 * @param modelId - Model performing the ranking
	 * @param responses - Anonymized responses to rank
	 * @param critiques - Critiques from other models
	 * @param sourceContent - Original source material for context
	 * @returns Formatted ranking prompt
	 *
	 * Requirements: 2.5
	 */
	private buildRankingPrompt(
		modelId: string,
		responses: AnonymizedResponse[],
		critiques: CritiqueResult[],
		sourceContent: string[]
	): string {
		const sourceText = sourceContent.join("\n\n");

		// Format each response for the prompt
		const formattedResponses = responses
			.map(response => {
				const questionsPreview = response.quiz.questions
					.slice(0, 2)
					.map(q => `  - ${JSON.stringify(q)}`)
					.join("\n");

				const totalQuestions = response.quiz.questions.length;
				const preview = totalQuestions > 2
					? `${questionsPreview}\n  ... and ${totalQuestions - 2} more questions`
					: questionsPreview;

				return `### ${response.anonymousId}
Quiz with ${totalQuestions} questions:
${preview}

Full quiz data:
\`\`\`json
${JSON.stringify(response.quiz, null, 2)}
\`\`\``;
			})
			.join("\n\n");

		// Format critiques for the prompt
		const formattedCritiques = this.formatCritiquesForPrompt(critiques);

		return `You are participating in a quality ranking of quiz generation outputs. Based on the responses and critiques from other evaluators, rank all responses from best to worst.

Consider these criteria when ranking:
1. **Accuracy** - Alignment with source material, factual correctness
2. **Clarity** - Well-written, unambiguous questions
3. **Difficulty** - Appropriate challenge level
4. **Formatting** - Proper structure and presentation
5. **Coverage** - Comprehensive topic coverage from source material

CRITICAL: Questions MUST be directly traceable to the source material. Any response with questions not supported by the source should be ranked lower.

Source Material:
${sourceText}

---

Responses to Rank:
${formattedResponses}

---

Available Critiques from Other Evaluators:
${formattedCritiques}

---

Provide your ranking in the following JSON format:
\`\`\`json
{
  "ranking": ["Response B", "Response A", "Response C"],
  "reasoning": "Explain your reasoning for this ranking, highlighting what made the top-ranked response better and noting any critical flaws in lower-ranked responses."
}
\`\`\`

The "ranking" array should list ALL ${responses.length} responses from best to worst. Ensure your response is valid JSON.`;
	}

	/**
	 * Format critiques for inclusion in ranking prompt
	 *
	 * @param critiques - All critique results
	 * @returns Formatted critique text
	 */
	private formatCritiquesForPrompt(critiques: CritiqueResult[]): string {
		const successfulCritiques = critiques.filter(c => c.success && c.critiques.length > 0);

		if (successfulCritiques.length === 0) {
			return "(No critiques available)";
		}

		return successfulCritiques
			.map(critiqueResult => {
				const critiqueSummaries = critiqueResult.critiques
					.map(critique => {
						const strengthsText = critique.strengths.length > 0
							? `  Strengths: ${critique.strengths.join(", ")}`
							: "";
						const weaknessesText = critique.weaknesses.length > 0
							? `  Weaknesses: ${critique.weaknesses.join(", ")}`
							: "";
						const errorsText = critique.errors.length > 0
							? `  Errors: ${critique.errors.join(", ")}`
							: "";

						return `  ${critique.responseId}:
${strengthsText}
${weaknessesText}
${errorsText}
  Assessment: ${critique.overallAssessment}`;
					})
					.join("\n\n");

				return `Evaluator ${critiqueResult.criticModelId}:
${critiqueSummaries}`;
			})
			.join("\n\n");
	}

	/**
	 * Parse ranking response from model
	 *
	 * Extracts structured ranking data from the model's raw output.
	 * Handles both JSON-wrapped and plain JSON responses.
	 * Implements error recovery and validation.
	 *
	 * @param rawResponse - Raw text from model
	 * @param anonymizedResponses - All responses to validate ranking against
	 * @returns Structured ranking data or error
	 *
	 * Requirements: 2.6, 6.1
	 */
	private parseRankingResponse(
		rawResponse: string,
		anonymizedResponses: AnonymizedResponse[]
	): ParsedRanking {
		try {
			// Try to extract JSON from code blocks if present
			let jsonStr = rawResponse.trim();

			// Remove markdown code block wrapper if present
			const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
			if (codeBlockMatch) {
				jsonStr = codeBlockMatch[1].trim();
			}

			// Parse JSON
			const parsed = JSON.parse(jsonStr);

			// Validate structure
			if (!parsed.ranking || !Array.isArray(parsed.ranking)) {
				return {
					success: false,
					ranking: [],
					reasoning: "",
					error: "Invalid ranking format: missing or invalid 'ranking' array"
				};
			}

			const ranking: string[] = parsed.ranking;
			const reasoning: string = parsed.reasoning || "";

			// Validate that ranking includes all response IDs
			const expectedIds = new Set(anonymizedResponses.map(r => r.anonymousId));
			const providedIds = new Set(ranking);

			// Check for duplicates FIRST (before checking missing/extra)
			// Duplicates would make the set smaller than the array
			if (providedIds.size !== ranking.length) {
				return {
					success: false,
					ranking: [],
					reasoning: "",
					error: "Ranking contains duplicate response IDs"
				};
			}

			// Check for missing IDs
			const missingIds = Array.from(expectedIds).filter(id => !providedIds.has(id));
			if (missingIds.length > 0) {
				return {
					success: false,
					ranking: [],
					reasoning: "",
					error: `Ranking missing response IDs: ${missingIds.join(", ")}`
				};
			}

			// Check for extra IDs (should not happen, but validate anyway)
			const extraIds = ranking.filter(id => !expectedIds.has(id));
			if (extraIds.length > 0) {
				return {
					success: false,
					ranking: [],
					reasoning: "",
					error: `Ranking contains unknown response IDs: ${extraIds.join(", ")}`
				};
			}

			return {
				success: true,
				ranking,
				reasoning
			};
		} catch (error) {
			return {
				success: false,
				ranking: [],
				reasoning: "",
				error: `JSON parsing error: ${(error as Error).message}`
			};
		}
	}

	/**
	 * Get or create a generator instance for a model
	 *
	 * Caches generator instances for connection pooling and performance.
	 * Uses createFromProviderConfig for direct provider configuration access.
	 *
	 * @param config - Model configuration with ProviderConfig
	 * @returns Generator instance
	 *
	 * Requirements: 6.2 (simplified settings mapping)
	 */
	private getOrCreateGenerator(model: ResolvedConsensusModel): Generator {
		if (this.generatorCache.has(model.id)) {
			return this.generatorCache.get(model.id)!;
		}

		// Create generator directly from ProviderConfig in the model's modelConfig
		const generator = GeneratorFactory.createFromProviderConfig(
			model.modelConfig.providerConfig,
			this.quizSettings,
			model.id
		);

		this.generatorCache.set(model.id, generator);
		return generator;
	}

	/**
	 * Invoke generator with timeout protection
	 *
	 * @param generator - Generator instance
	 * @param prompt - Prompt to send
	 * @param timeout - Maximum time to wait (milliseconds)
	 * @returns Raw response from generator
	 */
	private async invokeWithTimeout(
		generator: Generator,
		prompt: string,
		timeout: number
	): Promise<string | null> {
		return Promise.race([
			generator.generateQuiz([prompt]),
			new Promise<null>((_, reject) =>
				setTimeout(() => reject(new Error("Ranking request timed out")), timeout)
			)
		]);
	}

	/**
	 * Extract token usage from a generator if available
	 *
	 * This method attempts to get token usage from generators that support it
	 * (e.g., OpenAIGenerator). If the generator doesn't support token usage
	 * tracking, this returns undefined.
	 *
	 * @param generator - Generator instance to extract from
	 * @returns Total token count, or undefined if not available
	 *
	 * Requirements: 7.1, 7.3
	 */
	private extractTokenUsage(generator: Generator): number | undefined {
		// Try to get token usage from OpenAI generator
		if (typeof (generator as any).getLastTokenUsage === "function") {
			const usage = (generator as any).getLastTokenUsage();
			if (usage && typeof usage.totalTokens === "number") {
				return usage.totalTokens;
			}
		}

		// Generator doesn't support token usage tracking
		return undefined;
	}

	/**
	 * Clear generator cache
	 *
	 * Useful for cleanup and testing.
	 */
	public clearCache(): void {
		this.generatorCache.clear();
	}
}
