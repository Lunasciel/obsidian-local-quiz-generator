import { QuestionConsensusTrail } from "../../consensus/types";

interface ConsensusIndicatorProps {
	/** Consensus trail for this question (if available) */
	consensusTrail?: QuestionConsensusTrail;
	/** Whether to show detailed information */
	showDetailed?: boolean;
}

/**
 * ConsensusIndicator component displays consensus verification status for a quiz question
 *
 * Requirements:
 * - Requirement 6.1: Show consensus summary (e.g., "Verified by 3/3 models")
 * - Requirement 6.5: Display indicators in quiz UI
 *
 * Features:
 * - Shows agreement percentage and model count
 * - Color-coded badges based on consensus strength
 * - Warning for questions that didn't reach full consensus
 * - Compact and detailed display modes
 */
const ConsensusIndicator = ({ consensusTrail, showDetailed = false }: ConsensusIndicatorProps) => {
	// If no consensus trail, don't show anything
	if (!consensusTrail) {
		return null;
	}

	const {
		consensusReached,
		agreementPercentage,
		agreeingModels,
		disagreeingModels,
		roundsRequired
	} = consensusTrail;

	const totalModels = agreeingModels.length + disagreeingModels.length;
	const agreeingCount = agreeingModels.length;
	const percentDisplay = Math.round(agreementPercentage * 100);

	// Determine badge type based on consensus strength
	const getBadgeClass = (): string => {
		if (!consensusReached) {
			return "consensus-indicator-badge consensus-indicator-warning";
		}
		if (agreementPercentage >= 1.0) {
			return "consensus-indicator-badge consensus-indicator-success";
		}
		if (agreementPercentage >= 0.66) {
			return "consensus-indicator-badge consensus-indicator-partial";
		}
		return "consensus-indicator-badge consensus-indicator-warning";
	};

	// Get appropriate icon
	const getIcon = (): string => {
		if (!consensusReached) {
			return "⚠";
		}
		if (agreementPercentage >= 1.0) {
			return "✓";
		}
		return "✓";
	};

	// Get status text
	const getStatusText = (): string => {
		if (!consensusReached) {
			return "No consensus";
		}
		if (agreementPercentage >= 1.0) {
			return "Verified";
		}
		return "Partial consensus";
	};

	return (
		<div className="consensus-indicator-container">
			<div className={getBadgeClass()} title={`${percentDisplay}% agreement after ${roundsRequired} round${roundsRequired !== 1 ? 's' : ''}`}>
				<span className="consensus-indicator-icon">{getIcon()}</span>
				<span className="consensus-indicator-text">
					{getStatusText()} by {agreeingCount}/{totalModels} model{totalModels !== 1 ? 's' : ''}
				</span>
			</div>

			{showDetailed && (
				<div className="consensus-indicator-details">
					<span className="consensus-indicator-detail-item">
						{percentDisplay}% agreement
					</span>
					{roundsRequired > 1 && (
						<span className="consensus-indicator-detail-item">
							{roundsRequired} round{roundsRequired !== 1 ? 's' : ''}
						</span>
					)}
				</div>
			)}

			{!consensusReached && (
				<div className="consensus-indicator-warning-message">
					This question did not reach consensus. Review the audit trail for details.
				</div>
			)}
		</div>
	);
};

export default ConsensusIndicator;
