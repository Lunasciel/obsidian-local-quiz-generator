import { Notice } from "obsidian";
import OpenAI from "openai";
import Generator from "../generator";
import { cosineSimilarity } from "../../utils/helpers";
import {
	GeneratorResponse,
	TokenUsage,
	GeneratorSettings,
	OpenAIProviderConfig,
} from "../generatorTypes";
import { Provider } from "../providers";

/**
 * OpenAI-compatible generator for quiz generation and answer evaluation.
 *
 * Supports OpenAI's API and compatible endpoints (LM Studio, OpenRouter, etc.)
 * Uses the ProviderConfig for API configuration and GeneratorSettings for
 * quiz generation parameters.
 *
 * Requirements: 3.2, 3.3
 */
export default class OpenAIGenerator extends Generator {
	private readonly openai: OpenAI;
	private readonly providerConfig: OpenAIProviderConfig;

	/** Track last token usage for access by external code */
	private lastTokenUsage?: TokenUsage;

	constructor(settings: GeneratorSettings) {
		super(settings);

		// Validate that we have OpenAI provider config
		if (settings.providerConfig.provider !== Provider.OPENAI) {
			throw new Error(
				`OpenAIGenerator requires OpenAI provider config, got: ${settings.providerConfig.provider}`
			);
		}

		this.providerConfig = settings.providerConfig as OpenAIProviderConfig;
		this.openai = new OpenAI({
			apiKey: this.providerConfig.apiKey,
			baseURL: this.providerConfig.baseUrl,
			dangerouslyAllowBrowser: true,
		});
	}

	public async generateQuiz(contents: string[]): Promise<string | null> {
		try {
			const response = await this.openai.chat.completions.create({
				model: this.providerConfig.textGenerationModel,
				messages: [
					{ role: "system", content: this.systemPrompt() },
					{ role: "user", content: this.userPrompt(contents) },
				],
				response_format: { type: "json_object" },
			});

			if (response.choices[0].finish_reason === "length") {
				new Notice("Generation truncated: Token limit reached");
			}

			// Extract and store token usage information
			if (response.usage) {
				this.lastTokenUsage = {
					promptTokens: response.usage.prompt_tokens,
					completionTokens: response.usage.completion_tokens,
					totalTokens: response.usage.total_tokens,
					// OpenAI may provide cached tokens in some cases
					cachedTokens: (response.usage as any).prompt_tokens_details?.cached_tokens,
				};
			}

			return response.choices[0].message.content;
		} catch (error) {
			throw new Error((error as Error).message);
		}
	}

	/**
	 * Generate quiz with detailed response including token usage
	 *
	 * This method provides the same functionality as generateQuiz but
	 * returns additional metadata including token usage for cost tracking.
	 *
	 * @param contents - Source content for quiz generation
	 * @returns Generator response with content and usage information
	 */
	public async generateQuizWithUsage(contents: string[]): Promise<GeneratorResponse> {
		try {
			const response = await this.openai.chat.completions.create({
				model: this.providerConfig.textGenerationModel,
				messages: [
					{ role: "system", content: this.systemPrompt() },
					{ role: "user", content: this.userPrompt(contents) },
				],
				response_format: { type: "json_object" },
			});

			if (response.choices[0].finish_reason === "length") {
				new Notice("Generation truncated: Token limit reached");
			}

			// Extract token usage information
			const usage: TokenUsage | undefined = response.usage
				? {
						promptTokens: response.usage.prompt_tokens,
						completionTokens: response.usage.completion_tokens,
						totalTokens: response.usage.total_tokens,
						cachedTokens: (response.usage as any).prompt_tokens_details
							?.cached_tokens,
						metadata: {
							finishReason: response.choices[0].finish_reason,
							model: response.model,
						},
				  }
				: undefined;

			return {
				content: response.choices[0].message.content,
				usage,
			};
		} catch (error) {
			throw new Error((error as Error).message);
		}
	}

	/**
	 * Get the last token usage from the most recent generateQuiz call
	 *
	 * This allows callers to access token usage even when using the
	 * original generateQuiz method for backward compatibility.
	 *
	 * @returns Last token usage, or undefined if no quiz has been generated yet
	 */
	public getLastTokenUsage(): TokenUsage | undefined {
		return this.lastTokenUsage;
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		try {
			const embedding = await this.openai.embeddings.create({
				model: this.providerConfig.embeddingModel,
				input: [userAnswer, answer],
			});

			return cosineSimilarity(embedding.data[0].embedding, embedding.data[1].embedding);
		} catch (error) {
			throw new Error((error as Error).message);
		}
	}
}
