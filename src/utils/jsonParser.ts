/**
 * JSON Parser with automatic repair capabilities and user-friendly error messages
 * Handles common LLM JSON output issues like trailing commas, truncation, and control characters
 */

export interface ParseResult<T> {
	success: boolean;
	data?: T;
	repaired: boolean;
	repairDetails?: string[];
	error?: JSONParseError;
}

export interface JSONParseError {
	message: string;
	context: string;
	position?: number;
	suggestions: string[];
}

export interface ParseOptions {
	maxRetries?: number;
	enableRepair?: boolean;
	contextLength?: number;
}

interface RepairStrategy {
	name: string;
	description: string;
	repair: (input: string) => string;
}

const DEFAULT_OPTIONS: Required<ParseOptions> = {
	maxRetries: 1,
	enableRepair: true,
	contextLength: 50,
};

export class JSONParser {
	private static repairStrategies: RepairStrategy[] = [
		// 1. Remove trailing commas before closing brackets
		{
			name: "trailing-commas",
			description: "Removed trailing commas",
			repair: (input: string): string => input.replace(/,\s*([}\]])/g, "$1"),
		},

		// 2. Remove control characters (except newlines and tabs)
		{
			name: "control-characters",
			description: "Removed control characters",
			repair: (input: string): string =>
				input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""),
		},

		// 3. Fix unquoted keys
		{
			name: "unquoted-keys",
			description: "Added quotes to unquoted keys",
			repair: (input: string): string =>
				input.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3'),
		},

		// 4. Fix single quotes to double quotes
		{
			name: "single-quotes",
			description: "Converted single quotes to double quotes",
			repair: (input: string): string => {
				// Simple approach: replace single quotes that look like string delimiters
				// This is a heuristic and may not work for all cases
				return input.replace(
					/([{,:\[]\s*)'([^']*)'(\s*[,}\]:])/g,
					'$1"$2"$3'
				);
			},
		},

		// 5. Complete truncated JSON
		{
			name: "truncated-json",
			description: "Closed truncated JSON structure",
			repair: (input: string): string => {
				const trimmed = input.trim();

				// Count open brackets/braces and track structure
				let braces = 0;
				let brackets = 0;
				let inString = false;
				let escaped = false;
				let lastNonWhitespace = "";
				let inKey = false;
				let afterColon = false;

				for (let i = 0; i < trimmed.length; i++) {
					const char = trimmed[i];

					if (escaped) {
						escaped = false;
						continue;
					}

					if (char === "\\") {
						escaped = true;
						continue;
					}

					if (char === '"') {
						inString = !inString;
						if (!inString && afterColon) {
							afterColon = false;
						}
						continue;
					}

					if (!inString) {
						if (!/\s/.test(char)) {
							lastNonWhitespace = char;
						}

						switch (char) {
							case "{":
								braces++;
								inKey = true;
								afterColon = false;
								break;
							case "}":
								braces--;
								inKey = false;
								afterColon = false;
								break;
							case "[":
								brackets++;
								afterColon = false;
								break;
							case "]":
								brackets--;
								afterColon = false;
								break;
							case ":":
								inKey = false;
								afterColon = true;
								break;
							case ",":
								inKey = braces > 0;
								afterColon = false;
								break;
						}
					}
				}

				// Close any open structures
				let result = trimmed;

				// If we're in a string, close it
				if (inString) {
					result += '"';
				}

				// If we ended with a colon (incomplete value), add null
				if (lastNonWhitespace === ":") {
					result += "null";
				}

				// Handle trailing comma before closing
				result = result.replace(/,\s*$/, "");

				// Close brackets and braces
				while (brackets > 0) {
					result += "]";
					brackets--;
				}

				while (braces > 0) {
					result += "}";
					braces--;
				}

				return result;
			},
		},
	];

	/**
	 * Parse JSON with automatic repair and user-friendly errors
	 */
	static parse<T>(input: string, options?: ParseOptions): ParseResult<T> {
		const opts = { ...DEFAULT_OPTIONS, ...options };

		// First, try parsing as-is
		try {
			const data = JSON.parse(input) as T;
			return {
				success: true,
				data,
				repaired: false,
			};
		} catch (initialError) {
			// If repair is disabled, return error immediately
			if (!opts.enableRepair) {
				return {
					success: false,
					repaired: false,
					error: this.formatError(
						initialError as Error,
						input,
						opts.contextLength
					),
				};
			}

			// Try repair strategies
			const repairResult = this.repair(input);

			if (repairResult.repaired !== input) {
				try {
					const data = JSON.parse(repairResult.repaired) as T;
					return {
						success: true,
						data,
						repaired: true,
						repairDetails: repairResult.details,
					};
				} catch {
					// Repair didn't help, fall through to error
				}
			}

			// Return formatted error
			return {
				success: false,
				repaired: false,
				error: this.formatError(
					initialError as Error,
					input,
					opts.contextLength
				),
			};
		}
	}

	/**
	 * Attempt to repair common JSON issues
	 */
	private static repair(input: string): {
		repaired: string;
		details: string[];
	} {
		let current = input;
		const details: string[] = [];

		for (const strategy of this.repairStrategies) {
			const repaired = strategy.repair(current);
			if (repaired !== current) {
				details.push(strategy.description);
				current = repaired;
			}
		}

		return { repaired: current, details };
	}

	/**
	 * Format error with context and suggestions
	 */
	private static formatError(
		error: Error,
		input: string,
		contextLength: number
	): JSONParseError {
		const errorMessage = error.message;
		const position = this.extractPosition(errorMessage);

		// Generate user-friendly message
		const message = this.getUserFriendlyMessage(errorMessage, input);

		// Extract context around error
		const context = position
			? this.extractContext(input, position, contextLength)
			: this.extractEndContext(input, contextLength);

		// Generate suggestions
		const suggestions = this.generateSuggestions(errorMessage, input);

		return {
			message,
			context,
			position,
			suggestions,
		};
	}

	/**
	 * Extract position from error message
	 */
	private static extractPosition(errorMessage: string): number | undefined {
		// Match patterns like "at position 123" or "at line 1 column 45"
		const positionMatch = errorMessage.match(/position\s+(\d+)/i);
		if (positionMatch) {
			return parseInt(positionMatch[1], 10);
		}

		const columnMatch = errorMessage.match(/column\s+(\d+)/i);
		if (columnMatch) {
			return parseInt(columnMatch[1], 10);
		}

		return undefined;
	}

	/**
	 * Convert technical error to user-friendly message
	 */
	private static getUserFriendlyMessage(
		errorMessage: string,
		input: string
	): string {
		const lowerMessage = errorMessage.toLowerCase();

		if (
			lowerMessage.includes("unexpected end") ||
			lowerMessage.includes("end of json")
		) {
			return "The response was cut off before completing";
		}

		if (lowerMessage.includes("unexpected token")) {
			return "The response contained invalid formatting";
		}

		if (
			lowerMessage.includes("expected") &&
			(lowerMessage.includes("'}'") || lowerMessage.includes("'}'"))
		) {
			return "The response has mismatched brackets or braces";
		}

		if (lowerMessage.includes("expected")) {
			return "The response contained unexpected characters";
		}

		// Check for apparent truncation
		if (input.length > 100 && !input.trim().endsWith("}") && !input.trim().endsWith("]")) {
			return "The response appears to have been truncated";
		}

		return "The response could not be parsed as valid JSON";
	}

	/**
	 * Extract meaningful context around error position
	 */
	private static extractContext(
		input: string,
		position: number,
		length: number
	): string {
		const start = Math.max(0, position - Math.floor(length / 2));
		const end = Math.min(input.length, position + Math.floor(length / 2));

		let context = input.slice(start, end);

		// Add ellipsis if truncated
		if (start > 0) {
			context = "..." + context;
		}
		if (end < input.length) {
			context = context + "...";
		}

		// Clean up for display
		return context.replace(/\n/g, "\\n").replace(/\t/g, "\\t");
	}

	/**
	 * Extract context from the end of input (for truncation errors)
	 */
	private static extractEndContext(input: string, length: number): string {
		const start = Math.max(0, input.length - length);
		let context = input.slice(start);

		if (start > 0) {
			context = "..." + context;
		}

		return context.replace(/\n/g, "\\n").replace(/\t/g, "\\t");
	}

	/**
	 * Generate actionable suggestions based on error type
	 */
	private static generateSuggestions(
		errorMessage: string,
		input: string
	): string[] {
		const suggestions: string[] = [];
		const lowerMessage = errorMessage.toLowerCase();

		// Always suggest retry as LLM responses vary
		suggestions.push("Try again - LLM responses can vary");

		// Check for truncation issues
		if (
			lowerMessage.includes("unexpected end") ||
			lowerMessage.includes("end of json") ||
			(input.length > 1000 && !input.trim().endsWith("}") && !input.trim().endsWith("]"))
		) {
			suggestions.push("Try generating fewer items");
			suggestions.push("Try with a shorter source document");
		}

		// Check for complexity issues
		if (input.length > 5000) {
			suggestions.push("Consider splitting into smaller requests");
		}

		// Generic suggestions for syntax errors
		if (
			lowerMessage.includes("unexpected token") ||
			lowerMessage.includes("expected")
		) {
			suggestions.push("Try reducing the complexity of the source content");
		}

		return suggestions;
	}
}
