import {
	CouncilSettings,
	CouncilError,
	CouncilErrorCategory,
	ErrorAction,
	FallbackStrategy,
	CouncilPhase,
} from "./types";
import { ErrorFormatter, FormattedError } from "../utils/errorFormatter";

/**
 * Categorizes errors for appropriate handling (reused from consensus)
 */
export enum ErrorCategory {
	/** Network errors, timeouts, connection issues */
	NETWORK = "network",
	/** API rate limiting */
	RATE_LIMIT = "rate_limit",
	/** Invalid API keys, authentication failures */
	AUTHENTICATION = "authentication",
	/** Malformed requests, invalid parameters */
	VALIDATION = "validation",
	/** Model returned invalid or unparseable response */
	PARSE_ERROR = "parse_error",
	/** Service unavailable, 5xx errors */
	SERVICE_UNAVAILABLE = "service_unavailable",
	/** Unknown or uncategorized error */
	UNKNOWN = "unknown",
}

/**
 * Retry configuration for error handling
 */
export interface RetryConfig {
	/** Maximum number of retry attempts */
	maxRetries: number;
	/** Base delay in milliseconds for exponential backoff */
	baseDelayMs: number;
	/** Maximum delay in milliseconds */
	maxDelayMs: number;
	/** Multiplier for exponential backoff */
	backoffMultiplier: number;
}

/**
 * Context for error handling decisions
 */
export interface ErrorContext {
	/** Model identifier that encountered the error */
	modelId: string;
	/** Phase where error occurred */
	phase: CouncilPhase;
	/** Number of retries attempted so far */
	retryCount: number;
	/** Total number of models configured */
	totalModels: number;
	/** Number of models that have succeeded in current phase */
	successfulModels: number;
	/** Minimum models required for council */
	minModelsRequired: number;
}

/**
 * Result of an error handling decision
 */
export interface ErrorHandlingResult {
	/** Action to take */
	action: ErrorAction;
	/** Delay before retry (if action is RETRY_ONCE) */
	retryDelayMs?: number;
	/** User-friendly error message */
	userMessage: string;
	/** Technical details for logging */
	technicalDetails: string;
	/** Suggestions for user */
	suggestions: string[];
	/** Council-specific error details */
	councilError: CouncilError;
}

/**
 * Council error handler
 *
 * Provides centralized error handling strategies for the LLM Council system.
 * Determines appropriate actions for different error types and provides
 * user-friendly error messages with actionable suggestions.
 *
 * Key responsibilities:
 * - Categorize errors into actionable types
 * - Determine retry strategies with exponential backoff
 * - Decide when to skip failing models vs abort
 * - Provide user-friendly error messages
 * - Handle council failure scenarios (critique, ranking, synthesis)
 * - Implement fallback strategies
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */
export class CouncilErrorHandler {
	/** Default retry configuration */
	private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
		maxRetries: 2,
		baseDelayMs: 1000,
		maxDelayMs: 10000,
		backoffMultiplier: 2,
	};

	/** Retry configuration for this handler */
	private readonly retryConfig: RetryConfig;

	/** Council settings for fallback decisions */
	private readonly settings: CouncilSettings;

	/**
	 * Create a new council error handler
	 *
	 * @param settings - Council settings for fallback decisions
	 * @param retryConfig - Optional custom retry configuration
	 */
	constructor(settings: CouncilSettings, retryConfig?: Partial<RetryConfig>) {
		this.settings = settings;
		this.retryConfig = {
			...CouncilErrorHandler.DEFAULT_RETRY_CONFIG,
			...retryConfig,
		};
	}

	/**
	 * Handle an error from a model invocation during any council phase
	 *
	 * Analyzes the error and context to determine the appropriate action:
	 * - RETRY_ONCE: Transient errors that may succeed on retry
	 * - SKIP_MODEL: Permanent errors, but other models can continue
	 * - CONTINUE: Non-fatal errors, continue with partial results
	 * - ABORT: Critical errors that should stop the entire process
	 *
	 * @param error - The error that occurred
	 * @param context - Context about the error situation
	 * @returns Error handling result with action and details
	 *
	 * Requirements: 6.1, 6.2, 6.3, 6.4
	 */
	public handleModelError(
		error: Error,
		context: ErrorContext
	): ErrorHandlingResult {
		// Categorize the error
		const category = this.categorizeError(error);

		// Check if we should retry
		const shouldRetry = this.shouldRetry(category, context);

		if (shouldRetry && context.retryCount < this.retryConfig.maxRetries) {
			return this.createRetryResult(error, context, category);
		}

		// Check if we should skip this model or abort entirely
		const shouldAbort = this.shouldAbort(context);

		if (shouldAbort) {
			return this.createAbortResult(error, context, category);
		}

		return this.createSkipResult(error, context, category);
	}

	/**
	 * Handle parsing failure during any phase
	 *
	 * Models may return malformed JSON or responses that don't match
	 * the expected format. This method determines if we should retry
	 * or skip the model.
	 *
	 * @param modelId - Model that failed to parse
	 * @param phase - Phase where parsing failed
	 * @param rawResponse - The raw response text
	 * @param error - Parsing error
	 * @param context - Error context
	 * @returns Error handling result
	 *
	 * Requirements: 6.1, 6.3
	 */
	public handleParsingFailure(
		modelId: string,
		phase: CouncilPhase,
		rawResponse: string,
		error: Error,
		context: ErrorContext
	): ErrorHandlingResult {
		// Parsing errors are worth one retry
		if (context.retryCount === 0) {
			const retryDelayMs = this.calculateBackoffDelay(0);

			return {
				action: ErrorAction.RETRY_ONCE,
				retryDelayMs,
				userMessage: `Model ${modelId} returned malformed response in ${phase} phase. Retrying...`,
				technicalDetails: `Parse error: ${error.message}. Response preview: ${rawResponse.slice(0, 100)}...`,
				suggestions: [
					"Try again - LLM responses can vary",
					"Check if the model supports the requested format",
				],
				councilError: {
					category: CouncilErrorCategory.PARSING_FAILURE,
					phase,
					modelId,
					message: error.message,
					originalError: error,
					action: ErrorAction.RETRY_ONCE,
					timestamp: Date.now(),
				},
			};
		}

		// After retry, skip the model
		return this.createSkipResult(error, context, ErrorCategory.PARSE_ERROR);
	}

	/**
	 * Handle insufficient models scenario
	 *
	 * When not enough models succeed in Phase 1 (parallel query),
	 * determine if we should fallback or abort.
	 *
	 * @param successfulModels - Number of successful models
	 * @param totalModels - Total models attempted
	 * @returns Fallback strategy to use
	 *
	 * Requirements: 6.1, 6.2, 6.4, 6.5
	 */
	public handleInsufficientModels(
		successfulModels: number,
		totalModels: number
	): FallbackStrategy {
		// Complete failure - no models succeeded
		if (successfulModels === 0) {
			return FallbackStrategy.ABORT_WITH_ERROR;
		}

		// We have some successful models but not enough for council
		if (successfulModels < this.settings.minModelsRequired) {
			// If fallback is disabled, abort
			if (!this.settings.fallbackToSingleModel) {
				return FallbackStrategy.ABORT_WITH_ERROR;
			}

			// Fallback is enabled - return appropriate strategy
			if (successfulModels > 1) {
				// Multiple responses available - use highest ranked
				return FallbackStrategy.USE_HIGHEST_RANKED_RESPONSE;
			}

			// Only 1 response available - use single model fallback
			return FallbackStrategy.FALLBACK_TO_SINGLE_MODEL;
		}

		// We have enough models for council
		return FallbackStrategy.USE_HIGHEST_RANKED_RESPONSE;
	}

	/**
	 * Handle chair model failure
	 *
	 * When the chair model fails during synthesis, determine fallback:
	 * 1. Try alternate chair (if available)
	 * 2. Use highest-ranked response
	 * 3. Abort if no fallback is possible
	 *
	 * @param chairModelId - The chair model that failed
	 * @param error - The error from chair model
	 * @param availableModels - Models available for alternate chair
	 * @param hasRankings - Whether we have rankings to determine best response
	 * @returns Fallback strategy to use
	 *
	 * Requirements: 6.2, 6.3, 6.5
	 */
	public handleChairFailure(
		chairModelId: string,
		error: Error,
		availableModels: string[],
		hasRankings: boolean
	): FallbackStrategy {
		// Log the chair failure
		console.warn(`Chair model ${chairModelId} failed:`, error.message);

		// If we have rankings, use highest-ranked response
		if (hasRankings) {
			return FallbackStrategy.USE_HIGHEST_RANKED_RESPONSE;
		}

		// If we have multiple models available, try using one as alternate chair
		if (availableModels.length > 1) {
			// The caller can select a different model
			return FallbackStrategy.USE_HIGHEST_RANKED_RESPONSE;
		}

		// If we have at least one model and fallback is enabled
		if (availableModels.length > 0 && this.settings.fallbackToSingleModel) {
			return FallbackStrategy.FALLBACK_TO_SINGLE_MODEL;
		}

		// Complete failure
		return FallbackStrategy.ABORT_WITH_ERROR;
	}

	/**
	 * Handle critique phase failure
	 *
	 * When critique phase fails (all or most critiques fail),
	 * determine if we can continue without critiques.
	 *
	 * @param successfulCritiques - Number of successful critiques
	 * @param totalModels - Total models in council
	 * @returns Whether to continue without critiques
	 *
	 * Requirements: 6.1, 6.4
	 */
	public handleCritiqueFailure(
		successfulCritiques: number,
		totalModels: number
	): { shouldContinue: boolean; message: string } {
		// If we have at least some critiques, continue
		if (successfulCritiques > 0) {
			return {
				shouldContinue: true,
				message: `Critique phase partially failed (${successfulCritiques}/${totalModels} succeeded). Continuing with partial critiques.`,
			};
		}

		// No critiques succeeded, but we can still do ranking without them
		if (this.settings.enableRanking) {
			return {
				shouldContinue: true,
				message: "Critique phase failed completely. Continuing to ranking phase without critiques.",
			};
		}

		// No critiques and no ranking - can still proceed directly to synthesis
		return {
			shouldContinue: true,
			message: "Critique phase failed completely. Proceeding directly to synthesis phase.",
		};
	}

	/**
	 * Handle ranking phase failure
	 *
	 * When ranking phase fails, determine if we can continue to synthesis.
	 *
	 * @param successfulRankings - Number of successful rankings
	 * @param totalModels - Total models in council
	 * @returns Whether to continue without rankings
	 *
	 * Requirements: 6.1, 6.4
	 */
	public handleRankingFailure(
		successfulRankings: number,
		totalModels: number
	): { shouldContinue: boolean; message: string } {
		// If we have at least some rankings, continue
		if (successfulRankings > 0) {
			return {
				shouldContinue: true,
				message: `Ranking phase partially failed (${successfulRankings}/${totalModels} succeeded). Continuing with partial rankings.`,
			};
		}

		// No rankings succeeded, but we can still synthesize without them
		return {
			shouldContinue: true,
			message: "Ranking phase failed completely. Proceeding to synthesis without rankings.",
		};
	}

	/**
	 * Calculate delay for exponential backoff
	 *
	 * @param retryCount - Number of retries attempted
	 * @returns Delay in milliseconds
	 *
	 * Requirements: 6.6
	 */
	public calculateBackoffDelay(retryCount: number): number {
		const delay =
			this.retryConfig.baseDelayMs *
			Math.pow(this.retryConfig.backoffMultiplier, retryCount);

		return Math.min(delay, this.retryConfig.maxDelayMs);
	}

	/**
	 * Format an error for user display
	 *
	 * @param error - The error to format
	 * @param category - Error category
	 * @returns Formatted error with user-friendly message
	 */
	public formatError(error: Error, category: ErrorCategory): FormattedError & { userMessage: string } {
		// Use ErrorFormatter for consistent formatting
		const formatted = ErrorFormatter.format(error);

		// Add category-specific suggestions
		const categorySuggestions = this.getSuggestionsForCategory(category);
		const allSuggestions = [...formatted.suggestions, ...categorySuggestions];

		// Remove duplicates
		const uniqueSuggestions = Array.from(new Set(allSuggestions));

		return {
			...formatted,
			suggestions: uniqueSuggestions,
			userMessage: `${formatted.title}: ${formatted.message}`,
		};
	}

	/**
	 * Get user-friendly message for a council failure
	 *
	 * @param phase - Phase where failure occurred
	 * @param reason - Failure reason
	 * @returns User-friendly message
	 */
	public getCouncilFailureMessage(
		phase: CouncilPhase,
		reason: string
	): string {
		switch (phase) {
			case CouncilPhase.PARALLEL_QUERY:
				return `Council failed during parallel query: ${reason}`;

			case CouncilPhase.CRITIQUE:
				return `Council critique phase encountered issues: ${reason}`;

			case CouncilPhase.RANKING:
				return `Council ranking phase encountered issues: ${reason}`;

			case CouncilPhase.SYNTHESIS:
				return `Council synthesis phase failed: ${reason}`;

			case CouncilPhase.FINALIZATION:
				return `Council finalization failed: ${reason}`;

			default:
				return `Council failed: ${reason}`;
		}
	}

	/**
	 * Categorize an error based on its message and properties
	 *
	 * @param error - Error to categorize
	 * @returns Error category
	 */
	private categorizeError(error: Error): ErrorCategory {
		const message = error.message.toLowerCase();

		// Network errors
		if (
			message.includes("network") ||
			message.includes("timeout") ||
			message.includes("econnreset") ||
			message.includes("enotfound") ||
			message.includes("econnrefused") ||
			message.includes("fetch failed") ||
			message.includes("socket hang up")
		) {
			return ErrorCategory.NETWORK;
		}

		// Rate limiting
		if (
			message.includes("rate limit") ||
			message.includes("too many requests") ||
			message.includes("429")
		) {
			return ErrorCategory.RATE_LIMIT;
		}

		// Authentication
		if (
			message.includes("unauthorized") ||
			message.includes("api key") ||
			message.includes("authentication") ||
			message.includes("401") ||
			message.includes("403")
		) {
			return ErrorCategory.AUTHENTICATION;
		}

		// Validation errors
		if (
			message.includes("invalid") ||
			message.includes("validation") ||
			message.includes("bad request") ||
			message.includes("400")
		) {
			return ErrorCategory.VALIDATION;
		}

		// Parse errors
		if (
			message.includes("json") ||
			message.includes("parse") ||
			message.includes("syntax") ||
			message.includes("unexpected")
		) {
			return ErrorCategory.PARSE_ERROR;
		}

		// Service unavailable
		if (
			message.includes("503") ||
			message.includes("502") ||
			message.includes("504") ||
			message.includes("service unavailable") ||
			message.includes("gateway")
		) {
			return ErrorCategory.SERVICE_UNAVAILABLE;
		}

		return ErrorCategory.UNKNOWN;
	}

	/**
	 * Determine if an error should be retried
	 *
	 * @param category - Error category
	 * @param context - Error context
	 * @returns True if the error should be retried
	 */
	private shouldRetry(category: ErrorCategory, context: ErrorContext): boolean {
		// Check if we've exceeded max retries
		if (context.retryCount >= this.retryConfig.maxRetries) {
			return false;
		}

		// Retryable error categories
		const retryableCategories = [
			ErrorCategory.NETWORK,
			ErrorCategory.RATE_LIMIT,
			ErrorCategory.SERVICE_UNAVAILABLE,
			ErrorCategory.PARSE_ERROR, // Sometimes models return malformed JSON, worth a retry
		];

		return retryableCategories.includes(category);
	}

	/**
	 * Determine if a failure should abort the entire council process
	 *
	 * @param context - Error context
	 * @returns True if the process should abort
	 */
	private shouldAbort(context: ErrorContext): boolean {
		// Calculate models already processed (successful + current failed one)
		const modelsProcessed = context.successfulModels + 1; // +1 for current failing model
		const remainingModels = context.totalModels - modelsProcessed;
		const potentialSuccessful = context.successfulModels;

		// If we won't have enough models for council even if all remaining succeed
		if (potentialSuccessful + remainingModels < this.settings.minModelsRequired) {
			// Only abort if fallback is not enabled
			if (!this.settings.fallbackToSingleModel) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Create a retry result
	 *
	 * @param error - The error
	 * @param context - Error context
	 * @param category - Error category
	 * @returns Error handling result for retry
	 */
	private createRetryResult(
		error: Error,
		context: ErrorContext,
		category: ErrorCategory
	): ErrorHandlingResult {
		const retryDelayMs = this.calculateBackoffDelay(context.retryCount);
		const formatted = this.formatError(error, category);

		const councilError: CouncilError = {
			category: this.toCouncilErrorCategory(category),
			phase: context.phase,
			modelId: context.modelId,
			message: error.message,
			originalError: error,
			action: ErrorAction.RETRY_ONCE,
			timestamp: Date.now(),
		};

		return {
			action: ErrorAction.RETRY_ONCE,
			retryDelayMs,
			userMessage: `Model ${context.modelId} encountered a ${category} error in ${context.phase} phase. Retrying in ${Math.round(retryDelayMs / 1000)}s...`,
			technicalDetails: error.message,
			suggestions: formatted.suggestions,
			councilError,
		};
	}

	/**
	 * Create a skip result
	 *
	 * @param error - The error
	 * @param context - Error context
	 * @param category - Error category
	 * @returns Error handling result for skip
	 */
	private createSkipResult(
		error: Error,
		context: ErrorContext,
		category: ErrorCategory
	): ErrorHandlingResult {
		const formatted = this.formatError(error, category);

		const councilError: CouncilError = {
			category: this.toCouncilErrorCategory(category),
			phase: context.phase,
			modelId: context.modelId,
			message: error.message,
			originalError: error,
			action: ErrorAction.SKIP_MODEL,
			timestamp: Date.now(),
		};

		return {
			action: ErrorAction.SKIP_MODEL,
			userMessage: `Model ${context.modelId} failed (${category}) in ${context.phase} phase. Continuing with remaining models...`,
			technicalDetails: error.message,
			suggestions: formatted.suggestions,
			councilError,
		};
	}

	/**
	 * Create an abort result
	 *
	 * @param error - The error
	 * @param context - Error context
	 * @param category - Error category
	 * @returns Error handling result for abort
	 */
	private createAbortResult(
		error: Error,
		context: ErrorContext,
		category: ErrorCategory
	): ErrorHandlingResult {
		const formatted = this.formatError(error, category);

		const councilError: CouncilError = {
			category: this.toCouncilErrorCategory(category),
			phase: context.phase,
			modelId: context.modelId,
			message: error.message,
			originalError: error,
			action: ErrorAction.ABORT,
			timestamp: Date.now(),
		};

		return {
			action: ErrorAction.ABORT,
			userMessage: `Model ${context.modelId} failed and insufficient models remain for council. Aborting.`,
			technicalDetails: error.message,
			suggestions: [
				"Enable fallback to single-model generation in settings",
				"Configure additional models for council",
				...formatted.suggestions,
			],
			councilError,
		};
	}

	/**
	 * Convert error category to council error category
	 *
	 * @param category - Error category
	 * @returns Council error category
	 */
	private toCouncilErrorCategory(category: ErrorCategory): CouncilErrorCategory {
		switch (category) {
			case ErrorCategory.PARSE_ERROR:
				return CouncilErrorCategory.PARSING_FAILURE;
			case ErrorCategory.NETWORK:
			case ErrorCategory.RATE_LIMIT:
			case ErrorCategory.AUTHENTICATION:
			case ErrorCategory.VALIDATION:
			case ErrorCategory.SERVICE_UNAVAILABLE:
			case ErrorCategory.UNKNOWN:
				return CouncilErrorCategory.MODEL_FAILURE;
			default:
				return CouncilErrorCategory.MODEL_FAILURE;
		}
	}

	/**
	 * Get suggestions for a specific error category
	 *
	 * @param category - Error category
	 * @returns Array of suggestions
	 */
	private getSuggestionsForCategory(category: ErrorCategory): string[] {
		switch (category) {
			case ErrorCategory.NETWORK:
				return [
					"Check your internet connection",
					"Verify the API endpoint is accessible",
					"Check if firewall is blocking requests",
				];

			case ErrorCategory.RATE_LIMIT:
				return [
					"Wait a few minutes and try again",
					"Reduce the number of parallel models",
					"Upgrade your API plan if available",
				];

			case ErrorCategory.AUTHENTICATION:
				return [
					"Verify your API key is correct",
					"Check if your API key has expired",
					"Ensure API key has necessary permissions",
				];

			case ErrorCategory.VALIDATION:
				return [
					"Check your model configuration",
					"Verify the model name is correct",
					"Review your request parameters",
				];

			case ErrorCategory.PARSE_ERROR:
				return [
					"Try again - LLM responses can vary",
					"Try with simpler source content",
					"Reduce the number of questions requested",
				];

			case ErrorCategory.SERVICE_UNAVAILABLE:
				return [
					"The AI service is temporarily unavailable",
					"Try again in a few minutes",
					"Check the provider's status page",
				];

			case ErrorCategory.UNKNOWN:
				return [
					"Try again",
					"Check the console for more details",
					"Report this issue if it persists",
				];

			default:
				return [];
		}
	}
}
