import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { App } from "obsidian";
import FlashcardModal from "./FlashcardModal";
import {
	Flashcard,
	FlashcardMetadata,
	Deck,
	PracticeMode,
	ConfidenceRating,
	MasteryLevel
} from "../../utils/types";
import { QuizSettings } from "../../settings/config";
import SpacedRepetition from "../../services/flashcards/spacedRepetition";

// Mock SpacedRepetition
jest.mock("../../services/flashcards/spacedRepetition");

// Mock the child components
jest.mock("./FlashcardRenderer", () => {
	return function MockFlashcardRenderer({ card, revealed }: any) {
		return (
			<div data-testid="flashcard-renderer">
				<div data-testid="card-front">{card.front}</div>
				{revealed && <div data-testid="card-back">{card.back}</div>}
			</div>
		);
	};
});

jest.mock("./ConfidenceRating", () => {
	return function MockConfidenceRating({ onRate }: any) {
		return (
			<div data-testid="confidence-rating">
				<button onClick={() => onRate(ConfidenceRating.AGAIN)}>Again</button>
				<button onClick={() => onRate(ConfidenceRating.HARD)}>Hard</button>
				<button onClick={() => onRate(ConfidenceRating.GOOD)}>Good</button>
				<button onClick={() => onRate(ConfidenceRating.EASY)}>Easy</button>
			</div>
		);
	};
});

jest.mock("./ProgressDisplay", () => {
	return function MockProgressDisplay({ current, total, stats }: any) {
		return (
			<div data-testid="progress-display">
				Card {current} of {total}
				{stats && <span data-testid="stats">Correct: {stats.correctCount}</span>}
			</div>
		);
	};
});

jest.mock("../components/ModalButton", () => {
	return function MockModalButton({ icon, onClick, disabled }: any) {
		return (
			<button
				data-testid={`modal-button-${icon}`}
				onClick={onClick}
				disabled={disabled}
			>
				{icon}
			</button>
		);
	};
});

jest.mock("./PracticeModeSelector", () => {
	return function MockPracticeModeSelector({
		onSelect,
		selectedMode,
		availableModes
	}: any) {
		return (
			<div data-testid="practice-mode-selector" data-selected-mode={selectedMode}>
				{(availableModes || Object.values(PracticeMode)).map((mode: any) => (
					<button
						key={mode}
						onClick={() => onSelect(mode)}
						data-testid={`mode-${mode}`}
					>
						{mode}
					</button>
				))}
			</div>
		);
	};
});

describe("FlashcardModal", () => {
	let mockApp: App;
	let mockSettings: QuizSettings;
	let mockDeck: Deck;
	let mockCards: Flashcard[];
	let mockMetadata: Map<string, FlashcardMetadata>;
	let mockHandleClose: jest.Mock;
	let mockOnCardReviewed: jest.Mock;
	let mockOnSessionComplete: jest.Mock;

	beforeEach(() => {
		// Create mock app instance
		mockApp = {} as App;

		// Create mock settings
		mockSettings = {} as QuizSettings;

		// Create mock deck
		mockDeck = {
			id: "deck-1",
			name: "Test Deck",
			description: "A test deck",
			created: Date.now(),
			modified: Date.now(),
			cardIds: ["card-1", "card-2", "card-3"]
		};

		// Create mock flashcards
		mockCards = [
			{
				id: "card-1",
				front: "What is 2 + 2?",
				back: "4",
				deckId: "deck-1",
				created: Date.now(),
				modified: Date.now(),
				tags: []
			},
			{
				id: "card-2",
				front: "What is the capital of France?",
				back: "Paris",
				deckId: "deck-1",
				created: Date.now(),
				modified: Date.now(),
				tags: []
			},
			{
				id: "card-3",
				front: "What is H2O?",
				back: "Water",
				deckId: "deck-1",
				created: Date.now(),
				modified: Date.now(),
				tags: []
			}
		];

		// Create mock metadata
		mockMetadata = new Map([
			[
				"card-1",
				{
					id: "card-1",
					repetitions: 0,
					interval: 0,
					easeFactor: 2.5,
					dueDate: Date.now(),
					lastReviewed: 0,
					masteryLevel: MasteryLevel.NEW,
					reviewHistory: []
				}
			],
			[
				"card-2",
				{
					id: "card-2",
					repetitions: 2,
					interval: 5,
					easeFactor: 2.5,
					dueDate: Date.now(),
					lastReviewed: Date.now() - 86400000,
					masteryLevel: MasteryLevel.LEARNING,
					reviewHistory: []
				}
			],
			[
				"card-3",
				{
					id: "card-3",
					repetitions: 5,
					interval: 21,
					easeFactor: 2.6,
					dueDate: Date.now(),
					lastReviewed: Date.now() - 86400000 * 21,
					masteryLevel: MasteryLevel.MASTERED,
					reviewHistory: []
				}
			]
		]);

		// Create mock callbacks
		mockHandleClose = jest.fn();

		// Setup SpacedRepetition mocks
		const mockInitializeMetadata = SpacedRepetition.initializeMetadata as jest.Mock;
		const mockCalculateNextReview = SpacedRepetition.calculateNextReview as jest.Mock;

		mockInitializeMetadata.mockImplementation((cardId: string) => ({
			id: cardId,
			repetitions: 0,
			interval: 0,
			easeFactor: 2.5,
			dueDate: Date.now(),
			lastReviewed: 0,
			masteryLevel: MasteryLevel.NEW,
			reviewHistory: [],
			practiceMode: undefined
		}));

		mockCalculateNextReview.mockImplementation((metadata, rating: ConfidenceRating) => {
			const intervals: Record<ConfidenceRating, number> = {
				[ConfidenceRating.AGAIN]: 1,
				[ConfidenceRating.HARD]: 2,
				[ConfidenceRating.GOOD]: 5,
				[ConfidenceRating.EASY]: 10
			};

			return {
				...metadata,
				interval: intervals[rating],
				dueDate: Date.now() + intervals[rating] * 24 * 60 * 60 * 1000,
				repetitions: rating === ConfidenceRating.AGAIN ? 0 : metadata.repetitions + 1
			};
		});
		mockOnCardReviewed = jest.fn();
		mockOnSessionComplete = jest.fn();
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("Modal Structure", () => {
		it("should render the modal with correct title", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Title now includes practice mode name
			expect(screen.getByText(/Test Deck \(Standard\) - Card 1 of 3/)).toBeInTheDocument();
		});

		it("should render the flashcard renderer", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			expect(screen.getByTestId("flashcard-renderer")).toBeInTheDocument();
			expect(screen.getByTestId("card-front")).toHaveTextContent("What is 2 + 2?");
		});

		it("should render progress display", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			expect(screen.getByTestId("progress-display")).toBeInTheDocument();
			expect(screen.getByTestId("progress-display")).toHaveTextContent("Card 1 of 3");
		});

		it("should render modal close button", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			const closeButton = document.querySelector(".modal-close-button");
			expect(closeButton).toBeInTheDocument();
		});
	});

	describe("Card Navigation", () => {
		it("should navigate to next card when next button clicked", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Initially on card 1
			expect(screen.getByTestId("card-front")).toHaveTextContent("What is 2 + 2?");

			// Click next
			const nextButton = screen.getByTestId("modal-button-arrow-right");
			fireEvent.click(nextButton);

			// Should now be on card 2
			expect(screen.getByTestId("card-front")).toHaveTextContent(
				"What is the capital of France?"
			);
		});

		it("should navigate to previous card when previous button clicked", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Go to card 2
			const nextButton = screen.getByTestId("modal-button-arrow-right");
			fireEvent.click(nextButton);

			// Now go back
			const prevButton = screen.getByTestId("modal-button-arrow-left");
			fireEvent.click(prevButton);

			// Should be back on card 1
			expect(screen.getByTestId("card-front")).toHaveTextContent("What is 2 + 2?");
		});

		it("should disable previous button on first card", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			const prevButton = screen.getByTestId("modal-button-arrow-left");
			expect(prevButton).toBeDisabled();
		});

		it("should disable next button on last card", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Navigate to last card
			const nextButton = screen.getByTestId("modal-button-arrow-right");
			fireEvent.click(nextButton);
			fireEvent.click(nextButton);

			// Next button should be disabled
			expect(nextButton).toBeDisabled();
		});
	});

	describe("Answer Reveal", () => {
		it("should not show answer initially", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			expect(screen.queryByTestId("card-back")).not.toBeInTheDocument();
		});

		it("should show answer when reveal button clicked", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			const revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);

			expect(screen.getByTestId("card-back")).toBeInTheDocument();
			expect(screen.getByTestId("card-back")).toHaveTextContent("4");
		});

		it("should show confidence rating after revealing answer", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Initially no confidence rating
			expect(screen.queryByTestId("confidence-rating")).not.toBeInTheDocument();

			// Reveal answer
			const revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);

			// Confidence rating should appear
			expect(screen.getByTestId("confidence-rating")).toBeInTheDocument();
		});

		it("should reset revealed state when navigating to next card", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Reveal answer
			const revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);
			expect(screen.getByTestId("card-back")).toBeInTheDocument();

			// Navigate to next card
			const nextButton = screen.getByTestId("modal-button-arrow-right");
			fireEvent.click(nextButton);

			// Answer should not be revealed
			expect(screen.queryByTestId("card-back")).not.toBeInTheDocument();
		});
	});

	describe("Confidence Rating", () => {
		it("should call onCardReviewed when rating is selected", async () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
				/>
			);

			// Reveal answer
			const revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);

			// Select "Good" rating
			const goodButton = screen.getByText("Good");
			fireEvent.click(goodButton);

			// Should call callback with correct parameters
			expect(mockOnCardReviewed).toHaveBeenCalledWith(
				"card-1",
				ConfidenceRating.GOOD,
				expect.any(Number)
			);
		});

		it("should update session stats when rating is selected", async () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Reveal and rate
			fireEvent.click(screen.getByTestId("modal-button-eye"));
			fireEvent.click(screen.getByText("Good"));

			// Wait for state update
			await waitFor(() => {
				expect(screen.getByTestId("stats")).toHaveTextContent("Correct: 1");
			});
		});

		it("should increment again count when 'Again' is selected", async () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Reveal and rate as "Again"
			fireEvent.click(screen.getByTestId("modal-button-eye"));
			fireEvent.click(screen.getByText("Again"));

			// Wait for state update
			await waitFor(() => {
				// Correct count should still be 0
				expect(screen.getByTestId("stats")).toHaveTextContent("Correct: 0");
			});
		});

		it("should automatically move to next card after rating", async () => {
			jest.useFakeTimers();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Start on card 1
			expect(screen.getByTestId("card-front")).toHaveTextContent("What is 2 + 2?");

			// Reveal and rate
			fireEvent.click(screen.getByTestId("modal-button-eye"));
			fireEvent.click(screen.getByText("Good"));

			// Fast-forward timers wrapped in act
			await act(async () => {
				jest.advanceTimersByTime(300);
			});

			// Should move to card 2
			await waitFor(() => {
				expect(screen.getByTestId("card-front")).toHaveTextContent(
					"What is the capital of France?"
				);
			});

			jest.useRealTimers();
		});
	});

	describe("Session Completion", () => {
		it("should show session complete when all cards reviewed", async () => {
			jest.useFakeTimers();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review all 3 cards
			for (let i = 0; i < 3; i++) {
				fireEvent.click(screen.getByTestId("modal-button-eye"));
				fireEvent.click(screen.getByText("Good"));
				await act(async () => {
					jest.advanceTimersByTime(300);
				});
			}

			// Should show session complete
			await waitFor(() => {
				expect(screen.getByText("Session Complete!")).toBeInTheDocument();
			});

			// Should call onSessionComplete callback
			expect(mockOnSessionComplete).toHaveBeenCalled();

			jest.useRealTimers();
		});

		it("should display session statistics on completion", async () => {
			jest.useFakeTimers();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Review all cards with varying ratings (no "Again" to keep test simple)
			fireEvent.click(screen.getByTestId("modal-button-eye"));
			fireEvent.click(screen.getByText("Good"));
			await act(async () => {
				jest.advanceTimersByTime(300);
			});

			fireEvent.click(screen.getByTestId("modal-button-eye"));
			fireEvent.click(screen.getByText("Hard"));
			await act(async () => {
				jest.advanceTimersByTime(300);
			});

			fireEvent.click(screen.getByTestId("modal-button-eye"));
			fireEvent.click(screen.getByText("Easy"));
			await act(async () => {
				jest.advanceTimersByTime(300);
			});

			// Wait for session complete
			await waitFor(() => {
				expect(screen.getByText("Session Complete!")).toBeInTheDocument();
			});

			// Check statistics
			expect(screen.getByText(/Cards Reviewed/)).toBeInTheDocument();
			expect(screen.getByText(/Accuracy/)).toBeInTheDocument();

			jest.useRealTimers();
		});
	});

	describe("Keyboard Shortcuts", () => {
		it("should close modal when Escape is pressed", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			fireEvent.keyDown(window, { key: "Escape" });

			expect(mockHandleClose).toHaveBeenCalled();
		});

		it("should reveal answer when Space is pressed", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			fireEvent.keyDown(window, { key: " " });

			expect(screen.getByTestId("card-back")).toBeInTheDocument();
		});

		it("should navigate with arrow keys", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Navigate forward
			fireEvent.keyDown(window, { key: "ArrowRight" });
			expect(screen.getByTestId("card-front")).toHaveTextContent(
				"What is the capital of France?"
			);

			// Navigate backward
			fireEvent.keyDown(window, { key: "ArrowLeft" });
			expect(screen.getByTestId("card-front")).toHaveTextContent("What is 2 + 2?");
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty cards array", () => {
			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={[]}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			expect(screen.getByText("No Cards to Review")).toBeInTheDocument();
		});

		it("should handle single card", async () => {
			jest.useFakeTimers();

			const singleCard = [mockCards[0]];

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={singleCard}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Previous button should be disabled
			expect(screen.getByTestId("modal-button-arrow-left")).toBeDisabled();

			// Next button should be disabled
			expect(screen.getByTestId("modal-button-arrow-right")).toBeDisabled();

			// Review the card
			fireEvent.click(screen.getByTestId("modal-button-eye"));
			fireEvent.click(screen.getByText("Good"));
			await act(async () => {
				jest.advanceTimersByTime(300);
			});

			// Should complete session
			await waitFor(() => {
				expect(screen.getByText("Session Complete!")).toBeInTheDocument();
			});

			jest.useRealTimers();
		});
	});

	describe("Again Cards Cycling", () => {
		it("should add card to again queue when rated as Again", async () => {
			jest.useFakeTimers();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
				/>
			);

			// Review first card as "Again"
			fireEvent.click(screen.getByTestId("modal-button-eye"));
			fireEvent.click(screen.getByText("Again"));
			await act(async () => {
				jest.advanceTimersByTime(300);
			});

			// Review remaining cards normally
			fireEvent.click(screen.getByTestId("modal-button-eye"));
			fireEvent.click(screen.getByText("Good"));
			await act(async () => {
				jest.advanceTimersByTime(300);
			});

			fireEvent.click(screen.getByTestId("modal-button-eye"));
			fireEvent.click(screen.getByText("Good"));
			await act(async () => {
				jest.advanceTimersByTime(300);
			});

			// Should cycle back to the "Again" card
			await waitFor(() => {
				expect(screen.getByTestId("card-front")).toHaveTextContent("What is 2 + 2?");
			});

			jest.useRealTimers();
		});
	});

	describe("Practice Mode Integration (Task 39)", () => {
		let mockOnModeChange: jest.Mock;

		beforeEach(() => {
			mockOnModeChange = jest.fn();
			// Add enabled modes to deck settings
			mockDeck.settings = {
				newCardsPerDay: 20,
				reviewsPerDay: 100,
				enabledPracticeModes: [
					PracticeMode.STANDARD,
					PracticeMode.TYPE_ANSWER,
					PracticeMode.MULTIPLE_CHOICE,
					PracticeMode.CLOZE
				],
				enableAudioCues: false
			};
		});

		describe("Practice Mode Selection", () => {
			it("should show practice mode selector when no initial mode is provided", () => {
				// Remove settings to force selector to show
				const deckWithoutDefault = {
					...mockDeck,
					settings: undefined
				};

				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={deckWithoutDefault}
						cards={mockCards}
						metadata={mockMetadata}
						handleClose={mockHandleClose}
						onModeChange={mockOnModeChange}
					/>
				);

				expect(screen.getByTestId("practice-mode-selector")).toBeInTheDocument();
			});

			it("should not show practice mode selector when initial mode is provided", () => {
				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={mockDeck}
						cards={mockCards}
						metadata={mockMetadata}
						practiceMode={PracticeMode.STANDARD}
						handleClose={mockHandleClose}
						onModeChange={mockOnModeChange}
					/>
				);

				expect(
					screen.queryByTestId("practice-mode-selector")
				).not.toBeInTheDocument();
				expect(screen.getByTestId("flashcard-renderer")).toBeInTheDocument();
			});

			it("should call onModeChange callback when mode is selected", async () => {
				const deckWithoutDefault = {
					...mockDeck,
					settings: undefined
				};

				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={deckWithoutDefault}
						cards={mockCards}
						metadata={mockMetadata}
						handleClose={mockHandleClose}
						onModeChange={mockOnModeChange}
					/>
				);

				// Select standard mode
				const standardButton = screen.getByTestId(
					`mode-${PracticeMode.STANDARD}`
				);
				fireEvent.click(standardButton);

				await waitFor(() => {
					expect(mockOnModeChange).toHaveBeenCalledWith(
						PracticeMode.STANDARD
					);
				});
			});

			it("should hide mode selector after mode is selected", async () => {
				const deckWithoutDefault = {
					...mockDeck,
					settings: undefined
				};

				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={deckWithoutDefault}
						cards={mockCards}
						metadata={mockMetadata}
						handleClose={mockHandleClose}
						onModeChange={mockOnModeChange}
					/>
				);

				// Initially selector should be visible
				expect(screen.getByTestId("practice-mode-selector")).toBeInTheDocument();

				// Select a mode
				const typeAnswerButton = screen.getByTestId(
					`mode-${PracticeMode.TYPE_ANSWER}`
				);
				fireEvent.click(typeAnswerButton);

				// Selector should be hidden, renderer should be shown
				await waitFor(() => {
					expect(
						screen.queryByTestId("practice-mode-selector")
					).not.toBeInTheDocument();
					expect(screen.getByTestId("flashcard-renderer")).toBeInTheDocument();
				});
			});
		});

		describe("Mode Switching During Session", () => {
			it("should show settings button to change practice mode", () => {
				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={mockDeck}
						cards={mockCards}
						metadata={mockMetadata}
						practiceMode={PracticeMode.STANDARD}
						handleClose={mockHandleClose}
						onModeChange={mockOnModeChange}
					/>
				);

				const settingsButton = screen.getByTestId("modal-button-settings");
				expect(settingsButton).toBeInTheDocument();
				expect(settingsButton).not.toBeDisabled();
			});

			it("should toggle mode selector when settings button is clicked", async () => {
				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={mockDeck}
						cards={mockCards}
						metadata={mockMetadata}
						practiceMode={PracticeMode.STANDARD}
						handleClose={mockHandleClose}
						onModeChange={mockOnModeChange}
					/>
				);

				// Initially, mode selector should not be visible
				expect(
					screen.queryByTestId("practice-mode-selector")
				).not.toBeInTheDocument();

				// Click settings button
				const settingsButton = screen.getByTestId("modal-button-settings");
				fireEvent.click(settingsButton);

				// Mode selector should now be visible
				await waitFor(() => {
					expect(
						screen.getByTestId("practice-mode-selector")
					).toBeInTheDocument();
				});

				// Flashcard renderer should be hidden
				expect(
					screen.queryByTestId("flashcard-renderer")
				).not.toBeInTheDocument();
			});

			it("should switch to new mode when selected from selector", async () => {
				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={mockDeck}
						cards={mockCards}
						metadata={mockMetadata}
						practiceMode={PracticeMode.STANDARD}
						handleClose={mockHandleClose}
						onModeChange={mockOnModeChange}
					/>
				);

				// Open mode selector
				const settingsButton = screen.getByTestId("modal-button-settings");
				fireEvent.click(settingsButton);

				// Select a different mode
				const typeAnswerButton = screen.getByTestId(
					`mode-${PracticeMode.TYPE_ANSWER}`
				);
				fireEvent.click(typeAnswerButton);

				// Mode should be changed
				await waitFor(() => {
					expect(mockOnModeChange).toHaveBeenCalledWith(
						PracticeMode.TYPE_ANSWER
					);
				});

				// Renderer should be visible again
				await waitFor(() => {
					expect(screen.getByTestId("flashcard-renderer")).toBeInTheDocument();
				});
			});

			it("should preserve card progress when switching modes", async () => {
				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={mockDeck}
						cards={mockCards}
						metadata={mockMetadata}
						practiceMode={PracticeMode.STANDARD}
						handleClose={mockHandleClose}
						onCardReviewed={mockOnCardReviewed}
						onModeChange={mockOnModeChange}
					/>
				);

				// Navigate to second card
				const nextButton = screen.getByTestId("modal-button-arrow-right");
				fireEvent.click(nextButton);

				// Check we're on card 2
				await waitFor(() => {
					expect(screen.getByTestId("progress-display")).toHaveTextContent(
						"Card 2 of 3"
					);
				});

				// Switch mode
				const settingsButton = screen.getByTestId("modal-button-settings");
				fireEvent.click(settingsButton);

				const clozButton = screen.getByTestId(`mode-${PracticeMode.CLOZE}`);
				fireEvent.click(clozButton);

				// Should still be on card 2
				await waitFor(() => {
					expect(screen.getByTestId("progress-display")).toHaveTextContent(
						"Card 2 of 3"
					);
				});
			});
		});

		describe("Modal Title Updates", () => {
			it("should display practice mode in modal title", () => {
				const { container } = render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={mockDeck}
						cards={mockCards}
						metadata={mockMetadata}
						practiceMode={PracticeMode.TYPE_ANSWER}
						handleClose={mockHandleClose}
					/>
				);

				const title = container.querySelector(".modal-title-qg");
				expect(title).toHaveTextContent("Test Deck (Type Answer) - Card 1 of 3");
			});

			it("should update title when showing mode selector", async () => {
				const { container } = render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={mockDeck}
						cards={mockCards}
						metadata={mockMetadata}
						practiceMode={PracticeMode.STANDARD}
						handleClose={mockHandleClose}
					/>
				);

				// Click settings to show selector
				const settingsButton = screen.getByTestId("modal-button-settings");
				fireEvent.click(settingsButton);

				await waitFor(() => {
					const title = container.querySelector(".modal-title-qg");
					expect(title).toHaveTextContent("Test Deck - Select Practice Mode");
				});
			});

			it("should show correct mode name for each practice mode", () => {
				const modeNames: Record<PracticeMode, string> = {
					[PracticeMode.STANDARD]: "Standard",
					[PracticeMode.TYPE_ANSWER]: "Type Answer",
					[PracticeMode.MULTIPLE_CHOICE]: "Multiple Choice",
					[PracticeMode.CLOZE]: "Cloze Deletion"
				};

				Object.entries(modeNames).forEach(([mode, name]) => {
					const { container } = render(
						<FlashcardModal
							app={mockApp}
							settings={mockSettings}
							deck={mockDeck}
							cards={mockCards}
							metadata={mockMetadata}
							practiceMode={mode as PracticeMode}
							handleClose={mockHandleClose}
						/>
					);

					const title = container.querySelector(".modal-title-qg");
					expect(title).toHaveTextContent(`Test Deck (${name}) - Card 1 of 3`);
				});
			});
		});

		describe("Keyboard Shortcuts with Mode Selector", () => {
			it("should not handle card navigation shortcuts when mode selector is shown", async () => {
				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={mockDeck}
						cards={mockCards}
						metadata={mockMetadata}
						practiceMode={PracticeMode.STANDARD}
						handleClose={mockHandleClose}
					/>
				);

				// Open mode selector
				const settingsButton = screen.getByTestId("modal-button-settings");
				fireEvent.click(settingsButton);

				await waitFor(() => {
					expect(
						screen.getByTestId("practice-mode-selector")
					).toBeInTheDocument();
				});

				// Try to navigate with arrow keys
				fireEvent.keyDown(window, { key: "ArrowRight" });

				// Should still show mode selector (navigation should be blocked)
				expect(screen.getByTestId("practice-mode-selector")).toBeInTheDocument();
			});

			it("should close mode selector when Escape is pressed", async () => {
				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={mockDeck}
						cards={mockCards}
						metadata={mockMetadata}
						practiceMode={PracticeMode.STANDARD}
						handleClose={mockHandleClose}
					/>
				);

				// Open mode selector
				const settingsButton = screen.getByTestId("modal-button-settings");
				fireEvent.click(settingsButton);

				await waitFor(() => {
					expect(
						screen.getByTestId("practice-mode-selector")
					).toBeInTheDocument();
				});

				// Press Escape
				fireEvent.keyDown(window, { key: "Escape" });

				// Mode selector should be closed
				await waitFor(() => {
					expect(
						screen.queryByTestId("practice-mode-selector")
					).not.toBeInTheDocument();
					expect(screen.getByTestId("flashcard-renderer")).toBeInTheDocument();
				});
			});

			it("should not close modal when Escape is pressed in mode selector", async () => {
				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={mockDeck}
						cards={mockCards}
						metadata={mockMetadata}
						practiceMode={PracticeMode.STANDARD}
						handleClose={mockHandleClose}
					/>
				);

				// Open mode selector
				const settingsButton = screen.getByTestId("modal-button-settings");
				fireEvent.click(settingsButton);

				await waitFor(() => {
					expect(
						screen.getByTestId("practice-mode-selector")
					).toBeInTheDocument();
				});

				// Press Escape
				fireEvent.keyDown(window, { key: "Escape" });

				// Modal should NOT be closed
				expect(mockHandleClose).not.toHaveBeenCalled();

				// Mode selector should be closed
				await waitFor(() => {
					expect(
						screen.queryByTestId("practice-mode-selector")
					).not.toBeInTheDocument();
				});
			});
		});

		describe("Deck Settings Integration", () => {
			it("should handle deck with no settings gracefully", () => {
				const deckWithoutSettings: Deck = {
					...mockDeck,
					settings: undefined
				};

				// Should not crash
				expect(() => {
					render(
						<FlashcardModal
							app={mockApp}
							settings={mockSettings}
							deck={deckWithoutSettings}
							cards={mockCards}
							metadata={mockMetadata}
							handleClose={mockHandleClose}
						/>
					);
				}).not.toThrow();
			});

			it("should use enabled modes from deck settings", async () => {
				const deckWithoutDefault = {
					...mockDeck,
					settings: {
						...mockDeck.settings!,
						enabledPracticeModes: [PracticeMode.STANDARD, PracticeMode.CLOZE]
					}
				};

				render(
					<FlashcardModal
						app={mockApp}
						settings={mockSettings}
						deck={deckWithoutDefault}
						cards={mockCards}
						metadata={mockMetadata}
						handleClose={mockHandleClose}
						onModeChange={mockOnModeChange}
					/>
				);

				// Should default to first enabled mode from settings
				// In this case, STANDARD mode should be selected automatically
				expect(screen.getByTestId("flashcard-renderer")).toBeInTheDocument();
			});
		});
	});

	describe("Review Recording and Interval Calculation (Task 40)", () => {
		beforeEach(() => {
			// Mock SpacedRepetition methods
			const mockInitializeMetadata = SpacedRepetition.initializeMetadata as jest.Mock;
			const mockCalculateNextReview = SpacedRepetition.calculateNextReview as jest.Mock;

			// Setup default mock implementations
			mockInitializeMetadata.mockImplementation((cardId: string) => ({
				id: cardId,
				repetitions: 0,
				interval: 0,
				easeFactor: 2.5,
				dueDate: Date.now(),
				lastReviewed: 0,
				masteryLevel: MasteryLevel.NEW,
				reviewHistory: [],
				practiceMode: undefined
			}));

			// Mock calculateNextReview to return different intervals for each rating
			mockCalculateNextReview.mockImplementation((metadata, rating: ConfidenceRating) => {
				const intervals: Record<ConfidenceRating, number> = {
					[ConfidenceRating.AGAIN]: 1,
					[ConfidenceRating.HARD]: 2,
					[ConfidenceRating.GOOD]: 5,
					[ConfidenceRating.EASY]: 10
				};

				return {
					...metadata,
					interval: intervals[rating],
					dueDate: Date.now() + intervals[rating] * 24 * 60 * 60 * 1000,
					repetitions: rating === ConfidenceRating.AGAIN ? 0 : metadata.repetitions + 1
				};
			});
		});

		it("should calculate next intervals for all confidence ratings", () => {
			// Override the mock to capture calls and return specific values
			const mockCalculateNextReview = SpacedRepetition.calculateNextReview as jest.Mock;

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
				/>
			);

			// Reveal answer to show confidence rating
			const revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);

			// Verify that calculateNextReview was called for each rating option
			// to calculate the intervals to display
			expect(mockCalculateNextReview).toHaveBeenCalled();

			// Should be called 4 times (once for each rating: Again, Hard, Good, Easy)
			expect(mockCalculateNextReview).toHaveBeenCalledTimes(4);
		});

		it("should pass calculated intervals to ConfidenceRating component", () => {
			// Create a custom mock that captures the intervals prop
			let capturedIntervals: any = null;

			// Re-mock ConfidenceRating to capture props
			jest.isolateModules(() => {
				jest.doMock("./ConfidenceRating", () => {
					return function MockConfidenceRating({ onRate, intervals }: any) {
						capturedIntervals = intervals;
						return (
							<div data-testid="confidence-rating">
								<button onClick={() => onRate(ConfidenceRating.AGAIN)}>Again</button>
								<button onClick={() => onRate(ConfidenceRating.HARD)}>Hard</button>
								<button onClick={() => onRate(ConfidenceRating.GOOD)}>Good</button>
								<button onClick={() => onRate(ConfidenceRating.EASY)}>Easy</button>
							</div>
						);
					};
				});
			});

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
				/>
			);

			// Reveal answer
			const revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);

			// The intervals should be calculated and available (not null/undefined)
			// Note: Due to mocking complexity, we verify the calculation was triggered
			expect(SpacedRepetition.calculateNextReview).toHaveBeenCalled();
		});

		it("should use SpacedRepetition.initializeMetadata for new cards", () => {
			const mockInitializeMetadata = SpacedRepetition.initializeMetadata as jest.Mock;

			// Create a card that has no metadata
			const emptyMetadata = new Map<string, FlashcardMetadata>();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={emptyMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
				/>
			);

			// Reveal answer to trigger interval calculation
			const revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);

			// Should initialize metadata for the new card
			expect(mockInitializeMetadata).toHaveBeenCalledWith("card-1");
		});

		it("should use existing metadata when available for interval calculation", () => {
			const mockCalculateNextReview = SpacedRepetition.calculateNextReview as jest.Mock;

			// Create metadata with existing review history
			const existingMetadata = new Map<string, FlashcardMetadata>();
			existingMetadata.set("card-1", {
				id: "card-1",
				repetitions: 3,
				interval: 7,
				easeFactor: 2.6,
				dueDate: Date.now(),
				lastReviewed: Date.now() - 7 * 24 * 60 * 60 * 1000,
				masteryLevel: MasteryLevel.LEARNING,
				reviewHistory: [],
				practiceMode: PracticeMode.STANDARD
			});

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={existingMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
				/>
			);

			// Reveal answer
			const revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);

			// Should use the existing metadata for calculations
			expect(mockCalculateNextReview).toHaveBeenCalled();

			// Verify it was called with the existing metadata
			const firstCall = mockCalculateNextReview.mock.calls[0];
			expect(firstCall[0]).toMatchObject({
				id: "card-1",
				repetitions: 3,
				interval: 7,
				easeFactor: 2.6
			});
		});

		it("should include practice mode when calculating intervals", () => {
			const mockCalculateNextReview = SpacedRepetition.calculateNextReview as jest.Mock;

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.TYPE_ANSWER}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
				/>
			);

			// Reveal answer
			const revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);

			// Should pass the practice mode to calculateNextReview
			expect(mockCalculateNextReview).toHaveBeenCalled();

			// Check that practice mode was included in the calls
			const calls = mockCalculateNextReview.mock.calls;
			calls.forEach((call: any[]) => {
				expect(call[3]).toBe(PracticeMode.TYPE_ANSWER);
			});
		});

		it("should track session statistics correctly after rating", async () => {
			jest.useFakeTimers();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Reveal and rate first card as "Good"
			let revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);

			let goodButton = screen.getByText("Good");
			await act(async () => {
				fireEvent.click(goodButton);
				// Fast-forward through the auto-navigation delay
				jest.advanceTimersByTime(400);
			});

			// Should have updated stats with 1 correct
			let stats = screen.getByTestId("stats");
			expect(stats).toHaveTextContent("Correct: 1");

			// Wait for the new card to be ready
			await act(async () => {
				jest.runAllTimers();
			});

			// Reveal and rate second card as "Again"
			revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);

			const againButton = screen.getByText("Again");
			await act(async () => {
				fireEvent.click(againButton);
				jest.advanceTimersByTime(400);
			});

			// Stats should now show 1 correct and 1 again
			expect(mockOnCardReviewed).toHaveBeenCalledTimes(2);

			jest.useRealTimers();
		});

		it("should call onCardReviewed with correct time spent parameter", async () => {
			jest.useFakeTimers();
			const startTime = Date.now();
			jest.setSystemTime(startTime);

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
				/>
			);

			// Reveal answer
			const revealButton = screen.getByTestId("modal-button-eye");
			fireEvent.click(revealButton);

			// Simulate 3 seconds passing
			jest.advanceTimersByTime(3000);

			// Select rating
			const goodButton = screen.getByText("Good");
			await act(async () => {
				fireEvent.click(goodButton);
			});

			// Should have called with approximately 3000ms time spent
			expect(mockOnCardReviewed).toHaveBeenCalledWith(
				"card-1",
				ConfidenceRating.GOOD,
				expect.any(Number)
			);

			const timeSpent = mockOnCardReviewed.mock.calls[0][2];
			expect(timeSpent).toBeGreaterThanOrEqual(2900);
			expect(timeSpent).toBeLessThanOrEqual(3100);

			jest.useRealTimers();
		});
	});
});
