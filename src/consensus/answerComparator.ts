import {
	Question,
	TrueFalse,
	MultipleChoice,
	SelectAllThatApply,
	FillInTheBlank,
	Matching,
	ShortOrLongAnswer,
} from "../utils/types";

/**
 * Result of comparing two answers
 */
export interface ComparisonResult {
	/** Whether the answers match */
	match: boolean;

	/** Similarity score (0-1), where 1 is identical */
	similarity: number;

	/** Details about the comparison */
	details?: string;
}

/**
 * Options for answer comparison
 */
export interface ComparisonOptions {
	/** Threshold for fuzzy matching text (0-1) */
	fuzzyThreshold?: number;

	/** Whether to ignore case in text comparisons */
	ignoreCase?: boolean;

	/** Whether to ignore whitespace differences */
	ignoreWhitespace?: boolean;

	/** Whether to ignore punctuation in text comparisons */
	ignorePunctuation?: boolean;
}

/**
 * Default comparison options
 */
const DEFAULT_OPTIONS: Required<ComparisonOptions> = {
	fuzzyThreshold: 0.85,
	ignoreCase: true,
	ignoreWhitespace: true,
	ignorePunctuation: true,
};

/**
 * Compares two answers from different models to detect consensus.
 *
 * This is the main entry point for answer comparison. It determines the
 * question type and dispatches to the appropriate type-specific comparator.
 *
 * @param answer1 - First answer to compare
 * @param answer2 - Second answer to compare
 * @param questionType - The type of question (determines comparison strategy)
 * @param options - Comparison options
 * @returns Comparison result with similarity score
 */
export function compareAnswers(
	answer1: any,
	answer2: any,
	questionType: string,
	options?: ComparisonOptions
): ComparisonResult {
	const opts = { ...DEFAULT_OPTIONS, ...options };

	// Handle null/undefined cases
	if (answer1 == null || answer2 == null) {
		return {
			match: answer1 === answer2,
			similarity: answer1 === answer2 ? 1.0 : 0.0,
			details: "One or both answers are null/undefined",
		};
	}

	// Dispatch to type-specific comparators
	switch (questionType) {
		case "TrueFalse":
			return compareTrueFalseAnswers(answer1, answer2);
		case "MultipleChoice":
			return compareMultipleChoiceAnswers(answer1, answer2);
		case "SelectAllThatApply":
			return compareSelectAllAnswers(answer1, answer2);
		case "FillInTheBlank":
			return compareFillInTheBlankAnswers(answer1, answer2, opts);
		case "Matching":
			return compareMatchingAnswers(answer1, answer2, opts);
		case "ShortOrLongAnswer":
			return compareShortOrLongAnswers(answer1, answer2, opts);
		default:
			return {
				match: false,
				similarity: 0.0,
				details: `Unknown question type: ${questionType}`,
			};
	}
}

/**
 * Compare two True/False answers
 *
 * Simple boolean comparison.
 */
export function compareTrueFalseAnswers(
	answer1: boolean,
	answer2: boolean
): ComparisonResult {
	const match = answer1 === answer2;
	return {
		match,
		similarity: match ? 1.0 : 0.0,
		details: `answer1=${answer1}, answer2=${answer2}`,
	};
}

/**
 * Compare two Multiple Choice answers
 *
 * Compares the selected option indices.
 */
export function compareMultipleChoiceAnswers(
	answer1: number,
	answer2: number
): ComparisonResult {
	const match = answer1 === answer2;
	return {
		match,
		similarity: match ? 1.0 : 0.0,
		details: `answer1=${answer1}, answer2=${answer2}`,
	};
}

/**
 * Compare two Select All That Apply answers
 *
 * Uses Jaccard similarity coefficient to measure overlap between sets.
 */
export function compareSelectAllAnswers(
	answer1: number[],
	answer2: number[]
): ComparisonResult {
	// Ensure inputs are arrays
	if (!Array.isArray(answer1) || !Array.isArray(answer2)) {
		return {
			match: false,
			similarity: 0.0,
			details: "Invalid input: expected arrays",
		};
	}

	// Handle empty arrays
	if (answer1.length === 0 && answer2.length === 0) {
		return {
			match: true,
			similarity: 1.0,
			details: "Both answers are empty",
		};
	}

	if (answer1.length === 0 || answer2.length === 0) {
		return {
			match: false,
			similarity: 0.0,
			details: "One answer is empty",
		};
	}

	// Create sets for comparison
	const set1 = new Set(answer1);
	const set2 = new Set(answer2);

	// Calculate Jaccard similarity: |intersection| / |union|
	const intersection = new Set([...set1].filter(x => set2.has(x)));
	const union = new Set([...set1, ...set2]);

	const similarity = intersection.size / union.size;
	const match = similarity === 1.0;

	return {
		match,
		similarity,
		details: `intersection=${intersection.size}, union=${union.size}`,
	};
}

/**
 * Compare two Fill In The Blank answers
 *
 * Each answer is an array of strings (one per blank).
 * Uses fuzzy matching for each blank and averages the similarity.
 */
export function compareFillInTheBlankAnswers(
	answer1: string[],
	answer2: string[],
	options: Required<ComparisonOptions>
): ComparisonResult {
	// Ensure inputs are arrays
	if (!Array.isArray(answer1) || !Array.isArray(answer2)) {
		return {
			match: false,
			similarity: 0.0,
			details: "Invalid input: expected arrays",
		};
	}

	// Answers must have same number of blanks
	if (answer1.length !== answer2.length) {
		return {
			match: false,
			similarity: 0.0,
			details: `Different number of blanks: ${answer1.length} vs ${answer2.length}`,
		};
	}

	if (answer1.length === 0) {
		return {
			match: true,
			similarity: 1.0,
			details: "Both answers are empty",
		};
	}

	// Compare each blank
	let totalSimilarity = 0;
	for (let i = 0; i < answer1.length; i++) {
		const blankSimilarity = fuzzyStringMatch(answer1[i], answer2[i], options);
		totalSimilarity += blankSimilarity;
	}

	const similarity = totalSimilarity / answer1.length;
	const match = similarity >= options.fuzzyThreshold;

	return {
		match,
		similarity,
		details: `Average similarity across ${answer1.length} blanks`,
	};
}

/**
 * Compare two Matching answers
 *
 * Each answer is an array of {leftOption, rightOption} pairs.
 * Uses fuzzy matching for text comparison.
 */
export function compareMatchingAnswers(
	answer1: Array<{ leftOption: string; rightOption: string }>,
	answer2: Array<{ leftOption: string; rightOption: string }>,
	options: Required<ComparisonOptions>
): ComparisonResult {
	// Ensure inputs are arrays
	if (!Array.isArray(answer1) || !Array.isArray(answer2)) {
		return {
			match: false,
			similarity: 0.0,
			details: "Invalid input: expected arrays",
		};
	}

	// Answers must have same number of pairs
	if (answer1.length !== answer2.length) {
		return {
			match: false,
			similarity: 0.0,
			details: `Different number of pairs: ${answer1.length} vs ${answer2.length}`,
		};
	}

	if (answer1.length === 0) {
		return {
			match: true,
			similarity: 1.0,
			details: "Both answers are empty",
		};
	}

	// Create maps for comparison (case and whitespace normalized)
	const map1 = createMatchingMap(answer1, options);
	const map2 = createMatchingMap(answer2, options);

	// Count matching pairs
	let matchingPairs = 0;
	let totalSimilarity = 0;

	for (const [left1, right1] of map1.entries()) {
		const right2 = map2.get(left1);
		if (right2) {
			const similarity = fuzzyStringMatch(right1, right2, options);
			totalSimilarity += similarity;
			if (similarity >= options.fuzzyThreshold) {
				matchingPairs++;
			}
		}
	}

	const similarity = totalSimilarity / answer1.length;
	const match = matchingPairs === answer1.length;

	return {
		match,
		similarity,
		details: `${matchingPairs}/${answer1.length} pairs match`,
	};
}

/**
 * Compare two Short/Long Answer responses
 *
 * Uses fuzzy text matching with configurable thresholds.
 */
export function compareShortOrLongAnswers(
	answer1: string,
	answer2: string,
	options: Required<ComparisonOptions>
): ComparisonResult {
	if (typeof answer1 !== "string" || typeof answer2 !== "string") {
		return {
			match: false,
			similarity: 0.0,
			details: "Invalid input: expected strings",
		};
	}

	const similarity = fuzzyStringMatch(answer1, answer2, options);
	const match = similarity >= options.fuzzyThreshold;

	return {
		match,
		similarity,
		details: `Fuzzy match score: ${similarity.toFixed(3)}`,
	};
}

/**
 * Fuzzy string matching using Levenshtein distance
 *
 * Normalizes strings based on options and calculates similarity.
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @param options - Comparison options
 * @returns Similarity score (0-1)
 */
export function fuzzyStringMatch(
	str1: string,
	str2: string,
	options: Required<ComparisonOptions>
): number {
	// Normalize strings
	let normalized1 = normalizeString(str1, options);
	let normalized2 = normalizeString(str2, options);

	// Handle empty strings
	if (normalized1.length === 0 && normalized2.length === 0) {
		return 1.0;
	}
	if (normalized1.length === 0 || normalized2.length === 0) {
		return 0.0;
	}

	// Check for exact match (fast path)
	if (normalized1 === normalized2) {
		return 1.0;
	}

	// Calculate Levenshtein distance
	const distance = levenshteinDistance(normalized1, normalized2);
	const maxLength = Math.max(normalized1.length, normalized2.length);

	// Convert distance to similarity score
	const similarity = 1 - distance / maxLength;

	return Math.max(0, Math.min(1, similarity));
}

/**
 * Normalize a string based on comparison options
 */
function normalizeString(
	str: string,
	options: Required<ComparisonOptions>
): string {
	let result = str;

	if (options.ignoreCase) {
		result = result.toLowerCase();
	}

	if (options.ignorePunctuation) {
		// Remove all punctuation except spaces
		result = result.replace(/[^\w\s]|_/g, "");
	}

	if (options.ignoreWhitespace) {
		// Normalize whitespace to single spaces and trim
		result = result.replace(/\s+/g, " ").trim();
	}

	return result;
}

/**
 * Calculate Levenshtein distance between two strings
 *
 * This is the minimum number of single-character edits (insertions,
 * deletions, or substitutions) required to change one string into the other.
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Levenshtein distance
 */
function levenshteinDistance(str1: string, str2: string): number {
	const len1 = str1.length;
	const len2 = str2.length;

	// Create distance matrix
	const matrix: number[][] = Array(len1 + 1)
		.fill(null)
		.map(() => Array(len2 + 1).fill(0));

	// Initialize first column and row
	for (let i = 0; i <= len1; i++) {
		matrix[i][0] = i;
	}
	for (let j = 0; j <= len2; j++) {
		matrix[0][j] = j;
	}

	// Fill in the rest of the matrix
	for (let i = 1; i <= len1; i++) {
		for (let j = 1; j <= len2; j++) {
			const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1, // deletion
				matrix[i][j - 1] + 1, // insertion
				matrix[i - 1][j - 1] + cost // substitution
			);
		}
	}

	return matrix[len1][len2];
}

/**
 * Create a normalized map of left->right pairs for matching questions
 */
function createMatchingMap(
	pairs: Array<{ leftOption: string; rightOption: string }>,
	options: Required<ComparisonOptions>
): Map<string, string> {
	const map = new Map<string, string>();

	for (const pair of pairs) {
		const normalizedLeft = normalizeString(pair.leftOption, options);
		const normalizedRight = normalizeString(pair.rightOption, options);
		map.set(normalizedLeft, normalizedRight);
	}

	return map;
}

/**
 * Determine the question type from a question object
 *
 * This helper function identifies which type of question we're dealing with
 * based on the properties present in the object.
 *
 * @param question - Question object
 * @returns Question type string
 */
export function getQuestionType(question: Question): string {
	// Type guard checks
	if ("answer" in question) {
		if (typeof question.answer === "boolean") {
			return "TrueFalse";
		}
		if (typeof question.answer === "number") {
			return "MultipleChoice";
		}
		if (Array.isArray(question.answer)) {
			if (question.answer.length > 0 && typeof question.answer[0] === "number") {
				return "SelectAllThatApply";
			}
			if (question.answer.length > 0 && typeof question.answer[0] === "string") {
				return "FillInTheBlank";
			}
			if (
				question.answer.length > 0 &&
				typeof question.answer[0] === "object" &&
				"leftOption" in question.answer[0]
			) {
				return "Matching";
			}
		}
		if (typeof question.answer === "string") {
			return "ShortOrLongAnswer";
		}
	}

	return "Unknown";
}

/**
 * Compare two complete questions (including the question text and answer)
 *
 * This is useful when you need to compare entire question objects,
 * not just the answers.
 *
 * @param question1 - First question
 * @param question2 - Second question
 * @param options - Comparison options
 * @returns Comparison result
 */
export function compareQuestions(
	question1: Question,
	question2: Question,
	options?: ComparisonOptions
): ComparisonResult {
	const type1 = getQuestionType(question1);
	const type2 = getQuestionType(question2);

	// Questions must be of same type
	if (type1 !== type2) {
		return {
			match: false,
			similarity: 0.0,
			details: `Different question types: ${type1} vs ${type2}`,
		};
	}

	// Extract answers based on type
	const answer1 = (question1 as any).answer;
	const answer2 = (question2 as any).answer;

	// Compare answers
	return compareAnswers(answer1, answer2, type1, options);
}
