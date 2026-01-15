/**
 * StreakNotificationService
 *
 * Handles detection and notification of learning streak milestones.
 * Displays celebration messages when users reach 7, 30, 100, or 365 day streaks.
 *
 * Requirements addressed:
 * - Requirement 8.1: Track and celebrate learning streak milestones
 *
 * @module services/flashcards/streakNotificationService
 */

import { Notice } from "obsidian";
import StatisticsService, { StreakMilestoneAchievement } from "./statisticsService";
import { STREAK_MILESTONES } from "../../settings/flashcards/flashcardConfig";

/**
 * Configuration for streak notifications
 */
export interface StreakNotificationConfig {
	/** Whether to show streak milestone notifications */
	enabled: boolean;
	/** Duration in milliseconds to show the notification (0 = until dismissed) */
	duration: number;
}

/**
 * Default notification configuration
 */
const DEFAULT_CONFIG: StreakNotificationConfig = {
	enabled: true,
	duration: 8000, // 8 seconds for milestone celebrations
};

/**
 * StreakNotificationService manages streak milestone detection and celebration
 */
export default class StreakNotificationService {
	private readonly statisticsService: StatisticsService;
	private readonly config: StreakNotificationConfig;
	private lastKnownStreak: number = 0;

	constructor(
		statisticsService: StatisticsService,
		config: Partial<StreakNotificationConfig> = {}
	) {
		this.statisticsService = statisticsService;
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Initialize the service by loading the current streak
	 * Should be called when the plugin loads
	 */
	async initialize(): Promise<void> {
		try {
			const { current } = await this.statisticsService.calculateStreak();
			this.lastKnownStreak = current;
		} catch (error) {
			console.error("Error initializing streak notification service:", error);
			this.lastKnownStreak = 0;
		}
	}

	/**
	 * Check for streak milestone achievements after a session completes
	 * Should be called after each review session
	 *
	 * @returns The milestone achievement if one was reached, null otherwise
	 */
	async checkAndNotifyMilestone(): Promise<StreakMilestoneAchievement | null> {
		if (!this.config.enabled) {
			return null;
		}

		try {
			// Calculate current streak
			const { current: currentStreak } = await this.statisticsService.calculateStreak();

			// Check if a milestone was achieved
			const milestone = this.statisticsService.checkStreakMilestone(
				this.lastKnownStreak,
				currentStreak
			);

			// Update last known streak
			this.lastKnownStreak = currentStreak;

			// Show celebration if milestone reached
			if (milestone) {
				this.showMilestoneCelebration(milestone);
			}

			return milestone;
		} catch (error) {
			console.error("Error checking streak milestone:", error);
			return null;
		}
	}

	/**
	 * Display a celebration notification for a streak milestone
	 *
	 * @param achievement - The milestone achievement to celebrate
	 */
	private showMilestoneCelebration(achievement: StreakMilestoneAchievement): void {
		const { milestone } = achievement;
		const message = this.getMilestoneMessage(milestone);
		const icon = this.getMilestoneIcon(milestone);

		// Create rich celebration notice
		const noticeMessage = `${icon} ${message}`;
		new Notice(noticeMessage, this.config.duration);

		// Log the achievement for debugging
		console.log(`Streak milestone achieved: ${milestone} days`);
	}

	/**
	 * Get celebration message for a specific milestone
	 *
	 * @param milestone - The milestone days
	 * @returns Celebration message
	 */
	private getMilestoneMessage(milestone: number): string {
		switch (milestone) {
			case 7:
				return "Amazing! You've reached a 7-day learning streak! Keep it up!";
			case 30:
				return "Incredible! 30 days of consistent learning! You're building a strong habit!";
			case 100:
				return "Outstanding! 100-day streak achieved! Your dedication is inspiring!";
			case 365:
				return "Legendary! One full year of daily learning! You're a true master of consistency!";
			default:
				return `Congratulations! ${milestone}-day streak achieved!`;
		}
	}

	/**
	 * Get icon/emoji for a specific milestone
	 *
	 * @param milestone - The milestone days
	 * @returns Icon string
	 */
	private getMilestoneIcon(milestone: number): string {
		switch (milestone) {
			case 7:
				return "🔥";
			case 30:
				return "🌟";
			case 100:
				return "💎";
			case 365:
				return "👑";
			default:
				return "🎉";
		}
	}

	/**
	 * Get the user's current streak count
	 *
	 * @returns Current streak in days
	 */
	getCurrentStreak(): number {
		return this.lastKnownStreak;
	}

	/**
	 * Get the next milestone the user is working towards
	 *
	 * @returns Next milestone value or null if all milestones achieved
	 */
	getNextMilestone(): number | null {
		return this.statisticsService.getNextMilestone(this.lastKnownStreak);
	}

	/**
	 * Get progress towards the next milestone as a percentage
	 *
	 * @returns Progress percentage (0-100), or 100 if all milestones achieved
	 */
	getNextMilestoneProgress(): number {
		const nextMilestone = this.getNextMilestone();
		if (!nextMilestone) {
			return 100; // All milestones achieved
		}

		// Find the previous milestone
		const achievedMilestones = this.statisticsService.getAchievedMilestones(this.lastKnownStreak);
		const previousMilestone = achievedMilestones.length > 0
			? Math.max(...achievedMilestones)
			: 0;

		// Calculate progress between previous and next milestone
		const range = nextMilestone - previousMilestone;
		const progress = this.lastKnownStreak - previousMilestone;

		return Math.min(100, Math.max(0, (progress / range) * 100));
	}

	/**
	 * Enable or disable streak notifications
	 *
	 * @param enabled - Whether notifications should be shown
	 */
	setEnabled(enabled: boolean): void {
		this.config.enabled = enabled;
	}
}
