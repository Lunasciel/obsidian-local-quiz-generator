/**
 * DailyGoalNotificationService
 *
 * Handles periodic checking and notification of daily learning goal progress.
 * Shows progress notifications at configured times and celebrates goal completion.
 *
 * Requirements addressed:
 * - Requirement 8.2: Daily goal progress notifications and celebration
 *
 * @module services/flashcards/dailyGoalNotificationService
 */

import { Notice } from "obsidian";
import StatisticsService, { GoalProgress } from "./statisticsService";

/**
 * Configuration for daily goal notifications
 */
export interface DailyGoalNotificationConfig {
	/** Whether to show daily goal notifications */
	enabled: boolean;
	/** Time of day to show progress notification (HH:MM format, 24-hour) */
	notificationTime: string;
	/** Duration in milliseconds to show the notification (0 = until dismissed) */
	duration: number;
	/** Whether to show celebration when goal is completed */
	showCelebration: boolean;
}

/**
 * Default notification configuration
 */
const DEFAULT_CONFIG: DailyGoalNotificationConfig = {
	enabled: true,
	notificationTime: "18:00", // 6:00 PM
	duration: 6000, // 6 seconds
	showCelebration: true,
};

/**
 * Tracks which goals have been celebrated today to avoid duplicate celebrations
 */
interface GoalCelebrationState {
	date: string;
	cardGoalCelebrated: boolean;
	timeGoalCelebrated: boolean;
	bothGoalsCelebrated: boolean;
}

/**
 * DailyGoalNotificationService manages daily goal progress notifications
 */
export default class DailyGoalNotificationService {
	private readonly statisticsService: StatisticsService;
	private readonly config: DailyGoalNotificationConfig;
	private checkInterval: number | null = null;
	private celebrationState: GoalCelebrationState;

	constructor(
		statisticsService: StatisticsService,
		config: Partial<DailyGoalNotificationConfig> = {}
	) {
		this.statisticsService = statisticsService;
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.celebrationState = this.getInitialCelebrationState();
	}

	/**
	 * Initialize the service and start periodic checking
	 * Should be called when the plugin loads
	 */
	async initialize(): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		try {
			// Reset celebration state for new day
			this.resetCelebrationStateIfNeeded();

			// Start periodic checking (check every 5 minutes)
			this.startPeriodicChecking(5 * 60 * 1000);
		} catch (error) {
			console.error("Error initializing daily goal notification service:", error);
		}
	}

	/**
	 * Clean up resources when the service is destroyed
	 */
	destroy(): void {
		this.stopPeriodicChecking();
	}

	/**
	 * Start periodic checking of goal progress
	 *
	 * @param intervalMs - Check interval in milliseconds
	 */
	private startPeriodicChecking(intervalMs: number): void {
		// Stop any existing interval
		this.stopPeriodicChecking();

		// Set up new interval
		this.checkInterval = window.setInterval(async () => {
			await this.checkAndNotify();
		}, intervalMs);

		// Do an immediate check
		this.checkAndNotify();
	}

	/**
	 * Stop periodic checking
	 */
	private stopPeriodicChecking(): void {
		if (this.checkInterval !== null) {
			window.clearInterval(this.checkInterval);
			this.checkInterval = null;
		}
	}

	/**
	 * Check goal progress and show notifications if appropriate
	 * Requirement 8.2: Check goal progress periodically and show notifications
	 */
	async checkAndNotify(): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		try {
			// Reset celebration state for new day
			this.resetCelebrationStateIfNeeded();

			// Get current goal progress
			const goalProgress = await this.getGoalProgress();

			// Check if it's time to show progress notification
			if (this.shouldShowProgressNotification()) {
				this.showProgressNotification(goalProgress);
			}

			// Check for goal completion celebrations
			if (this.config.showCelebration) {
				await this.checkAndCelebrateGoals(goalProgress);
			}
		} catch (error) {
			console.error("Error checking daily goal progress:", error);
		}
	}

	/**
	 * Get current goal progress from statistics service
	 *
	 * @returns Goal progress information
	 */
	private async getGoalProgress(): Promise<GoalProgress> {
		const stats = await this.statisticsService.getGlobalStats();
		return stats.goalProgress;
	}

	/**
	 * Check if it's time to show the progress notification
	 * Requirement 8.2: Show progress notification at configured time
	 *
	 * @returns True if notification should be shown
	 */
	private shouldShowProgressNotification(): boolean {
		const now = new Date();
		const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

		// Parse configured notification time
		const [targetHour, targetMinute] = this.config.notificationTime.split(':').map(Number);

		// Check if we're within 5 minutes of the target time
		const currentMinutes = now.getHours() * 60 + now.getMinutes();
		const targetMinutes = targetHour * 60 + targetMinute;
		const diff = Math.abs(currentMinutes - targetMinutes);

		return diff <= 5;
	}

	/**
	 * Show progress notification with current goal status
	 * Requirement 8.2: Display progress notification
	 *
	 * @param progress - Current goal progress
	 */
	private showProgressNotification(progress: GoalProgress): void {
		const cardProgress = Math.min(100, Math.round((progress.cardsReviewedToday / progress.dailyCardGoal) * 100));
		const timeProgress = Math.min(100, Math.round((progress.timeSpentToday / progress.dailyTimeGoal) * 100));

		let message = "📚 Daily Learning Progress:\n";
		message += `Cards: ${progress.cardsReviewedToday}/${progress.dailyCardGoal} (${cardProgress}%)`;

		if (progress.dailyTimeGoal > 0) {
			const timeSpentFormatted = Math.round(progress.timeSpentToday);
			message += `\nTime: ${timeSpentFormatted}/${progress.dailyTimeGoal} min (${timeProgress}%)`;
		}

		if (progress.cardGoalMet && progress.timeGoalMet) {
			message += "\n🎉 All goals completed!";
		} else if (progress.cardGoalMet || progress.timeGoalMet) {
			message += "\n✨ Keep going!";
		} else {
			message += "\n💪 You can do it!";
		}

		new Notice(message, this.config.duration);
	}

	/**
	 * Check for goal completions and show celebrations if appropriate
	 * Requirement 8.2: Display celebration on goal completion
	 *
	 * @param progress - Current goal progress
	 */
	private async checkAndCelebrateGoals(progress: GoalProgress): Promise<void> {
		// Check card goal completion
		if (progress.cardGoalMet && !this.celebrationState.cardGoalCelebrated) {
			this.celebrateCardGoal(progress);
			this.celebrationState.cardGoalCelebrated = true;
			this.saveCelebrationState();
		}

		// Check time goal completion
		if (progress.timeGoalMet && !this.celebrationState.timeGoalCelebrated) {
			this.celebrateTimeGoal(progress);
			this.celebrationState.timeGoalCelebrated = true;
			this.saveCelebrationState();
		}

		// Check both goals completion (extra celebration)
		if (progress.cardGoalMet && progress.timeGoalMet && !this.celebrationState.bothGoalsCelebrated) {
			this.celebrateBothGoals(progress);
			this.celebrationState.bothGoalsCelebrated = true;
			this.saveCelebrationState();
		}
	}

	/**
	 * Celebrate card goal completion
	 * Requirement 8.2: Display celebration on goal completion
	 *
	 * @param progress - Current goal progress
	 */
	private celebrateCardGoal(progress: GoalProgress): void {
		const message = `🎯 Card Goal Achieved!\n` +
			`You've reviewed ${progress.cardsReviewedToday} cards today!`;
		new Notice(message, this.config.duration);
		console.log(`Daily card goal achieved: ${progress.cardsReviewedToday}/${progress.dailyCardGoal}`);
	}

	/**
	 * Celebrate time goal completion
	 * Requirement 8.2: Display celebration on goal completion
	 *
	 * @param progress - Current goal progress
	 */
	private celebrateTimeGoal(progress: GoalProgress): void {
		const timeSpent = Math.round(progress.timeSpentToday);
		const message = `⏰ Time Goal Achieved!\n` +
			`You've spent ${timeSpent} minutes studying today!`;
		new Notice(message, this.config.duration);
		console.log(`Daily time goal achieved: ${timeSpent}/${progress.dailyTimeGoal} minutes`);
	}

	/**
	 * Celebrate both goals completion (extra special celebration)
	 * Requirement 8.2: Display celebration on goal completion
	 *
	 * @param progress - Current goal progress
	 */
	private celebrateBothGoals(progress: GoalProgress): void {
		const message = `🌟 All Daily Goals Completed!\n` +
			`${progress.cardsReviewedToday} cards reviewed, ` +
			`${Math.round(progress.timeSpentToday)} minutes studied.\n` +
			`Outstanding work today!`;
		new Notice(message, this.config.duration * 1.5); // Show longer for double celebration
		console.log("All daily goals achieved!");
	}

	/**
	 * Get initial celebration state for today
	 *
	 * @returns Initial celebration state
	 */
	private getInitialCelebrationState(): GoalCelebrationState {
		const today = this.getTodayDateString();
		const saved = this.loadCelebrationState();

		// If saved state is from today, use it; otherwise reset
		if (saved && saved.date === today) {
			return saved;
		}

		return {
			date: today,
			cardGoalCelebrated: false,
			timeGoalCelebrated: false,
			bothGoalsCelebrated: false,
		};
	}

	/**
	 * Reset celebration state if it's a new day
	 */
	private resetCelebrationStateIfNeeded(): void {
		const today = this.getTodayDateString();
		if (this.celebrationState.date !== today) {
			this.celebrationState = {
				date: today,
				cardGoalCelebrated: false,
				timeGoalCelebrated: false,
				bothGoalsCelebrated: false,
			};
			this.saveCelebrationState();
		}
	}

	/**
	 * Get today's date as a string (YYYY-MM-DD)
	 *
	 * @returns Date string
	 */
	private getTodayDateString(): string {
		const date = new Date();
		return date.toISOString().split("T")[0];
	}

	/**
	 * Save celebration state to localStorage
	 * Requirement 8.2: Add goal completion to daily stats
	 */
	private saveCelebrationState(): void {
		try {
			localStorage.setItem(
				"flashcard-goal-celebration-state",
				JSON.stringify(this.celebrationState)
			);
		} catch (error) {
			console.error("Error saving celebration state:", error);
		}
	}

	/**
	 * Load celebration state from localStorage
	 *
	 * @returns Saved celebration state or null
	 */
	private loadCelebrationState(): GoalCelebrationState | null {
		try {
			const saved = localStorage.getItem("flashcard-goal-celebration-state");
			if (saved) {
				return JSON.parse(saved);
			}
		} catch (error) {
			console.error("Error loading celebration state:", error);
		}
		return null;
	}

	/**
	 * Manually trigger a check and notification (useful for testing)
	 */
	async triggerCheck(): Promise<void> {
		await this.checkAndNotify();
	}

	/**
	 * Enable or disable daily goal notifications
	 *
	 * @param enabled - Whether notifications should be shown
	 */
	setEnabled(enabled: boolean): void {
		this.config.enabled = enabled;

		if (enabled && this.checkInterval === null) {
			this.startPeriodicChecking(5 * 60 * 1000);
		} else if (!enabled && this.checkInterval !== null) {
			this.stopPeriodicChecking();
		}
	}

	/**
	 * Update notification time
	 *
	 * @param time - New notification time (HH:MM format)
	 */
	setNotificationTime(time: string): void {
		// Validate time format
		const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
		if (!timeRegex.test(time)) {
			console.error("Invalid time format. Use HH:MM (24-hour format)");
			return;
		}

		this.config.notificationTime = time;
	}

	/**
	 * Get current goal progress
	 *
	 * @returns Current goal progress
	 */
	async getCurrentProgress(): Promise<GoalProgress> {
		return await this.getGoalProgress();
	}

	/**
	 * Check if card goal is met today
	 *
	 * @returns True if card goal is met
	 */
	async isCardGoalMet(): Promise<boolean> {
		const progress = await this.getGoalProgress();
		return progress.cardGoalMet;
	}

	/**
	 * Check if time goal is met today
	 *
	 * @returns True if time goal is met
	 */
	async isTimeGoalMet(): Promise<boolean> {
		const progress = await this.getGoalProgress();
		return progress.timeGoalMet;
	}

	/**
	 * Check if both goals are met today
	 *
	 * @returns True if both goals are met
	 */
	async areBothGoalsMet(): Promise<boolean> {
		const progress = await this.getGoalProgress();
		return progress.cardGoalMet && progress.timeGoalMet;
	}
}
