import { App, Component, MarkdownRenderer } from "obsidian";

/**
 * Detects if markdown content contains a table.
 * A markdown table is identified by lines containing pipe characters (|)
 * with at least one line containing dashes for the header separator.
 *
 * @param content - The markdown content to check
 * @returns true if the content contains a table, false otherwise
 */
export function containsTable(content: string): boolean {
	if (!content || typeof content !== "string") {
		return false;
	}

	const lines = content.split("\n");
	let hasPipes = false;
	let hasSeparator = false;

	for (const line of lines) {
		const trimmedLine = line.trim();

		// Check if line contains pipe characters (potential table row)
		if (trimmedLine.includes("|")) {
			hasPipes = true;

			// Check if this is a header separator line (contains dashes between pipes)
			// Example: | --- | --- | --- |
			// Split by pipes and check if cells contain only dashes/colons
			const parts = trimmedLine.split("|").map(p => p.trim());

			// Check if any parts match the separator pattern (dashes with optional colons)
			const isSeparator = parts.some(part =>
				part.length > 0 && /^:?-+:?$/.test(part)
			);

			if (isSeparator) {
				hasSeparator = true;
				break;
			}
		}
	}

	return hasPipes && hasSeparator;
}

/**
 * Renders markdown content with proper table support using Obsidian's MarkdownRenderer.
 * If tables are detected, applies appropriate CSS classes for styling and scrolling.
 *
 * @param app - The Obsidian App instance
 * @param content - The markdown content to render
 * @param container - The HTML element to render into
 * @param sourcePath - The source file path for link resolution (defaults to empty string)
 * @param component - The Obsidian Component for lifecycle management
 * @param cssClass - Optional CSS class to add to the container for context-specific styling
 * @returns A promise that resolves when rendering is complete
 */
export async function renderWithTables(
	app: App,
	content: string,
	container: HTMLElement,
	sourcePath: string,
	component: Component,
	cssClass?: string
): Promise<void> {
	// Clear the container first
	container.empty();

	// Render the markdown content using Obsidian's built-in renderer
	await MarkdownRenderer.render(app, content, container, sourcePath, component);

	// Check if tables were rendered and apply appropriate styling
	const tables = container.querySelectorAll("table");

	if (tables.length > 0) {
		tables.forEach((table) => {
			// Add base table class for quiz/flashcard styling
			table.addClass("rendered-table-qg");

			// Add context-specific class if provided
			if (cssClass) {
				table.addClass(cssClass);
			}

			// Wrap table in a scrollable container for wide tables
			if (table.parentNode) {
				const tableWrapper = table.parentNode.createEl("div");
				tableWrapper.addClass("table-wrapper-qg");

				// Insert wrapper before table and move table into wrapper
				table.parentNode.insertBefore(tableWrapper as Node, table as Node);
				tableWrapper.appendChild(table as Node);
			}

			// Apply accessible table attributes
			if (!table.getAttribute("role")) {
				table.setAttribute("role", "table");
			}
		});
	}
}

/**
 * Convenience function for rendering content in quiz contexts.
 * Automatically applies quiz-specific table styling.
 *
 * @param app - The Obsidian App instance
 * @param content - The markdown content to render
 * @param container - The HTML element to render into
 * @param sourcePath - The source file path for link resolution (defaults to empty string)
 * @param component - The Obsidian Component for lifecycle management
 * @returns A promise that resolves when rendering is complete
 */
export async function renderQuizContent(
	app: App,
	content: string,
	container: HTMLElement,
	sourcePath: string,
	component: Component
): Promise<void> {
	return renderWithTables(app, content, container, sourcePath, component, "quiz-table-qg");
}

/**
 * Convenience function for rendering content in flashcard contexts.
 * Automatically applies flashcard-specific table styling.
 *
 * @param app - The Obsidian App instance
 * @param content - The markdown content to render
 * @param container - The HTML element to render into
 * @param sourcePath - The source file path for link resolution (defaults to empty string)
 * @param component - The Obsidian Component for lifecycle management
 * @returns A promise that resolves when rendering is complete
 */
export async function renderFlashcardContent(
	app: App,
	content: string,
	container: HTMLElement,
	sourcePath: string,
	component: Component
): Promise<void> {
	return renderWithTables(app, content, container, sourcePath, component, "flashcard-table-qg");
}

/**
 * Normalizes a string for comparison by:
 * - Converting to lowercase
 * - Trimming whitespace
 * - Removing punctuation
 * - Collapsing multiple spaces to single space
 * - Removing markdown formatting (bold, italic, code)
 *
 * @param text - The text to normalize
 * @returns Normalized text suitable for comparison
 */
export function normalizeText(text: string): string {
	if (!text || typeof text !== "string") {
		return "";
	}

	return text
		.toLowerCase()
		.trim()
		// Remove markdown formatting
		.replace(/\*\*([^*]+)\*\*/g, "$1") // Bold
		.replace(/\*([^*]+)\*/g, "$1") // Italic
		.replace(/__([^_]+)__/g, "$1") // Bold
		.replace(/_([^_]+)_/g, "$1") // Italic
		.replace(/`([^`]+)`/g, "$1") // Inline code
		// Remove punctuation except hyphens in compound words
		.replace(/[^\w\s-]/g, "")
		// Collapse multiple spaces
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Calculates the Levenshtein distance between two strings.
 * This measures how many single-character edits are needed to transform one string into another.
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns The Levenshtein distance (number of edits)
 */
export function levenshteinDistance(str1: string, str2: string): number {
	const len1 = str1.length;
	const len2 = str2.length;

	// Create a 2D array for dynamic programming
	const matrix: number[][] = Array(len1 + 1)
		.fill(null)
		.map(() => Array(len2 + 1).fill(0));

	// Initialize first column (deletion costs)
	for (let i = 0; i <= len1; i++) {
		matrix[i][0] = i;
	}

	// Initialize first row (insertion costs)
	for (let j = 0; j <= len2; j++) {
		matrix[0][j] = j;
	}

	// Fill in the rest of the matrix
	for (let i = 1; i <= len1; i++) {
		for (let j = 1; j <= len2; j++) {
			const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;

			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1, // Deletion
				matrix[i][j - 1] + 1, // Insertion
				matrix[i - 1][j - 1] + cost // Substitution
			);
		}
	}

	return matrix[len1][len2];
}

/**
 * Compares two answers and calculates a similarity score.
 * Uses normalized text comparison and Levenshtein distance for fuzzy matching.
 *
 * @param userAnswer - The answer provided by the user
 * @param correctAnswer - The correct answer
 * @returns An object with similarity score (0-1), whether it's considered correct, and feedback
 */
export function compareAnswers(
	userAnswer: string,
	correctAnswer: string
): {
	similarity: number;
	isCorrect: boolean;
	feedback: string;
} {
	// Handle empty inputs
	if (!userAnswer || !correctAnswer) {
		return {
			similarity: 0,
			isCorrect: false,
			feedback: "Please provide an answer"
		};
	}

	// Normalize both answers
	const normalizedUser = normalizeText(userAnswer);
	const normalizedCorrect = normalizeText(correctAnswer);

	// Exact match after normalization
	if (normalizedUser === normalizedCorrect) {
		return {
			similarity: 1.0,
			isCorrect: true,
			feedback: "Correct!"
		};
	}

	// Calculate Levenshtein distance
	const distance = levenshteinDistance(normalizedUser, normalizedCorrect);
	const maxLength = Math.max(normalizedUser.length, normalizedCorrect.length);

	// Calculate similarity as percentage (1 - distance/maxLength)
	const similarity = maxLength > 0 ? 1 - distance / maxLength : 0;

	// Determine correctness thresholds
	let isCorrect = false;
	let feedback = "";

	if (similarity >= 0.9) {
		// 90%+ similarity - likely just minor typos
		isCorrect = true;
		feedback = "Correct! (minor typo)";
	} else if (similarity >= 0.75) {
		// 75-89% similarity - partially correct
		isCorrect = false;
		feedback = "Close! Check your spelling";
	} else if (similarity >= 0.5) {
		// 50-74% similarity - some resemblance
		isCorrect = false;
		feedback = "Partially correct";
	} else {
		// < 50% similarity - incorrect
		isCorrect = false;
		feedback = "Incorrect";
	}

	return {
		similarity: Math.round(similarity * 100) / 100, // Round to 2 decimal places
		isCorrect,
		feedback
	};
}
