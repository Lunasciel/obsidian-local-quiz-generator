/**
 * DeckStatsCard Component
 *
 * Displays statistics for a single deck including due/mastered/struggling counts,
 * retention rate, and average ease. Provides click handler to open deck review.
 *
 * Requirements addressed:
 * - Requirement 3.2: Display deck-specific statistics
 * - Requirement 3.5: Show retention rate per deck
 * - Requirement 3.6: Display average ease and interval
 *
 * @module ui/statistics/DeckStatsCard
 */

import { DeckStatsExtended } from "../../services/flashcards/statisticsService";

/**
 * Props for the DeckStatsCard component
 */
interface DeckStatsCardProps {
	/**
	 * Statistics for the deck to display
	 */
	stats: DeckStatsExtended;

	/**
	 * Callback when user clicks to review the deck
	 */
	onReviewClick?: (deckId: string) => void;
}

/**
 * Format timestamp as relative time string
 */
function formatLastReviewed(timestamp: number): string {
	if (timestamp === 0) return "Never reviewed";

	const now = Date.now();
	const diffMs = now - timestamp;
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return `${diffDays} days ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
	if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
	return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Format retention rate as percentage
 */
function formatRetention(rate: number): string {
	return `${Math.round(rate)}%`;
}

/**
 * Format ease factor for display
 */
function formatEase(ease: number): string {
	return ease.toFixed(2);
}

/**
 * Format interval as days
 */
function formatInterval(interval: number): string {
	if (interval < 1) return "< 1 day";
	if (interval === 1) return "1 day";
	if (interval < 30) return `${Math.round(interval)} days`;
	if (interval < 365) return `${Math.round(interval / 30)} months`;
	return `${Math.round(interval / 365)} years`;
}

/**
 * DeckStatsCard Component
 *
 * Renders a card showing deck statistics with visual indicators
 * for progress and performance metrics.
 */
const DeckStatsCard = ({ stats, onReviewClick }: DeckStatsCardProps) => {
	const {
		deckId,
		deckName,
		totalCards,
		cardsDue,
		cardsMastered,
		cardsStruggling,
		averageEase,
		averageInterval,
		retentionRate,
		lastReviewed,
	} = stats;

	// Calculate progress percentage
	const masteryPercent = totalCards > 0 ? (cardsMastered / totalCards) * 100 : 0;

	const handleClick = () => {
		if (onReviewClick && cardsDue > 0) {
			onReviewClick(deckId);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if ((e.key === "Enter" || e.key === " ") && onReviewClick && cardsDue > 0) {
			e.preventDefault();
			onReviewClick(deckId);
		}
	};

	const isClickable = onReviewClick && cardsDue > 0;

	return (
		<div
			className={`deck-stats-card-qg ${isClickable ? "deck-stats-card-clickable-qg" : ""}`}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			tabIndex={isClickable ? 0 : -1}
			role={isClickable ? "button" : undefined}
			aria-label={isClickable ? `Review ${deckName} - ${cardsDue} cards due` : undefined}
			data-deck-id={deckId}
		>
			{/* Header with deck name and due count */}
			<div className="deck-stats-header-qg">
				<h4 className="deck-stats-name-qg">{deckName}</h4>
				{cardsDue > 0 && (
					<span className="deck-stats-due-badge-qg" aria-label={`${cardsDue} cards due`}>
						{cardsDue} due
					</span>
				)}
			</div>

			{/* Mastery progress bar */}
			<div className="deck-stats-progress-qg">
				<div className="deck-stats-progress-bar-qg">
					<div
						className="deck-stats-progress-fill-qg"
						style={{ width: `${masteryPercent}%` }}
						role="progressbar"
						aria-valuenow={cardsMastered}
						aria-valuemin={0}
						aria-valuemax={totalCards}
						aria-label={`${cardsMastered} of ${totalCards} cards mastered`}
					/>
				</div>
				<span className="deck-stats-progress-text-qg">
					{cardsMastered}/{totalCards} mastered
				</span>
			</div>

			{/* Card counts */}
			<div className="deck-stats-counts-qg">
				<div className="deck-stat-item-qg">
					<span className="deck-stat-label-qg">Total</span>
					<span className="deck-stat-value-qg">{totalCards}</span>
				</div>
				<div className="deck-stat-item-qg">
					<span className="deck-stat-label-qg">Mastered</span>
					<span className="deck-stat-value-qg deck-stat-mastered-qg">{cardsMastered}</span>
				</div>
				<div className="deck-stat-item-qg">
					<span className="deck-stat-label-qg">Struggling</span>
					<span className="deck-stat-value-qg deck-stat-struggling-qg">{cardsStruggling}</span>
				</div>
			</div>

			{/* Performance metrics */}
			<div className="deck-stats-metrics-qg">
				<div className="deck-metric-item-qg">
					<span className="deck-metric-label-qg">Retention</span>
					<span className="deck-metric-value-qg">{formatRetention(retentionRate)}</span>
				</div>
				<div className="deck-metric-item-qg">
					<span className="deck-metric-label-qg">Avg. Ease</span>
					<span className="deck-metric-value-qg">{formatEase(averageEase)}</span>
				</div>
				<div className="deck-metric-item-qg">
					<span className="deck-metric-label-qg">Avg. Interval</span>
					<span className="deck-metric-value-qg">{formatInterval(averageInterval)}</span>
				</div>
			</div>

			{/* Footer with last reviewed */}
			<div className="deck-stats-footer-qg">
				<span className="deck-stats-last-reviewed-qg">
					Last reviewed: {formatLastReviewed(lastReviewed)}
				</span>
			</div>
		</div>
	);
};

export default DeckStatsCard;
