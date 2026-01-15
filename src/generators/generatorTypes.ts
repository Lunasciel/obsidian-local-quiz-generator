import { ProviderConfig, OpenAIProviderConfig, OllamaProviderConfig } from "../settings/modelRegistry/types";
import { GenerationConfig } from "../settings/generation/generationConfig";

// Re-export for convenience
export type { ProviderConfig, OpenAIProviderConfig, OllamaProviderConfig };

/**
 * Settings needed by generators for quiz generation.
 *
 * This interface decouples generators from the full QuizSettings,
 * containing only the settings needed for:
 * 1. Provider configuration (API keys, URLs, models)
 * 2. Generation parameters (question types, counts, language)
 *
 * Requirements: 3.2, 3.3
 */
export interface GeneratorSettings extends GenerationConfig {
	/** Language for quiz generation */
	language: string;

	/** Provider-specific configuration */
	providerConfig: ProviderConfig;
}

/**
 * Create GeneratorSettings from a provider config and base settings.
 *
 * This helper extracts only the settings needed by generators,
 * allowing them to be independent of the full QuizSettings.
 *
 * @param providerConfig - Provider-specific configuration
 * @param generationConfig - Generation settings (question types, counts)
 * @param language - Language for quiz generation
 * @returns GeneratorSettings object
 *
 * Requirements: 3.2, 3.3
 */
export function createGeneratorSettings(
	providerConfig: ProviderConfig,
	generationConfig: GenerationConfig,
	language: string
): GeneratorSettings {
	return {
		...generationConfig,
		language,
		providerConfig,
	};
}

/**
 * Response from a generator including token usage information
 *
 * This type wraps the quiz generation response with metadata about
 * token usage, which is essential for cost tracking and usage analytics.
 */
export interface GeneratorResponse {
	/** The generated quiz content as a JSON string */
	content: string | null;

	/** Token usage information (if available from the provider) */
	usage?: TokenUsage;
}

/**
 * Token usage information from a model API call
 *
 * Different providers may return different token breakdowns.
 * This interface normalizes the data across providers.
 */
export interface TokenUsage {
	/** Number of tokens in the prompt */
	promptTokens: number;

	/** Number of tokens in the completion/response */
	completionTokens: number;

	/** Total tokens used (prompt + completion) */
	totalTokens: number;

	/** Optional: Cached tokens (for providers that support caching) */
	cachedTokens?: number;

	/** Optional: Provider-specific metadata */
	metadata?: Record<string, any>;
}

/**
 * Model pricing information for cost estimation
 *
 * Prices are specified per million tokens unless otherwise noted.
 */
export interface ModelPricing {
	/** Model identifier */
	modelId: string;

	/** Provider name */
	provider: string;

	/** Cost per million prompt tokens (USD) */
	promptCostPerMillion: number;

	/** Cost per million completion tokens (USD) */
	completionCostPerMillion: number;

	/** Cost per million cached tokens (USD), if applicable */
	cachedCostPerMillion?: number;

	/** Last updated timestamp */
	lastUpdated?: string;
}

/**
 * Cost estimate based on token usage
 */
export interface CostEstimate {
	/** Cost for prompt tokens (USD) */
	promptCost: number;

	/** Cost for completion tokens (USD) */
	completionCost: number;

	/** Cost for cached tokens (USD), if applicable */
	cachedCost?: number;

	/** Total estimated cost (USD) */
	totalCost: number;

	/** Model ID used for pricing */
	modelId: string;

	/** Provider name */
	provider: string;
}
