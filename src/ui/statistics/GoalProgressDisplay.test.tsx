/**
 * Unit tests for GoalProgressDisplay Component
 *
 * Tests rendering, goal tracking, and accessibility.
 * Requirements: 3.7, 8.1, 8.2
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import GoalProgressDisplay from "./GoalProgressDisplay";
import { GoalProgress } from "../../services/flashcards/statisticsService";

const createMockProgress = (overrides?: Partial<GoalProgress>): GoalProgress => ({
	dailyCardGoal: 20,
	cardsReviewedToday: 10,
	dailyTimeGoal: 15,
	timeSpentToday: 8,
	cardGoalMet: false,
	timeGoalMet: false,
	...overrides,
});

describe("GoalProgressDisplay - Rendering", () => {
	it("should render streak display", () => {
		const progress = createMockProgress();

		render(<GoalProgressDisplay progress={progress} currentStreak={5} longestStreak={10} />);

		expect(screen.getByText("5")).toBeInTheDocument();
		expect(screen.getByText("day streak")).toBeInTheDocument();
	});

	it("should show best streak when different from current", () => {
		const progress = createMockProgress();

		render(<GoalProgressDisplay progress={progress} currentStreak={5} longestStreak={15} />);

		expect(screen.getByText("Best:")).toBeInTheDocument();
		expect(screen.getByText("15 days")).toBeInTheDocument();
	});

	it("should not show best streak when equal to current", () => {
		const progress = createMockProgress();

		render(<GoalProgressDisplay progress={progress} currentStreak={10} longestStreak={10} />);

		expect(screen.queryByText("Best:")).not.toBeInTheDocument();
	});

	it("should display card goal progress", () => {
		const progress = createMockProgress({
			cardsReviewedToday: 15,
			dailyCardGoal: 20,
		});

		render(<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />);

		expect(screen.getByText("Daily Cards")).toBeInTheDocument();
		expect(screen.getByText("15 / 20")).toBeInTheDocument();
	});

	it("should display time goal progress", () => {
		const progress = createMockProgress({
			timeSpentToday: 10,
			dailyTimeGoal: 15,
		});

		render(<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />);

		expect(screen.getByText("Daily Time")).toBeInTheDocument();
		expect(screen.getByText("10 min / 15 min")).toBeInTheDocument();
	});

	it("should format time in hours for large values", () => {
		const progress = createMockProgress({
			timeSpentToday: 75,
			dailyTimeGoal: 120,
		});

		render(<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />);

		expect(screen.getByText("1h 15m / 2h")).toBeInTheDocument();
	});

	it("should show checkmark when card goal is met", () => {
		const progress = createMockProgress({
			cardGoalMet: true,
			cardsReviewedToday: 20,
			dailyCardGoal: 20,
		});

		render(<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />);

		const checkmarks = screen.getAllByLabelText("Goal completed");
		expect(checkmarks.length).toBeGreaterThanOrEqual(1);
	});

	it("should show checkmark when time goal is met", () => {
		const progress = createMockProgress({
			timeGoalMet: true,
			timeSpentToday: 15,
			dailyTimeGoal: 15,
		});

		render(<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />);

		const checkmarks = screen.getAllByLabelText("Goal completed");
		expect(checkmarks.length).toBeGreaterThanOrEqual(1);
	});
});

describe("GoalProgressDisplay - Goal Completion", () => {
	it("should show celebration when all goals are met", () => {
		const progress = createMockProgress({
			cardGoalMet: true,
			timeGoalMet: true,
		});

		render(<GoalProgressDisplay progress={progress} currentStreak={5} longestStreak={5} />);

		expect(screen.getByText("Daily goals complete!")).toBeInTheDocument();
	});

	it("should not show celebration when only card goal is met", () => {
		const progress = createMockProgress({
			cardGoalMet: true,
			timeGoalMet: false,
		});

		render(<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />);

		expect(screen.queryByText("Daily goals complete!")).not.toBeInTheDocument();
	});

	it("should not show celebration when only time goal is met", () => {
		const progress = createMockProgress({
			cardGoalMet: false,
			timeGoalMet: true,
		});

		render(<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />);

		expect(screen.queryByText("Daily goals complete!")).not.toBeInTheDocument();
	});

	it("should apply goals-complete class when all goals met", () => {
		const progress = createMockProgress({
			cardGoalMet: true,
			timeGoalMet: true,
		});

		const { container } = render(
			<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />
		);

		const display = container.querySelector(".goal-progress-display-qg");
		expect(display).toHaveClass("goals-complete-qg");
	});
});

describe("GoalProgressDisplay - Accessibility", () => {
	it("should have progress bars with proper ARIA attributes", () => {
		const progress = createMockProgress({
			cardsReviewedToday: 8,
			dailyCardGoal: 20,
		});

		render(<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />);

		const progressbars = screen.getAllByRole("progressbar");
		expect(progressbars.length).toBe(2);

		const cardProgressbar = progressbars[0];
		expect(cardProgressbar).toHaveAttribute("aria-valuenow", "8");
		expect(cardProgressbar).toHaveAttribute("aria-valuemin", "0");
		expect(cardProgressbar).toHaveAttribute("aria-valuemax", "20");
	});

	it("should have aria-hidden on decorative icons", () => {
		const progress = createMockProgress({
			cardGoalMet: true,
			timeGoalMet: true,
		});

		const { container } = render(
			<GoalProgressDisplay progress={progress} currentStreak={3} longestStreak={3} />
		);

		const streakIcon = container.querySelector(".goal-streak-icon-qg");
		expect(streakIcon).toHaveAttribute("aria-hidden", "true");

		const celebrationIcon = container.querySelector(".goal-celebration-icon-qg");
		expect(celebrationIcon).toHaveAttribute("aria-hidden", "true");
	});

	it("should have aria-live on celebration message", () => {
		const progress = createMockProgress({
			cardGoalMet: true,
			timeGoalMet: true,
		});

		const { container } = render(
			<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />
		);

		const celebration = container.querySelector(".goal-celebration-qg");
		expect(celebration).toHaveAttribute("aria-live", "polite");
	});
});

describe("GoalProgressDisplay - Styling", () => {
	it("should apply goal-met class when card goal is met", () => {
		const progress = createMockProgress({ cardGoalMet: true });

		const { container } = render(
			<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />
		);

		const goalItems = container.querySelectorAll(".goal-item-qg");
		expect(goalItems[0]).toHaveClass("goal-met-qg");
	});

	it("should apply goal-met class when time goal is met", () => {
		const progress = createMockProgress({ timeGoalMet: true });

		const { container } = render(
			<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />
		);

		const goalItems = container.querySelectorAll(".goal-item-qg");
		expect(goalItems[1]).toHaveClass("goal-met-qg");
	});

	it("should apply complete class on progress bar when goal met", () => {
		const progress = createMockProgress({ cardGoalMet: true });

		const { container } = render(
			<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />
		);

		const progressBars = container.querySelectorAll(".goal-progress-bar-qg");
		expect(progressBars[0]).toHaveClass("goal-progress-complete-qg");
	});
});

describe("GoalProgressDisplay - Edge Cases", () => {
	it("should handle zero progress", () => {
		const progress = createMockProgress({
			cardsReviewedToday: 0,
			timeSpentToday: 0,
		});

		render(<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />);

		expect(screen.getByText("0 / 20")).toBeInTheDocument();
	});

	it("should cap progress bar at 100%", () => {
		const progress = createMockProgress({
			cardsReviewedToday: 30, // Over goal
			dailyCardGoal: 20,
			cardGoalMet: true,
		});

		const { container } = render(
			<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />
		);

		// Progress bar width should be capped at 100%
		const progressBar = container.querySelector(".goal-progress-bar-qg") as HTMLElement;
		expect(progressBar.style.width).toBe("100%");
	});

	it("should handle zero streak", () => {
		const progress = createMockProgress();

		render(<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />);

		expect(screen.getByText("0")).toBeInTheDocument();
	});

	it("should handle very small time values", () => {
		const progress = createMockProgress({
			timeSpentToday: 0.5,
			dailyTimeGoal: 15,
		});

		render(<GoalProgressDisplay progress={progress} currentStreak={0} longestStreak={0} />);

		expect(screen.getByText("< 1 min / 15 min")).toBeInTheDocument();
	});

	it("should display streak icon", () => {
		const progress = createMockProgress();

		render(<GoalProgressDisplay progress={progress} currentStreak={7} longestStreak={7} />);

		// Check for fire emoji
		expect(screen.getByText("🔥")).toBeInTheDocument();
	});
});
