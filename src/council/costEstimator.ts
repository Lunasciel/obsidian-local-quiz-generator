import { TokenUsage, ModelPricing, CostEstimate } from "../generators/generatorTypes";
import { Provider } from "../generators/providers";

/**
 * Model pricing database
 *
 * Prices are per million tokens in USD.
 * These should be updated periodically as providers change pricing.
 *
 * Last updated: 2024-12-10
 */
const MODEL_PRICING_DB: Record<string, ModelPricing> = {
	// OpenAI Models
	"gpt-4": {
		modelId: "gpt-4",
		provider: "OpenAI",
		promptCostPerMillion: 30.0,
		completionCostPerMillion: 60.0,
		lastUpdated: "2024-12-10",
	},
	"gpt-4-turbo": {
		modelId: "gpt-4-turbo",
		provider: "OpenAI",
		promptCostPerMillion: 10.0,
		completionCostPerMillion: 30.0,
		lastUpdated: "2024-12-10",
	},
	"gpt-4o": {
		modelId: "gpt-4o",
		provider: "OpenAI",
		promptCostPerMillion: 2.5,
		completionCostPerMillion: 10.0,
		cachedCostPerMillion: 1.25,
		lastUpdated: "2024-12-10",
	},
	"gpt-4o-mini": {
		modelId: "gpt-4o-mini",
		provider: "OpenAI",
		promptCostPerMillion: 0.15,
		completionCostPerMillion: 0.6,
		cachedCostPerMillion: 0.075,
		lastUpdated: "2024-12-10",
	},
	"gpt-3.5-turbo": {
		modelId: "gpt-3.5-turbo",
		provider: "OpenAI",
		promptCostPerMillion: 0.5,
		completionCostPerMillion: 1.5,
		lastUpdated: "2024-12-10",
	},
	"o1": {
		modelId: "o1",
		provider: "OpenAI",
		promptCostPerMillion: 15.0,
		completionCostPerMillion: 60.0,
		lastUpdated: "2024-12-10",
	},
	"o1-mini": {
		modelId: "o1-mini",
		provider: "OpenAI",
		promptCostPerMillion: 3.0,
		completionCostPerMillion: 12.0,
		lastUpdated: "2024-12-10",
	},

	// Anthropic Models (Claude)
	"claude-3-opus-20240229": {
		modelId: "claude-3-opus-20240229",
		provider: "Anthropic",
		promptCostPerMillion: 15.0,
		completionCostPerMillion: 75.0,
		lastUpdated: "2024-12-10",
	},
	"claude-3-sonnet-20240229": {
		modelId: "claude-3-sonnet-20240229",
		provider: "Anthropic",
		promptCostPerMillion: 3.0,
		completionCostPerMillion: 15.0,
		lastUpdated: "2024-12-10",
	},
	"claude-3-5-sonnet-20241022": {
		modelId: "claude-3-5-sonnet-20241022",
		provider: "Anthropic",
		promptCostPerMillion: 3.0,
		completionCostPerMillion: 15.0,
		cachedCostPerMillion: 0.3,
		lastUpdated: "2024-12-10",
	},
	"claude-3-5-haiku-20241022": {
		modelId: "claude-3-5-haiku-20241022",
		provider: "Anthropic",
		promptCostPerMillion: 1.0,
		completionCostPerMillion: 5.0,
		lastUpdated: "2024-12-10",
	},
	"claude-3-haiku-20240307": {
		modelId: "claude-3-haiku-20240307",
		provider: "Anthropic",
		promptCostPerMillion: 0.25,
		completionCostPerMillion: 1.25,
		lastUpdated: "2024-12-10",
	},

	// Google Models (Gemini)
	"gemini-1.5-pro": {
		modelId: "gemini-1.5-pro",
		provider: "Google",
		promptCostPerMillion: 1.25,
		completionCostPerMillion: 5.0,
		cachedCostPerMillion: 0.3125,
		lastUpdated: "2024-12-10",
	},
	"gemini-1.5-flash": {
		modelId: "gemini-1.5-flash",
		provider: "Google",
		promptCostPerMillion: 0.075,
		completionCostPerMillion: 0.3,
		cachedCostPerMillion: 0.01875,
		lastUpdated: "2024-12-10",
	},
	"gemini-2.0-flash": {
		modelId: "gemini-2.0-flash",
		provider: "Google",
		promptCostPerMillion: 0.0,
		completionCostPerMillion: 0.0,
		lastUpdated: "2024-12-10",
	},

	// Default pricing for unknown models
	"unknown": {
		modelId: "unknown",
		provider: "Unknown",
		promptCostPerMillion: 1.0,
		completionCostPerMillion: 3.0,
		lastUpdated: "2024-12-10",
	},
};

/**
 * Cost estimator for LLM token usage
 *
 * This class provides utilities for:
 * - Estimating costs based on token usage
 * - Looking up model pricing information
 * - Calculating total costs across multiple model calls
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export class CostEstimator {
	/**
	 * Get pricing information for a specific model
	 *
	 * @param modelId - The model identifier (e.g., "gpt-4o", "claude-3-5-sonnet")
	 * @returns Pricing information for the model
	 */
	public static getModelPricing(modelId: string): ModelPricing {
		// Try exact match first
		if (MODEL_PRICING_DB[modelId]) {
			return MODEL_PRICING_DB[modelId];
		}

		// Try partial match (e.g., "gpt-4o-2024-08-06" matches "gpt-4o")
		for (const key in MODEL_PRICING_DB) {
			if (modelId.startsWith(key) || key.startsWith(modelId)) {
				return MODEL_PRICING_DB[key];
			}
		}

		// Return unknown model pricing as fallback
		console.warn(
			`[CostEstimator] No pricing found for model "${modelId}". Using default pricing.`
		);
		return { ...MODEL_PRICING_DB["unknown"], modelId };
	}

	/**
	 * Estimate cost for a single model invocation
	 *
	 * @param usage - Token usage information
	 * @param modelId - Model identifier
	 * @param provider - Provider name (optional, for better pricing lookup)
	 * @returns Cost estimate breakdown
	 *
	 * Requirements: 7.1, 7.2, 7.3
	 */
	public static estimateCost(
		usage: TokenUsage,
		modelId: string,
		provider?: string
	): CostEstimate {
		const pricing = this.getModelPricing(modelId);

		// Calculate prompt cost
		const promptCost = (usage.promptTokens / 1_000_000) * pricing.promptCostPerMillion;

		// Calculate completion cost
		const completionCost =
			(usage.completionTokens / 1_000_000) * pricing.completionCostPerMillion;

		// Calculate cached cost if applicable
		let cachedCost: number | undefined;
		if (usage.cachedTokens && pricing.cachedCostPerMillion) {
			cachedCost = (usage.cachedTokens / 1_000_000) * pricing.cachedCostPerMillion;
		}

		// Calculate total cost
		const totalCost = promptCost + completionCost + (cachedCost || 0);

		return {
			promptCost,
			completionCost,
			cachedCost,
			totalCost,
			modelId: pricing.modelId,
			provider: provider || pricing.provider,
		};
	}

	/**
	 * Estimate total cost for multiple model invocations
	 *
	 * @param usages - Array of token usage with model IDs
	 * @returns Aggregated cost estimate
	 *
	 * Requirements: 7.2, 7.4
	 */
	public static estimateTotalCost(
		usages: Array<{ usage: TokenUsage; modelId: string; provider?: string }>
	): CostEstimate {
		let totalPromptCost = 0;
		let totalCompletionCost = 0;
		let totalCachedCost = 0;
		const providers = new Set<string>();

		for (const { usage, modelId, provider } of usages) {
			const estimate = this.estimateCost(usage, modelId, provider);
			totalPromptCost += estimate.promptCost;
			totalCompletionCost += estimate.completionCost;
			totalCachedCost += estimate.cachedCost || 0;
			providers.add(estimate.provider);
		}

		return {
			promptCost: totalPromptCost,
			completionCost: totalCompletionCost,
			cachedCost: totalCachedCost > 0 ? totalCachedCost : undefined,
			totalCost: totalPromptCost + totalCompletionCost + totalCachedCost,
			modelId: "multiple",
			provider: providers.size === 1 ? Array.from(providers)[0] : "multiple",
		};
	}

	/**
	 * Format cost as a human-readable string
	 *
	 * @param cost - Cost in USD
	 * @returns Formatted cost string (e.g., "$0.0123", "$1.23", "$123.45")
	 */
	public static formatCost(cost: number): string {
		if (cost === 0) {
			return "$0.00";
		} else if (cost < 0.01) {
			// Show more precision for very small costs
			return `$${cost.toFixed(4)}`;
		} else if (cost < 1) {
			return `$${cost.toFixed(3)}`;
		} else {
			return `$${cost.toFixed(2)}`;
		}
	}

	/**
	 * Format token count as a human-readable string
	 *
	 * @param tokens - Number of tokens
	 * @returns Formatted token string (e.g., "1.2K", "123K", "1.2M")
	 */
	public static formatTokens(tokens: number): string {
		if (tokens < 1000) {
			return tokens.toString();
		} else if (tokens < 1_000_000) {
			return `${(tokens / 1000).toFixed(1)}K`;
		} else {
			return `${(tokens / 1_000_000).toFixed(2)}M`;
		}
	}

	/**
	 * Get all available model pricing information
	 *
	 * Useful for displaying pricing tables or allowing users to select models.
	 *
	 * @returns Array of all model pricing information
	 */
	public static getAllPricing(): ModelPricing[] {
		return Object.values(MODEL_PRICING_DB).filter(
			pricing => pricing.modelId !== "unknown"
		);
	}

	/**
	 * Update pricing for a specific model
	 *
	 * Useful for updating pricing when providers change rates.
	 *
	 * @param pricing - Updated pricing information
	 */
	public static updatePricing(pricing: ModelPricing): void {
		MODEL_PRICING_DB[pricing.modelId] = {
			...pricing,
			lastUpdated: new Date().toISOString().split("T")[0],
		};
	}
}
