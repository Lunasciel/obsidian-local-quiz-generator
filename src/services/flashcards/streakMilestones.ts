/**
 * Streak Milestones Service
 *
 * Tracks and manages learning streak milestones and achievements.
 * Implements Requirement 8.1: Learning Streaks feature
 *
 * @module services/flashcards/streakMilestones
 */

import { Notice } from "obsidian";

/**
 * Milestone definitions for learning streaks
 */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const;

/**
 * Type for valid milestone values
 */
export type StreakMilestone = typeof STREAK_MILESTONES[number];

/**
 * Interface for tracking milestone achievements
 */
export interface MilestoneAchievement {
	/** The milestone value (e.g., 7, 30, 100) */
	milestone: StreakMilestone;
	/** Timestamp when this milestone was first achieved */
	achievedAt: number;
	/** Whether a notification has been shown for this milestone */
	notificationShown: boolean;
}

/**
 * Interface for storing milestone data in metadata
 */
export interface MilestoneData {
	/** Array of achieved milestones */
	achievements: MilestoneAchievement[];
	/** Last streak value for which milestones were checked */
	lastCheckedStreak: number;
}

/**
 * Type guard for MilestoneData
 */
export function isMilestoneData(obj: unknown): obj is MilestoneData {
	if (!obj || typeof obj !== "object") return false;
	const data = obj as Record<string, unknown>;
	return (
		Array.isArray(data.achievements) &&
		typeof data.lastCheckedStreak === "number"
	);
}

/**
 * StreakMilestonesService manages learning streak achievements and notifications
 */
export default class StreakMilestonesService {
	/**
	 * Check if a streak value represents a new milestone achievement
	 * @param currentStreak - Current streak count
	 * @param milestoneData - Existing milestone achievement data
	 * @returns Array of newly achieved milestones
	 */
	checkForNewMilestones(
		currentStreak: number,
		milestoneData: MilestoneData
	): StreakMilestone[] {
		const newMilestones: StreakMilestone[] = [];
		const achievedValues = new Set(
			milestoneData.achievements.map((a) => a.milestone)
		);

		for (const milestone of STREAK_MILESTONES) {
			if (currentStreak >= milestone && !achievedValues.has(milestone)) {
				newMilestones.push(milestone);
			}
		}

		return newMilestones;
	}

	/**
	 * Record milestone achievements
	 * @param milestones - Array of milestone values to record
	 * @param milestoneData - Existing milestone data to update
	 * @returns Updated milestone data
	 */
	recordMilestones(
		milestones: StreakMilestone[],
		milestoneData: MilestoneData
	): MilestoneData {
		const now = Date.now();
		const newAchievements = milestones.map((milestone) => ({
			milestone,
			achievedAt: now,
			notificationShown: false,
		}));

		return {
			...milestoneData,
			achievements: [...milestoneData.achievements, ...newAchievements],
		};
	}

	/**
	 * Show celebration notification for achieved milestone
	 * @param milestone - The milestone value achieved
	 * @param enableNotifications - Whether notifications are enabled in settings
	 */
	showMilestoneNotification(
		milestone: StreakMilestone,
		enableNotifications: boolean
	): void {
		if (!enableNotifications) {
			return;
		}

		const messages: Record<StreakMilestone, string> = {
			7: "🔥 Amazing! 7-day streak! You're building a great habit!",
			30: "🎉 Incredible! 30-day streak! You're on fire!",
			100: "⭐ Outstanding! 100-day streak! You're a learning champion!",
			365: "🏆 Legendary! 365-day streak! A full year of dedication!",
		};

		const message = messages[milestone];
		new Notice(message, 8000);
	}

	/**
	 * Mark milestone notifications as shown
	 * @param milestones - Array of milestones to mark as shown
	 * @param milestoneData - Existing milestone data to update
	 * @returns Updated milestone data
	 */
	markNotificationsShown(
		milestones: StreakMilestone[],
		milestoneData: MilestoneData
	): MilestoneData {
		const milestoneSet = new Set(milestones);
		const updatedAchievements = milestoneData.achievements.map((achievement) => {
			if (milestoneSet.has(achievement.milestone)) {
				return { ...achievement, notificationShown: true };
			}
			return achievement;
		});

		return {
			...milestoneData,
			achievements: updatedAchievements,
		};
	}

	/**
	 * Get pending notifications (milestones achieved but not yet shown)
	 * @param milestoneData - Milestone data to check
	 * @returns Array of milestones that need notification
	 */
	getPendingNotifications(milestoneData: MilestoneData): StreakMilestone[] {
		return milestoneData.achievements
			.filter((a) => !a.notificationShown)
			.map((a) => a.milestone)
			.sort((a, b) => a - b); // Show in ascending order
	}

	/**
	 * Get the next milestone to achieve
	 * @param currentStreak - Current streak count
	 * @param milestoneData - Existing milestone data
	 * @returns Next milestone value or null if all achieved
	 */
	getNextMilestone(
		currentStreak: number,
		milestoneData: MilestoneData
	): StreakMilestone | null {
		const achievedValues = new Set(
			milestoneData.achievements.map((a) => a.milestone)
		);

		for (const milestone of STREAK_MILESTONES) {
			if (currentStreak < milestone && !achievedValues.has(milestone)) {
				return milestone;
			}
		}

		return null; // All milestones achieved
	}

	/**
	 * Create empty milestone data
	 * @returns Empty milestone data structure
	 */
	createEmptyMilestoneData(): MilestoneData {
		return {
			achievements: [],
			lastCheckedStreak: 0,
		};
	}

	/**
	 * Get achievement summary text for UI display
	 * @param milestoneData - Milestone data
	 * @returns Human-readable summary
	 */
	getAchievementSummary(milestoneData: MilestoneData): string {
		const achievedCount = milestoneData.achievements.length;
		const totalCount = STREAK_MILESTONES.length;

		if (achievedCount === 0) {
			return "No milestones achieved yet";
		}

		if (achievedCount === totalCount) {
			return `All ${totalCount} milestones achieved! 🏆`;
		}

		return `${achievedCount} of ${totalCount} milestones achieved`;
	}

	/**
	 * Format milestone for display
	 * @param milestone - Milestone value
	 * @returns Formatted string with emoji
	 */
	formatMilestone(milestone: StreakMilestone): string {
		const emojis: Record<StreakMilestone, string> = {
			7: "🔥",
			30: "🎉",
			100: "⭐",
			365: "🏆",
		};

		return `${emojis[milestone]} ${milestone} days`;
	}
}
