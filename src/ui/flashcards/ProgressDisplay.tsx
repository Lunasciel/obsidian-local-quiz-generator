import { StudySession } from "../../utils/types";

/**
 * Props for the ProgressDisplay component
 */
interface ProgressDisplayProps {
	/**
	 * Current card number (1-indexed for display)
	 */
	current: number;

	/**
	 * Total number of cards in the review session
	 */
	total: number;

	/**
	 * Current study session statistics (optional)
	 * If undefined, only card progress will be shown
	 */
	stats?: StudySession;
}

/**
 * ProgressDisplay Component
 *
 * Displays progress information during a flashcard review session.
 * Shows the current card position, total cards, and session statistics
 * including correct count and "again" count.
 *
 * Features:
 * - Current card number and total cards display
 * - Visual progress bar indicating completion percentage
 * - Session statistics (correct count, again count)
 * - Responsive design that adapts to different container sizes
 * - Consistent styling with existing quiz components
 *
 * Requirements addressed:
 * - Requirement 3.6: Display session statistics during review
 * - Requirement 6.3: Show mastery progress
 * - Requirement 6.6: Display success rate and study metrics
 *
 * Usage:
 * ```tsx
 * <ProgressDisplay
 *   current={5}
 *   total={20}
 *   stats={studySession}
 * />
 * ```
 *
 * @param props - The component props
 * @returns A rendered progress display element
 */
const ProgressDisplay = ({ current, total, stats }: ProgressDisplayProps) => {
	// Calculate completion percentage for progress bar
	const progressPercent = total > 0 ? (current / total) * 100 : 0;

	return (
		<div className="progress-display-qg">
			{/* Card position indicator */}
			<div className="progress-text-qg">
				<span className="progress-current-qg">Card {current}</span>
				<span className="progress-separator-qg"> of </span>
				<span className="progress-total-qg">{total}</span>
			</div>

			{/* Visual progress bar */}
			<div className="progress-bar-container-qg">
				<div
					className="progress-bar-fill-qg"
					style={{ width: `${progressPercent}%` }}
					role="progressbar"
					aria-valuenow={current}
					aria-valuemin={0}
					aria-valuemax={total}
					aria-label={`Progress: ${current} of ${total} cards`}
				/>
			</div>

			{/* Session statistics (if available) */}
			{stats && (
				<div className="progress-stats-qg">
					{/* Running accuracy percentage */}
					{stats.cardsReviewed > 0 && (
						<div className="progress-stat-item-qg progress-stat-accuracy-qg">
							<span className="progress-stat-label-qg">Accuracy: </span>
							<span className="progress-stat-value-qg progress-stat-accuracy-value-qg">
								{Math.round((stats.correctCount / stats.cardsReviewed) * 100)}%
							</span>
						</div>
					)}
					<div className="progress-stat-item-qg">
						<span className="progress-stat-label-qg">Correct: </span>
						<span className="progress-stat-value-qg progress-stat-correct-qg">
							{stats.correctCount}
						</span>
					</div>
					<div className="progress-stat-item-qg">
						<span className="progress-stat-label-qg">Again: </span>
						<span className="progress-stat-value-qg progress-stat-again-qg">
							{stats.againCount}
						</span>
					</div>
					{stats.cardsReviewed > 0 && (
						<div className="progress-stat-item-qg">
							<span className="progress-stat-label-qg">Reviewed: </span>
							<span className="progress-stat-value-qg">
								{stats.cardsReviewed}
							</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default ProgressDisplay;
