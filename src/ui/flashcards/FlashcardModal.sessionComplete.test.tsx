/**
 * Tests for FlashcardModal session completion handling
 * Implements comprehensive testing for task 41: Session completion handling
 *
 * Requirements tested:
 * - Display session summary when all cards reviewed
 * - Show total cards reviewed, accuracy, time spent
 * - Provide options to continue, review again cards, or close
 * - Save session data to history
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// Define vi for jest environment
const vi = {
  fn: jest.fn,
  spyOn: jest.spyOn,
  clearAllMocks: jest.clearAllMocks,
  restoreAllMocks: jest.restoreAllMocks,
} as const;
import FlashcardModal from "./FlashcardModal";
import {
	Flashcard,
	FlashcardMetadata,
	Deck,
	PracticeMode,
	ConfidenceRating,
	StudySession,
	MasteryLevel,
} from "../../utils/types";
import { App } from "obsidian";

// Mock Obsidian App
const mockApp = {
	vault: {
		adapter: {
			read: vi.fn(),
			write: vi.fn(),
			exists: vi.fn(),
		},
	},
} as unknown as App;

// Mock settings
const mockSettings = {
	apiKey: "test-key",
	model: "gpt-3.5-turbo",
	savePath: "./",
	flashcardSettings: {
		inlineSeparator: "::",
	},
};

// Sample test data
const createTestDeck = (): Deck => ({
	id: "test-deck-1",
	name: "Test Deck",
	description: "A deck for testing",
	created: Date.now() - 86400000,
	modified: Date.now(),
	cardIds: ["card-1", "card-2", "card-3"],
	settings: {
		newCardsPerDay: 20,
		reviewsPerDay: 100,
		enabledPracticeModes: [
			PracticeMode.STANDARD,
			PracticeMode.TYPE_ANSWER,
			PracticeMode.MULTIPLE_CHOICE,
		],
		enableAudioCues: false,
	},
});

const createTestCards = (): Flashcard[] => [
	{
		id: "card-1",
		front: "What is 2+2?",
		back: "4",
		deckId: "test-deck-1",
		created: Date.now() - 86400000,
		modified: Date.now(),
		tags: [],
	},
	{
		id: "card-2",
		front: "What is the capital of France?",
		back: "Paris",
		deckId: "test-deck-1",
		created: Date.now() - 86400000,
		modified: Date.now(),
		tags: [],
	},
	{
		id: "card-3",
		front: "What is React?",
		back: "A JavaScript library for building user interfaces",
		deckId: "test-deck-1",
		created: Date.now() - 86400000,
		modified: Date.now(),
		tags: [],
	},
];

const createTestMetadata = (): Map<string, FlashcardMetadata> => {
	const map = new Map<string, FlashcardMetadata>();
	["card-1", "card-2", "card-3"].forEach((id) => {
		map.set(id, {
			id,
			repetitions: 0,
			interval: 0,
			easeFactor: 2.5,
			dueDate: Date.now(),
			lastReviewed: 0,
			masteryLevel: MasteryLevel.NEW,
			reviewHistory: [],
		});
	});
	return map;
};

describe("FlashcardModal - Session Completion", () => {
	let mockHandleClose: ReturnType<typeof vi.fn>;
	let mockOnCardReviewed: ReturnType<typeof vi.fn>;
	let mockOnSessionComplete: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockHandleClose = vi.fn();
		mockOnCardReviewed = vi.fn();
		mockOnSessionComplete = vi.fn();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Session Summary Display", () => {
		it("should display session summary when all cards are reviewed", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			const { container } = render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Simulate reviewing all cards
			for (let i = 0; i < cards.length; i++) {
				// Reveal the answer
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				// Rate the card
				await waitFor(() => {
					const goodButton = screen.getByText(/Good/i);
					fireEvent.click(goodButton);
				});
			}

			// Wait for session complete screen
			await waitFor(() => {
				expect(screen.getByText(/Session Complete/i)).toBeInTheDocument();
			});

			// Verify session summary elements are displayed
			expect(screen.getByText(/Cards Reviewed/i)).toBeInTheDocument();
			expect(screen.getByText(/Accuracy/i)).toBeInTheDocument();
			expect(screen.getByText(/Time Spent/i)).toBeInTheDocument();
		});

		it("should display correct cards reviewed count", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review all cards
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const goodButton = screen.getByText(/Good/i);
					fireEvent.click(goodButton);
				});
			}

			await waitFor(() => {
				expect(screen.getByText(cards.length.toString())).toBeInTheDocument();
			});
		});

		it("should display correct accuracy percentage", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review cards: 2 correct, 1 again
			const ratings = [ConfidenceRating.GOOD, ConfidenceRating.AGAIN, ConfidenceRating.GOOD];

			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const ratingButton =
						ratings[i] === ConfidenceRating.AGAIN
							? screen.getByText(/Again/i)
							: screen.getByText(/Good/i);
					fireEvent.click(ratingButton);
				});
			}

			await waitFor(() => {
				// 2 out of 3 correct = 67% (rounded)
				expect(screen.getByText(/67%/i)).toBeInTheDocument();
			});
		});

		it("should display time spent in minutes", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review all cards
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const goodButton = screen.getByText(/Good/i);
					fireEvent.click(goodButton);
				});
			}

			await waitFor(() => {
				expect(screen.getByText(/\d+ min/i)).toBeInTheDocument();
			});
		});

		it("should display correct and again counts", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review cards: 2 correct, 1 again
			const ratings = [ConfidenceRating.GOOD, ConfidenceRating.AGAIN, ConfidenceRating.GOOD];

			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const ratingButton =
						ratings[i] === ConfidenceRating.AGAIN
							? screen.getByText(/Again/i)
							: screen.getByText(/Good/i);
					fireEvent.click(ratingButton);
				});
			}

			await waitFor(() => {
				// Find the correct count display
				const correctDisplay = screen.getByText(/Correct/i).closest("div");
				expect(correctDisplay).toHaveTextContent("2");

				// Find the again count display
				const againDisplay = screen.getByText(/Again/i).closest("div");
				expect(againDisplay).toHaveTextContent("1");
			});
		});
	});

	describe("Session Action Buttons", () => {
		it("should display close button on session complete", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review all cards
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const goodButton = screen.getByText(/Good/i);
					fireEvent.click(goodButton);
				});
			}

			await waitFor(() => {
				const closeButton = screen.getByText(/Close/i);
				expect(closeButton).toBeInTheDocument();
			});
		});

		it("should call handleClose when close button is clicked", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review all cards
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const goodButton = screen.getByText(/Good/i);
					fireEvent.click(goodButton);
				});
			}

			await waitFor(() => {
				const closeButton = screen.getByText(/Close/i);
				fireEvent.click(closeButton);
			});

			expect(mockHandleClose).toHaveBeenCalledTimes(1);
		});

		it('should display "Review Again Cards" button when cards are marked as again', async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review cards: mark one as "Again"
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const ratingButton = i === 1 ? screen.getByText(/Again/i) : screen.getByText(/Good/i);
					fireEvent.click(ratingButton);
				});
			}

			await waitFor(() => {
				expect(screen.getByText(/Review.*Again Card/i)).toBeInTheDocument();
			});
		});

		it('should NOT display "Review Again Cards" button when no cards marked as again', async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review all cards with positive ratings
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const goodButton = screen.getByText(/Good/i);
					fireEvent.click(goodButton);
				});
			}

			await waitFor(() => {
				expect(screen.queryByText(/Review.*Again Card/i)).not.toBeInTheDocument();
			});
		});

		it("should restart session when review again cards is clicked", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Mark one card as "Again"
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const ratingButton = i === 1 ? screen.getByText(/Again/i) : screen.getByText(/Good/i);
					fireEvent.click(ratingButton);
				});
			}

			await waitFor(() => {
				const reviewAgainButton = screen.getByText(/Review.*Again Card/i);
				fireEvent.click(reviewAgainButton);
			});

			// Should return to review interface
			await waitFor(() => {
				expect(screen.queryByText(/Session Complete/i)).not.toBeInTheDocument();
			});
		});
	});

	describe("Session Data Persistence", () => {
		it("should call onSessionComplete with final session data", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review all cards
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const goodButton = screen.getByText(/Good/i);
					fireEvent.click(goodButton);
				});
			}

			await waitFor(() => {
				expect(mockOnSessionComplete).toHaveBeenCalledTimes(1);
			});
		});

		it("should include all required session data fields", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review all cards
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const goodButton = screen.getByText(/Good/i);
					fireEvent.click(goodButton);
				});
			}

			await waitFor(() => {
				expect(mockOnSessionComplete).toHaveBeenCalled();
			});

			const sessionData: StudySession = mockOnSessionComplete.mock.calls[0][0];

			expect(sessionData).toHaveProperty("deckId", deck.id);
			expect(sessionData).toHaveProperty("startTime");
			expect(sessionData).toHaveProperty("endTime");
			expect(sessionData).toHaveProperty("cardsReviewed", cards.length);
			expect(sessionData).toHaveProperty("correctCount");
			expect(sessionData).toHaveProperty("againCount");
			expect(sessionData).toHaveProperty("practiceMode");
		});

		it('should track "Again" card IDs in session data', async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Mark card-2 as "Again"
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const ratingButton = i === 1 ? screen.getByText(/Again/i) : screen.getByText(/Good/i);
					fireEvent.click(ratingButton);
				});
			}

			await waitFor(() => {
				expect(mockOnSessionComplete).toHaveBeenCalled();
			});

			const sessionData: StudySession = mockOnSessionComplete.mock.calls[0][0];

			expect(sessionData.againCardIds).toBeDefined();
			expect(sessionData.againCardIds).toContain("card-2");
			expect(sessionData.againCardIds).toHaveLength(1);
		});

		it("should include practice mode in session data", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.TYPE_ANSWER}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review all cards
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const goodButton = screen.getByText(/Good/i);
					fireEvent.click(goodButton);
				});
			}

			await waitFor(() => {
				expect(mockOnSessionComplete).toHaveBeenCalled();
			});

			const sessionData: StudySession = mockOnSessionComplete.mock.calls[0][0];

			expect(sessionData.practiceMode).toBe(PracticeMode.TYPE_ANSWER);
		});
	});

	describe("Edge Cases", () => {
		it("should handle session with zero cards reviewed", () => {
			const deck = createTestDeck();
			const cards: Flashcard[] = [];
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Should show "No cards to review" message
			expect(screen.getByText(/No cards to review/i)).toBeInTheDocument();
		});

		it("should handle session with all cards marked as again", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Mark all cards as "Again"
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const againButton = screen.getByText(/Again/i);
					fireEvent.click(againButton);
				});
			}

			await waitFor(() => {
				const sessionData: StudySession = mockOnSessionComplete.mock.calls[0][0];
				expect(sessionData.correctCount).toBe(0);
				expect(sessionData.againCount).toBe(cards.length);
				expect(sessionData.againCardIds).toHaveLength(cards.length);
			});
		});

		it("should calculate 100% accuracy when all cards are correct", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Review all cards correctly
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const easyButton = screen.getByText(/Easy/i);
					fireEvent.click(easyButton);
				});
			}

			await waitFor(() => {
				expect(screen.getByText(/100%/i)).toBeInTheDocument();
			});
		});

		it("should calculate 0% accuracy when no cards are correct", async () => {
			const deck = createTestDeck();
			const cards = createTestCards();
			const metadata = createTestMetadata();

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings as any}
					deck={deck}
					cards={cards}
					metadata={metadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					onCardReviewed={mockOnCardReviewed}
					onSessionComplete={mockOnSessionComplete}
				/>
			);

			// Mark all cards as "Again"
			for (let i = 0; i < cards.length; i++) {
				const revealButton = screen.getByText(/Reveal answer/i);
				fireEvent.click(revealButton);

				await waitFor(() => {
					const againButton = screen.getByText(/Again/i);
					fireEvent.click(againButton);
				});
			}

			await waitFor(() => {
				expect(screen.getByText(/0%/i)).toBeInTheDocument();
			});
		});
	});
});
