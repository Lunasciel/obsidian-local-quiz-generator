import MetadataStorage from "./metadataStorage";
import {
	Deck,
	FlashcardMetadata,
	StudySession,
	MasteryLevel,
	ConfidenceRating,
} from "../../utils/types";
import { STREAK_MILESTONES, StreakMilestone } from "../../settings/flashcards/flashcardConfig";

/**
 * Daily statistics for review activity tracking
 */
export interface DailyStats {
	/** ISO date string (YYYY-MM-DD) */
	date: string;
	/** Total cards reviewed on this day */
	cardsReviewed: number;
	/** Number of correct responses (not AGAIN) */
	correctCount: number;
	/** Number of AGAIN responses */
	againCount: number;
	/** Total time spent reviewing in milliseconds */
	timeSpentMs: number;
	/** Number of new cards introduced */
	newCardsLearned: number;
}

/**
 * Statistics for a specific deck
 */
export interface DeckStatsExtended {
	/** Deck identifier */
	deckId: string;
	/** Deck name for display */
	deckName: string;
	/** Total number of cards in the deck */
	totalCards: number;
	/** Number of cards due for review */
	cardsDue: number;
	/** Number of mastered cards */
	cardsMastered: number;
	/** Number of struggling cards (ease < 2.0) */
	cardsStruggling: number;
	/** Average ease factor across all cards */
	averageEase: number;
	/** Average interval in days */
	averageInterval: number;
	/** Retention rate as percentage (correct over last 30 days) */
	retentionRate: number;
	/** Last review timestamp */
	lastReviewed: number;
}

/**
 * Goal progress tracking
 */
export interface GoalProgress {
	/** Daily card review goal */
	dailyCardGoal: number;
	/** Cards reviewed today */
	cardsReviewedToday: number;
	/** Daily time goal in minutes */
	dailyTimeGoal: number;
	/** Time spent today in minutes */
	timeSpentToday: number;
	/** Whether daily card goal is met */
	cardGoalMet: boolean;
	/** Whether daily time goal is met */
	timeGoalMet: boolean;
}

/**
 * Streak milestone achievement
 * Requirement 8.1: Track streak milestones
 */
export interface StreakMilestoneAchievement {
	/** The milestone that was achieved */
	milestone: StreakMilestone;
	/** Whether this is a new achievement (not previously reached) */
	isNew: boolean;
	/** Timestamp when milestone was reached */
	achievedAt: number;
}

/**
 * Global statistics across all decks
 */
export interface GlobalStats {
	/** Total number of decks */
	totalDecks: number;
	/** Total number of cards across all decks */
	totalCards: number;
	/** Total lifetime reviews */
	totalReviews: number;
	/** Current streak in consecutive days */
	currentStreak: number;
	/** Longest streak ever achieved */
	longestStreak: number;
	/** Daily statistics history */
	dailyStats: DailyStats[];
	/** Progress toward learning goals */
	goalProgress: GoalProgress;
	/** Total mastered cards */
	totalMastered: number;
	/** Overall retention rate */
	overallRetention: number;
}

/**
 * StatisticsService tracks and computes learning statistics across all decks
 * Implements Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */
export default class StatisticsService {
	private readonly metadataStorage: MetadataStorage;

	/** Default daily card goal */
	private static readonly DEFAULT_DAILY_CARD_GOAL = 20;

	/** Default daily time goal in minutes */
	private static readonly DEFAULT_DAILY_TIME_GOAL = 15;

	/** Threshold ease factor for struggling cards */
	private static readonly STRUGGLING_EASE_THRESHOLD = 2.0;

	/** Number of days for retention rate calculation */
	private static readonly RETENTION_WINDOW_DAYS = 30;

	constructor(metadataStorage: MetadataStorage) {
		this.metadataStorage = metadataStorage;
	}

	/**
	 * Get global statistics across all decks
	 * @returns Global statistics including totals, streaks, and goal progress
	 */
	async getGlobalStats(): Promise<GlobalStats> {
		try {
			const store = await this.metadataStorage.loadMetadata();
			const allDeckStats = await this.getAllDeckStats();
			const { current, longest } = await this.calculateStreak();
			const dailyStats = await this.getDailyStatsHistory(90);
			const goalProgress = await this.calculateGoalProgress(store.sessions);

			// Calculate totals
			const totalCards = allDeckStats.reduce((sum, deck) => sum + deck.totalCards, 0);
			const totalMastered = allDeckStats.reduce((sum, deck) => sum + deck.cardsMastered, 0);
			const totalReviews = store.sessions.reduce((sum, session) => sum + session.cardsReviewed, 0);

			// Calculate overall retention rate
			const overallRetention = this.calculateOverallRetention(store.cards);

			return {
				totalDecks: store.decks.size,
				totalCards,
				totalReviews,
				currentStreak: current,
				longestStreak: longest,
				dailyStats,
				goalProgress,
				totalMastered,
				overallRetention,
			};
		} catch (error) {
			console.error("Error calculating global stats:", error);
			return this.getEmptyGlobalStats();
		}
	}

	/**
	 * Get statistics for a specific deck
	 * @param deckId - The deck identifier
	 * @returns Deck statistics or null if deck not found
	 */
	async getDeckStats(deckId: string): Promise<DeckStatsExtended | null> {
		try {
			const store = await this.metadataStorage.loadMetadata();
			const deck = store.decks.get(deckId);

			if (!deck) {
				return null;
			}

			return this.calculateDeckStats(deck, store.cards, store.sessions);
		} catch (error) {
			console.error(`Error calculating stats for deck ${deckId}:`, error);
			return null;
		}
	}

	/**
	 * Get statistics for all decks
	 * @returns Array of deck statistics
	 */
	async getAllDeckStats(): Promise<DeckStatsExtended[]> {
		try {
			const store = await this.metadataStorage.loadMetadata();
			const deckStats: DeckStatsExtended[] = [];

			for (const deck of store.decks.values()) {
				const stats = this.calculateDeckStats(deck, store.cards, store.sessions);
				deckStats.push(stats);
			}

			// Sort by last reviewed (most recent first)
			return deckStats.sort((a, b) => b.lastReviewed - a.lastReviewed);
		} catch (error) {
			console.error("Error calculating all deck stats:", error);
			return [];
		}
	}

	/**
	 * Record daily activity from a completed study session
	 * This updates the daily statistics based on session results
	 * @param session - The completed study session
	 */
	async recordDailyActivity(session: StudySession): Promise<void> {
		// The session is already saved by MetadataStorage.saveSession
		// This method is for any additional processing needed
		// Currently, daily stats are computed on-demand from sessions
		// This could be extended to maintain a separate daily stats cache if needed
		console.log(`Recorded activity: ${session.cardsReviewed} cards reviewed`);
	}

	/**
	 * Calculate current and longest streak
	 * @returns Object containing current and longest streak counts
	 */
	async calculateStreak(): Promise<{ current: number; longest: number }> {
		try {
			const store = await this.metadataStorage.loadMetadata();
			const sessions = store.sessions;

			if (sessions.length === 0) {
				return { current: 0, longest: 0 };
			}

			// Get unique dates with activity
			const activeDates = this.getUniqueDates(sessions);

			if (activeDates.length === 0) {
				return { current: 0, longest: 0 };
			}

			// Sort dates in descending order (most recent first)
			activeDates.sort((a, b) => b.localeCompare(a));

			// Calculate current streak
			const today = this.getDateString(Date.now());
			const yesterday = this.getDateString(Date.now() - 24 * 60 * 60 * 1000);

			let currentStreak = 0;
			const mostRecentDate = activeDates[0];

			// Check if streak is active (studied today or yesterday)
			if (mostRecentDate === today || mostRecentDate === yesterday) {
				currentStreak = 1;
				let expectedDate = mostRecentDate === today ? yesterday : this.getPreviousDate(yesterday);

				for (let i = 1; i < activeDates.length; i++) {
					if (activeDates[i] === expectedDate) {
						currentStreak++;
						expectedDate = this.getPreviousDate(expectedDate);
					} else if (activeDates[i] < expectedDate) {
						// Gap in streak
						break;
					}
				}
			}

			// Calculate longest streak
			let longestStreak = 0;
			let tempStreak = 1;

			for (let i = 1; i < activeDates.length; i++) {
				const expectedPrevDate = this.getPreviousDate(activeDates[i - 1]);
				if (activeDates[i] === expectedPrevDate) {
					tempStreak++;
				} else {
					longestStreak = Math.max(longestStreak, tempStreak);
					tempStreak = 1;
				}
			}
			longestStreak = Math.max(longestStreak, tempStreak, currentStreak);

			return { current: currentStreak, longest: longestStreak };
		} catch (error) {
			console.error("Error calculating streak:", error);
			return { current: 0, longest: 0 };
		}
	}

	/**
	 * Get heatmap data for calendar display
	 * @param days - Number of days to retrieve (default: 90)
	 * @returns Map of date strings to review counts
	 */
	async getHeatmapData(days: number = 90): Promise<Map<string, number>> {
		try {
			const store = await this.metadataStorage.loadMetadata();
			const heatmapData = new Map<string, number>();

			// Initialize all days with 0
			const today = Date.now();
			for (let i = 0; i < days; i++) {
				const date = this.getDateString(today - i * 24 * 60 * 60 * 1000);
				heatmapData.set(date, 0);
			}

			// Count reviews per day
			for (const session of store.sessions) {
				const date = this.getDateString(session.startTime);
				if (heatmapData.has(date)) {
					heatmapData.set(date, heatmapData.get(date)! + session.cardsReviewed);
				}
			}

			return heatmapData;
		} catch (error) {
			console.error("Error generating heatmap data:", error);
			return new Map();
		}
	}

	/**
	 * Calculate statistics for a single deck
	 */
	private calculateDeckStats(
		deck: Deck,
		allCards: Map<string, FlashcardMetadata>,
		sessions: StudySession[]
	): DeckStatsExtended {
		const now = Date.now();
		const cardMetadata: FlashcardMetadata[] = [];

		// Collect metadata for cards in this deck
		for (const cardId of deck.cardIds) {
			const metadata = allCards.get(cardId);
			if (metadata) {
				cardMetadata.push(metadata);
			}
		}

		// Calculate basic counts
		const totalCards = deck.cardIds.length;
		const cardsDue = cardMetadata.filter(m => m.dueDate <= now).length;
		const cardsMastered = cardMetadata.filter(m => m.masteryLevel === MasteryLevel.MASTERED).length;
		const cardsStruggling = cardMetadata.filter(
			m => m.easeFactor < StatisticsService.STRUGGLING_EASE_THRESHOLD
		).length;

		// Calculate averages
		const averageEase = cardMetadata.length > 0
			? cardMetadata.reduce((sum, m) => sum + m.easeFactor, 0) / cardMetadata.length
			: 2.5;

		const averageInterval = cardMetadata.length > 0
			? cardMetadata.reduce((sum, m) => sum + m.interval, 0) / cardMetadata.length
			: 0;

		// Calculate retention rate over last 30 days
		const retentionRate = this.calculateDeckRetention(cardMetadata);

		// Get last reviewed timestamp
		const lastReviewed = cardMetadata.reduce(
			(max, m) => Math.max(max, m.lastReviewed),
			0
		);

		return {
			deckId: deck.id,
			deckName: deck.name,
			totalCards,
			cardsDue,
			cardsMastered,
			cardsStruggling,
			averageEase,
			averageInterval,
			retentionRate,
			lastReviewed,
		};
	}

	/**
	 * Calculate retention rate for a deck's cards over the retention window
	 */
	private calculateDeckRetention(cardMetadata: FlashcardMetadata[]): number {
		const windowStart = Date.now() - StatisticsService.RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
		let correctCount = 0;
		let totalCount = 0;

		for (const card of cardMetadata) {
			for (const review of card.reviewHistory) {
				if (review.timestamp >= windowStart) {
					totalCount++;
					if (review.rating !== ConfidenceRating.AGAIN) {
						correctCount++;
					}
				}
			}
		}

		return totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
	}

	/**
	 * Calculate overall retention rate across all cards
	 */
	private calculateOverallRetention(allCards: Map<string, FlashcardMetadata>): number {
		const windowStart = Date.now() - StatisticsService.RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
		let correctCount = 0;
		let totalCount = 0;

		for (const card of allCards.values()) {
			for (const review of card.reviewHistory) {
				if (review.timestamp >= windowStart) {
					totalCount++;
					if (review.rating !== ConfidenceRating.AGAIN) {
						correctCount++;
					}
				}
			}
		}

		return totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
	}

	/**
	 * Get daily statistics history
	 */
	private async getDailyStatsHistory(days: number): Promise<DailyStats[]> {
		const store = await this.metadataStorage.loadMetadata();
		const dailyMap = new Map<string, DailyStats>();

		// Initialize days
		const today = Date.now();
		for (let i = 0; i < days; i++) {
			const date = this.getDateString(today - i * 24 * 60 * 60 * 1000);
			dailyMap.set(date, {
				date,
				cardsReviewed: 0,
				correctCount: 0,
				againCount: 0,
				timeSpentMs: 0,
				newCardsLearned: 0,
			});
		}

		// Aggregate session data
		for (const session of store.sessions) {
			const date = this.getDateString(session.startTime);
			const stats = dailyMap.get(date);

			if (stats) {
				stats.cardsReviewed += session.cardsReviewed;
				stats.correctCount += session.correctCount;
				stats.againCount += session.againCount;
				stats.newCardsLearned += session.newCards;

				if (session.endTime) {
					stats.timeSpentMs += session.endTime - session.startTime;
				}
			}
		}

		// Convert to array and sort by date descending
		return Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));
	}

	/**
	 * Calculate goal progress for today
	 */
	private async calculateGoalProgress(sessions: StudySession[]): Promise<GoalProgress> {
		const today = this.getDateString(Date.now());

		let cardsReviewedToday = 0;
		let timeSpentToday = 0;

		for (const session of sessions) {
			if (this.getDateString(session.startTime) === today) {
				cardsReviewedToday += session.cardsReviewed;
				if (session.endTime) {
					timeSpentToday += (session.endTime - session.startTime) / 1000 / 60; // Convert to minutes
				}
			}
		}

		const dailyCardGoal = StatisticsService.DEFAULT_DAILY_CARD_GOAL;
		const dailyTimeGoal = StatisticsService.DEFAULT_DAILY_TIME_GOAL;

		return {
			dailyCardGoal,
			cardsReviewedToday,
			dailyTimeGoal,
			timeSpentToday,
			cardGoalMet: cardsReviewedToday >= dailyCardGoal,
			timeGoalMet: timeSpentToday >= dailyTimeGoal,
		};
	}

	/**
	 * Get unique dates from sessions
	 */
	private getUniqueDates(sessions: StudySession[]): string[] {
		const dates = new Set<string>();
		for (const session of sessions) {
			dates.add(this.getDateString(session.startTime));
		}
		return Array.from(dates);
	}

	/**
	 * Convert timestamp to date string (YYYY-MM-DD)
	 */
	private getDateString(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toISOString().split("T")[0];
	}

	/**
	 * Get the previous date string
	 */
	private getPreviousDate(dateString: string): string {
		const date = new Date(dateString);
		date.setDate(date.getDate() - 1);
		return date.toISOString().split("T")[0];
	}

	/**
	 * Return empty global stats for error cases
	 */
	private getEmptyGlobalStats(): GlobalStats {
		return {
			totalDecks: 0,
			totalCards: 0,
			totalReviews: 0,
			currentStreak: 0,
			longestStreak: 0,
			dailyStats: [],
			goalProgress: {
				dailyCardGoal: StatisticsService.DEFAULT_DAILY_CARD_GOAL,
				cardsReviewedToday: 0,
				dailyTimeGoal: StatisticsService.DEFAULT_DAILY_TIME_GOAL,
				timeSpentToday: 0,
				cardGoalMet: false,
				timeGoalMet: false,
			},
			totalMastered: 0,
			overallRetention: 0,
		};
	}

	/**
	 * Check if a streak milestone has been achieved
	 * Requirement 8.1: Detect and report streak milestone achievements
	 *
	 * @param previousStreak - The streak count before the current session
	 * @param currentStreak - The current streak count after the session
	 * @returns StreakMilestoneAchievement if a milestone was reached, null otherwise
	 */
	checkStreakMilestone(
		previousStreak: number,
		currentStreak: number
	): StreakMilestoneAchievement | null {
		// Find the highest milestone achieved with current streak
		const currentMilestone = STREAK_MILESTONES
			.filter(m => currentStreak >= m)
			.sort((a, b) => b - a)[0];

		// Find the highest milestone that was achieved with previous streak
		const previousMilestone = STREAK_MILESTONES
			.filter(m => previousStreak >= m)
			.sort((a, b) => b - a)[0];

		// Check if we crossed a new milestone
		if (currentMilestone && currentMilestone !== previousMilestone) {
			return {
				milestone: currentMilestone,
				isNew: true,
				achievedAt: Date.now(),
			};
		}

		return null;
	}

	/**
	 * Get all milestones achieved by a given streak
	 *
	 * @param streak - The streak count to check
	 * @returns Array of all milestone values achieved
	 */
	getAchievedMilestones(streak: number): StreakMilestone[] {
		return STREAK_MILESTONES.filter(m => streak >= m);
	}

	/**
	 * Get the next milestone to achieve
	 *
	 * @param currentStreak - The current streak count
	 * @returns The next milestone value, or null if all milestones are achieved
	 */
	getNextMilestone(currentStreak: number): StreakMilestone | null {
		const nextMilestone = STREAK_MILESTONES.find(m => m > currentStreak);
		return nextMilestone ?? null;
	}
}
