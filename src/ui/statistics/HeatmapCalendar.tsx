/**
 * HeatmapCalendar Component
 *
 * Displays a 90-day activity grid showing review intensity by color.
 * Each cell represents a day with color intensity based on review count.
 *
 * Requirements addressed:
 * - Requirement 3.4: Display heatmap calendar for review history
 *
 * @module ui/statistics/HeatmapCalendar
 */

/**
 * Props for the HeatmapCalendar component
 */
interface HeatmapCalendarProps {
	/**
	 * Map of date strings (YYYY-MM-DD) to review counts
	 */
	data: Map<string, number>;

	/**
	 * Number of days to display (default: 90)
	 */
	days?: number;
}

/**
 * Get intensity level (0-4) based on review count
 */
function getIntensityLevel(count: number, maxCount: number): number {
	if (count === 0) return 0;
	if (maxCount === 0) return 0;

	const ratio = count / maxCount;
	if (ratio <= 0.25) return 1;
	if (ratio <= 0.5) return 2;
	if (ratio <= 0.75) return 3;
	return 4;
}

/**
 * Format date for tooltip display
 */
function formatDateForTooltip(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/**
 * Get day of week (0 = Sunday, 6 = Saturday)
 */
function getDayOfWeek(dateStr: string): number {
	return new Date(dateStr).getDay();
}

/**
 * HeatmapCalendar Component
 *
 * Renders a GitHub-style activity heatmap showing review activity over time.
 * Uses CSS variables for theme compatibility.
 */
const HeatmapCalendar = ({ data, days = 90 }: HeatmapCalendarProps) => {
	// Generate array of dates from today going back
	const dates: string[] = [];
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	for (let i = days - 1; i >= 0; i--) {
		const date = new Date(today);
		date.setDate(date.getDate() - i);
		dates.push(date.toISOString().split("T")[0]);
	}

	// Calculate max count for intensity scaling
	const maxCount = Math.max(...Array.from(data.values()), 1);

	// Calculate total reviews
	const totalReviews = Array.from(data.values()).reduce((sum, count) => sum + count, 0);

	// Group dates by week for grid layout
	const weeks: string[][] = [];
	let currentWeek: string[] = [];

	// Pad the first week to align with day of week
	const firstDayOfWeek = getDayOfWeek(dates[0]);
	for (let i = 0; i < firstDayOfWeek; i++) {
		currentWeek.push("");
	}

	for (const date of dates) {
		currentWeek.push(date);
		if (currentWeek.length === 7) {
			weeks.push(currentWeek);
			currentWeek = [];
		}
	}

	// Add remaining days
	if (currentWeek.length > 0) {
		weeks.push(currentWeek);
	}

	return (
		<div className="heatmap-calendar-qg">
			<div className="heatmap-header-qg">
				<h3 className="heatmap-title-qg">Review Activity</h3>
				<span className="heatmap-total-qg">{totalReviews} reviews</span>
			</div>

			<div className="heatmap-container-qg">
				{/* Day labels */}
				<div className="heatmap-day-labels-qg">
					<span className="heatmap-day-label-qg">Sun</span>
					<span className="heatmap-day-label-qg">Mon</span>
					<span className="heatmap-day-label-qg">Tue</span>
					<span className="heatmap-day-label-qg">Wed</span>
					<span className="heatmap-day-label-qg">Thu</span>
					<span className="heatmap-day-label-qg">Fri</span>
					<span className="heatmap-day-label-qg">Sat</span>
				</div>

				{/* Heatmap grid */}
				<div className="heatmap-grid-qg">
					{weeks.map((week, weekIndex) => (
						<div key={weekIndex} className="heatmap-week-qg">
							{week.map((date, dayIndex) => {
								if (!date) {
									return (
										<div
											key={`empty-${dayIndex}`}
											className="heatmap-cell-qg heatmap-cell-empty-qg"
										/>
									);
								}

								const count = data.get(date) || 0;
								const intensity = getIntensityLevel(count, maxCount);
								const tooltip = `${formatDateForTooltip(date)}: ${count} ${count === 1 ? "review" : "reviews"}`;

								return (
									<div
										key={date}
										className={`heatmap-cell-qg heatmap-cell-intensity-${intensity}-qg`}
										data-date={date}
										data-count={count}
										title={tooltip}
										aria-label={tooltip}
									/>
								);
							})}
						</div>
					))}
				</div>
			</div>

			{/* Legend */}
			<div className="heatmap-legend-qg">
				<span className="heatmap-legend-label-qg">Less</span>
				<div className="heatmap-cell-qg heatmap-cell-intensity-0-qg" />
				<div className="heatmap-cell-qg heatmap-cell-intensity-1-qg" />
				<div className="heatmap-cell-qg heatmap-cell-intensity-2-qg" />
				<div className="heatmap-cell-qg heatmap-cell-intensity-3-qg" />
				<div className="heatmap-cell-qg heatmap-cell-intensity-4-qg" />
				<span className="heatmap-legend-label-qg">More</span>
			</div>
		</div>
	);
};

export default HeatmapCalendar;
