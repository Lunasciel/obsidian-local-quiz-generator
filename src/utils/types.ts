export type Question = TrueFalse | MultipleChoice | SelectAllThatApply | FillInTheBlank | Matching | ShortOrLongAnswer;

export interface Quiz {
	questions: Question[];
}

export interface TrueFalse {
	question: string;
	answer: boolean;
}

export interface MultipleChoice {
	question: string;
	options: string[];
	answer: number;
}

export interface SelectAllThatApply {
	question: string;
	options: string[];
	answer: number[];
}

export interface FillInTheBlank {
	question: string;
	answer: string[];
}

export interface Matching {
	question: string;
	answer: {
		leftOption: string;
		rightOption: string;
	}[];
}

export interface ShortOrLongAnswer {
	question: string;
	answer: string;
}

/**
 * Represents a single flashcard with front (question/prompt) and back (answer/explanation)
 */
export interface Flashcard {
	/** Unique identifier for the flashcard */
	id: string;
	/** Question or prompt (markdown) */
	front: string;
	/** Answer or explanation (markdown) */
	back: string;
	/** Associated deck ID */
	deckId: string;
	/** Timestamp when card was created */
	created: number;
	/** Timestamp when card was last modified */
	modified: number;
	/** Optional tags for organization */
	tags: string[];
	/** Path to the source note file */
	sourceFile?: string;
	/** Optional mnemonic or hint */
	hint?: string;
	/** Media attachments (images, diagrams) */
	media?: FlashcardMedia;
	/** Whether the card is flagged for later editing or review */
	flagged?: boolean;
}

/**
 * Media content embedded in flashcards
 */
export interface FlashcardMedia {
	/** Array of image paths or URLs */
	images: string[];
	/** Array of Mermaid diagram definitions */
	diagrams: string[];
}

/**
 * Metadata for spaced repetition algorithm
 * Stored separately from flashcard content for performance
 */
export interface FlashcardMetadata {
	/** Flashcard ID this metadata belongs to */
	id: string;
	/** Number of successful reviews */
	repetitions: number;
	/** Days until next review */
	interval: number;
	/** SM-2 ease factor (default: 2.5) */
	easeFactor: number;
	/** Timestamp for next scheduled review */
	dueDate: number;
	/** Timestamp of last review */
	lastReviewed: number;
	/** Current mastery level */
	masteryLevel: MasteryLevel;
	/** History of all reviews */
	reviewHistory: ReviewRecord[];
	/** Last used practice mode */
	practiceMode?: PracticeMode;
}

/**
 * Mastery levels for progressive learning
 */
export enum MasteryLevel {
	/** Card has never been reviewed */
	NEW = "new",
	/** Card is being actively learned */
	LEARNING = "learning",
	/** Card has been mastered (3+ consecutive successful reviews) */
	MASTERED = "mastered"
}

/**
 * Available practice modes for active recall
 */
export enum PracticeMode {
	/** Standard flashcard: show front, reveal back */
	STANDARD = "standard",
	/** Type the answer before revealing */
	TYPE_ANSWER = "type-answer",
	/** Multiple choice with distractors */
	MULTIPLE_CHOICE = "multiple-choice",
	/** Fill in blanks for cloze deletion */
	CLOZE = "cloze-deletion"
}

/**
 * Confidence rating for spaced repetition
 * Based on SM-2 algorithm
 */
export enum ConfidenceRating {
	/** Incorrect or completely forgot */
	AGAIN = 0,
	/** Correct but with difficulty */
	HARD = 1,
	/** Correct with some thought */
	GOOD = 2,
	/** Instantly recalled */
	EASY = 3
}

/**
 * Single review record in history
 */
export interface ReviewRecord {
	/** When the review occurred */
	timestamp: number;
	/** Confidence rating given */
	rating: ConfidenceRating;
	/** Practice mode used */
	mode: PracticeMode;
	/** Time spent reviewing (milliseconds) */
	timeSpent: number;
}

/**
 * A deck is a collection of flashcards organized by topic
 */
export interface Deck {
	/** Unique identifier for the deck */
	id: string;
	/** Display name */
	name: string;
	/** Optional description */
	description: string;
	/** Timestamp when deck was created */
	created: number;
	/** Timestamp when deck was last modified */
	modified: number;
	/** Array of flashcard IDs in this deck */
	cardIds: string[];
	/** Optional source folder path */
	sourceFolder?: string;
	/** Deck-specific settings */
	settings?: DeckSettings;
	/** Whether the deck is archived (hidden from main list by default) */
	archived?: boolean;
}

/**
 * Configuration for a specific deck
 */
export interface DeckSettings {
	/** Maximum new cards to introduce per day */
	newCardsPerDay: number;
	/** Maximum reviews per day */
	reviewsPerDay: number;
	/** Which practice modes are enabled for this deck */
	enabledPracticeModes: PracticeMode[];
	/** Whether to play audio cues */
	enableAudioCues: boolean;
}

/**
 * Statistics for a deck
 */
export interface DeckStats {
	/** Total number of cards in deck */
	totalCards: number;
	/** Number of new (never reviewed) cards */
	newCards: number;
	/** Number of cards being learned */
	learningCards: number;
	/** Number of mastered cards */
	masteredCards: number;
	/** Number of cards due for review today */
	dueToday: number;
	/** Average ease factor across all cards */
	averageEaseFactor: number;
	/** Consecutive days studied */
	studyStreak: number;
	/** Timestamp of last review (most recent card review in the deck) */
	lastReviewed?: number;
}

/**
 * A review session tracks progress during active studying
 */
export interface StudySession {
	/** Unique identifier for the session */
	id?: string;
	/** Deck being studied */
	deckId: string;
	/** When the session started */
	startTime: number;
	/** When the session ended (undefined if in progress) */
	endTime?: number;
	/** Total cards reviewed in this session */
	cardsReviewed: number;
	/** Number of new cards introduced */
	newCards: number;
	/** Number of cards answered correctly */
	correctCount: number;
	/** Number of cards marked as "Again" */
	againCount: number;
	/** IDs of cards that were marked as "Again" during this session */
	againCardIds?: string[];
	/** Practice mode used for this session */
	practiceMode?: PracticeMode;
}

/**
 * Paused session state for localStorage persistence
 * Stores all necessary state to resume a session
 */
export interface PausedSessionState {
	/** Deck being reviewed */
	deckId: string;
	/** Current card index */
	cardIndex: number;
	/** Whether the current card's answer is revealed */
	revealed: boolean;
	/** When the current card was started */
	cardStartTime: number;
	/** Current session statistics */
	sessionStats: StudySession;
	/** Set of card IDs that have been reviewed */
	reviewedCardIds: string[];
	/** Array of card IDs marked as "Again" */
	againCardIds: string[];
	/** Map of card ID to last shown timestamp */
	lastShownTimes: Array<[string, number]>;
	/** Selected practice mode */
	practiceMode: PracticeMode | null;
	/** When the session was paused */
	pausedAt: number;
}

/**
 * Type guard to check if an object is a valid Flashcard
 */
export function isFlashcard(obj: any): obj is Flashcard {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.id === "string" &&
		typeof obj.front === "string" &&
		typeof obj.back === "string" &&
		typeof obj.deckId === "string" &&
		typeof obj.created === "number" &&
		typeof obj.modified === "number" &&
		Array.isArray(obj.tags)
	);
}

/**
 * Type guard to check if an object is a valid Deck
 */
export function isDeck(obj: any): obj is Deck {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.id === "string" &&
		typeof obj.name === "string" &&
		typeof obj.description === "string" &&
		typeof obj.created === "number" &&
		typeof obj.modified === "number" &&
		Array.isArray(obj.cardIds)
	);
}

/**
 * Type guard to check if an object is a valid StudySession
 */
export function isStudySession(obj: any): obj is StudySession {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.deckId === "string" &&
		typeof obj.startTime === "number" &&
		typeof obj.cardsReviewed === "number" &&
		typeof obj.newCards === "number" &&
		typeof obj.correctCount === "number" &&
		typeof obj.againCount === "number"
	);
}

/**
 * Type guard to check if an object is valid FlashcardMetadata
 */
export function isFlashcardMetadata(obj: any): obj is FlashcardMetadata {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.id === "string" &&
		typeof obj.repetitions === "number" &&
		typeof obj.interval === "number" &&
		typeof obj.easeFactor === "number" &&
		typeof obj.dueDate === "number" &&
		typeof obj.lastReviewed === "number" &&
		typeof obj.masteryLevel === "string" &&
		Array.isArray(obj.reviewHistory)
	);
}

/**
 * Tracks the relationship between source notes and generated content (quizzes and flashcards)
 * Used for Requirements 10.1, 10.4
 */
export interface ContentSource {
	/** Path to the source note file */
	sourceNotePath: string;
	/** Paths to quiz files generated from this source */
	quizFiles: string[];
	/** IDs of decks created from this source */
	deckIds: string[];
	/** Timestamp when this source was first tracked */
	created: number;
	/** Timestamp when this source was last updated */
	modified: number;
}

/**
 * Relationship data showing connections between quizzes and flashcards
 */
export interface ContentRelationship {
	/** Source note path */
	sourceNotePath: string;
	/** Related quiz files */
	relatedQuizzes: string[];
	/** Related decks */
	relatedDecks: Deck[];
	/** Whether both quizzes and flashcards exist for this source */
	hasBoth: boolean;
}

/**
 * Type guard to check if an object is a valid ContentSource
 */
export function isContentSource(obj: any): obj is ContentSource {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.sourceNotePath === "string" &&
		Array.isArray(obj.quizFiles) &&
		Array.isArray(obj.deckIds) &&
		typeof obj.created === "number" &&
		typeof obj.modified === "number"
	);
}
