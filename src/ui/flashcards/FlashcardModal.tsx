import { App } from "obsidian";
import { useState, useEffect } from "react";
import { QuizSettings } from "../../settings/config";
import {
	Flashcard,
	FlashcardMetadata,
	Deck,
	PracticeMode,
	ConfidenceRating as ConfidenceRatingEnum,
	StudySession,
	DeckStats,
	PausedSessionState
} from "../../utils/types";
import ModalButton from "../components/ModalButton";
import FlashcardRenderer from "./FlashcardRenderer";
import ConfidenceRating from "./ConfidenceRating";
import ProgressDisplay from "./ProgressDisplay";
import PracticeModeSelector from "./PracticeModeSelector";
import SessionSummary from "./SessionSummary";
import SpacedRepetition from "../../services/flashcards/spacedRepetition";
import SuggestionService, { Suggestion } from "../../services/flashcards/suggestionService";
import { savePausedSession, clearPausedSession, loadPausedSession } from "../../utils/pausedSessionStorage";

/**
 * Props for the FlashcardModal component
 */
interface FlashcardModalProps {
	/**
	 * The Obsidian App instance
	 */
	app: App;

	/**
	 * Plugin settings
	 */
	settings: QuizSettings;

	/**
	 * The deck being reviewed
	 */
	deck: Deck;

	/**
	 * Array of flashcards to review
	 */
	cards: Flashcard[];

	/**
	 * Map of card IDs to their metadata (for spaced repetition)
	 */
	metadata: Map<string, FlashcardMetadata>;

	/**
	 * Initial practice mode for this review session (optional)
	 * If not provided, user will be prompted to select a mode
	 */
	practiceMode?: PracticeMode;

	/**
	 * Callback to handle closing the modal
	 */
	handleClose: () => void;

	/**
	 * Callback to update card metadata after review
	 * @param cardId - The ID of the card that was reviewed
	 * @param rating - The confidence rating given by the user
	 * @param timeSpent - Time spent on the card in milliseconds
	 */
	onCardReviewed?: (
		cardId: string,
		rating: ConfidenceRatingEnum,
		timeSpent: number
	) => void;

	/**
	 * Callback when the review session is completed
	 * @param session - The completed study session data
	 */
	onSessionComplete?: (session: StudySession) => void;

	/**
	 * Callback when practice mode changes
	 * Used to update deck settings with the last used mode
	 * @param mode - The newly selected practice mode
	 */
	onModeChange?: (mode: PracticeMode) => void;

	/**
	 * Deck statistics for suggestion system (optional)
	 * Used to generate quiz suggestions after mastery
	 */
	deckStats?: DeckStats;

	/**
	 * Paused session state to resume from (optional)
	 * If provided, the modal will restore this state instead of starting fresh
	 */
	pausedSession?: PausedSessionState;

	/**
	 * Callback when a card's flag state is toggled
	 * @param cardId - The ID of the card to toggle
	 */
	onFlagToggle?: (cardId: string) => void;
}

/**
 * FlashcardModal Component
 *
 * Main modal component for flashcard review sessions. Displays flashcards one at a time
 * and provides navigation, rating, and progress tracking functionality.
 *
 * Features:
 * - Card-by-card navigation with next/previous buttons
 * - Keyboard shortcuts for efficient navigation (arrows, space, escape)
 * - Reveal/hide answer functionality
 * - Confidence rating integration for spaced repetition
 * - Progress tracking with visual indicators
 * - Session statistics (correct count, again count)
 * - Support for multiple practice modes (standard, type-answer, multiple-choice, cloze)
 * - Responsive modal layout following Obsidian patterns
 *
 * Requirements addressed:
 * - Requirement 3.3: Display one flashcard at a time with question visible
 * - Requirement 3.4: Show back of flashcard with answer on reveal
 * - Requirement 3.5: Provide navigation options (next/previous cards)
 * - Requirement 3.6: Display session summary when all cards reviewed
 * - Requirement 4.4: Update card's next review date based on rating
 * - Requirement 6.1: Track performance for each card
 * - Requirement 8.1-8.6: Implement confidence-based repetition
 *
 * Usage:
 * ```tsx
 * <FlashcardModal
 *   app={app}
 *   settings={settings}
 *   deck={deck}
 *   cards={flashcards}
 *   metadata={metadataMap}
 *   practiceMode={PracticeMode.STANDARD}
 *   handleClose={() => modal.close()}
 *   onCardReviewed={(id, rating, time) => updateMetadata(id, rating, time)}
 *   onSessionComplete={(session) => saveSession(session)}
 * />
 * ```
 *
 * @param props - The component props
 * @returns A rendered flashcard modal element
 */
const FlashcardModal = ({
	app,
	settings,
	deck,
	cards,
	metadata,
	practiceMode: initialPracticeMode,
	handleClose,
	onCardReviewed,
	onSessionComplete,
	onModeChange,
	deckStats,
	pausedSession,
	onFlagToggle
}: FlashcardModalProps) => {
	// Helper function to initialize state from paused session or defaults
	const initializePracticeMode = (): PracticeMode | null => {
		if (pausedSession) return pausedSession.practiceMode;
		return initialPracticeMode || deck.settings?.enabledPracticeModes?.[0] || null;
	};

	const initializeCardIndex = (): number => {
		return pausedSession?.cardIndex ?? 0;
	};

	const initializeRevealed = (): boolean => {
		return pausedSession?.revealed ?? false;
	};

	const initializeCardStartTime = (): number => {
		return pausedSession?.cardStartTime ?? Date.now();
	};

	const initializeSessionStats = (): StudySession => {
		if (pausedSession) {
			return pausedSession.sessionStats;
		}
		return {
			deckId: deck.id,
			startTime: Date.now(),
			cardsReviewed: 0,
			newCards: 0,
			correctCount: 0,
			againCount: 0,
			againCardIds: [],
			practiceMode: initializePracticeMode() || undefined
		};
	};

	const initializeReviewedCards = (): Set<string> => {
		return pausedSession ? new Set(pausedSession.reviewedCardIds) : new Set();
	};

	const initializeAgainCards = (): string[] => {
		return pausedSession?.againCardIds ?? [];
	};

	const initializeLastShownTime = (): Map<string, number> => {
		return pausedSession ? new Map(pausedSession.lastShownTimes) : new Map();
	};

	// Practice mode state - can be changed during session
	const [selectedPracticeMode, setSelectedPracticeMode] = useState<PracticeMode | null>(
		initializePracticeMode()
	);

	// Whether to show practice mode selector
	const [showModeSelector, setShowModeSelector] = useState<boolean>(
		!pausedSession && !initialPracticeMode && !selectedPracticeMode
	);

	// Current card index (0-based)
	const [cardIndex, setCardIndex] = useState<number>(initializeCardIndex());

	// Whether the answer is currently revealed
	const [revealed, setRevealed] = useState<boolean>(initializeRevealed());

	// Track when the current card was started (for time tracking)
	const [cardStartTime, setCardStartTime] = useState<number>(initializeCardStartTime());

	// Session statistics
	const [sessionStats, setSessionStats] = useState<StudySession>(initializeSessionStats());

	// Track which cards have been reviewed in this session
	const [reviewedCards, setReviewedCards] = useState<Set<string>>(initializeReviewedCards());

	// Track cards marked as "Again" that need to be shown again
	const [againCards, setAgainCards] = useState<string[]>(initializeAgainCards());

	// Track when each card was last shown to prevent immediate repetition
	const [lastShownTime, setLastShownTime] = useState<Map<string, number>>(initializeLastShownTime());

	// Suggestion state for quiz-flashcard workflow (Requirement 10.3, 10.6)
	const [sessionSuggestion, setSessionSuggestion] = useState<Suggestion | null>(null);

	// Session complete flag
	const [sessionComplete, setSessionComplete] = useState<boolean>(false);

	/**
	 * Get the current flashcard being displayed
	 */
	const currentCard = cards[cardIndex];

	/**
	 * Calculate next review intervals for each confidence rating
	 * This shows users what the next interval will be for each rating option
	 * Implements requirement 8.1-8.5: Display next interval for each rating
	 */
	const calculateNextIntervals = () => {
		const cardMetadata = metadata.get(currentCard.id);

		// If no metadata exists, initialize it to get default intervals
		const currentMetadata = cardMetadata || SpacedRepetition.initializeMetadata(currentCard.id);

		// Calculate what the interval would be for each rating
		const againInterval = SpacedRepetition.calculateNextReview(
			currentMetadata,
			ConfidenceRatingEnum.AGAIN,
			0,
			selectedPracticeMode || PracticeMode.STANDARD
		).interval;

		const hardInterval = SpacedRepetition.calculateNextReview(
			currentMetadata,
			ConfidenceRatingEnum.HARD,
			0,
			selectedPracticeMode || PracticeMode.STANDARD
		).interval;

		const goodInterval = SpacedRepetition.calculateNextReview(
			currentMetadata,
			ConfidenceRatingEnum.GOOD,
			0,
			selectedPracticeMode || PracticeMode.STANDARD
		).interval;

		const easyInterval = SpacedRepetition.calculateNextReview(
			currentMetadata,
			ConfidenceRatingEnum.EASY,
			0,
			selectedPracticeMode || PracticeMode.STANDARD
		).interval;

		return {
			again: againInterval,
			hard: hardInterval,
			good: goodInterval,
			easy: easyInterval
		};
	};

	/**
	 * Handles practice mode selection
	 * @param mode - The selected practice mode
	 */
	const handleModeSelect = (mode: PracticeMode) => {
		setSelectedPracticeMode(mode);
		setShowModeSelector(false);

		// Notify parent about mode change to update deck settings
		if (onModeChange) {
			onModeChange(mode);
		}
	};

	/**
	 * Toggles the practice mode selector visibility
	 */
	const handleToggleModeSelector = () => {
		setShowModeSelector(!showModeSelector);
	};

	/**
	 * Handles moving to the previous card
	 */
	const handlePreviousCard = () => {
		if (cardIndex > 0) {
			setCardIndex(cardIndex - 1);
			setRevealed(false);
			setCardStartTime(Date.now());
		}
	};

	/**
	 * Handles moving to the next card
	 * Implements cycling of "Again" cards with spacing to prevent immediate repetition
	 * Requirement 8.7: Cycle through other cards before showing the same card again
	 */
	const handleNextCard = () => {
		const now = Date.now();
		const MIN_REPEAT_INTERVAL_MS = 30000; // 30 seconds minimum between showing same card

		// Helper function to check if enough time has passed since card was last shown
		const canShowCard = (cardId: string): boolean => {
			const lastShown = lastShownTime.get(cardId);
			if (!lastShown) return true;
			return (now - lastShown) >= MIN_REPEAT_INTERVAL_MS;
		};

		// Helper function to find the next eligible "Again" card
		const getNextAgainCard = (): { cardId: string; index: number } | null => {
			// Look for a card that hasn't been shown recently
			for (let i = 0; i < againCards.length; i++) {
				const cardId = againCards[i];
				if (canShowCard(cardId)) {
					const index = cards.findIndex(c => c.id === cardId);
					if (index !== -1) {
						return { cardId, index };
					}
				}
			}
			// If all cards were shown recently, return the oldest one
			if (againCards.length > 0) {
				const cardId = againCards[0];
				const index = cards.findIndex(c => c.id === cardId);
				if (index !== -1) {
					return { cardId, index };
				}
			}
			return null;
		};

		// If not at the end of the main deck, move to next card normally
		if (cardIndex < cards.length - 1) {
			setCardIndex(cardIndex + 1);
			setRevealed(false);
			setCardStartTime(Date.now());
			// Record when this card was shown
			setLastShownTime(new Map(lastShownTime).set(cards[cardIndex + 1].id, now));
			return;
		}

		// At the end of main deck - check for "Again" cards
		if (againCards.length > 0) {
			const nextAgainCard = getNextAgainCard();
			if (nextAgainCard) {
				setCardIndex(nextAgainCard.index);
				setRevealed(false);
				setCardStartTime(Date.now());
				// Record when this card was shown
				setLastShownTime(new Map(lastShownTime).set(nextAgainCard.cardId, now));
				// Remove this card from the "Again" queue
				setAgainCards(againCards.filter(id => id !== nextAgainCard.cardId));
				return;
			}
		}

		// All cards reviewed (including all "Again" cards), show session complete
		completeSession();
	};

	/**
	 * Handles revealing the answer
	 */
	const handleReveal = () => {
		setRevealed(true);
	};

	/**
	 * Handles confidence rating selection
	 * @param rating - The confidence rating selected by the user
	 */
	const handleRating = (rating: ConfidenceRatingEnum) => {
		const timeSpent = Date.now() - cardStartTime;

		// Update session statistics
		const updatedStats = { ...sessionStats };
		updatedStats.cardsReviewed += 1;

		// Track correct vs. again
		if (rating === ConfidenceRatingEnum.AGAIN) {
			updatedStats.againCount += 1;
			// Add to again cards queue if not already there
			if (!againCards.includes(currentCard.id)) {
				setAgainCards([...againCards, currentCard.id]);
			}
			// Track in session stats for history
			if (!updatedStats.againCardIds) {
				updatedStats.againCardIds = [];
			}
			if (!updatedStats.againCardIds.includes(currentCard.id)) {
				updatedStats.againCardIds.push(currentCard.id);
			}
		} else {
			// Good, Hard, or Easy considered "correct"
			updatedStats.correctCount += 1;
		}

		// Check if this is a new card
		const cardMetadata = metadata.get(currentCard.id);
		if (cardMetadata && cardMetadata.repetitions === 0) {
			updatedStats.newCards += 1;
		}

		setSessionStats(updatedStats);

		// Mark card as reviewed
		setReviewedCards(new Set(reviewedCards).add(currentCard.id));

		// Call the parent callback to update metadata
		if (onCardReviewed) {
			onCardReviewed(currentCard.id, rating, timeSpent);
		}

		// Automatically move to next card after rating
		setTimeout(() => {
			handleNextCard();
		}, 300); // Small delay for visual feedback
	};

	/**
	 * Handles pausing the current session
	 * Saves the current state to localStorage and closes the modal
	 */
	const handlePauseSession = () => {
		const pausedState: PausedSessionState = {
			deckId: deck.id,
			cardIndex,
			revealed,
			cardStartTime,
			sessionStats,
			reviewedCardIds: Array.from(reviewedCards),
			againCardIds: againCards,
			lastShownTimes: Array.from(lastShownTime.entries()),
			practiceMode: selectedPracticeMode,
			pausedAt: Date.now()
		};

		try {
			savePausedSession(pausedState);
			handleClose();
		} catch (error) {
			console.error("Error saving paused session:", error);
			// Show error to user but still allow close
			handleClose();
		}
	};

	/**
	 * Completes the review session
	 * Generates suggestions for quiz-flashcard workflow integration (Req 10.3, 10.6)
	 * Clears any saved paused session state
	 */
	const completeSession = () => {
		const finalStats: StudySession = {
			...sessionStats,
			endTime: Date.now(),
			practiceMode: selectedPracticeMode || undefined
		};
		setSessionStats(finalStats);
		setSessionComplete(true);

		// Clear any paused session state since we're completing
		clearPausedSession();

		// Generate quiz suggestion if deck stats available (Requirement 10.3, 10.6)
		if (deckStats) {
			const suggestionService = new SuggestionService(app, settings);
			suggestionService.getSuggestionAfterReview(
				deck,
				deckStats,
				finalStats.cardsReviewed
			).then(setSessionSuggestion);
		}

		// Call parent callback (parent will save to history)
		if (onSessionComplete) {
			onSessionComplete(finalStats);
		}
	};

	/**
	 * Handles restarting the session with only "Again" cards
	 */
	const handleReviewAgainCards = () => {
		// Get the "Again" card IDs from the completed session
		const againCardIds = sessionStats.againCardIds || [];

		// Reset session state for a new review of "Again" cards
		setSessionComplete(false);

		// Find the first "Again" card in the main deck
		const firstAgainIndex = cards.findIndex(c => againCardIds.includes(c.id));
		setCardIndex(firstAgainIndex !== -1 ? firstAgainIndex : 0);

		setRevealed(false);
		setCardStartTime(Date.now());

		// Reset the "Again" cards queue with the session's again cards
		// Remove the first card since we're showing it now
		setAgainCards(againCardIds.filter((_, index) => index !== 0));

		// Clear the last shown time tracking for a fresh start
		setLastShownTime(new Map([[againCardIds[0], Date.now()]]));

		// Reset session stats for the new review
		setSessionStats({
			deckId: deck.id,
			startTime: Date.now(),
			cardsReviewed: 0,
			newCards: 0,
			correctCount: 0,
			againCount: 0,
			againCardIds: [],
			practiceMode: selectedPracticeMode || undefined
		});

		// Clear reviewed cards set
		setReviewedCards(new Set());
	};

	/**
	 * Handles continuing the review with remaining cards
	 */
	const handleContinueReview = () => {
		// Resume from where we left off
		setSessionComplete(false);
		setRevealed(false);
		setCardStartTime(Date.now());
	};

	/**
	 * Keyboard shortcuts handler
	 */
	const handleKeyDown = (event: KeyboardEvent) => {
		// Don't handle shortcuts if typing in an input field
		if (
			event.target instanceof HTMLInputElement ||
			event.target instanceof HTMLTextAreaElement
		) {
			return;
		}

		// Don't handle shortcuts if mode selector is shown
		if (showModeSelector) {
			// Only allow Escape to close selector
			if (event.key === "Escape") {
				setShowModeSelector(false);
			}
			return;
		}

		switch (event.key) {
			case "Escape":
				handleClose();
				break;
			case " ":
			case "Enter":
				if (!revealed) {
					event.preventDefault();
					handleReveal();
				}
				break;
			case "ArrowLeft":
				event.preventDefault();
				handlePreviousCard();
				break;
			case "ArrowRight":
				event.preventDefault();
				handleNextCard();
				break;
		}
	};

	/**
	 * Set up keyboard shortcuts
	 */
	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [cardIndex, revealed, sessionComplete, showModeSelector]);

	/**
	 * Track when the first card is shown
	 */
	useEffect(() => {
		if (currentCard && lastShownTime.size === 0) {
			setLastShownTime(new Map([[currentCard.id, Date.now()]]));
		}
	}, []);

	/**
	 * Renders the session complete summary
	 */
	const renderSessionComplete = () => {
		return (
			<SessionSummary
				app={app}
				deck={deck}
				session={sessionStats}
				totalCards={cards.length}
				suggestion={sessionSuggestion}
				onClose={handleClose}
				onReviewAgainCards={handleReviewAgainCards}
				onContinueReview={handleContinueReview}
			/>
		);
	};

	/**
	 * Renders the main flashcard review interface
	 */
	const renderReviewInterface = () => {
		// Show mode selector if no mode is selected or if user toggled it
		if (showModeSelector) {
			return (
				<div className="flashcard-mode-selector-container-qg">
					<PracticeModeSelector
						availableModes={deck.settings?.enabledPracticeModes}
						selectedMode={selectedPracticeMode || undefined}
						onSelect={handleModeSelect}
						lastUsedMode={deck.settings?.enabledPracticeModes?.[0]}
						disabled={false}
					/>
				</div>
			);
		}

		// Ensure we have a practice mode selected before rendering
		if (!selectedPracticeMode) {
			return (
				<div className="flashcard-no-mode-qg">
					<p>Please select a practice mode to begin.</p>
					<button
						className="flashcard-select-mode-button-qg"
						onClick={() => setShowModeSelector(true)}
					>
						Select Practice Mode
					</button>
				</div>
			);
		}

		return (
			<>
				{/* Navigation and action buttons */}
				<div className="modal-button-container-qg">
					<ModalButton
						icon="arrow-left"
						tooltip="Previous card (←)"
						onClick={handlePreviousCard}
						disabled={cardIndex === 0}
					/>
					{!revealed && (
						<ModalButton
							icon="eye"
							tooltip="Reveal answer (Space)"
							onClick={handleReveal}
							disabled={false}
						/>
					)}
					<ModalButton
						icon="pause"
						tooltip="Pause session"
						onClick={handlePauseSession}
						disabled={false}
					/>
					<ModalButton
						icon="settings"
						tooltip="Change practice mode"
						onClick={handleToggleModeSelector}
						disabled={false}
					/>
					<ModalButton
						icon="arrow-right"
						tooltip="Next card (→)"
						onClick={handleNextCard}
						disabled={cardIndex === cards.length - 1 && againCards.length === 0}
					/>
				</div>

				<hr className="quiz-divider-qg" />

				{/* Flashcard content */}
				<FlashcardRenderer
					app={app}
					card={currentCard}
					revealed={revealed}
					practiceMode={selectedPracticeMode}
					sourcePath={currentCard.sourceFile}
					deckCards={cards}
					onFlagToggle={onFlagToggle}
				/>

				{/* Confidence rating (shown after reveal) */}
				{revealed && (
					<>
						<hr className="quiz-divider-qg" />
						<div className="flashcard-rating-container-qg">
							<div className="flashcard-rating-prompt-qg">
								How well did you know this?
							</div>
							<ConfidenceRating
								onRate={handleRating}
								intervals={calculateNextIntervals()}
								disabled={false}
							/>
						</div>
					</>
				)}

				{/* Progress display */}
				<hr className="quiz-divider-qg" />
				<ProgressDisplay
					current={cardIndex + 1}
					total={cards.length}
					stats={sessionStats}
				/>
			</>
		);
	};

	// Handle empty cards array
	if (!cards || cards.length === 0) {
		return (
			<div className="modal-container mod-dim">
				<div className="modal-bg" style={{ opacity: 0.85 }} onClick={handleClose} />
				<div className="modal modal-qg">
					<div className="modal-close-button" onClick={handleClose} />
					<div className="modal-header">
						<div className="modal-title modal-title-qg">No Cards to Review</div>
					</div>
					<div className="modal-content modal-content-flex-qg">
						<div className="flashcard-no-cards-qg">
							<p>There are no cards due for review in this deck.</p>
							<button
								className="flashcard-session-button-qg"
								onClick={handleClose}
							>
								Close
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Helper function to get practice mode display name
	const getPracticeModeName = (mode: PracticeMode | null): string => {
		if (!mode) return "";
		switch (mode) {
			case PracticeMode.STANDARD:
				return "Standard";
			case PracticeMode.TYPE_ANSWER:
				return "Type Answer";
			case PracticeMode.MULTIPLE_CHOICE:
				return "Multiple Choice";
			case PracticeMode.CLOZE:
				return "Cloze Deletion";
			default:
				return "";
		}
	};

	// Build modal title
	const getModalTitle = (): string => {
		if (sessionComplete) {
			return "Review Complete";
		}
		if (showModeSelector) {
			return `${deck.name} - Select Practice Mode`;
		}
		const modeName = getPracticeModeName(selectedPracticeMode);
		const modeText = modeName ? ` (${modeName})` : "";
		return `${deck.name}${modeText} - Card ${cardIndex + 1} of ${cards.length}`;
	};

	return (
		<div className="modal-container mod-dim">
			<div className="modal-bg" style={{ opacity: 0.85 }} onClick={handleClose} />
			<div className="modal modal-qg">
				<div className="modal-close-button" onClick={handleClose} />
				<div className="modal-header">
					<div className="modal-title modal-title-qg">
						{getModalTitle()}
					</div>
				</div>
				<div className="modal-content modal-content-flex-qg">
					{sessionComplete ? renderSessionComplete() : renderReviewInterface()}
				</div>
			</div>
		</div>
	);
};

export default FlashcardModal;
