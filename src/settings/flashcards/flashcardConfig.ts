import { PracticeMode } from "../../utils/types";

/**
 * Save format options for flashcards
 */
export const enum FlashcardSaveFormat {
	CALLOUT = "Callout",
	SPACED_REPETITION = "Spaced Repetition",
}

/**
 * Map of flashcard save formats with display names
 */
export const flashcardSaveFormats: Record<FlashcardSaveFormat, string> = {
	[FlashcardSaveFormat.CALLOUT]: "Callout",
	[FlashcardSaveFormat.SPACED_REPETITION]: "Spaced Repetition",
};

/**
 * Keyboard shortcuts for flashcard review
 */
export interface FlashcardKeyboardShortcuts {
	/** Key to reveal flashcard answer */
	revealAnswer: string;
	/** Key to move to next card */
	nextCard: string;
	/** Key to move to previous card */
	previousCard: string;
	/** Key for "Again" confidence rating */
	ratingAgain: string;
	/** Key for "Hard" confidence rating */
	ratingHard: string;
	/** Key for "Good" confidence rating */
	ratingGood: string;
	/** Key for "Easy" confidence rating */
	ratingEasy: string;
	/** Key to show hint */
	showHint: string;
}

/**
 * Organization scheme for flashcard folder structure
 */
export type FlashcardOrganizationScheme = "flat" | "mirror" | "deck-based";

/**
 * Configuration interface for flashcard system settings
 */
export interface FlashcardConfig {
	/** Automatically save flashcards after generation */
	autoSave: boolean;
	/** Path where flashcards are saved (relative to vault root) */
	savePath: string;
	/** Format for saving flashcards */
	saveFormat: string;
	/** Maximum new cards to introduce per day (default deck setting) */
	defaultNewCardsPerDay: number;
	/** Maximum reviews per day (default deck setting) */
	defaultReviewsPerDay: number;
	/** Default practice modes enabled for new decks */
	defaultEnabledPracticeModes: PracticeMode[];
	/** Enable audio cues by default */
	defaultEnableAudioCues: boolean;
	/** Default ease factor for new cards (SM-2 algorithm) */
	defaultEaseFactor: number;
	/** Minimum ease factor (prevent cards from becoming too difficult) */
	minEaseFactor: number;
	/** Maximum ease factor (prevent excessive intervals) */
	maxEaseFactor: number;
	/** Interval for "Again" rating (in days) */
	againInterval: number;
	/** Interval multiplier for "Hard" rating */
	hardIntervalMultiplier: number;
	/** Interval multiplier for "Good" rating */
	goodIntervalMultiplier: number;
	/** Interval multiplier for "Easy" rating */
	easyIntervalMultiplier: number;
	/** Minimum interval between reviews (in days) */
	minInterval: number;
	/** Maximum interval between reviews (in days) */
	maxInterval: number;
	/** Number of reviews to keep in history per card */
	maxReviewHistoryLength: number;
	/** Property name for flashcard source material in frontmatter */
	flashcardMaterialProperty: string;
	/** Separator for inline spaced repetition format (e.g., "Question :: Answer") */
	inlineSeparator: string;
	/** Keyboard shortcuts for flashcard review */
	keyboardShortcuts: FlashcardKeyboardShortcuts;
	/** Enable high contrast mode for improved visibility */
	enableHighContrastMode: boolean;

	// Folder organization settings (Requirement 2.1)
	/** Dedicated folder for storing flashcards (relative to vault root) */
	dedicatedFolder: string;
	/** Organization scheme for flashcard files */
	organizationScheme: FlashcardOrganizationScheme;
	/** Automatically migrate flashcards when folder settings change */
	autoMigrateOnChange: boolean;

	// Learning goals settings (Requirements 3.7, 9.4, 9.5)
	/** Daily card review goal */
	dailyCardGoal: number;
	/** Daily time goal in minutes */
	dailyTimeGoal: number;
	/** Enable notifications for streak milestones */
	enableStreakNotifications: boolean;
	/** Enable daily goal notifications (Requirement 8.2) */
	enableDailyGoalNotifications: boolean;
	/** Time to show daily goal progress notification (HH:MM format, 24-hour) */
	dailyGoalNotificationTime: string;
	/** Show flashcard count for active note in status bar (Requirements 6.4, 6.5) */
	showFlashcardCountInStatusBar: boolean;
}

/**
 * Default keyboard shortcuts for flashcard review
 */
export const DEFAULT_KEYBOARD_SHORTCUTS: FlashcardKeyboardShortcuts = {
	revealAnswer: "Space",
	nextCard: "ArrowRight",
	previousCard: "ArrowLeft",
	ratingAgain: "1",
	ratingHard: "2",
	ratingGood: "3",
	ratingEasy: "4",
	showHint: "h",
};

/**
 * Default flashcard configuration values
 * Based on requirements 9.1, 9.5 and SM-2 algorithm standards
 */
export const DEFAULT_FLASHCARD_SETTINGS: FlashcardConfig = {
	// Saving settings
	autoSave: false,
	savePath: "/",
	saveFormat: FlashcardSaveFormat.CALLOUT,

	// Deck settings
	defaultNewCardsPerDay: 20,
	defaultReviewsPerDay: 100,
	defaultEnabledPracticeModes: [
		PracticeMode.STANDARD,
		PracticeMode.TYPE_ANSWER,
		PracticeMode.MULTIPLE_CHOICE,
		PracticeMode.CLOZE,
	],
	defaultEnableAudioCues: false,

	// SM-2 Algorithm settings
	defaultEaseFactor: 2.5, // Standard SM-2 default
	minEaseFactor: 1.3, // Prevent cards from becoming impossible
	maxEaseFactor: 3.0, // Cap maximum ease to prevent excessive intervals

	// Confidence rating intervals (based on SM-2 best practices)
	againInterval: 1, // Review again in 1 day
	hardIntervalMultiplier: 1.2, // Minimal increase
	goodIntervalMultiplier: 2.5, // Standard SM-2 multiplier (uses ease factor)
	easyIntervalMultiplier: 3.0, // Significant increase for easy cards

	// Interval constraints
	minInterval: 1, // At least 1 day between reviews
	maxInterval: 365, // Maximum 1 year between reviews

	// Data management
	maxReviewHistoryLength: 50, // Keep last 50 reviews per card

	// File format settings
	flashcardMaterialProperty: "flashcard-sources",
	inlineSeparator: "::",

	// Accessibility settings
	keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
	enableHighContrastMode: false,

	// Folder organization settings (Requirement 2.1)
	dedicatedFolder: "Flashcards",
	organizationScheme: "flat",
	autoMigrateOnChange: false,

	// Learning goals settings (Requirements 3.7, 9.4, 9.5)
	dailyCardGoal: 20,
	dailyTimeGoal: 15,
	enableStreakNotifications: true,
	// Daily goal notification settings (Requirement 8.2)
	enableDailyGoalNotifications: true,
	dailyGoalNotificationTime: "18:00",
	// Status bar settings (Requirements 6.4, 6.5)
	showFlashcardCountInStatusBar: true,
};

/**
 * Storage paths and file naming conventions
 */
export const FLASHCARD_STORAGE = {
	/** Metadata file name (stored in plugin data directory) */
	METADATA_FILE: "flashcard-metadata.json",
	/** Backup metadata file suffix */
	METADATA_BACKUP_SUFFIX: ".backup",
	/** Default deck name when creating from note */
	DEFAULT_DECK_NAME: "My Flashcards",
	/** File prefix for saved flashcard files */
	FILE_PREFIX: "flashcards-",
} as const;

/**
 * Mastery thresholds for progressive difficulty tracking
 */
export const MASTERY_THRESHOLDS = {
	/** Minimum consecutive successful reviews to reach mastered status */
	CONSECUTIVE_SUCCESSES_FOR_MASTERY: 3,
	/** Minimum interval (days) required before card can be marked as mastered */
	MIN_INTERVAL_FOR_MASTERY: 21,
	/** Minimum ease factor to consider for mastery */
	MIN_EASE_FOR_MASTERY: 2.0,
} as const;

/**
 * Learning streak milestone thresholds
 * Requirement 8.1: Track and celebrate learning streak milestones
 */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const;

/**
 * Type for streak milestone values
 */
export type StreakMilestone = typeof STREAK_MILESTONES[number];

/**
 * Practice mode descriptions for UI display
 */
export const PRACTICE_MODE_DESCRIPTIONS: Record<PracticeMode, string> = {
	[PracticeMode.STANDARD]: "Show front, reveal back (classic flashcard)",
	[PracticeMode.TYPE_ANSWER]: "Type your answer before revealing",
	[PracticeMode.MULTIPLE_CHOICE]: "Choose from multiple options",
	[PracticeMode.CLOZE]: "Fill in the blanks (cloze deletion)",
};

/**
 * Confidence rating descriptions for UI display
 */
export const CONFIDENCE_RATING_LABELS = {
	AGAIN: "Again",
	HARD: "Hard",
	GOOD: "Good",
	EASY: "Easy",
} as const;
