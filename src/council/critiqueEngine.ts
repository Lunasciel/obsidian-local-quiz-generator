import { ModelCoordinator, ModelResponse as ConsensusModelResponse, ResolvedConsensusModel } from "../consensus/modelCoordinator";
import {
	CouncilSettings,
	AnonymizedResponse,
	CritiqueResult,
	ResponseCritique,
	ParsedCritique,
	CouncilPhase,
	CouncilErrorCategory,
	ErrorAction
} from "./types";
import { Quiz } from "../utils/types";
import { QuizSettings } from "../settings/config";
import { RateLimitManager } from "../consensus/rateLimitManager";
import Generator from "../generators/generator";
import GeneratorFactory from "../generators/generatorFactory";

/**
 * Manages the critique phase of the LLM Council process
 *
 * Responsibilities:
 * - Anonymize model responses for unbiased evaluation
 * - Orchestrate critique requests to all models
 * - Build critique prompts with anonymized responses
 * - Parse and validate critique responses
 * - Handle errors and partial failures gracefully
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
export class CritiqueEngine {
	private readonly settings: CouncilSettings;
	private readonly quizSettings: QuizSettings;
	private readonly modelCoordinator: ModelCoordinator;
	private readonly rateLimitManager: RateLimitManager;
	private readonly resolvedModels: ResolvedConsensusModel[];
	private generatorCache: Map<string, Generator> = new Map();

	/**
	 * Create a new critique engine
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
	 * Anonymize responses for unbiased critique
	 *
	 * Assigns anonymous IDs (Response A, B, C, etc.) to each response
	 * while preserving the original model IDs internally for later de-anonymization.
	 *
	 * @param responses - Original model responses with identifiers
	 * @returns Anonymized responses with random IDs
	 *
	 * Requirements: 2.1, 2.2
	 */
	public anonymizeResponses(responses: ConsensusModelResponse[]): AnonymizedResponse[] {
		// Filter to only successful responses with valid quizzes
		const successfulResponses = responses.filter(
			r => r.success && r.quiz !== null
		);

		// Create anonymized responses with sequential letter IDs
		return successfulResponses.map((response, index) => {
			const anonymousId = `Response ${String.fromCharCode(65 + index)}`; // A, B, C, etc.

			return {
				anonymousId,
				originalModelId: response.modelId,
				quiz: response.quiz as Quiz
			};
		});
	}

	/**
	 * Request critiques from all models
	 *
	 * Each model critiques all responses except its own. This ensures
	 * unbiased evaluation and prevents self-congratulatory assessments.
	 *
	 * @param anonymizedResponses - Responses with anonymous IDs
	 * @param originalResponses - Original responses to map models to their responses
	 * @param sourceContent - Original source material for context
	 * @returns Critique results from all models
	 *
	 * Requirements: 2.3, 2.4, 6.1
	 */
	public async requestCritiques(
		anonymizedResponses: AnonymizedResponse[],
		originalResponses: ConsensusModelResponse[],
		sourceContent: string[]
	): Promise<CritiqueResult[]> {
		const enabledModels = this.resolvedModels.filter(model => model.enabled);
		const critiquePromises = enabledModels
			.map(model => this.requestCritiqueFromModel(
				model,
				anonymizedResponses,
				originalResponses,
				sourceContent
			));

		// Use allSettled to continue even if some critiques fail
		const results = await Promise.allSettled(critiquePromises);

		return results.map((result, index) => {
			const modelId = enabledModels[index].id;

			if (result.status === "fulfilled") {
				return result.value;
			} else {
				// Return error response for failed critique
				return {
					criticModelId: modelId,
					critiques: [],
					success: false,
					error: result.reason?.message || "Unknown error during critique"
				};
			}
		});
	}

	/**
	 * Request critique from a single model
	 *
	 * @param model - Resolved model configuration from the registry
	 * @param anonymizedResponses - All anonymized responses
	 * @param originalResponses - Original responses to exclude self-critique
	 * @param sourceContent - Source material
	 * @returns Critique result from this model
	 */
	private async requestCritiqueFromModel(
		model: ResolvedConsensusModel,
		anonymizedResponses: AnonymizedResponse[],
		originalResponses: ConsensusModelResponse[],
		sourceContent: string[]
	): Promise<CritiqueResult> {
		const startTime = Date.now();

		try {
			// Filter out this model's own response
			const responsesToCritique = this.filterOwnResponse(
				anonymizedResponses,
				model.id
			);

			// Build critique prompt
			const critiquePrompt = this.buildCritiquePrompt(
				model.id,
				responsesToCritique,
				sourceContent
			);

			// Acquire rate limit permission
			await this.rateLimitManager.acquire(model.id);

			// Get or create generator for this model
			const generator = this.getOrCreateGenerator(model);

			// Invoke model with timeout
			const timeout = this.settings.phaseTimeouts.critique;
			const rawResponse = await this.invokeWithTimeout(
				generator,
				critiquePrompt,
				timeout
			);

			// Extract token usage from generator if available
			const tokenUsage = this.extractTokenUsage(generator);

			// Release rate limit
			this.rateLimitManager.release(model.id);

			const duration = Date.now() - startTime;

			// Parse critique response
			const parsedCritique = this.parseCritiqueResponse(rawResponse || "");

			return {
				criticModelId: model.id,
				critiques: parsedCritique.critiques,
				success: parsedCritique.success,
				error: parsedCritique.error,
				tokenUsage
			};
		} catch (error) {
			this.rateLimitManager.release(model.id);

			return {
				criticModelId: model.id,
				critiques: [],
				success: false,
				error: (error as Error).message
			};
		}
	}

	/**
	 * Filter out a model's own response from the critique list
	 *
	 * Ensures models don't critique their own output.
	 *
	 * @param anonymizedResponses - All anonymized responses
	 * @param modelId - ID of the model that will perform critique
	 * @returns Filtered list excluding the model's own response
	 */
	private filterOwnResponse(
		anonymizedResponses: AnonymizedResponse[],
		modelId: string
	): AnonymizedResponse[] {
		return anonymizedResponses.filter(
			response => response.originalModelId !== modelId
		);
	}

	/**
	 * Build critique prompt for a model
	 *
	 * Creates a structured prompt that asks the model to evaluate
	 * multiple anonymized responses, identifying strengths, weaknesses,
	 * and errors in each.
	 *
	 * @param modelId - Model performing the critique
	 * @param responsesToCritique - Anonymized responses to evaluate
	 * @param sourceContent - Original source material for context
	 * @returns Formatted critique prompt
	 *
	 * Requirements: 2.4, 2.5
	 */
	private buildCritiquePrompt(
		modelId: string,
		responsesToCritique: AnonymizedResponse[],
		sourceContent: string[]
	): string {
		const sourceText = sourceContent.join("\n\n");

		// Format each response for the prompt
		const formattedResponses = responsesToCritique
			.map(response => {
				const questionsPreview = response.quiz.questions
					.slice(0, 3)
					.map(q => `  - ${JSON.stringify(q)}`)
					.join("\n");

				const totalQuestions = response.quiz.questions.length;
				const preview = totalQuestions > 3
					? `${questionsPreview}\n  ... and ${totalQuestions - 3} more questions`
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

		return `You are participating in a peer review of quiz generation outputs. You will evaluate multiple anonymized quiz responses.

Your task:
1. Review each response carefully
2. Identify STRENGTHS (what works well)
3. Identify WEAKNESSES (areas for improvement)
4. Identify ERRORS (factual mistakes, formatting issues, questions not supported by source)
5. Provide an OVERALL ASSESSMENT

Be objective and constructive. Focus on quiz quality, accuracy, and adherence to the source material.

CRITICAL: You MUST ONLY evaluate quizzes based on information explicitly stated in the source material below. Any question not directly traceable to the source should be flagged as an error.

Source Material:
${sourceText}

---

Responses to Evaluate:
${formattedResponses}

---

Provide your critique in the following JSON format:
\`\`\`json
{
  "critiques": [
    {
      "responseId": "Response A",
      "strengths": ["Specific strength 1", "Specific strength 2"],
      "weaknesses": ["Specific weakness 1", "Specific weakness 2"],
      "errors": ["Specific error 1", "Specific error 2"],
      "overallAssessment": "Brief overall assessment of this response"
    }
  ]
}
\`\`\`

Ensure your response is valid JSON and includes critiques for all ${responsesToCritique.length} responses.`;
	}

	/**
	 * Parse critique response from model
	 *
	 * Extracts structured critique data from the model's raw output.
	 * Handles both JSON-wrapped and plain JSON responses.
	 * Implements error recovery for malformed responses.
	 *
	 * @param rawResponse - Raw text from model
	 * @returns Structured critique data or error
	 *
	 * Requirements: 2.6, 6.1
	 */
	private parseCritiqueResponse(rawResponse: string): ParsedCritique {
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
			if (!parsed.critiques || !Array.isArray(parsed.critiques)) {
				return {
					success: false,
					critiques: [],
					error: "Invalid critique format: missing or invalid 'critiques' array"
				};
			}

			// Validate each critique
			const validCritiques: ResponseCritique[] = [];
			for (const critique of parsed.critiques) {
				if (!critique.responseId || typeof critique.responseId !== "string") {
					continue; // Skip invalid critique
				}

				validCritiques.push({
					responseId: critique.responseId,
					strengths: Array.isArray(critique.strengths) ? critique.strengths : [],
					weaknesses: Array.isArray(critique.weaknesses) ? critique.weaknesses : [],
					errors: Array.isArray(critique.errors) ? critique.errors : [],
					overallAssessment: critique.overallAssessment || ""
				});
			}

			if (validCritiques.length === 0) {
				return {
					success: false,
					critiques: [],
					error: "No valid critiques found in response"
				};
			}

			return {
				success: true,
				critiques: validCritiques
			};
		} catch (error) {
			return {
				success: false,
				critiques: [],
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
				setTimeout(() => reject(new Error("Critique request timed out")), timeout)
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
