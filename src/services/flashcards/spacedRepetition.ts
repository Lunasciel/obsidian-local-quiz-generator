import {
	FlashcardMetadata,
	ConfidenceRating,
	MasteryLevel,
	ReviewRecord,
	PracticeMode
} from "../../utils/types";

/**
 * SpacedRepetition implements the SM-2 (SuperMemo 2) algorithm for optimal review scheduling.
 *
 * The SM-2 algorithm uses the following formula:
 * - I(1) = 1 day (first interval)
 * - I(2) = 6 days (second interval)
 * - I(n) = I(n-1) * EF (subsequent intervals)
 *
 * Where EF (Ease Factor) is calculated based on performance ratings and starts at 2.5
 *
 * References:
 * - Original SM-2 algorithm: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */
export default class SpacedRepetition {
	/**
	 * Default ease factor for new cards (SM-2 standard)
	 */
	private static readonly DEFAULT_EASE_FACTOR = 2.5;

	/**
	 * Minimum allowed ease factor to prevent cards from becoming too difficult
	 */
	private static readonly MIN_EASE_FACTOR = 1.3;

	/**
	 * Maximum ease factor to keep intervals reasonable
	 */
	private static readonly MAX_EASE_FACTOR = 3.5;

	/**
	 * First interval in days (SM-2 standard)
	 */
	private static readonly FIRST_INTERVAL = 1;

	/**
	 * Second interval in days (SM-2 standard)
	 */
	private static readonly SECOND_INTERVAL = 6;

	/**
	 * Minimum interval for "Again" ratings (immediate review)
	 */
	private static readonly AGAIN_INTERVAL = 1;

	/**
	 * Number of consecutive successful reviews required for mastery
	 */
	private static readonly MASTERY_THRESHOLD = 3;

	/**
	 * Minimum interval (in days) required for mastery consideration
	 */
	private static readonly MASTERY_MIN_INTERVAL = 21;

	/**
	 * Initialize metadata for a new flashcard
	 * @param cardId - Unique identifier for the card
	 * @returns New metadata with default values
	 */
	static initializeMetadata(cardId: string): FlashcardMetadata {
		return {
			id: cardId,
			repetitions: 0,
			interval: 0,
			easeFactor: this.DEFAULT_EASE_FACTOR,
			dueDate: Date.now(), // Due immediately for new cards
			lastReviewed: 0,
			masteryLevel: MasteryLevel.NEW,
			reviewHistory: [],
			practiceMode: undefined
		};
	}

	/**
	 * Calculate next review interval and update metadata based on SM-2 algorithm
	 * @param metadata - Current card metadata
	 * @param rating - User's confidence rating
	 * @param timeSpent - Time spent on this review in milliseconds
	 * @param mode - Practice mode used for this review
	 * @returns Updated metadata with new interval and due date
	 */
	static calculateNextReview(
		metadata: FlashcardMetadata,
		rating: ConfidenceRating,
		timeSpent: number = 0,
		mode: PracticeMode = PracticeMode.STANDARD
	): FlashcardMetadata {
		const now = Date.now();

		// Create a copy to avoid mutating the original
		const updated: FlashcardMetadata = {
			...metadata,
			lastReviewed: now,
			practiceMode: mode
		};

		// Add review record to history
		const reviewRecord: ReviewRecord = {
			timestamp: now,
			rating,
			mode,
			timeSpent
		};
		updated.reviewHistory = [...metadata.reviewHistory, reviewRecord];

		// Calculate new ease factor based on rating
		updated.easeFactor = this.calculateEaseFactor(metadata.easeFactor, rating);

		// Calculate new interval based on rating and repetitions
		if (rating === ConfidenceRating.AGAIN) {
			// Failed review - reset progress
			updated.repetitions = 0;
			updated.interval = this.AGAIN_INTERVAL;
		} else {
			// Successful review - increase repetitions
			updated.repetitions = metadata.repetitions + 1;
			updated.interval = this.calculateInterval(
				updated.repetitions,
				metadata.interval,
				updated.easeFactor,
				rating
			);
		}

		// Calculate next due date
		updated.dueDate = now + (updated.interval * 24 * 60 * 60 * 1000);

		// Update mastery level based on performance
		updated.masteryLevel = this.updateMasteryLevel(updated);

		return updated;
	}

	/**
	 * Calculate new ease factor based on performance rating
	 * Uses SM-2 formula: EF' = EF + (0.1 - (3 - q) * (0.08 + (3 - q) * 0.02))
	 * Where q is the quality of answer (0-5, mapped from our ConfidenceRating)
	 *
	 * @param currentEF - Current ease factor
	 * @param rating - Confidence rating
	 * @returns New ease factor (clamped between MIN and MAX)
	 */
	private static calculateEaseFactor(
		currentEF: number,
		rating: ConfidenceRating
	): number {
		// Map our 0-3 rating to SM-2's 0-5 quality scale
		// AGAIN (0) -> q=0, HARD (1) -> q=3, GOOD (2) -> q=4, EASY (3) -> q=5
		const qualityMap: Record<ConfidenceRating, number> = {
			[ConfidenceRating.AGAIN]: 0,
			[ConfidenceRating.HARD]: 3,
			[ConfidenceRating.GOOD]: 4,
			[ConfidenceRating.EASY]: 5
		};

		const quality = qualityMap[rating];

		// SM-2 formula for ease factor adjustment
		const newEF = currentEF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

		// Clamp between MIN and MAX ease factors
		return Math.max(this.MIN_EASE_FACTOR, Math.min(this.MAX_EASE_FACTOR, newEF));
	}

	/**
	 * Calculate the next interval based on SM-2 algorithm
	 * @param repetitions - Number of successful repetitions
	 * @param previousInterval - Previous interval in days
	 * @param easeFactor - Current ease factor
	 * @param rating - Confidence rating
	 * @returns New interval in days
	 */
	private static calculateInterval(
		repetitions: number,
		previousInterval: number,
		easeFactor: number,
		rating: ConfidenceRating
	): number {
		// Special handling for first two repetitions (SM-2 standard)
		if (repetitions === 1) {
			return this.FIRST_INTERVAL;
		} else if (repetitions === 2) {
			return this.SECOND_INTERVAL;
		}

		// For subsequent repetitions, use standard SM-2 formula
		let interval = previousInterval * easeFactor;

		// Apply multiplier based on rating to fine-tune intervals
		switch (rating) {
			case ConfidenceRating.HARD:
				// Minimal increase for hard cards
				interval = previousInterval * 1.2;
				break;
			case ConfidenceRating.GOOD:
				// Standard SM-2 interval
				interval = previousInterval * easeFactor;
				break;
			case ConfidenceRating.EASY:
				// Bonus multiplier for easy cards
				interval = previousInterval * easeFactor * 1.3;
				break;
		}

		// Round to nearest day and ensure at least 1 day
		return Math.max(1, Math.round(interval));
	}

	/**
	 * Update mastery level based on review performance
	 *
	 * Transitions:
	 * - NEW -> LEARNING: After first successful review
	 * - LEARNING -> MASTERED: After MASTERY_THRESHOLD consecutive successful reviews
	 *   with interval >= MASTERY_MIN_INTERVAL
	 * - MASTERED -> LEARNING: On any "Again" rating
	 *
	 * @param metadata - Current metadata with updated review history
	 * @returns New mastery level
	 */
	static updateMasteryLevel(metadata: FlashcardMetadata): MasteryLevel {
		const { masteryLevel, repetitions, interval, reviewHistory } = metadata;

		// If marked as "Again" in latest review, demote from MASTERED to LEARNING
		if (reviewHistory.length > 0) {
			const latestReview = reviewHistory[reviewHistory.length - 1];
			if (latestReview.rating === ConfidenceRating.AGAIN) {
				if (masteryLevel === MasteryLevel.MASTERED) {
					return MasteryLevel.LEARNING;
				}
				// Stay in current level if already NEW or LEARNING
				return masteryLevel;
			}
		}

		// Transition from NEW to LEARNING after first successful review
		if (masteryLevel === MasteryLevel.NEW && repetitions >= 1) {
			return MasteryLevel.LEARNING;
		}

		// Transition from LEARNING to MASTERED
		if (masteryLevel === MasteryLevel.LEARNING) {
			// Check if we have enough consecutive successful reviews
			const consecutiveSuccesses = this.getConsecutiveSuccessCount(reviewHistory);

			if (
				consecutiveSuccesses >= this.MASTERY_THRESHOLD &&
				interval >= this.MASTERY_MIN_INTERVAL
			) {
				return MasteryLevel.MASTERED;
			}
		}

		// No change in mastery level
		return masteryLevel;
	}

	/**
	 * Count consecutive successful reviews (non-AGAIN ratings)
	 * @param reviewHistory - Array of review records
	 * @returns Number of consecutive successful reviews
	 */
	private static getConsecutiveSuccessCount(reviewHistory: ReviewRecord[]): number {
		let count = 0;

		// Iterate backwards from most recent review
		for (let i = reviewHistory.length - 1; i >= 0; i--) {
			if (reviewHistory[i].rating === ConfidenceRating.AGAIN) {
				break; // Stop at first failure
			}
			count++;
		}

		return count;
	}

	/**
	 * Get cards that are due for review
	 * @param allMetadata - Array of all flashcard metadata
	 * @param now - Current timestamp (defaults to Date.now())
	 * @returns Cards due for review, sorted by priority (overdue first, then by interval)
	 */
	static getDueCards(
		allMetadata: FlashcardMetadata[],
		now: number = Date.now()
	): FlashcardMetadata[] {
		// Filter cards that are due
		const dueCards = allMetadata.filter(metadata => metadata.dueDate <= now);

		// Sort by priority:
		// 1. More overdue cards first (earlier due date)
		// 2. For equally overdue cards, shorter intervals first (struggling cards)
		return dueCards.sort((a, b) => {
			// Primary sort: due date (earlier = higher priority)
			const dueDateDiff = a.dueDate - b.dueDate;
			if (dueDateDiff !== 0) {
				return dueDateDiff;
			}

			// Secondary sort: interval (shorter = higher priority)
			return a.interval - b.interval;
		});
	}

	/**
	 * Filter cards by mastery level
	 * @param allMetadata - Array of all flashcard metadata
	 * @param level - Mastery level to filter by
	 * @returns Cards matching the specified mastery level
	 */
	static filterByMasteryLevel(
		allMetadata: FlashcardMetadata[],
		level: MasteryLevel
	): FlashcardMetadata[] {
		return allMetadata.filter(metadata => metadata.masteryLevel === level);
	}

	/**
	 * Get cards due for review filtered by mastery level
	 * @param allMetadata - Array of all flashcard metadata
	 * @param level - Mastery level to filter by
	 * @param now - Current timestamp (defaults to Date.now())
	 * @returns Due cards matching the mastery level, sorted by priority
	 */
	static getDueCardsByMasteryLevel(
		allMetadata: FlashcardMetadata[],
		level: MasteryLevel,
		now: number = Date.now()
	): FlashcardMetadata[] {
		const dueCards = this.getDueCards(allMetadata, now);
		return dueCards.filter(metadata => metadata.masteryLevel === level);
	}
}
