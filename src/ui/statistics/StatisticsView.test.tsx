/**
 * Unit tests for StatisticsView Component
 *
 * Tests the main statistics dashboard composition and interaction.
 * Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7
 */

import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import StatisticsView from "./StatisticsView";
import { GlobalStats, DeckStatsExtended, GoalProgress } from "../../services/flashcards/statisticsService";

const createMockGoalProgress = (): GoalProgress => ({
	dailyCardGoal: 20,
	cardsReviewedToday: 10,
	dailyTimeGoal: 15,
	timeSpentToday: 8,
	cardGoalMet: false,
	timeGoalMet: false,
});

const createMockGlobalStats = (overrides?: Partial<GlobalStats>): GlobalStats => ({
	totalDecks: 5,
	totalCards: 250,
	totalReviews: 1000,
	currentStreak: 7,
	longestStreak: 14,
	dailyStats: [],
	goalProgress: createMockGoalProgress(),
	totalMastered: 100,
	overallRetention: 85.5,
	...overrides,
});

const createMockDeckStats = (overrides?: Partial<DeckStatsExtended>): DeckStatsExtended => ({
	deckId: "deck-1",
	deckName: "Test Deck",
	totalCards: 50,
	cardsDue: 5,
	cardsMastered: 25,
	cardsStruggling: 3,
	averageEase: 2.5,
	averageInterval: 14,
	retentionRate: 90,
	lastReviewed: Date.now(),
	...overrides,
});

describe("StatisticsView - Rendering", () => {
	it("should render title", () => {
		const globalStats = createMockGlobalStats();
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByText("Learning Statistics")).toBeInTheDocument();
	});

	it("should render close button", () => {
		const globalStats = createMockGlobalStats();
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByLabelText("Close statistics")).toBeInTheDocument();
	});

	it("should display summary statistics", () => {
		const globalStats = createMockGlobalStats({
			totalCards: 500,
			totalMastered: 200,
			totalReviews: 2500,
			overallRetention: 92,
		});
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByText("500")).toBeInTheDocument();
		expect(screen.getByText("200")).toBeInTheDocument();
		expect(screen.getByText("2,500")).toBeInTheDocument();
		expect(screen.getByText("92%")).toBeInTheDocument();
	});

	it("should render GoalProgressDisplay", () => {
		const globalStats = createMockGlobalStats();
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		// Check for streak display from GoalProgressDisplay
		expect(screen.getByText("day streak")).toBeInTheDocument();
	});

	it("should render HeatmapCalendar", () => {
		const globalStats = createMockGlobalStats();
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByText("Review Activity")).toBeInTheDocument();
	});

	it("should render deck section title with count", () => {
		const globalStats = createMockGlobalStats({ totalDecks: 3 });
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByText("Decks (3)")).toBeInTheDocument();
	});

	it("should render empty state when no decks", () => {
		const globalStats = createMockGlobalStats({ totalDecks: 0 });
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByText(/No decks yet/)).toBeInTheDocument();
	});

	it("should render DeckStatsCards for each deck", () => {
		const globalStats = createMockGlobalStats();
		const deckStats = [
			createMockDeckStats({ deckId: "deck-1", deckName: "Deck One" }),
			createMockDeckStats({ deckId: "deck-2", deckName: "Deck Two" }),
		];
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={deckStats}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByText("Deck One")).toBeInTheDocument();
		expect(screen.getByText("Deck Two")).toBeInTheDocument();
	});
});

describe("StatisticsView - Interaction", () => {
	it("should call onClose when close button clicked", () => {
		const globalStats = createMockGlobalStats();
		const heatmapData = new Map<string, number>();
		const mockOnClose = jest.fn();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={mockOnClose}
			/>
		);

		fireEvent.click(screen.getByLabelText("Close statistics"));

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("should call onClose on Escape key", () => {
		const globalStats = createMockGlobalStats();
		const heatmapData = new Map<string, number>();
		const mockOnClose = jest.fn();

		const { container } = render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={mockOnClose}
			/>
		);

		const view = container.querySelector(".statistics-view-qg");
		fireEvent.keyDown(view!, { key: "Escape" });

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("should call onReviewDeck when deck card is clicked", () => {
		const globalStats = createMockGlobalStats();
		const deckStats = [createMockDeckStats({ deckId: "deck-123", cardsDue: 10 })];
		const heatmapData = new Map<string, number>();
		const mockOnReview = jest.fn();

		const { container } = render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={deckStats}
				heatmapData={heatmapData}
				onClose={jest.fn()}
				onReviewDeck={mockOnReview}
			/>
		);

		const deckCard = container.querySelector("[data-deck-id='deck-123']");
		fireEvent.click(deckCard!);

		expect(mockOnReview).toHaveBeenCalledWith("deck-123");
	});
});

describe("StatisticsView - Data Formatting", () => {
	it("should format large numbers with commas", () => {
		const globalStats = createMockGlobalStats({
			totalCards: 12345,
			totalReviews: 67890,
		});
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByText("12,345")).toBeInTheDocument();
		expect(screen.getByText("67,890")).toBeInTheDocument();
	});

	it("should round retention rate", () => {
		const globalStats = createMockGlobalStats({ overallRetention: 87.567 });
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByText("88%")).toBeInTheDocument();
	});
});

describe("StatisticsView - Accessibility", () => {
	it("should have accessible close button", () => {
		const globalStats = createMockGlobalStats();
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		const closeButton = screen.getByLabelText("Close statistics");
		expect(closeButton).toBeInTheDocument();
		expect(closeButton.tagName).toBe("BUTTON");
	});
});

describe("StatisticsView - Edge Cases", () => {
	it("should handle zero values", () => {
		const globalStats = createMockGlobalStats({
			totalDecks: 0,
			totalCards: 0,
			totalReviews: 0,
			totalMastered: 0,
			overallRetention: 0,
		});
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={[]}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByText("Decks (0)")).toBeInTheDocument();
		expect(screen.getByText("0%")).toBeInTheDocument();
	});

	it("should handle many decks", () => {
		const globalStats = createMockGlobalStats({ totalDecks: 10 });
		const deckStats = Array.from({ length: 10 }, (_, i) =>
			createMockDeckStats({ deckId: `deck-${i}`, deckName: `Deck ${i}` })
		);
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={deckStats}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		expect(screen.getByText("Decks (10)")).toBeInTheDocument();
		expect(screen.getByText("Deck 0")).toBeInTheDocument();
		expect(screen.getByText("Deck 9")).toBeInTheDocument();
	});

	it("should render without onReviewDeck callback", () => {
		const globalStats = createMockGlobalStats();
		const deckStats = [createMockDeckStats({ cardsDue: 5 })];
		const heatmapData = new Map<string, number>();

		render(
			<StatisticsView
				globalStats={globalStats}
				deckStats={deckStats}
				heatmapData={heatmapData}
				onClose={jest.fn()}
			/>
		);

		// Should render but deck cards won't be clickable
		expect(screen.getByText("Test Deck")).toBeInTheDocument();
	});
});
