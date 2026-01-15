import { ModelCoordinator, ModelResponse as ConsensusModelResponse, ResolvedConsensusModel } from "../consensus/modelCoordinator";
import {
	CouncilSettings,
	AnonymizedResponse,
	CritiqueResult,
	RankingResult,
	CouncilPhase,
	CouncilErrorCategory,
	ErrorAction
} from "./types";
import { ConsensusModelConfig } from "../consensus/types";
import { Quiz } from "../utils/types";
import { QuizSettings } from "../settings/config";
import { RateLimitManager } from "../consensus/rateLimitManager";
import Generator from "../generators/generator";
import GeneratorFactory from "../generators/generatorFactory";
import {
	ModelResolver,
	createModelResolver,
	isModelNotFoundError,
	ModelConfiguration,
} from "../settings/modelRegistry";
import { Provider } from "../generators/providers";

/**
 * Manages the chair model synthesis phase of the LLM Council process
 *
 * Responsibilities:
 * - Select the chair model based on configuration strategy
 * - Orchestrate synthesis request to chair model
 * - Build comprehensive synthesis prompt with all debate data
 * - Parse and validate synthesized quiz response
 * - Handle errors and implement fallback strategies
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.2, 6.3
 */
export class ChairSynthesisEngine {
	private readonly settings: CouncilSettings;
	private readonly quizSettings: QuizSettings;
	private readonly resolvedModels: ResolvedConsensusModel[];
	private readonly modelCoordinator: ModelCoordinator;
	private readonly rateLimitManager: RateLimitManager;
	private generatorCache: Map<string, Generator> = new Map();

	/**
	 * Create a new chair synthesis engine
	 *
	 * This constructor now supports both the legacy format (councilModels with
	 * embedded settings) and the new registry-based format (resolved models from
	 * the central ModelRegistry).
	 *
	 * @param settings - Council configuration settings
	 * @param quizSettings - Quiz generation settings (contains model registry)
	 * @param resolvedModels - Pre-resolved model configurations from the registry
	 * @param modelCoordinator - Coordinator for parallel model invocation (optional)
	 * @param rateLimitManager - Rate limit manager (optional, creates default if not provided)
	 *
	 * Requirements: 1.4, 3.1, 9.4
	 */
	constructor(
		settings: CouncilSettings,
		quizSettings: QuizSettings,
		resolvedModels: ResolvedConsensusModel[],
		modelCoordinator?: ModelCoordinator,
		rateLimitManager?: RateLimitManager
	) {
		this.settings = settings;
		this.quizSettings = quizSettings;
		this.resolvedModels = resolvedModels;
		this.rateLimitManager = rateLimitManager || new RateLimitManager();

		// If modelCoordinator not provided, create one from resolved models
		this.modelCoordinator = modelCoordinator || new ModelCoordinator(
			resolvedModels,
			quizSettings,
			this.rateLimitManager
		);
	}

	/**
	 * Select the chair model based on configuration strategy
	 *
	 * Supports three selection strategies:
	 * - "configured": Use the specific model configured in settings
	 * - "highest-ranked": Use the model with the highest ranking from the critique phase
	 * - "rotating": Rotate through available models in a round-robin fashion
	 *
	 * Implements fallback logic when the configured chair is unavailable.
	 *
	 * @param rankings - Ranking results from the ranking phase
	 * @param anonymizedResponses - Anonymized responses to map back to model IDs
	 * @returns ID of the selected chair model
	 *
	 * Requirements: 3.1, 3.2, 3.3
	 */
	public selectChairModel(
		rankings: RankingResult,
		anonymizedResponses: AnonymizedResponse[]
	): string {
		const strategy = this.settings.chairModel.selectionStrategy;
		const successfulModelIds = anonymizedResponses.map(r => r.originalModelId);

		switch (strategy) {
			case "configured": {
				// Use configured chair model if available
				const configuredChairId = this.settings.chairModel.configuredChairId;
				if (configuredChairId && successfulModelIds.includes(configuredChairId)) {
					return configuredChairId;
				}

				// Fallback to highest-ranked if configured chair unavailable
				console.warn(
					`Configured chair model "${configuredChairId}" is unavailable. Falling back to highest-ranked.`
				);
				return this.selectHighestRankedModel(rankings, anonymizedResponses);
			}

			case "highest-ranked": {
				return this.selectHighestRankedModel(rankings, anonymizedResponses);
			}

			case "rotating": {
				return this.selectRotatingModel(successfulModelIds);
			}

			default: {
				// Fallback to highest-ranked for unknown strategies
				console.warn(
					`Unknown chair selection strategy "${strategy}". Falling back to highest-ranked.`
				);
				return this.selectHighestRankedModel(rankings, anonymizedResponses);
			}
		}
	}

	/**
	 * Select the highest-ranked model as chair
	 *
	 * Finds the model that produced the highest-ranked response and uses it as chair.
	 * If no rankings available, defaults to the first successful model.
	 *
	 * @param rankings - Ranking results
	 * @param anonymizedResponses - Anonymized responses to map back to original model IDs
	 * @returns ID of highest-ranked model
	 */
	private selectHighestRankedModel(
		rankings: RankingResult,
		anonymizedResponses: AnonymizedResponse[]
	): string {
		// If no rankings available, use first successful model
		if (!rankings.consensusRanking || rankings.consensusRanking.length === 0) {
			return anonymizedResponses[0]?.originalModelId || "";
		}

		// Get the highest-ranked anonymous response ID
		const highestRankedResponseId = rankings.consensusRanking[0];

		// Find the model that produced this response
		const highestRankedResponse = anonymizedResponses.find(
			r => r.anonymousId === highestRankedResponseId
		);

		if (!highestRankedResponse) {
			// Fallback to first successful model
			console.warn(
				`Could not find model for highest-ranked response "${highestRankedResponseId}". Using first available.`
			);
			return anonymizedResponses[0]?.originalModelId || "";
		}

		return highestRankedResponse.originalModelId;
	}

	/**
	 * Select model using rotating strategy
	 *
	 * Implements round-robin selection through available models.
	 * Maintains rotation index in settings.
	 *
	 * @param successfulModelIds - IDs of models with successful responses
	 * @returns ID of rotated model
	 */
	private selectRotatingModel(successfulModelIds: string[]): string {
		const rotationIndex = this.settings.chairModel.rotationIndex || 0;
		const selectedIndex = rotationIndex % successfulModelIds.length;

		// Update rotation index for next call
		this.settings.chairModel.rotationIndex = (rotationIndex + 1) % successfulModelIds.length;

		return successfulModelIds[selectedIndex];
	}

	/**
	 * Synthesize final quiz using chair model
	 *
	 * The chair model receives all debate data (responses, critiques, rankings)
	 * and synthesizes the best elements into a final, high-quality quiz.
	 *
	 * Implements fallback strategy when chair model fails:
	 * 1. Try second-choice chair model (if available)
	 * 2. Return highest-ranked response as fallback
	 *
	 * @param anonymizedResponses - Original anonymized responses
	 * @param originalResponses - Original model responses with IDs
	 * @param critiques - All critiques from models
	 * @param rankings - Aggregated rankings
	 * @param chairModelId - Selected chair model ID
	 * @param sourceContent - Original source material
	 * @returns Synthesis result with quiz and optional token usage
	 *
	 * Requirements: 3.4, 3.5, 6.2, 6.3, 7.1
	 */
	public async synthesizeFinalQuiz(
		anonymizedResponses: AnonymizedResponse[],
		originalResponses: ConsensusModelResponse[],
		critiques: CritiqueResult[],
		rankings: RankingResult,
		chairModelId: string,
		sourceContent: string[]
	): Promise<{ quiz: Quiz; tokenUsage?: number }> {
		try {
			// Build synthesis prompt with all debate data
			const synthesisPrompt = this.buildSynthesisPrompt(
				anonymizedResponses,
				originalResponses,
				critiques,
				rankings,
				sourceContent
			);

			// Find chair model configuration from resolved models
			const resolvedChair = this.resolvedModels.find(m => m.id === chairModelId);
			if (!resolvedChair) {
				throw new Error(`Chair model configuration not found for "${chairModelId}"`);
			}

			// Acquire rate limit permission
			await this.rateLimitManager.acquire(chairModelId);

			// Get or create generator for chair model
			const generator = this.getOrCreateGenerator(resolvedChair);

			// Invoke chair model with timeout
			const timeout = this.settings.phaseTimeouts.synthesis;
			const rawResponse = await this.invokeWithTimeout(
				generator,
				synthesisPrompt,
				timeout
			);

			// Extract token usage from generator if available
			const tokenUsage = this.extractTokenUsage(generator);

			// Release rate limit
			this.rateLimitManager.release(chairModelId);

			// Parse synthesis response
			const quiz = this.parseSynthesisResponse(rawResponse || "");

			if (!quiz) {
				throw new Error("Failed to parse synthesis response from chair model");
			}

			return { quiz, tokenUsage };
		} catch (error) {
			// Release rate limit in case of error
			this.rateLimitManager.release(chairModelId);

			console.error(`Chair model synthesis failed: ${(error as Error).message}`);

			// Fallback: Return highest-ranked response (no token usage)
			return {
				quiz: this.getFallbackQuiz(anonymizedResponses, rankings),
				tokenUsage: undefined,
			};
		}
	}

	/**
	 * Get fallback quiz when chair synthesis fails
	 *
	 * Returns the quiz from the highest-ranked response as a fallback.
	 *
	 * @param anonymizedResponses - Anonymized responses
	 * @param rankings - Ranking results
	 * @returns Quiz from highest-ranked response
	 */
	private getFallbackQuiz(
		anonymizedResponses: AnonymizedResponse[],
		rankings: RankingResult
	): Quiz {
		// Get highest-ranked response ID
		const highestRankedId = rankings.consensusRanking[0];

		// Find the corresponding quiz
		const highestRankedResponse = anonymizedResponses.find(
			r => r.anonymousId === highestRankedId
		);

		if (!highestRankedResponse) {
			// Ultimate fallback: first response
			console.warn("Could not find highest-ranked response. Using first available response.");
			return anonymizedResponses[0].quiz;
		}

		return highestRankedResponse.quiz;
	}

	/**
	 * Build synthesis prompt for chair model
	 *
	 * Creates a comprehensive prompt that includes:
	 * - Source material
	 * - All responses with revealed model IDs
	 * - All critiques from models
	 * - Consensus rankings
	 * - Instructions to synthesize best elements
	 *
	 * @param anonymizedResponses - Anonymized responses
	 * @param originalResponses - Original responses with model IDs
	 * @param critiques - All critiques
	 * @param rankings - Final rankings
	 * @param sourceContent - Original source material
	 * @returns Comprehensive synthesis prompt
	 *
	 * Requirements: 3.5
	 */
	private buildSynthesisPrompt(
		anonymizedResponses: AnonymizedResponse[],
		originalResponses: ConsensusModelResponse[],
		critiques: CritiqueResult[],
		rankings: RankingResult,
		sourceContent: string[]
	): string {
		const sourceText = sourceContent.join("\n\n");

		// Create mapping from anonymous ID to model ID
		const anonymousToModelMap = new Map<string, string>();
		anonymizedResponses.forEach(response => {
			anonymousToModelMap.set(response.anonymousId, response.originalModelId);
		});

		// Format responses with revealed model IDs
		const formattedResponses = anonymizedResponses
			.map(response => {
				const modelId = response.originalModelId;
				const questionsPreview = response.quiz.questions
					.slice(0, 2)
					.map(q => `  - ${q.question || JSON.stringify(q).substring(0, 100)}`)
					.join("\n");

				const totalQuestions = response.quiz.questions.length;
				const preview = totalQuestions > 2
					? `${questionsPreview}\n  ... and ${totalQuestions - 2} more questions`
					: questionsPreview;

				return `### ${response.anonymousId} (from ${modelId})
Quiz with ${totalQuestions} questions:
${preview}

Full quiz data:
\`\`\`json
${JSON.stringify(response.quiz, null, 2)}
\`\`\``;
			})
			.join("\n\n");

		// Format critiques
		const formattedCritiques = this.formatCritiquesForPrompt(critiques);

		// Format rankings
		const formattedRankings = this.formatRankingsForPrompt(rankings, anonymousToModelMap);

		return `You are the chair of an LLM Council. Multiple models have generated quiz responses, critiqued each other's work, and provided rankings.

Your task as chair:
1. Review all responses, critiques, and rankings carefully
2. Identify the BEST ELEMENTS from all responses (best questions, clearest wording, optimal difficulty)
3. Synthesize these elements into a final, high-quality quiz
4. Ensure the final quiz is accurate, clear, well-formatted, and comprehensive
5. CRITICAL: Every question MUST be directly traceable to the source material

You should:
- Use the highest-ranked responses as your primary foundation
- Incorporate strong questions from other responses when they add value
- Fix any errors or weaknesses identified in the critiques
- Ensure consistent difficulty and formatting across all questions
- Avoid redundant or duplicate questions

Source Material:
${sourceText}

---

All Responses (with model identities revealed):
${formattedResponses}

---

Critiques from Council Members:
${formattedCritiques}

---

Consensus Rankings:
${formattedRankings}

---

Create the final synthesized quiz in the exact same JSON format as the input quizzes. Your response should be ONLY the quiz JSON, with no additional commentary:

\`\`\`json
{
  "questions": [
    // Your synthesized questions here
  ]
}
\`\`\`

Ensure your response is valid JSON matching the quiz structure shown in the responses above.`;
	}

	/**
	 * Format critiques for synthesis prompt
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
						const parts: string[] = [];

						if (critique.strengths.length > 0) {
							parts.push(`  Strengths: ${critique.strengths.join(", ")}`);
						}
						if (critique.weaknesses.length > 0) {
							parts.push(`  Weaknesses: ${critique.weaknesses.join(", ")}`);
						}
						if (critique.errors.length > 0) {
							parts.push(`  Errors: ${critique.errors.join(", ")}`);
						}
						parts.push(`  Assessment: ${critique.overallAssessment}`);

						return `  ${critique.responseId}:\n${parts.join("\n")}`;
					})
					.join("\n\n");

				return `Council Member ${critiqueResult.criticModelId}:
${critiqueSummaries}`;
			})
			.join("\n\n");
	}

	/**
	 * Format rankings for synthesis prompt
	 *
	 * @param rankings - Ranking results
	 * @param anonymousToModelMap - Mapping from anonymous IDs to model IDs
	 * @returns Formatted ranking text
	 */
	private formatRankingsForPrompt(
		rankings: RankingResult,
		anonymousToModelMap: Map<string, string>
	): string {
		// Format consensus ranking
		const consensusRanking = rankings.consensusRanking
			.map((responseId, index) => {
				const score = rankings.scores.get(responseId) || 0;
				const modelId = anonymousToModelMap.get(responseId) || "unknown";
				return `${index + 1}. ${responseId} (from ${modelId}) - Score: ${score}`;
			})
			.join("\n");

		// Format individual rankings
		const individualRankings = rankings.individualRankings
			.filter(r => r.success && r.ranking.length > 0)
			.map(ranking => {
				const rankingText = ranking.ranking.join(" > ");
				return `  ${ranking.modelId}: ${rankingText}
  Reasoning: ${ranking.reasoning}`;
			})
			.join("\n\n");

		return `Consensus Ranking (Borda count):
${consensusRanking}

Individual Rankings:
${individualRankings}`;
	}

	/**
	 * Parse synthesized quiz from chair model response
	 *
	 * Extracts and validates the quiz structure from the chair's output.
	 * Handles both JSON-wrapped and plain JSON responses.
	 * Implements error recovery for malformed responses.
	 *
	 * @param rawResponse - Raw output from chair model
	 * @returns Parsed quiz structure or null if parsing fails
	 *
	 * Requirements: 3.6, 6.3
	 */
	private parseSynthesisResponse(rawResponse: string): Quiz | null {
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

			// Validate quiz structure
			if (!parsed.questions || !Array.isArray(parsed.questions)) {
				console.error("Invalid quiz format: missing or invalid 'questions' array");
				return null;
			}

			// Basic validation: ensure we have at least one question
			if (parsed.questions.length === 0) {
				console.error("Invalid quiz: no questions found");
				return null;
			}

			// Return the quiz (assuming it matches the Quiz type structure)
			return parsed as Quiz;
		} catch (error) {
			console.error(`Failed to parse synthesis response: ${(error as Error).message}`);
			return null;
		}
	}

	/**
	 * Get or create a generator instance for a resolved model.
	 *
	 * Caches generator instances for connection pooling and performance.
	 *
	 * For the new registry-based format, it uses GeneratorFactory.createFromModelConfig()
	 * to create generators from the resolved ModelConfiguration.
	 *
	 * For legacy format (with legacySettings), it falls back to the old behavior.
	 *
	 * @param resolvedModel - Resolved model from registry
	 * @returns Generator instance
	 *
	 * Requirements: 1.4, 9.4
	 */
	private getOrCreateGenerator(resolvedModel: ResolvedConsensusModel): Generator {
		if (this.generatorCache.has(resolvedModel.id)) {
			return this.generatorCache.get(resolvedModel.id)!;
		}

		// Create generator from ModelConfiguration using the registry-based factory
		// (Legacy createInstance path has been removed as part of task 6.1)
		const generator = GeneratorFactory.createFromModelConfig(
			resolvedModel.modelConfig,
			this.quizSettings
		);

		this.generatorCache.set(resolvedModel.id, generator);
		return generator;
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
	 * Requirements: 7.1
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
				setTimeout(() => reject(new Error("Synthesis request timed out")), timeout)
			)
		]);
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
