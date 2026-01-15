/**
 * Integration tests for FlashcardModal pause/resume functionality
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { App } from "obsidian";
import FlashcardModal from "./FlashcardModal";
import {
	Flashcard,
	Deck,
	PracticeMode,
	FlashcardMetadata,
	MasteryLevel,
	PausedSessionState
} from "../../utils/types";
import {
	savePausedSession,
	loadPausedSession,
	clearPausedSession
} from "../../utils/pausedSessionStorage";

// Mock the pausedSessionStorage module
jest.mock("../../utils/pausedSessionStorage");

// Mock Obsidian App
const mockApp = {
	vault: {},
	workspace: {},
	metadataCache: {}
} as unknown as App;

const mockSettings = {
	flashcardSettings: {
		dedicatedFolder: "Flashcards",
		organizationScheme: "flat",
		autoMigrateOnChange: false
	}
} as any;

describe("FlashcardModal - Pause/Resume", () => {
	let mockDeck: Deck;
	let mockCards: Flashcard[];
	let mockMetadata: Map<string, FlashcardMetadata>;
	let mockHandleClose: jest.Mock;
	let mockOnSessionComplete: jest.Mock;

	// Mock localStorage
	let localStorageMock: { [key: string]: string } = {};

	beforeAll(() => {
		global.localStorage = {
			getItem: (key: string) => localStorageMock[key] || null,
			setItem: (key: string, value: string) => {
				localStorageMock[key] = value;
			},
			removeItem: (key: string) => {
				delete localStorageMock[key];
			},
			clear: () => {
				localStorageMock = {};
			},
			length: 0,
			key: () => null
		} as Storage;
	});

	beforeEach(() => {
		localStorageMock = {};
		jest.clearAllMocks();

		mockDeck = {
			id: "test-deck",
			name: "Test Deck",
			sourceFile: "test.md",
			cardIds: ["card-1", "card-2", "card-3"],
			created: Date.now(),
			modified: Date.now(),
			settings: {
				enabledPracticeModes: [PracticeMode.STANDARD]
			}
		};

		mockCards = [
			{
				id: "card-1",
				front: "Question 1",
				back: "Answer 1",
				deckId: "test-deck",
				sourceFile: "test.md",
				tags: [],
				created: Date.now(),
				modified: Date.now()
			},
			{
				id: "card-2",
				front: "Question 2",
				back: "Answer 2",
				deckId: "test-deck",
				sourceFile: "test.md",
				tags: [],
				created: Date.now(),
				modified: Date.now()
			},
			{
				id: "card-3",
				front: "Question 3",
				back: "Answer 3",
				deckId: "test-deck",
				sourceFile: "test.md",
				tags: [],
				created: Date.now(),
				modified: Date.now()
			}
		];

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
				"card-3",
				{
					id: "card-3",
					repetitions: 0,
					interval: 0,
					easeFactor: 2.5,
					dueDate: Date.now(),
					lastReviewed: 0,
					masteryLevel: MasteryLevel.NEW,
					reviewHistory: []
				}
			]
		]);

		mockHandleClose = jest.fn();
		mockOnSessionComplete = jest.fn();
	});

	describe("Pause Button", () => {
		it("should render pause button in review interface", () => {
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

			// Find pause button by tooltip
			const pauseButton = screen.getByTitle("Pause session");
			expect(pauseButton).toBeInTheDocument();
		});

		it("should call savePausedSession and close modal when pause button clicked", async () => {
			const mockSavePausedSession = savePausedSession as jest.MockedFunction<
				typeof savePausedSession
			>;

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

			const pauseButton = screen.getByTitle("Pause session");
			fireEvent.click(pauseButton);

			await waitFor(() => {
				expect(mockSavePausedSession).toHaveBeenCalled();
				expect(mockHandleClose).toHaveBeenCalled();
			});
		});

		it("should save correct session state when pausing", async () => {
			const mockSavePausedSession = savePausedSession as jest.MockedFunction<
				typeof savePausedSession
			>;

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

			// Navigate to second card
			const nextButton = screen.getByTitle("Next card (→)");
			fireEvent.click(nextButton);

			await waitFor(() => {
				const pauseButton = screen.getByTitle("Pause session");
				fireEvent.click(pauseButton);
			});

			expect(mockSavePausedSession).toHaveBeenCalledWith(
				expect.objectContaining({
					deckId: "test-deck",
					cardIndex: 1, // Second card (0-indexed)
					practiceMode: PracticeMode.STANDARD
				})
			);
		});
	});

	describe("Resume Session", () => {
		it("should restore session state from pausedSession prop", () => {
			const pausedState: PausedSessionState = {
				deckId: "test-deck",
				cardIndex: 1,
				revealed: false,
				cardStartTime: Date.now() - 30000,
				sessionStats: {
					deckId: "test-deck",
					startTime: Date.now() - 300000,
					cardsReviewed: 1,
					newCards: 1,
					correctCount: 1,
					againCount: 0,
					againCardIds: []
				},
				reviewedCardIds: ["card-1"],
				againCardIds: [],
				lastShownTimes: [["card-1", Date.now() - 60000]],
				practiceMode: PracticeMode.STANDARD,
				pausedAt: Date.now() - 30000
			};

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					pausedSession={pausedState}
				/>
			);

			// Should be on card 2 (index 1)
			expect(screen.getByText(/Card 2 of 3/)).toBeInTheDocument();
		});

		it("should restore reviewed cards state", () => {
			const pausedState: PausedSessionState = {
				deckId: "test-deck",
				cardIndex: 2,
				revealed: false,
				cardStartTime: Date.now(),
				sessionStats: {
					deckId: "test-deck",
					startTime: Date.now() - 300000,
					cardsReviewed: 2,
					newCards: 2,
					correctCount: 2,
					againCount: 0
				},
				reviewedCardIds: ["card-1", "card-2"],
				againCardIds: [],
				lastShownTimes: [],
				practiceMode: PracticeMode.STANDARD,
				pausedAt: Date.now()
			};

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					pausedSession={pausedState}
				/>
			);

			// Check that progress display shows correct count
			expect(screen.getByText(/2 reviewed/i)).toBeInTheDocument();
		});

		it("should restore revealed state", () => {
			const pausedState: PausedSessionState = {
				deckId: "test-deck",
				cardIndex: 0,
				revealed: true, // Answer was revealed
				cardStartTime: Date.now(),
				sessionStats: {
					deckId: "test-deck",
					startTime: Date.now(),
					cardsReviewed: 0,
					newCards: 0,
					correctCount: 0,
					againCount: 0
				},
				reviewedCardIds: [],
				againCardIds: [],
				lastShownTimes: [],
				practiceMode: PracticeMode.STANDARD,
				pausedAt: Date.now()
			};

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					practiceMode={PracticeMode.STANDARD}
					handleClose={mockHandleClose}
					pausedSession={pausedState}
				/>
			);

			// Should show confidence rating buttons since answer was revealed
			expect(screen.getByText(/How well did you know this?/i)).toBeInTheDocument();
		});

		it("should restore practice mode", () => {
			const pausedState: PausedSessionState = {
				deckId: "test-deck",
				cardIndex: 0,
				revealed: false,
				cardStartTime: Date.now(),
				sessionStats: {
					deckId: "test-deck",
					startTime: Date.now(),
					cardsReviewed: 0,
					newCards: 0,
					correctCount: 0,
					againCount: 0
				},
				reviewedCardIds: [],
				againCardIds: [],
				lastShownTimes: [],
				practiceMode: PracticeMode.TYPE_ANSWER,
				pausedAt: Date.now()
			};

			render(
				<FlashcardModal
					app={mockApp}
					settings={mockSettings}
					deck={mockDeck}
					cards={mockCards}
					metadata={mockMetadata}
					handleClose={mockHandleClose}
					pausedSession={pausedState}
				/>
			);

			// Modal title should show the practice mode
			expect(screen.getByText(/Type Answer/)).toBeInTheDocument();
		});
	});

	describe("Session Complete", () => {
		it("should clear paused session when completing session", async () => {
			const mockClearPausedSession = clearPausedSession as jest.MockedFunction<
				typeof clearPausedSession
			>;

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

			// Complete all cards by rating them
			for (let i = 0; i < mockCards.length; i++) {
				// Reveal answer
				const revealButton = screen.getByTitle("Reveal answer (Space)");
				fireEvent.click(revealButton);

				await waitFor(() => {
					// Rate as Good
					const goodButton = screen.getByText("Good");
					fireEvent.click(goodButton);
				});
			}

			await waitFor(() => {
				expect(mockClearPausedSession).toHaveBeenCalled();
				expect(mockOnSessionComplete).toHaveBeenCalled();
			});
		});
	});

	describe("Error Handling", () => {
		it("should still close modal if savePausedSession throws error", async () => {
			const mockSavePausedSession = savePausedSession as jest.MockedFunction<
				typeof savePausedSession
			>;
			mockSavePausedSession.mockImplementation(() => {
				throw new Error("Storage quota exceeded");
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
				/>
			);

			const pauseButton = screen.getByTitle("Pause session");
			fireEvent.click(pauseButton);

			await waitFor(() => {
				expect(mockHandleClose).toHaveBeenCalled();
			});
		});
	});
});
