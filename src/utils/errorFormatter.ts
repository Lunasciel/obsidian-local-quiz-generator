/**
 * Error formatting utilities for user-friendly error messages
 * Converts technical errors to actionable guidance
 */

export interface FormattedError {
	title: string;
	message: string;
	context: string;
	suggestions: string[];
}

export interface ErrorContext {
	input?: string;
	operation?: string;
	itemCount?: number;
}

/**
 * Maps error types to user-friendly messages and suggestions
 */
const ERROR_MAPPINGS: {
	pattern: RegExp;
	title: string;
	message: string;
	suggestions: string[];
}[] = [
	{
		pattern: /unexpected end of (json|input)/i,
		title: "Response Truncated",
		message: "The AI response was cut off before completing",
		suggestions: [
			"Try generating fewer items",
			"Use a shorter source document",
			"Try again - response length can vary",
		],
	},
	{
		pattern: /unexpected token/i,
		title: "Invalid Response Format",
		message: "The AI response contained invalid formatting",
		suggestions: [
			"Try again - LLM responses can vary",
			"Try with simpler source content",
		],
	},
	{
		pattern: /expected.*[}\]]/i,
		title: "Incomplete Response",
		message: "The response has mismatched or missing brackets",
		suggestions: [
			"Try again - this is usually a one-time issue",
			"Try generating fewer items",
		],
	},
	{
		pattern: /position\s+\d+/i,
		title: "Parse Error",
		message: "The response could not be properly parsed",
		suggestions: [
			"Try again - LLM responses can vary",
			"Try reducing the number of items",
		],
	},
];

export class ErrorFormatter {
	/**
	 * Convert technical error to user-friendly message
	 */
	static format(error: Error, context?: ErrorContext): FormattedError {
		const errorMessage = error.message;

		// Find matching error pattern
		for (const mapping of ERROR_MAPPINGS) {
			if (mapping.pattern.test(errorMessage)) {
				const suggestions = [...mapping.suggestions];

				// Add context-specific suggestions
				if (context?.itemCount && context.itemCount > 10) {
					suggestions.unshift(
						`Try reducing from ${context.itemCount} to ${Math.ceil(context.itemCount / 2)} items`
					);
				}

				return {
					title: mapping.title,
					message: mapping.message,
					context: this.extractErrorContext(errorMessage, context?.input),
					suggestions,
				};
			}
		}

		// Default formatting for unknown errors
		return {
			title: "Generation Error",
			message: "An error occurred while processing the response",
			context: errorMessage,
			suggestions: [
				"Try again - LLM responses can vary",
				"Check your API settings",
			],
		};
	}

	/**
	 * Extract meaningful context around error position
	 */
	static extractContext(
		input: string,
		position: number,
		length: number = 50
	): string {
		if (position < 0 || position > input.length) {
			return this.extractEndContext(input, length);
		}

		const halfLength = Math.floor(length / 2);
		const start = Math.max(0, position - halfLength);
		const end = Math.min(input.length, position + halfLength);

		let context = input.slice(start, end);

		// Add position indicator
		const indicatorPos = Math.min(position - start, context.length);
		const before = context.slice(0, indicatorPos);
		const after = context.slice(indicatorPos);

		// Add ellipsis if truncated
		let result = "";
		if (start > 0) {
			result += "...";
		}
		result += before + ">>HERE<<" + after;
		if (end < input.length) {
			result += "...";
		}

		return this.sanitizeContext(result);
	}

	/**
	 * Extract context from the end of input
	 */
	private static extractEndContext(input: string, length: number): string {
		const start = Math.max(0, input.length - length);
		let context = input.slice(start);

		if (start > 0) {
			context = "..." + context;
		}

		return this.sanitizeContext(context);
	}

	/**
	 * Extract error context from error message or input
	 */
	private static extractErrorContext(
		errorMessage: string,
		input?: string
	): string {
		// Try to extract position from error
		const positionMatch = errorMessage.match(/position\s+(\d+)/i);

		if (positionMatch && input) {
			const position = parseInt(positionMatch[1], 10);
			return this.extractContext(input, position, 40);
		}

		// Return sanitized error message
		return errorMessage
			.replace(/^SyntaxError:\s*/i, "")
			.replace(/^JSON\.parse:\s*/i, "");
	}

	/**
	 * Sanitize context for display
	 */
	private static sanitizeContext(context: string): string {
		return context
			.replace(/\n/g, "\\n")
			.replace(/\t/g, "\\t")
			.replace(/\r/g, "\\r");
	}

	/**
	 * Map error type to actionable suggestions
	 */
	static getSuggestions(errorType: string, context?: ErrorContext): string[] {
		const suggestions: string[] = [];
		const lowerType = errorType.toLowerCase();

		// Truncation errors
		if (lowerType.includes("truncat") || lowerType.includes("cut off")) {
			suggestions.push("Try generating fewer items");
			suggestions.push("Use a shorter source document");
		}

		// Formatting errors
		if (lowerType.includes("format") || lowerType.includes("invalid")) {
			suggestions.push("Try again - LLM responses can vary");
			suggestions.push("Simplify the source content");
		}

		// API errors
		if (lowerType.includes("api") || lowerType.includes("network")) {
			suggestions.push("Check your API key configuration");
			suggestions.push("Verify your network connection");
		}

		// Rate limiting
		if (lowerType.includes("rate") || lowerType.includes("limit")) {
			suggestions.push("Wait a moment and try again");
			suggestions.push("Consider using a different model");
		}

		// Context-specific suggestions
		if (context?.itemCount && context.itemCount > 5) {
			suggestions.push(`Try reducing the number of items (currently ${context.itemCount})`);
		}

		// Always add generic retry suggestion if not already present
		if (!suggestions.some((s) => s.toLowerCase().includes("try again"))) {
			suggestions.push("Try again - LLM responses can vary");
		}

		return suggestions;
	}

	/**
	 * Format error for display in Obsidian Notice
	 */
	static formatForNotice(error: FormattedError): string {
		const lines = [error.title, "", error.message];

		if (error.context && error.context !== error.message) {
			lines.push("", `Context: ${error.context}`);
		}

		if (error.suggestions.length > 0) {
			lines.push("", "Suggestions:");
			error.suggestions.forEach((suggestion) => {
				lines.push(`  - ${suggestion}`);
			});
		}

		return lines.join("\n");
	}

	/**
	 * Format error for console logging
	 */
	static formatForLog(
		error: FormattedError,
		rawError?: Error,
		rawInput?: string
	): string {
		const lines = [
			`[Quiz Generator Error] ${error.title}`,
			`Message: ${error.message}`,
			`Context: ${error.context}`,
		];

		if (rawError) {
			lines.push(`Original error: ${rawError.message}`);
			if (rawError.stack) {
				lines.push(`Stack: ${rawError.stack}`);
			}
		}

		if (rawInput) {
			// Truncate long inputs
			const truncatedInput =
				rawInput.length > 500
					? rawInput.slice(0, 500) + `... (${rawInput.length - 500} more chars)`
					: rawInput;
			lines.push(`Raw input: ${truncatedInput}`);
		}

		return lines.join("\n");
	}
}
