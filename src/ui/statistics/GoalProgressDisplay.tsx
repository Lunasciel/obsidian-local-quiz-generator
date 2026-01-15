/**
 * GoalProgressDisplay Component
 *
 * Displays progress toward daily learning goals including card and time goals.
 * Shows streak information with visual indicators and celebration animations.
 *
 * Requirements addressed:
 * - Requirement 3.7: Display goal progress
 * - Requirement 8.1: Show streak information
 * - Requirement 8.2: Display goal completion celebration
 *
 * @module ui/statistics/GoalProgressDisplay
 */

import { GoalProgress } from "../../services/flashcards/statisticsService";

/**
 * Props for the GoalProgressDisplay component
 */
interface GoalProgressDisplayProps {
	/**
	 * Goal progress data
	 */
	progress: GoalProgress;

	/**
	 * Current streak in days
	 */
	currentStreak: number;

	/**
	 * Longest streak achieved
	 */
	longestStreak: number;
}

/**
 * GoalProgressDisplay Component
 *
 * Renders goal progress with animated progress bars and streak display.
 */
const GoalProgressDisplay = ({
	progress,
	currentStreak,
	longestStreak,
}: GoalProgressDisplayProps) => {
	const {
		dailyCardGoal,
		cardsReviewedToday,
		dailyTimeGoal,
		timeSpentToday,
		cardGoalMet,
		timeGoalMet,
	} = progress;

	// Calculate percentages (cap at 100% for display)
	const cardPercent = Math.min((cardsReviewedToday / dailyCardGoal) * 100, 100);
	const timePercent = Math.min((timeSpentToday / dailyTimeGoal) * 100, 100);

	// Format time for display
	const formatTime = (minutes: number): string => {
		if (minutes < 1) return "< 1 min";
		if (minutes < 60) return `${Math.round(minutes)} min`;
		const hours = Math.floor(minutes / 60);
		const mins = Math.round(minutes % 60);
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	};

	// Check if both goals are met for celebration
	const allGoalsMet = cardGoalMet && timeGoalMet;

	return (
		<div className={`goal-progress-display-qg ${allGoalsMet ? "goals-complete-qg" : ""}`}>
			{/* Streak display */}
			<div className="goal-streak-container-qg">
				<div className="goal-streak-qg">
					<span className="goal-streak-icon-qg" aria-hidden="true">
						🔥
					</span>
					<span className="goal-streak-count-qg">{currentStreak}</span>
					<span className="goal-streak-label-qg">day streak</span>
				</div>
				{longestStreak > currentStreak && (
					<div className="goal-streak-best-qg">
						<span className="goal-streak-best-label-qg">Best:</span>
						<span className="goal-streak-best-value-qg">{longestStreak} days</span>
					</div>
				)}
			</div>

			{/* Daily goals */}
			<div className="goal-items-container-qg">
				{/* Card goal */}
				<div className={`goal-item-qg ${cardGoalMet ? "goal-met-qg" : ""}`}>
					<div className="goal-item-header-qg">
						<span className="goal-item-label-qg">Daily Cards</span>
						<span className="goal-item-status-qg">
							{cardsReviewedToday} / {dailyCardGoal}
							{cardGoalMet && (
								<span className="goal-complete-icon-qg" aria-label="Goal completed">
									✓
								</span>
							)}
						</span>
					</div>
					<div className="goal-progress-bar-container-qg">
						<div
							className={`goal-progress-bar-qg ${cardGoalMet ? "goal-progress-complete-qg" : ""}`}
							style={{ width: `${cardPercent}%` }}
							role="progressbar"
							aria-valuenow={cardsReviewedToday}
							aria-valuemin={0}
							aria-valuemax={dailyCardGoal}
							aria-label={`${cardsReviewedToday} of ${dailyCardGoal} cards reviewed`}
						/>
					</div>
				</div>

				{/* Time goal */}
				<div className={`goal-item-qg ${timeGoalMet ? "goal-met-qg" : ""}`}>
					<div className="goal-item-header-qg">
						<span className="goal-item-label-qg">Daily Time</span>
						<span className="goal-item-status-qg">
							{formatTime(timeSpentToday)} / {formatTime(dailyTimeGoal)}
							{timeGoalMet && (
								<span className="goal-complete-icon-qg" aria-label="Goal completed">
									✓
								</span>
							)}
						</span>
					</div>
					<div className="goal-progress-bar-container-qg">
						<div
							className={`goal-progress-bar-qg ${timeGoalMet ? "goal-progress-complete-qg" : ""}`}
							style={{ width: `${timePercent}%` }}
							role="progressbar"
							aria-valuenow={timeSpentToday}
							aria-valuemin={0}
							aria-valuemax={dailyTimeGoal}
							aria-label={`${formatTime(timeSpentToday)} of ${formatTime(dailyTimeGoal)} spent`}
						/>
					</div>
				</div>
			</div>

			{/* Celebration message when all goals met */}
			{allGoalsMet && (
				<div className="goal-celebration-qg" aria-live="polite">
					<span className="goal-celebration-icon-qg" aria-hidden="true">
						🎉
					</span>
					<span className="goal-celebration-text-qg">Daily goals complete!</span>
				</div>
			)}
		</div>
	);
};

export default GoalProgressDisplay;
