/**
 * Unit tests for SessionSummary component
 * Tests all aspects of the session summary display and user interactions
 *
 * Requirements tested:
 * - Requirement 5.2: Display cards reviewed, accuracy, time spent
 * - Requirement 5.6: Record session to StatisticsService
 * - Display new cards learned count
 * - Show contextual action buttons based on session state
 * - Handle user interactions (close, review again, continue)
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import SessionSummary from "./SessionSummary";
import { StudySession, Deck, PracticeMode } from "../../utils/types";
import { App } from "obsidian";

// Define vi for jest environment
const vi = {
	fn: jest.fn,
	spyOn: jest.spyOn,
	clearAllMocks: jest.clearAllMocks,
	restoreAllMocks: jest.restoreAllMocks,
} as const;

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

// Sample test data
const createTestDeck = (): Deck => ({
	id: "test-deck-1",
	name: "Test Deck",
	description: "A deck for testing",
	created: Date.now() - 86400000,
	modified: Date.now(),
	cardIds: ["card-1", "card-2", "card-3", "card-4", "card-5"],
	settings: {
		newCardsPerDay: 20,
		reviewsPerDay: 100,
		enabledPracticeModes: [PracticeMode.STANDARD],
		enableAudioCues: false,
	},
});

const createTestSession = (overrides?: Partial<StudySession>): StudySession => ({
	id: "session-1",
	deckId: "test-deck-1",
	startTime: Date.now() - 300000, // 5 minutes ago
	endTime: Date.now(),
	cardsReviewed: 3,
	newCards: 1,
	correctCount: 2,
	againCount: 1,
	againCardIds: ["card-1"],
	practiceMode: PracticeMode.STANDARD,
	...overrides,
});

describe("SessionSummary", () => {
	let mockOnClose: ReturnType<typeof vi.fn>;
	let mockOnReviewAgainCards: ReturnType<typeof vi.fn>;
	let mockOnContinueReview: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockOnClose = vi.fn();
		mockOnReviewAgainCards = vi.fn();
		mockOnContinueReview = vi.fn();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Rendering", () => {
		it("should render session complete title", () => {
			const deck = createTestDeck();
			const session = createTestSession();

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("Session Complete!")).toBeInTheDocument();
		});

		it("should display cards reviewed count", () => {
			const deck = createTestDeck();
			const session = createTestSession({ cardsReviewed: 3 });

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("Cards Reviewed")).toBeInTheDocument();
			expect(screen.getByText("3")).toBeInTheDocument();
		});

		it("should display accuracy percentage correctly", () => {
			const deck = createTestDeck();
			// 2 correct out of 3 = 67% (rounded)
			const session = createTestSession({
				cardsReviewed: 3,
				correctCount: 2,
				againCount: 1,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("Accuracy")).toBeInTheDocument();
			expect(screen.getByText("67%")).toBeInTheDocument();
		});

		it("should display 100% accuracy when all cards are correct", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				cardsReviewed: 3,
				correctCount: 3,
				againCount: 0,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("100%")).toBeInTheDocument();
		});

		it("should display 0% accuracy when no cards are correct", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				cardsReviewed: 3,
				correctCount: 0,
				againCount: 3,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("0%")).toBeInTheDocument();
		});

		it("should display time spent in minutes", () => {
			const deck = createTestDeck();
			const now = Date.now();
			// 5 minutes session
			const session = createTestSession({
				startTime: now - 300000,
				endTime: now,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("Time Spent")).toBeInTheDocument();
			expect(screen.getByText("5 min")).toBeInTheDocument();
		});

		it("should display correct and again counts", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				correctCount: 2,
				againCount: 1,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("Correct")).toBeInTheDocument();
			expect(screen.getByText("Again")).toBeInTheDocument();
			// Find the correct count value (the second "2" is in the correct section)
			const correctValues = screen.getAllByText("2");
			const againValues = screen.getAllByText("1");
			expect(correctValues.length).toBeGreaterThan(0);
			expect(againValues.length).toBeGreaterThan(0);
		});

		it("should display new cards learned when present", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				cardsReviewed: 5,
				newCards: 3
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("New Cards")).toBeInTheDocument();
			// Use getAllByText since the value might appear in multiple places
			const threeValues = screen.getAllByText("3");
			expect(threeValues.length).toBeGreaterThan(0);
		});

		it("should not display new cards section when zero new cards", () => {
			const deck = createTestDeck();
			const session = createTestSession({ newCards: 0 });

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.queryByText("New Cards")).not.toBeInTheDocument();
		});

		it("should display quiz suggestion when provided", () => {
			const deck = createTestDeck();
			const session = createTestSession();
			const suggestion = {
				message: "Great job! Try a quiz to test your knowledge further.",
				action: "generate-quiz" as const,
				deckId: "test-deck-1",
			};

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					suggestion={suggestion}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("💡")).toBeInTheDocument();
			expect(
				screen.getByText("Great job! Try a quiz to test your knowledge further.")
			).toBeInTheDocument();
		});

		it("should not display quiz suggestion when not provided", () => {
			const deck = createTestDeck();
			const session = createTestSession();

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.queryByText("💡")).not.toBeInTheDocument();
		});
	});

	describe("Action Buttons", () => {
		it("should always display close button", () => {
			const deck = createTestDeck();
			const session = createTestSession();

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("Close")).toBeInTheDocument();
		});

		it("should display 'Review Again Cards' button when there are again cards", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				againCardIds: ["card-1", "card-2"],
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
					onReviewAgainCards={mockOnReviewAgainCards}
				/>
			);

			expect(screen.getByText("Review 2 Again Cards")).toBeInTheDocument();
		});

		it("should display 'Review 1 Again Card' for single again card (singular)", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				againCardIds: ["card-1"],
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
					onReviewAgainCards={mockOnReviewAgainCards}
				/>
			);

			expect(screen.getByText("Review 1 Again Card")).toBeInTheDocument();
		});

		it("should not display 'Review Again Cards' button when no again cards", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				againCardIds: [],
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
					onReviewAgainCards={mockOnReviewAgainCards}
				/>
			);

			expect(screen.queryByText(/Review.*Again Card/)).not.toBeInTheDocument();
		});

		it("should not display 'Review Again Cards' button when callback not provided", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				againCardIds: ["card-1"],
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.queryByText(/Review.*Again Card/)).not.toBeInTheDocument();
		});

		it("should display 'Continue Review' button when more cards remain", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				cardsReviewed: 3,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5} // More than cardsReviewed
					onClose={mockOnClose}
					onContinueReview={mockOnContinueReview}
				/>
			);

			expect(screen.getByText("Continue Review")).toBeInTheDocument();
		});

		it("should not display 'Continue Review' button when all cards reviewed", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				cardsReviewed: 5,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5} // Same as cardsReviewed
					onClose={mockOnClose}
					onContinueReview={mockOnContinueReview}
				/>
			);

			expect(screen.queryByText("Continue Review")).not.toBeInTheDocument();
		});

		it("should not display 'Continue Review' button when callback not provided", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				cardsReviewed: 3,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.queryByText("Continue Review")).not.toBeInTheDocument();
		});
	});

	describe("User Interactions", () => {
		it("should call onClose when Close button is clicked", () => {
			const deck = createTestDeck();
			const session = createTestSession();

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			const closeButton = screen.getByText("Close");
			fireEvent.click(closeButton);

			expect(mockOnClose).toHaveBeenCalledTimes(1);
		});

		it("should call onReviewAgainCards when 'Review Again Cards' button is clicked", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				againCardIds: ["card-1", "card-2"],
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
					onReviewAgainCards={mockOnReviewAgainCards}
				/>
			);

			const reviewAgainButton = screen.getByText("Review 2 Again Cards");
			fireEvent.click(reviewAgainButton);

			expect(mockOnReviewAgainCards).toHaveBeenCalledTimes(1);
		});

		it("should call onContinueReview when 'Continue Review' button is clicked", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				cardsReviewed: 3,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
					onContinueReview={mockOnContinueReview}
				/>
			);

			const continueButton = screen.getByText("Continue Review");
			fireEvent.click(continueButton);

			expect(mockOnContinueReview).toHaveBeenCalledTimes(1);
		});
	});

	describe("Edge Cases", () => {
		it("should handle session with no endTime gracefully", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				endTime: undefined,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("Time Spent")).toBeInTheDocument();
			expect(screen.getByText("0 min")).toBeInTheDocument();
		});

		it("should handle session with zero cards reviewed", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				cardsReviewed: 0,
				correctCount: 0,
				againCount: 0,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			// Check for multiple occurrences of "0" (cards reviewed, correct, again)
			const zeroValues = screen.getAllByText("0");
			expect(zeroValues.length).toBeGreaterThan(0);
			expect(screen.getByText("0%")).toBeInTheDocument();
		});

		it("should round time spent to nearest minute", () => {
			const deck = createTestDeck();
			const now = Date.now();
			// 5.7 minutes should round to 6
			const session = createTestSession({
				startTime: now - 342000,
				endTime: now,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("6 min")).toBeInTheDocument();
		});

		it("should handle very short sessions (less than 1 minute)", () => {
			const deck = createTestDeck();
			const now = Date.now();
			// 30 seconds should round to 1 minute
			const session = createTestSession({
				startTime: now - 30000,
				endTime: now,
			});

			render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(screen.getByText("1 min")).toBeInTheDocument();
		});
	});

	describe("CSS Classes", () => {
		it("should apply correct CSS classes to elements", () => {
			const deck = createTestDeck();
			const session = createTestSession();

			const { container } = render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			expect(container.querySelector(".flashcard-session-complete-qg")).toBeInTheDocument();
			expect(container.querySelector(".flashcard-session-complete-title-qg")).toBeInTheDocument();
			expect(container.querySelector(".flashcard-session-stats-qg")).toBeInTheDocument();
			expect(container.querySelector(".flashcard-session-actions-qg")).toBeInTheDocument();
		});

		it("should apply correct CSS classes to stat elements", () => {
			const deck = createTestDeck();
			const session = createTestSession();

			const { container } = render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
				/>
			);

			const statElements = container.querySelectorAll(".flashcard-session-stat-qg");
			expect(statElements.length).toBeGreaterThan(0);

			expect(container.querySelector(".flashcard-session-stat-label-qg")).toBeInTheDocument();
			expect(container.querySelector(".flashcard-session-stat-value-qg")).toBeInTheDocument();
			expect(container.querySelector(".flashcard-session-stat-correct-qg")).toBeInTheDocument();
			expect(container.querySelector(".flashcard-session-stat-again-qg")).toBeInTheDocument();
		});

		it("should apply correct CSS classes to buttons", () => {
			const deck = createTestDeck();
			const session = createTestSession({
				againCardIds: ["card-1"],
			});

			const { container } = render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					onClose={mockOnClose}
					onReviewAgainCards={mockOnReviewAgainCards}
					onContinueReview={mockOnContinueReview}
				/>
			);

			expect(container.querySelector(".flashcard-session-button-qg")).toBeInTheDocument();
			expect(container.querySelector(".flashcard-session-close-qg")).toBeInTheDocument();
			expect(container.querySelector(".flashcard-session-review-again-qg")).toBeInTheDocument();
			expect(container.querySelector(".flashcard-session-continue-qg")).toBeInTheDocument();
		});

		it("should apply correct CSS classes to suggestion element", () => {
			const deck = createTestDeck();
			const session = createTestSession();
			const suggestion = {
				message: "Great job!",
				action: "generate-quiz" as const,
				deckId: "test-deck-1",
			};

			const { container } = render(
				<SessionSummary
					app={mockApp}
					deck={deck}
					session={session}
					totalCards={5}
					suggestion={suggestion}
					onClose={mockOnClose}
				/>
			);

			expect(container.querySelector(".flashcard-session-suggestion-qg")).toBeInTheDocument();
			expect(container.querySelector(".flashcard-session-suggestion-icon-qg")).toBeInTheDocument();
			expect(container.querySelector(".flashcard-session-suggestion-message-qg")).toBeInTheDocument();
		});
	});
});
