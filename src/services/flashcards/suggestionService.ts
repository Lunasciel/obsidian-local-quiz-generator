import { App, TFile } from "obsidian";
import { Deck, DeckStats, FlashcardMetadata, MasteryLevel } from "../../utils/types";
import { QuizSettings } from "../../settings/config";
import ContentSourceTracker from "./contentSourceTracker";

/**
 * Suggestion types for quiz-flashcard workflow integration
 * Requirement 10.3, 10.6
 */
export enum SuggestionType {
	/** Suggest taking a quiz after mastering flashcards */
	QUIZ_AFTER_MASTERY = "quiz-after-mastery",
	/** Suggest reviewing flashcards before taking quiz */
	FLASHCARD_BEFORE_QUIZ = "flashcard-before-quiz",
	/** Indicate deck is ready for quiz assessment */
	READY_FOR_QUIZ = "ready-for-quiz"
}

/**
 * Suggestion data structure
 */
export interface Suggestion {
	/** Type of suggestion */
	type: SuggestionType;
	/** Suggestion message to display */
	message: string;
	/** Associated deck (if applicable) */
	deck?: Deck;
	/** Source file path (if applicable) */
	sourceFile?: string;
	/** Related quiz files (if applicable) */
	relatedQuizFiles?: string[];
	/** Action to perform when suggestion is accepted */
	action?: () => void | Promise<void>;
}

/**
 * SuggestionService handles quiz-flashcard workflow suggestions
 * Implements requirements: 10.3, 10.6
 *
 * This service provides intelligent suggestions to help users:
 * - Take quizzes after mastering flashcards (Req 10.3)
 * - Review flashcards before quizzes (Req 10.6)
 * - Know when they're ready for quiz-based assessment (Req 10.6)
 */
export default class SuggestionService {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly contentSourceTracker: ContentSourceTracker;

	/** Minimum percentage of mastered cards to suggest quiz (default: 70%) */
	private readonly MASTERY_THRESHOLD_FOR_QUIZ = 0.7;

	/** Minimum number of cards to consider for quiz suggestions */
	private readonly MIN_CARDS_FOR_QUIZ_SUGGESTION = 5;

	constructor(app: App, settings: QuizSettings) {
		this.app = app;
		this.settings = settings;
		this.contentSourceTracker = new ContentSourceTracker(this.app, this.settings);
	}

	/**
	 * Check if deck is ready for quiz-based assessment
	 * A deck is ready when:
	 * - It has at least MIN_CARDS_FOR_QUIZ_SUGGESTION cards
	 * - At least MASTERY_THRESHOLD_FOR_QUIZ of cards are mastered
	 *
	 * @param deckStats - Statistics for the deck
	 * @returns True if deck is ready for quiz assessment
	 */
	isDeckReadyForQuiz(deckStats: DeckStats): boolean {
		if (deckStats.totalCards < this.MIN_CARDS_FOR_QUIZ_SUGGESTION) {
			return false;
		}

		const masteryRate = deckStats.masteredCards / deckStats.totalCards;
		return masteryRate >= this.MASTERY_THRESHOLD_FOR_QUIZ;
	}

	/**
	 * Calculate mastery percentage for a deck
	 * @param deckStats - Statistics for the deck
	 * @returns Mastery percentage (0-100)
	 */
	getMasteryPercentage(deckStats: DeckStats): number {
		if (deckStats.totalCards === 0) {
			return 0;
		}
		return Math.round((deckStats.masteredCards / deckStats.totalCards) * 100);
	}

	/**
	 * Get suggestion after completing a flashcard review session
	 * Suggests taking a quiz if the deck has reached mastery threshold
	 *
	 * @param deck - The deck that was reviewed
	 * @param deckStats - Statistics for the deck
	 * @param cardsReviewed - Number of cards reviewed in session
	 * @returns Suggestion object or null if no suggestion
	 */
	async getSuggestionAfterReview(
		deck: Deck,
		deckStats: DeckStats,
		cardsReviewed: number
	): Promise<Suggestion | null> {
		// Only suggest if deck is ready for quiz
		if (!this.isDeckReadyForQuiz(deckStats)) {
			return null;
		}

		const masteryPercentage = this.getMasteryPercentage(deckStats);

		// Check if there are related quizzes
		const relatedQuizzes = await this.contentSourceTracker.getRelatedQuizzesForDeck(deck);

		return {
			type: SuggestionType.QUIZ_AFTER_MASTERY,
			message: `Great progress! You've mastered ${masteryPercentage}% of cards in "${deck.name}". Ready to test your knowledge with a quiz?`,
			deck,
			sourceFile: deck.sourceFolder,
			relatedQuizFiles: relatedQuizzes
		};
	}

	/**
	 * Get suggestion when user has struggling cards
	 * Identifies cards that need more review before quiz
	 *
	 * @param metadata - Array of card metadata
	 * @returns Suggestion object or null
	 */
	getSuggestionForStrugglingCards(
		metadata: FlashcardMetadata[]
	): Suggestion | null {
		// Identify struggling cards (cards with low ease factor or many repetitions but still in learning)
		const strugglingCards = metadata.filter(
			(card) =>
				card.masteryLevel === MasteryLevel.LEARNING &&
				card.repetitions >= 3 &&
				card.easeFactor < 2.0
		);

		if (strugglingCards.length === 0) {
			return null;
		}

		return {
			type: SuggestionType.FLASHCARD_BEFORE_QUIZ,
			message: `You have ${strugglingCards.length} card${strugglingCards.length > 1 ? "s" : ""} that could use more practice. Consider reviewing before taking a quiz.`,
		};
	}

	/**
	 * Check if source note has associated quizzes
	 * Uses ContentSourceTracker to find related quiz files
	 *
	 * @param sourceFile - Path to source note file
	 * @returns True if there are quiz files associated with this source
	 */
	async hasAssociatedQuizzes(sourceFile: string): Promise<boolean> {
		try {
			const source = await this.contentSourceTracker.getContentSource(sourceFile);
			return source !== null && source.quizFiles.length > 0;
		} catch (error) {
			console.error(`Error checking associated quizzes for: ${sourceFile}`, error);
			return false;
		}
	}

	/**
	 * Get readiness indicator for deck selector display
	 * Shows visual indicator when deck is ready for quiz
	 *
	 * @param deckStats - Statistics for the deck
	 * @returns Readiness status message or null
	 */
	getQuizReadinessIndicator(deckStats: DeckStats): string | null {
		if (!this.isDeckReadyForQuiz(deckStats)) {
			return null;
		}

		const masteryPercentage = this.getMasteryPercentage(deckStats);
		return `Ready for quiz (${masteryPercentage}% mastered)`;
	}

	/**
	 * Get suggestion for reviewing flashcards before quiz
	 * Uses ContentSourceTracker to find decks associated with a quiz file
	 *
	 * @param quizFilePath - Path to the quiz file
	 * @param allDecks - All available decks
	 * @returns Suggestion object or null
	 */
	async getSuggestionBeforeQuiz(
		quizFilePath: string,
		allDecks: Deck[]
	): Promise<Suggestion | null> {
		// Find decks associated with this quiz file via ContentSourceTracker
		const relatedDecks = await this.contentSourceTracker.getRelatedDecksForQuiz(
			quizFilePath,
			allDecks
		);

		if (relatedDecks.length === 0) {
			return null;
		}

		// If there's a related deck, suggest reviewing flashcards first
		const deck = relatedDecks[0];
		return {
			type: SuggestionType.FLASHCARD_BEFORE_QUIZ,
			message: `You have flashcards for this topic in "${deck.name}". Would you like to review them before taking the quiz?`,
			deck,
			sourceFile: deck.sourceFolder
		};
	}

	/**
	 * Get comprehensive suggestions for a deck
	 * Combines multiple suggestion types into a prioritized list
	 *
	 * @param deck - The deck to analyze
	 * @param deckStats - Statistics for the deck
	 * @param cardMetadata - Metadata for all cards in deck
	 * @returns Array of suggestions (prioritized)
	 */
	async getComprehensiveSuggestions(
		deck: Deck,
		deckStats: DeckStats,
		cardMetadata: FlashcardMetadata[]
	): Promise<Suggestion[]> {
		const suggestions: Suggestion[] = [];

		// Get related quizzes for this deck
		const relatedQuizzes = await this.contentSourceTracker.getRelatedQuizzesForDeck(deck);

		// Priority 1: Quiz readiness
		if (this.isDeckReadyForQuiz(deckStats)) {
			const masteryPercentage = this.getMasteryPercentage(deckStats);
			suggestions.push({
				type: SuggestionType.READY_FOR_QUIZ,
				message: `This deck is ${masteryPercentage}% mastered and ready for quiz-based assessment!`,
				deck,
				sourceFile: deck.sourceFolder,
				relatedQuizFiles: relatedQuizzes
			});
		}

		// Priority 2: Struggling cards warning
		const strugglingCardsSuggestion = this.getSuggestionForStrugglingCards(cardMetadata);
		if (strugglingCardsSuggestion) {
			suggestions.push(strugglingCardsSuggestion);
		}

		// Priority 3: Associated quizzes available
		if (relatedQuizzes.length > 0 && this.isDeckReadyForQuiz(deckStats)) {
			const quizCount = relatedQuizzes.length;
			suggestions.push({
				type: SuggestionType.QUIZ_AFTER_MASTERY,
				message: `You have ${quizCount} quiz${quizCount > 1 ? "zes" : ""} available from the same source. Take them to test your mastery!`,
				deck,
				sourceFile: deck.sourceFolder,
				relatedQuizFiles: relatedQuizzes
			});
		}

		return suggestions;
	}

	/**
	 * Format suggestion as notification message
	 * @param suggestion - Suggestion to format
	 * @returns Formatted message string
	 */
	formatSuggestionMessage(suggestion: Suggestion): string {
		return suggestion.message;
	}

	/**
	 * Check if enough time has passed since last session to suggest quiz
	 * Prevents overwhelming users with suggestions
	 *
	 * @param lastReviewTime - Timestamp of last review
	 * @param minHoursBetween - Minimum hours between suggestions (default: 24)
	 * @returns True if enough time has passed
	 */
	shouldShowSuggestion(
		lastReviewTime: number,
		minHoursBetween: number = 24
	): boolean {
		const now = Date.now();
		const hoursSinceLastReview = (now - lastReviewTime) / (1000 * 60 * 60);
		return hoursSinceLastReview >= minHoursBetween;
	}
}
