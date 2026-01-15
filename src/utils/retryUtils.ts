/**
 * Retry utility for LLM generation with progressive user feedback
 * Provides consistent retry behavior across quiz and flashcard generation
 */

import { Notice } from "obsidian";
import { JSONParser, ParseResult, JSONParseError } from "./jsonParser";

export interface RetryOptions {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;
	/** Base delay in milliseconds for exponential backoff (default: 1000) */
	baseDelay?: number;
	/** Custom error handler called on each failure */
	onError?: (error: Error, attempt: number) => void;
	/** Custom notice prefix for retry messages */
	noticePrefix?: string;
}

export interface RetryResult<T> {
	success: boolean;
	data?: T;
	error?: JSONParseError;
	attempts: number;
	repaired: boolean;
	repairDetails?: string[];
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onError' | 'noticePrefix'>> = {
	maxRetries: 3,
	baseDelay: 1000,
};

/**
 * Generate content with retry logic and parse the response
 * Shows progressive user feedback during retry attempts
 *
 * @param generator - Async function that generates the LLM response
 * @param options - Retry configuration options
 * @returns Retry result with parsed data or error details
 *
 * @example
 * ```typescript
 * const result = await generateWithRetry<Quiz>(
 *   async () => await llm.generate(prompt),
 *   { maxRetries: 3, noticePrefix: "Quiz generation" }
 * );
 *
 * if (result.success) {
 *   // Use result.data
 * } else {
 *   // Handle result.error
 * }
 * ```
 */
export async function generateWithRetry<T>(
	generator: () => Promise<string | null>,
	options?: RetryOptions
): Promise<RetryResult<T>> {
	const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
	const prefix = opts.noticePrefix || "Generation";

	let lastError: JSONParseError | null = null;
	let lastRawResponse: string | null = null;

	for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
		try {
			// Call the generator
			const response = await generator();

			if (!response) {
				throw new Error("Empty response from LLM");
			}

			lastRawResponse = response;

			// Parse the response with JSONParser
			const parseResult = JSONParser.parse<T>(response);

			// Debug: Log parse result for troubleshooting
			console.log(`${prefix} parse attempt ${attempt}:`, {
				success: parseResult.success,
				repaired: parseResult.repaired,
				hasData: !!parseResult.data,
				dataType: typeof parseResult.data,
				dataKeys: parseResult.data ? Object.keys(parseResult.data as object) : [],
			});

			if (parseResult.success) {
				// Show repair notice if applicable
				if (parseResult.repaired) {
					const repairDetails = parseResult.repairDetails?.join(", ") || "automatic repairs";
					new Notice(`Response was automatically repaired: ${repairDetails}`, 3000);
					console.log(`${prefix} JSON auto-repair applied:`, parseResult.repairDetails);
				}

				return {
					success: true,
					data: parseResult.data,
					attempts: attempt,
					repaired: parseResult.repaired,
					repairDetails: parseResult.repairDetails,
				};
			}

			// Parse failed - store error for potential retry or final display
			lastError = parseResult.error || {
				message: "Unknown parsing error",
				context: "",
				suggestions: ["Try again - LLM responses can vary"],
			};

			// Log error for debugging
			console.error(`${prefix} attempt ${attempt} failed:`, {
				message: lastError.message,
				context: lastError.context,
				position: lastError.position,
				rawResponse: response.substring(0, 500) + (response.length > 500 ? "..." : ""),
			});

			// Call custom error handler if provided
			if (opts.onError) {
				opts.onError(new Error(lastError.message), attempt);
			}

		} catch (error) {
			// Network or other errors
			const errorMessage = (error as Error).message;
			lastError = {
				message: errorMessage,
				context: lastRawResponse ? lastRawResponse.substring(0, 50) : "",
				suggestions: [
					"Try again - LLM responses can vary",
					"Check your API key and network connection",
				],
			};

			console.error(`${prefix} attempt ${attempt} error:`, error);

			if (opts.onError) {
				opts.onError(error as Error, attempt);
			}
		}

		// Show retry notice if not the last attempt
		if (attempt < opts.maxRetries) {
			new Notice(`${prefix} failed. Retrying... (attempt ${attempt + 1}/${opts.maxRetries})`, 2000);

			// Exponential backoff
			const delay = opts.baseDelay * Math.pow(2, attempt - 1);
			await sleep(delay);
		}
	}

	// All attempts failed - show final error with suggestions
	if (lastError) {
		showErrorWithSuggestions(lastError, prefix);

		// Add escalated suggestions for repeated failures
		if (!lastError.suggestions.includes("Check your API settings or try a different model")) {
			lastError.suggestions.push("Check your API settings or try a different model");
		}
	}

	return {
		success: false,
		error: lastError || {
			message: "Generation failed after all retry attempts",
			context: "",
			suggestions: ["Try again later", "Check your API settings"],
		},
		attempts: opts.maxRetries,
		repaired: false,
	};
}

/**
 * Display a formatted error notice with context and suggestions
 * Notice stays visible until dismissed by user
 */
export function showErrorWithSuggestions(error: JSONParseError, prefix?: string): void {
	const title = prefix ? `${prefix} failed` : "Generation failed";

	const message = [
		title,
		"",
		error.message,
		"",
		error.context ? `Context: ${error.context}` : "",
		"",
		"Suggestions:",
		...error.suggestions.map(s => `• ${s}`),
	].filter(line => line !== "" || line === "").join("\n");

	new Notice(message, 0); // 0 = stays until dismissed
}

/**
 * Helper function to sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrapper for generating and parsing with retry
 * Convenience function that combines generation and validation
 *
 * @param generator - Async function that generates the LLM response
 * @param validator - Optional function to validate parsed data
 * @param options - Retry configuration options
 * @returns Parsed and validated data
 * @throws Error if all retries fail or validation fails
 */
export async function generateAndParse<T>(
	generator: () => Promise<string | null>,
	validator?: (data: T) => boolean,
	options?: RetryOptions
): Promise<T> {
	const result = await generateWithRetry<T>(generator, options);

	if (!result.success) {
		throw new Error(result.error?.message || "Generation failed");
	}

	if (validator && !validator(result.data!)) {
		throw new Error("Generated data failed validation");
	}

	return result.data!;
}
