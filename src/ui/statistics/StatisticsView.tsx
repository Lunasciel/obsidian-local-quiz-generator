/**
 * StatisticsView Component
 *
 * Main statistics dashboard that composes HeatmapCalendar, DeckStatsCard list,
 * and GoalProgressDisplay into a comprehensive statistics view.
 *
 * Requirements addressed:
 * - Requirement 3.1: Display global statistics dashboard
 * - Requirement 3.2: Show deck-specific statistics
 * - Requirement 3.4: Display heatmap calendar
 * - Requirement 3.5: Show retention rates
 * - Requirement 3.6: Display study metrics
 * - Requirement 3.7: Show goal progress
 *
 * @module ui/statistics/StatisticsView
 */

import { GlobalStats, DeckStatsExtended } from "../../services/flashcards/statisticsService";
import HeatmapCalendar from "./HeatmapCalendar";
import DeckStatsCard from "./DeckStatsCard";
import GoalProgressDisplay from "./GoalProgressDisplay";

/**
 * Props for the StatisticsView component
 */
interface StatisticsViewProps {
	/**
	 * Global statistics data
	 */
	globalStats: GlobalStats;

	/**
	 * Statistics for all decks
	 */
	deckStats: DeckStatsExtended[];

	/**
	 * Heatmap data (date -> review count)
	 */
	heatmapData: Map<string, number>;

	/**
	 * Callback to close the statistics view
	 */
	onClose: () => void;

	/**
	 * Callback when user wants to review a deck
	 */
	onReviewDeck?: (deckId: string) => void;
}

/**
 * Format large numbers with commas
 */
function formatNumber(num: number): string {
	return num.toLocaleString();
}

/**
 * StatisticsView Component
 *
 * Renders the complete statistics dashboard with all sub-components.
 */
const StatisticsView = ({
	globalStats,
	deckStats,
	heatmapData,
	onClose,
	onReviewDeck,
}: StatisticsViewProps) => {
	const {
		totalDecks,
		totalCards,
		totalReviews,
		currentStreak,
		longestStreak,
		goalProgress,
		totalMastered,
		overallRetention,
	} = globalStats;

	// Handle keyboard escape to close
	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		}
	};

	return (
		<div
			className="statistics-view-qg"
			onKeyDown={handleKeyDown}
			tabIndex={-1}
		>
			{/* Header */}
			<div className="statistics-header-qg">
				<h2 className="statistics-title-qg">Learning Statistics</h2>
				<button
					className="statistics-close-qg"
					onClick={onClose}
					aria-label="Close statistics"
				>
					×
				</button>
			</div>

			{/* Summary stats */}
			<div className="statistics-summary-qg">
				<div className="summary-stat-qg">
					<span className="summary-stat-value-qg">{formatNumber(totalCards)}</span>
					<span className="summary-stat-label-qg">Total Cards</span>
				</div>
				<div className="summary-stat-qg">
					<span className="summary-stat-value-qg">{formatNumber(totalMastered)}</span>
					<span className="summary-stat-label-qg">Mastered</span>
				</div>
				<div className="summary-stat-qg">
					<span className="summary-stat-value-qg">{formatNumber(totalReviews)}</span>
					<span className="summary-stat-label-qg">Total Reviews</span>
				</div>
				<div className="summary-stat-qg">
					<span className="summary-stat-value-qg">{Math.round(overallRetention)}%</span>
					<span className="summary-stat-label-qg">Retention</span>
				</div>
			</div>

			{/* Goal progress */}
			<section className="statistics-section-qg">
				<GoalProgressDisplay
					progress={goalProgress}
					currentStreak={currentStreak}
					longestStreak={longestStreak}
				/>
			</section>

			{/* Heatmap calendar */}
			<section className="statistics-section-qg">
				<HeatmapCalendar data={heatmapData} days={90} />
			</section>

			{/* Deck statistics */}
			<section className="statistics-section-qg">
				<h3 className="statistics-section-title-qg">
					Decks ({totalDecks})
				</h3>
				{deckStats.length === 0 ? (
					<div className="statistics-empty-qg">
						<p>No decks yet. Generate flashcards from your notes to get started!</p>
					</div>
				) : (
					<div className="deck-stats-grid-qg">
						{deckStats.map((stats) => (
							<DeckStatsCard
								key={stats.deckId}
								stats={stats}
								onReviewClick={onReviewDeck}
							/>
						))}
					</div>
				)}
			</section>
		</div>
	);
};

export default StatisticsView;
