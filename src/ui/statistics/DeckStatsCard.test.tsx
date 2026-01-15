/**
 * Unit tests for DeckStatsCard Component
 *
 * Tests rendering, interaction, and accessibility for deck statistics cards.
 * Requirements: 3.2, 3.5, 3.6
 */

import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import DeckStatsCard from "./DeckStatsCard";
import { DeckStatsExtended } from "../../services/flashcards/statisticsService";

const createMockStats = (overrides?: Partial<DeckStatsExtended>): DeckStatsExtended => ({
	deckId: "deck-1",
	deckName: "Test Deck",
	totalCards: 100,
	cardsDue: 10,
	cardsMastered: 50,
	cardsStruggling: 5,
	averageEase: 2.5,
	averageInterval: 14,
	retentionRate: 85,
	lastReviewed: Date.now() - 24 * 60 * 60 * 1000, // Yesterday
	...overrides,
});

describe("DeckStatsCard - Rendering", () => {
	it("should render deck name", () => {
		const stats = createMockStats({ deckName: "My Study Deck" });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("My Study Deck")).toBeInTheDocument();
	});

	it("should show due badge when cards are due", () => {
		const stats = createMockStats({ cardsDue: 15 });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("15 due")).toBeInTheDocument();
	});

	it("should not show due badge when no cards are due", () => {
		const stats = createMockStats({ cardsDue: 0 });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.queryByText(/due/)).not.toBeInTheDocument();
	});

	it("should display mastery progress", () => {
		const stats = createMockStats({ cardsMastered: 75, totalCards: 100 });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("75/100 mastered")).toBeInTheDocument();
	});

	it("should display card counts", () => {
		const stats = createMockStats({
			totalCards: 200,
			cardsMastered: 80,
			cardsStruggling: 10,
		});

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("200")).toBeInTheDocument();
		expect(screen.getByText("80")).toBeInTheDocument();
		expect(screen.getByText("10")).toBeInTheDocument();
	});

	it("should display retention rate", () => {
		const stats = createMockStats({ retentionRate: 92.5 });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("93%")).toBeInTheDocument();
	});

	it("should display average ease", () => {
		const stats = createMockStats({ averageEase: 2.75 });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("2.75")).toBeInTheDocument();
	});

	it("should display average interval", () => {
		const stats = createMockStats({ averageInterval: 25 });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("25 days")).toBeInTheDocument();
	});

	it("should format interval in months for large values", () => {
		const stats = createMockStats({ averageInterval: 60 });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("2 months")).toBeInTheDocument();
	});

	it("should display last reviewed time", () => {
		const stats = createMockStats({
			lastReviewed: Date.now() - 24 * 60 * 60 * 1000,
		});

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("Last reviewed: Yesterday")).toBeInTheDocument();
	});

	it("should show 'Never reviewed' when lastReviewed is 0", () => {
		const stats = createMockStats({ lastReviewed: 0 });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("Last reviewed: Never reviewed")).toBeInTheDocument();
	});
});

describe("DeckStatsCard - Interaction", () => {
	it("should call onReviewClick when clicked with due cards", () => {
		const stats = createMockStats({ cardsDue: 5 });
		const mockOnClick = jest.fn();

		render(<DeckStatsCard stats={stats} onReviewClick={mockOnClick} />);

		const card = screen.getByRole("button");
		fireEvent.click(card);

		expect(mockOnClick).toHaveBeenCalledTimes(1);
		expect(mockOnClick).toHaveBeenCalledWith("deck-1");
	});

	it("should not call onReviewClick when no cards are due", () => {
		const stats = createMockStats({ cardsDue: 0 });
		const mockOnClick = jest.fn();

		render(<DeckStatsCard stats={stats} onReviewClick={mockOnClick} />);

		const card = screen.getByText("Test Deck").closest(".deck-stats-card-qg");
		fireEvent.click(card!);

		expect(mockOnClick).not.toHaveBeenCalled();
	});

	it("should call onReviewClick on Enter key", () => {
		const stats = createMockStats({ cardsDue: 5 });
		const mockOnClick = jest.fn();

		render(<DeckStatsCard stats={stats} onReviewClick={mockOnClick} />);

		const card = screen.getByRole("button");
		fireEvent.keyDown(card, { key: "Enter" });

		expect(mockOnClick).toHaveBeenCalledTimes(1);
	});

	it("should call onReviewClick on Space key", () => {
		const stats = createMockStats({ cardsDue: 5 });
		const mockOnClick = jest.fn();

		render(<DeckStatsCard stats={stats} onReviewClick={mockOnClick} />);

		const card = screen.getByRole("button");
		fireEvent.keyDown(card, { key: " " });

		expect(mockOnClick).toHaveBeenCalledTimes(1);
	});

	it("should not be clickable without onReviewClick prop", () => {
		const stats = createMockStats({ cardsDue: 5 });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});

describe("DeckStatsCard - Accessibility", () => {
	it("should have correct aria-label when clickable", () => {
		const stats = createMockStats({ deckName: "Study Deck", cardsDue: 8 });

		render(<DeckStatsCard stats={stats} onReviewClick={jest.fn()} />);

		const card = screen.getByRole("button");
		expect(card).toHaveAttribute("aria-label", "Review Study Deck - 8 cards due");
	});

	it("should have aria-label for due badge", () => {
		const stats = createMockStats({ cardsDue: 12 });

		render(<DeckStatsCard stats={stats} />);

		const badge = screen.getByText("12 due");
		expect(badge).toHaveAttribute("aria-label", "12 cards due");
	});

	it("should have proper progressbar role on mastery bar", () => {
		const stats = createMockStats({ cardsMastered: 40, totalCards: 100 });

		render(<DeckStatsCard stats={stats} />);

		const progressbar = screen.getByRole("progressbar");
		expect(progressbar).toHaveAttribute("aria-valuenow", "40");
		expect(progressbar).toHaveAttribute("aria-valuemin", "0");
		expect(progressbar).toHaveAttribute("aria-valuemax", "100");
	});

	it("should be keyboard focusable when clickable", () => {
		const stats = createMockStats({ cardsDue: 5 });

		render(<DeckStatsCard stats={stats} onReviewClick={jest.fn()} />);

		const card = screen.getByRole("button");
		expect(card).toHaveAttribute("tabIndex", "0");
	});

	it("should not be focusable when not clickable", () => {
		const stats = createMockStats({ cardsDue: 0 });

		const { container } = render(<DeckStatsCard stats={stats} onReviewClick={jest.fn()} />);

		const card = container.querySelector(".deck-stats-card-qg");
		expect(card).toHaveAttribute("tabIndex", "-1");
	});

	it("should have data-deck-id attribute", () => {
		const stats = createMockStats({ deckId: "my-deck-123" });

		const { container } = render(<DeckStatsCard stats={stats} />);

		const card = container.querySelector(".deck-stats-card-qg");
		expect(card).toHaveAttribute("data-deck-id", "my-deck-123");
	});
});

describe("DeckStatsCard - Styling", () => {
	it("should apply clickable class when interactive", () => {
		const stats = createMockStats({ cardsDue: 5 });

		const { container } = render(<DeckStatsCard stats={stats} onReviewClick={jest.fn()} />);

		const card = container.querySelector(".deck-stats-card-qg");
		expect(card).toHaveClass("deck-stats-card-clickable-qg");
	});

	it("should not apply clickable class when no due cards", () => {
		const stats = createMockStats({ cardsDue: 0 });

		const { container } = render(<DeckStatsCard stats={stats} onReviewClick={jest.fn()} />);

		const card = container.querySelector(".deck-stats-card-qg");
		expect(card).not.toHaveClass("deck-stats-card-clickable-qg");
	});
});

describe("DeckStatsCard - Edge Cases", () => {
	it("should handle zero total cards", () => {
		const stats = createMockStats({ totalCards: 0, cardsMastered: 0 });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("0/0 mastered")).toBeInTheDocument();
	});

	it("should handle very long deck names", () => {
		const stats = createMockStats({ deckName: "A Very Long Deck Name That Might Overflow" });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("A Very Long Deck Name That Might Overflow")).toBeInTheDocument();
	});

	it("should format interval less than 1 day", () => {
		const stats = createMockStats({ averageInterval: 0.5 });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("< 1 day")).toBeInTheDocument();
	});

	it("should handle 'Today' for same-day review", () => {
		const stats = createMockStats({ lastReviewed: Date.now() });

		render(<DeckStatsCard stats={stats} />);

		expect(screen.getByText("Last reviewed: Today")).toBeInTheDocument();
	});
});
