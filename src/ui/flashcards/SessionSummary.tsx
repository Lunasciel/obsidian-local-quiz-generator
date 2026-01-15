import { App } from "obsidian";
import { StudySession, Deck } from "../../utils/types";
import { Suggestion } from "../../services/flashcards/suggestionService";

/**
 * Props for the SessionSummary component
 */
interface SessionSummaryProps {
	/**
	 * The Obsidian App instance
	 */
	app: App;

	/**
	 * The deck that was reviewed
	 */
	deck: Deck;

	/**
	 * The completed study session data
	 */
	session: StudySession;

	/**
	 * Total number of cards in the deck
	 */
	totalCards: number;

	/**
	 * Optional quiz suggestion for workflow integration (Requirement 10.3, 10.6)
	 */
	suggestion?: Suggestion | null;

	/**
	 * Callback when user clicks "Close" button
	 */
	onClose: () => void;

	/**
	 * Callback when user clicks "Review Again Cards" button
	 * Only shown if there are cards marked as "Again"
	 */
	onReviewAgainCards?: () => void;

	/**
	 * Callback when user clicks "Continue Review" button
	 * Only shown if there are more cards in the deck
	 */
	onContinueReview?: () => void;
}

/**
 * SessionSummary Component
 *
 * Displays a summary of a completed flashcard review session, showing statistics
 * like cards reviewed, accuracy, time spent, and new cards learned. Provides
 * action buttons to review again cards, continue reviewing, or close the session.
 *
 * Features:
 * - Displays session statistics in a clear, visual format
 * - Shows accuracy percentage based on correct vs. again ratings
 * - Displays time spent in minutes
 * - Highlights new cards learned
 * - Provides contextual action buttons based on session state
 * - Supports quiz-flashcard workflow suggestions (Requirement 10.3, 10.6)
 *
 * Requirements addressed:
 * - Requirement 5.2: Show summary with accuracy, time spent, and cards mastered
 * - Requirement 5.6: Record session to StatisticsService
 * - Requirement 10.3: Generate quiz suggestion after mastery
 * - Requirement 10.6: Display suggestions in session summary
 *
 * Usage:
 * ```tsx
 * <SessionSummary
 *   app={app}
 *   deck={deck}
 *   session={completedSession}
 *   totalCards={cards.length}
 *   suggestion={quizSuggestion}
 *   onClose={() => modal.close()}
 *   onReviewAgainCards={() => handleReviewAgain()}
 *   onContinueReview={() => handleContinue()}
 * />
 * ```
 *
 * @param props - The component props
 * @returns A rendered session summary element
 */
const SessionSummary = ({
	app,
	deck,
	session,
	totalCards,
	suggestion,
	onClose,
	onReviewAgainCards,
	onContinueReview
}: SessionSummaryProps) => {
	/**
	 * Calculate session accuracy as a percentage
	 */
	const calculateAccuracy = (): number => {
		if (session.cardsReviewed === 0) {
			return 0;
		}
		return Math.round((session.correctCount / session.cardsReviewed) * 100);
	};

	/**
	 * Calculate session duration in minutes
	 */
	const calculateDuration = (): number => {
		if (!session.endTime) {
			return 0;
		}
		return Math.round((session.endTime - session.startTime) / 1000 / 60);
	};

	const accuracy = calculateAccuracy();
	const duration = calculateDuration();

	return (
		<div className="flashcard-session-complete-qg">
			<div className="flashcard-session-complete-title-qg">
				Session Complete!
			</div>

			<div className="flashcard-session-stats-qg">
				<div className="flashcard-session-stat-qg">
					<div className="flashcard-session-stat-label-qg">
						Cards Reviewed
					</div>
					<div className="flashcard-session-stat-value-qg">
						{session.cardsReviewed}
					</div>
				</div>

				<div className="flashcard-session-stat-qg">
					<div className="flashcard-session-stat-label-qg">Accuracy</div>
					<div className="flashcard-session-stat-value-qg">{accuracy}%</div>
				</div>

				<div className="flashcard-session-stat-qg">
					<div className="flashcard-session-stat-label-qg">
						Time Spent
					</div>
					<div className="flashcard-session-stat-value-qg">
						{duration} min
					</div>
				</div>

				<div className="flashcard-session-stat-qg">
					<div className="flashcard-session-stat-label-qg">
						Correct
					</div>
					<div className="flashcard-session-stat-value-qg flashcard-session-stat-correct-qg">
						{session.correctCount}
					</div>
				</div>

				<div className="flashcard-session-stat-qg">
					<div className="flashcard-session-stat-label-qg">
						Again
					</div>
					<div className="flashcard-session-stat-value-qg flashcard-session-stat-again-qg">
						{session.againCount}
					</div>
				</div>

				{session.newCards > 0 && (
					<div className="flashcard-session-stat-qg">
						<div className="flashcard-session-stat-label-qg">
							New Cards
						</div>
						<div className="flashcard-session-stat-value-qg">
							{session.newCards}
						</div>
					</div>
				)}
			</div>

			{/* Quiz suggestion for workflow integration (Requirement 10.3, 10.6) */}
			{suggestion && (
				<div className="flashcard-session-suggestion-qg">
					<div className="flashcard-session-suggestion-icon-qg">
						💡
					</div>
					<div className="flashcard-session-suggestion-message-qg">
						{suggestion.message}
					</div>
				</div>
			)}

			<div className="flashcard-session-actions-qg">
				{/* Show "Review Again Cards" button if there are cards marked as "Again" */}
				{session.againCardIds && session.againCardIds.length > 0 && onReviewAgainCards && (
					<button
						className="flashcard-session-button-qg flashcard-session-review-again-qg"
						onClick={onReviewAgainCards}
					>
						Review {session.againCardIds.length} Again Card{session.againCardIds.length !== 1 ? 's' : ''}
					</button>
				)}

				{/* Show "Continue" button if there are more cards in the deck */}
				{totalCards > session.cardsReviewed && onContinueReview && (
					<button
						className="flashcard-session-button-qg flashcard-session-continue-qg"
						onClick={onContinueReview}
					>
						Continue Review
					</button>
				)}

				<button
					className="flashcard-session-button-qg flashcard-session-close-qg"
					onClick={onClose}
				>
					Close
				</button>
			</div>
		</div>
	);
};

export default SessionSummary;
