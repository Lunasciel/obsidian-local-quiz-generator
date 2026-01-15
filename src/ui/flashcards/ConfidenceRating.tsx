import { useEffect } from "react";
import { ConfidenceRating as ConfidenceRatingEnum } from "../../utils/types";

interface ConfidenceRatingProps {
	/** Callback function when a rating is selected */
	onRate: (rating: ConfidenceRatingEnum) => void;
	/** Optional next interval for each rating (in days) */
	intervals?: {
		again: number;
		hard: number;
		good: number;
		easy: number;
	};
	/** Whether the rating buttons are disabled */
	disabled?: boolean;
}

/**
 * ConfidenceRating component provides buttons for users to rate their
 * confidence level when reviewing flashcards. This implements the SM-2
 * spaced repetition algorithm feedback mechanism.
 *
 * Features:
 * - Four rating levels: Again, Hard, Good, Easy
 * - Keyboard shortcuts (1-4 for ratings)
 * - Optional display of next interval for each rating
 * - Accessible button design with clear visual feedback
 *
 * Requirements satisfied:
 * - 8.1: Present confidence rating options (Again, Hard, Good, Easy)
 * - 8.2: "Again" shows card again within same session
 * - 8.3: "Hard" schedules with minimal interval increase
 * - 8.4: "Good" schedules with moderate interval increase
 * - 8.5: "Easy" schedules with maximum interval increase
 * - 8.6: Prioritize "Again"/"Hard" cards in future sessions
 * - 8.7: Cycle through cards before showing same card again
 */
const ConfidenceRating = ({ onRate, intervals, disabled = false }: ConfidenceRatingProps) => {
	const handleKeyPress = (event: KeyboardEvent) => {
		if (disabled) return;

		switch (event.key) {
			case "1":
				onRate(ConfidenceRatingEnum.AGAIN);
				break;
			case "2":
				onRate(ConfidenceRatingEnum.HARD);
				break;
			case "3":
				onRate(ConfidenceRatingEnum.GOOD);
				break;
			case "4":
				onRate(ConfidenceRatingEnum.EASY);
				break;
		}
	};

	// Set up keyboard shortcuts
	useEffect(() => {
		if (!disabled) {
			window.addEventListener("keydown", handleKeyPress);
			return () => {
				window.removeEventListener("keydown", handleKeyPress);
			};
		}
	}, [disabled, onRate]);

	const formatInterval = (days: number): string => {
		if (days < 1) {
			return "< 1 day";
		} else if (days === 1) {
			return "1 day";
		} else if (days < 30) {
			return `${Math.round(days)} days`;
		} else if (days < 365) {
			const months = Math.round(days / 30);
			return `${months} ${months === 1 ? "month" : "months"}`;
		} else {
			const years = Math.round(days / 365);
			return `${years} ${years === 1 ? "year" : "years"}`;
		}
	};

	return (
		<div className="confidence-rating-qg">
			<button
				className="confidence-button-qg confidence-again-qg"
				onClick={() => onRate(ConfidenceRatingEnum.AGAIN)}
				disabled={disabled}
				aria-label="Again - Show this card again in the same session"
				data-hotkey="1"
			>
				<span className="confidence-label-qg">Again</span>
				{intervals && (
					<span className="confidence-interval-qg">
						{formatInterval(intervals.again)}
					</span>
				)}
				<span className="confidence-hotkey-qg">1</span>
			</button>

			<button
				className="confidence-button-qg confidence-hard-qg"
				onClick={() => onRate(ConfidenceRatingEnum.HARD)}
				disabled={disabled}
				aria-label="Hard - Correct but with difficulty"
				data-hotkey="2"
			>
				<span className="confidence-label-qg">Hard</span>
				{intervals && (
					<span className="confidence-interval-qg">
						{formatInterval(intervals.hard)}
					</span>
				)}
				<span className="confidence-hotkey-qg">2</span>
			</button>

			<button
				className="confidence-button-qg confidence-good-qg"
				onClick={() => onRate(ConfidenceRatingEnum.GOOD)}
				disabled={disabled}
				aria-label="Good - Correct with some thought"
				data-hotkey="3"
			>
				<span className="confidence-label-qg">Good</span>
				{intervals && (
					<span className="confidence-interval-qg">
						{formatInterval(intervals.good)}
					</span>
				)}
				<span className="confidence-hotkey-qg">3</span>
			</button>

			<button
				className="confidence-button-qg confidence-easy-qg"
				onClick={() => onRate(ConfidenceRatingEnum.EASY)}
				disabled={disabled}
				aria-label="Easy - Instantly recalled"
				data-hotkey="4"
			>
				<span className="confidence-label-qg">Easy</span>
				{intervals && (
					<span className="confidence-interval-qg">
						{formatInterval(intervals.easy)}
					</span>
				)}
				<span className="confidence-hotkey-qg">4</span>
			</button>
		</div>
	);
};

export default ConfidenceRating;
