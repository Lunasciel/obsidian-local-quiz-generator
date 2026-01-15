import {
	ConsensusSettings,
	ConsensusFailureReason,
	ModelErrorAction,
	ConsensusFailureAction,
} from "./types";
import { ErrorFormatter, FormattedError } from "../utils/errorFormatter";

/**
 * Categorizes errors for appropriate handling
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
	/** Number of retries attempted so far */
	retryCount: number;
	/** Total number of models configured */
	totalModels: number;
	/** Number of models that have succeeded */
	successfulModels: number;
	/** Minimum models required for consensus */
	minModelsRequired: number;
	/** Current consensus round (if applicable) */
	currentRound?: number;
	/** Maximum rounds allowed */
	maxRounds?: number;
}

/**
 * Result of an error handling decision
 */
export interface ErrorHandlingResult {
	/** Action to take */
	action: ModelErrorAction;
	/** Delay before retry (if action is RETRY) */
	retryDelayMs?: number;
	/** User-friendly error message */
	userMessage: string;
	/** Technical details for logging */
	technicalDetails: string;
	/** Suggestions for user */
	suggestions: string[];
}

/**
 * Consensus error handler
 *
 * Provides centralized error handling strategies for the consensus system.
 * Determines appropriate actions for different error types and provides
 * user-friendly error messages with actionable suggestions.
 *
 * Key responsibilities:
 * - Categorize errors into actionable types
 * - Determine retry strategies with exponential backoff
 * - Decide when to skip failing models vs abort
 * - Provide user-friendly error messages
 * - Handle consensus failure scenarios
 */
export class ConsensusErrorHandler {
	/** Default retry configuration */
	private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
		maxRetries: 2,
		baseDelayMs: 1000,
		maxDelayMs: 10000,
		backoffMultiplier: 2,
	};

	/** Retry configuration for this handler */
	private readonly retryConfig: RetryConfig;

	/**
	 * Create a new consensus error handler
	 *
	 * @param retryConfig - Optional custom retry configuration
	 */
	constructor(retryConfig?: Partial<RetryConfig>) {
		this.retryConfig = {
			...ConsensusErrorHandler.DEFAULT_RETRY_CONFIG,
			...retryConfig,
		};
	}

	/**
	 * Handle an error from a model invocation
	 *
	 * Analyzes the error and context to determine the appropriate action:
	 * - RETRY: Transient errors that may succeed on retry
	 * - SKIP_MODEL: Permanent errors, but other models can continue
	 * - ABORT: Critical errors that should stop the entire process
	 *
	 * @param error - The error that occurred
	 * @param context - Context about the error situation
	 * @returns Error handling result with action and details
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
	 * Handle a consensus failure scenario
	 *
	 * Determines the appropriate action when consensus cannot be reached:
	 * - FALLBACK_SINGLE_MODEL: Use the best available response
	 * - NOTIFY_USER_PARTIAL_CONSENSUS: Show partial results to user
	 * - ABORT_GENERATION: Complete failure
	 *
	 * @param reason - Reason for consensus failure
	 * @param settings - Consensus settings
	 * @param availableModels - Number of models that successfully responded
	 * @returns Appropriate failure action
	 */
	public handleConsensusFailure(
		reason: ConsensusFailureReason,
		settings: ConsensusSettings,
		availableModels: number
	): ConsensusFailureAction {
		switch (reason) {
			case ConsensusFailureReason.INSUFFICIENT_MODELS:
				// If fallback is enabled and we have at least 1 model, use it
				if (settings.fallbackToSingleModel && availableModels > 0) {
					return ConsensusFailureAction.FALLBACK_SINGLE_MODEL;
				}
				return ConsensusFailureAction.ABORT_GENERATION;

			case ConsensusFailureReason.MAX_ITERATIONS_EXCEEDED:
				// If we have some consensus, notify user of partial results
				if (availableModels >= settings.minModelsRequired) {
					return ConsensusFailureAction.NOTIFY_USER_PARTIAL_CONSENSUS;
				}
				// Otherwise, fallback if enabled
				if (settings.fallbackToSingleModel && availableModels > 0) {
					return ConsensusFailureAction.FALLBACK_SINGLE_MODEL;
				}
				return ConsensusFailureAction.ABORT_GENERATION;

			case ConsensusFailureReason.CIRCULAR_REASONING:
				// Circular reasoning detected - use current best answer
				return ConsensusFailureAction.NOTIFY_USER_PARTIAL_CONSENSUS;

			case ConsensusFailureReason.ALL_MODELS_FAILED:
				// Complete failure
				return ConsensusFailureAction.ABORT_GENERATION;

			case ConsensusFailureReason.VALIDATION_FAILURE:
				// Validation is optional - continue with partial results
				if (availableModels >= settings.minModelsRequired) {
					return ConsensusFailureAction.NOTIFY_USER_PARTIAL_CONSENSUS;
				}
				if (settings.fallbackToSingleModel && availableModels > 0) {
					return ConsensusFailureAction.FALLBACK_SINGLE_MODEL;
				}
				return ConsensusFailureAction.ABORT_GENERATION;

			default:
				return ConsensusFailureAction.ABORT_GENERATION;
		}
	}

	/**
	 * Determine if the system should fall back to single-model generation
	 *
	 * @param availableModels - Number of models available
	 * @param settings - Consensus settings
	 * @returns True if fallback should be used
	 */
	public shouldFallback(
		availableModels: number,
		settings: ConsensusSettings
	): boolean {
		// Fallback is only allowed if:
		// 1. Fallback is enabled in settings
		// 2. We have at least 1 successful model
		// 3. We don't have enough models for consensus
		return (
			settings.fallbackToSingleModel &&
			availableModels > 0 &&
			availableModels < settings.minModelsRequired
		);
	}

	/**
	 * Calculate delay for exponential backoff
	 *
	 * @param retryCount - Number of retries attempted
	 * @returns Delay in milliseconds
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
	public formatError(error: Error, category: ErrorCategory): FormattedError {
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
		};
	}

	/**
	 * Get user-friendly message for a consensus failure reason
	 *
	 * @param reason - Failure reason
	 * @param availableModels - Number of available models
	 * @param requiredModels - Number of required models
	 * @returns User-friendly message
	 */
	public getConsensusFailureMessage(
		reason: ConsensusFailureReason,
		availableModels: number,
		requiredModels: number
	): string {
		switch (reason) {
			case ConsensusFailureReason.INSUFFICIENT_MODELS:
				return `Consensus failed: Only ${availableModels} of ${requiredModels} required models responded successfully.`;

			case ConsensusFailureReason.MAX_ITERATIONS_EXCEEDED:
				return `Consensus failed: Maximum iterations reached without agreement. Models could not agree on some answers.`;

			case ConsensusFailureReason.CIRCULAR_REASONING:
				return `Consensus failed: Circular reasoning detected. Models are oscillating between different answers.`;

			case ConsensusFailureReason.ALL_MODELS_FAILED:
				return `Consensus failed: All configured models encountered errors.`;

			case ConsensusFailureReason.VALIDATION_FAILURE:
				return `Source validation failed: Could not verify source material through multiple models.`;

			default:
				return `Consensus failed: An unexpected error occurred.`;
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
	 * Determine if a failure should abort the entire consensus process
	 *
	 * @param context - Error context
	 * @returns True if the process should abort
	 */
	private shouldAbort(context: ErrorContext): boolean {
		// Calculate how many models we'll have if we skip this one
		const remainingModels = context.totalModels - 1; // Assume this model is being skipped
		const potentialSuccessful = context.successfulModels;

		// If we won't have enough models for consensus even if all remaining succeed
		if (potentialSuccessful + remainingModels < context.minModelsRequired) {
			return true;
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

		return {
			action: ModelErrorAction.RETRY,
			retryDelayMs,
			userMessage: `Model ${context.modelId} encountered a ${category} error. Retrying in ${Math.round(retryDelayMs / 1000)}s...`,
			technicalDetails: error.message,
			suggestions: formatted.suggestions,
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

		return {
			action: ModelErrorAction.SKIP_MODEL,
			userMessage: `Model ${context.modelId} failed (${category}). Continuing with remaining models...`,
			technicalDetails: error.message,
			suggestions: formatted.suggestions,
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

		return {
			action: ModelErrorAction.ABORT,
			userMessage: `Model ${context.modelId} failed and insufficient models remain for consensus. Aborting.`,
			technicalDetails: error.message,
			suggestions: [
				"Enable fallback to single-model generation in settings",
				"Configure additional models for consensus",
				...formatted.suggestions,
			],
		};
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
