/**
 * Unit tests for HeatmapCalendar Component
 *
 * Tests rendering, data display, and accessibility for the heatmap calendar.
 * Requirement 3.4: Display heatmap calendar for review history
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import HeatmapCalendar from "./HeatmapCalendar";

describe("HeatmapCalendar - Rendering", () => {
	it("should render with basic structure", () => {
		const data = new Map<string, number>();

		render(<HeatmapCalendar data={data} />);

		expect(screen.getByText("Review Activity")).toBeInTheDocument();
		expect(screen.getByText("0 reviews")).toBeInTheDocument();
	});

	it("should display total review count", () => {
		const data = new Map<string, number>();
		const today = new Date().toISOString().split("T")[0];
		data.set(today, 10);

		render(<HeatmapCalendar data={data} />);

		expect(screen.getByText("10 reviews")).toBeInTheDocument();
	});

	it("should render day labels", () => {
		const data = new Map<string, number>();

		render(<HeatmapCalendar data={data} />);

		expect(screen.getByText("Sun")).toBeInTheDocument();
		expect(screen.getByText("Mon")).toBeInTheDocument();
		expect(screen.getByText("Tue")).toBeInTheDocument();
		expect(screen.getByText("Wed")).toBeInTheDocument();
		expect(screen.getByText("Thu")).toBeInTheDocument();
		expect(screen.getByText("Fri")).toBeInTheDocument();
		expect(screen.getByText("Sat")).toBeInTheDocument();
	});

	it("should render legend", () => {
		const data = new Map<string, number>();

		render(<HeatmapCalendar data={data} />);

		expect(screen.getByText("Less")).toBeInTheDocument();
		expect(screen.getByText("More")).toBeInTheDocument();
	});

	it("should render cells for the specified number of days", () => {
		const data = new Map<string, number>();

		const { container } = render(<HeatmapCalendar data={data} days={7} />);

		// Should have cells for 7 days plus possible empty padding cells
		const cells = container.querySelectorAll(".heatmap-cell-qg");
		expect(cells.length).toBeGreaterThanOrEqual(7);
	});
});

describe("HeatmapCalendar - Data Display", () => {
	it("should display correct intensity for cells with data", () => {
		const data = new Map<string, number>();
		const today = new Date().toISOString().split("T")[0];
		data.set(today, 10);

		const { container } = render(<HeatmapCalendar data={data} days={1} />);

		// Cell with highest count should have max intensity
		const intenseCells = container.querySelectorAll(".heatmap-cell-intensity-4-qg");
		expect(intenseCells.length).toBeGreaterThanOrEqual(1);
	});

	it("should show zero intensity for days with no reviews", () => {
		const data = new Map<string, number>();

		const { container } = render(<HeatmapCalendar data={data} days={7} />);

		const zeroCells = container.querySelectorAll(".heatmap-cell-intensity-0-qg");
		expect(zeroCells.length).toBeGreaterThan(0);
	});

	it("should calculate intensity levels correctly", () => {
		const data = new Map<string, number>();
		const today = new Date();

		// Set up data with varying counts
		for (let i = 0; i < 5; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);
			const dateStr = date.toISOString().split("T")[0];
			data.set(dateStr, i * 5); // 0, 5, 10, 15, 20
		}

		const { container } = render(<HeatmapCalendar data={data} days={5} />);

		// Should have various intensity levels
		const cells = container.querySelectorAll(".heatmap-cell-qg:not(.heatmap-cell-empty-qg)");
		expect(cells.length).toBeGreaterThan(0);
	});

	it("should set correct data attributes on cells", () => {
		const data = new Map<string, number>();
		// Use the same date calculation as the component
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const dateStr = today.toISOString().split("T")[0];
		data.set(dateStr, 5);

		const { container } = render(<HeatmapCalendar data={data} days={7} />);

		const cell = container.querySelector(`[data-date="${dateStr}"]`);
		expect(cell).toBeInTheDocument();
		expect(cell).toHaveAttribute("data-count", "5");
	});
});

describe("HeatmapCalendar - Accessibility", () => {
	it("should have tooltips with date and count", () => {
		const data = new Map<string, number>();
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const dateStr = today.toISOString().split("T")[0];
		data.set(dateStr, 7);

		const { container } = render(<HeatmapCalendar data={data} days={7} />);

		const cell = container.querySelector(`[data-date="${dateStr}"]`);
		expect(cell).toHaveAttribute("title");
		expect(cell?.getAttribute("title")).toContain("7");
		expect(cell?.getAttribute("title")).toContain("reviews");
	});

	it("should have aria-labels on cells", () => {
		const data = new Map<string, number>();
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const dateStr = today.toISOString().split("T")[0];
		data.set(dateStr, 3);

		const { container } = render(<HeatmapCalendar data={data} days={7} />);

		const cell = container.querySelector(`[data-date="${dateStr}"]`);
		expect(cell).toHaveAttribute("aria-label");
	});

	it("should use singular 'review' for count of 1", () => {
		const data = new Map<string, number>();
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const dateStr = today.toISOString().split("T")[0];
		data.set(dateStr, 1);

		const { container } = render(<HeatmapCalendar data={data} days={7} />);

		const cell = container.querySelector(`[data-date="${dateStr}"]`);
		expect(cell?.getAttribute("title")).toContain("1 review");
		expect(cell?.getAttribute("title")).not.toContain("1 reviews");
	});
});

describe("HeatmapCalendar - Edge Cases", () => {
	it("should handle empty data map", () => {
		const data = new Map<string, number>();

		render(<HeatmapCalendar data={data} />);

		expect(screen.getByText("0 reviews")).toBeInTheDocument();
	});

	it("should handle default days parameter", () => {
		const data = new Map<string, number>();

		const { container } = render(<HeatmapCalendar data={data} />);

		// Default is 90 days, should render weeks
		const weeks = container.querySelectorAll(".heatmap-week-qg");
		expect(weeks.length).toBeGreaterThanOrEqual(12); // ~90 days = ~13 weeks
	});

	it("should calculate total from multiple days", () => {
		const data = new Map<string, number>();
		const today = new Date();

		for (let i = 0; i < 3; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);
			data.set(date.toISOString().split("T")[0], 5);
		}

		render(<HeatmapCalendar data={data} days={7} />);

		expect(screen.getByText("15 reviews")).toBeInTheDocument();
	});

	it("should handle large review counts", () => {
		const data = new Map<string, number>();
		const today = new Date().toISOString().split("T")[0];
		data.set(today, 1000);

		render(<HeatmapCalendar data={data} days={1} />);

		expect(screen.getByText("1000 reviews")).toBeInTheDocument();
	});
});
