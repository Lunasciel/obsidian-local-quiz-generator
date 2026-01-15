import { PracticeMode } from "../../utils/types";

/**
 * Props for the PracticeModeSelector component
 */
interface PracticeModeSelectorProps {
	/**
	 * Array of available practice modes for selection
	 * If not provided, all practice modes will be available
	 */
	availableModes?: PracticeMode[];

	/**
	 * Currently selected practice mode
	 * Used to highlight the active mode
	 */
	selectedMode?: PracticeMode;

	/**
	 * Callback function when a practice mode is selected
	 * @param mode - The practice mode that was selected
	 */
	onSelect: (mode: PracticeMode) => void;

	/**
	 * Optional last used mode from deck settings
	 * Will be highlighted as "last used" in the UI
	 */
	lastUsedMode?: PracticeMode;

	/**
	 * Whether the selector is disabled
	 */
	disabled?: boolean;
}

/**
 * Practice mode information for display
 */
interface PracticeModeInfo {
	mode: PracticeMode;
	title: string;
	description: string;
	icon: string;
	features: string[];
}

/**
 * PracticeModeSelector Component
 *
 * Provides a UI for selecting practice modes before starting a flashcard review session.
 * Displays available practice modes with descriptions, icons, and feature highlights.
 *
 * Features:
 * - Display all available practice modes with descriptions
 * - Highlight currently selected mode
 * - Show last used mode indicator
 * - Store last used mode in deck settings (handled by parent)
 * - Responsive grid layout for mode cards
 * - Accessible keyboard navigation and ARIA labels
 * - Visual feedback on hover and selection
 *
 * Practice Modes:
 * - STANDARD: Traditional flashcard flip (front → back)
 * - TYPE_ANSWER: Type the answer before revealing
 * - MULTIPLE_CHOICE: Select from multiple options with distractors
 * - CLOZE: Fill in blanks for cloze deletion
 *
 * Requirements addressed:
 * - Requirement 5.6: Allow mode selection and pass to review session
 * - Requirement 5.6: Store last used mode in deck settings
 * - Design requirement: Display available practice modes with descriptions
 *
 * Usage:
 * ```tsx
 * <PracticeModeSelector
 *   availableModes={[PracticeMode.STANDARD, PracticeMode.TYPE_ANSWER]}
 *   selectedMode={currentMode}
 *   onSelect={(mode) => setCurrentMode(mode)}
 *   lastUsedMode={deckSettings?.lastUsedPracticeMode}
 * />
 * ```
 *
 * @param props - The component props
 * @returns A rendered practice mode selector element
 */
const PracticeModeSelector = ({
	availableModes,
	selectedMode,
	onSelect,
	lastUsedMode,
	disabled = false
}: PracticeModeSelectorProps) => {
	/**
	 * Practice mode information mapping
	 */
	const practiceModeInfo: Record<PracticeMode, PracticeModeInfo> = {
		[PracticeMode.STANDARD]: {
			mode: PracticeMode.STANDARD,
			title: "Standard Flashcards",
			description: "Traditional flashcard experience with front and back",
			icon: "🎴",
			features: [
				"Show question first",
				"Reveal answer when ready",
				"Optional hints available",
				"Perfect for quick reviews"
			]
		},
		[PracticeMode.TYPE_ANSWER]: {
			mode: PracticeMode.TYPE_ANSWER,
			title: "Type Answer",
			description: "Type your answer before revealing the correct one",
			icon: "⌨️",
			features: [
				"Active recall practice",
				"Compare your answer",
				"Similarity scoring",
				"Deeper engagement"
			]
		},
		[PracticeMode.MULTIPLE_CHOICE]: {
			mode: PracticeMode.MULTIPLE_CHOICE,
			title: "Multiple Choice",
			description: "Select the correct answer from multiple options",
			icon: "✓",
			features: [
				"Generated distractors",
				"Instant feedback",
				"Recognition practice",
				"Good for testing"
			]
		},
		[PracticeMode.CLOZE]: {
			mode: PracticeMode.CLOZE,
			title: "Cloze Deletion",
			description: "Fill in the blanks for key terms",
			icon: "📝",
			features: [
				"Fill-in-the-blank style",
				"Focus on key terms",
				"Multiple blanks support",
				"Contextual learning"
			]
		}
	};

	/**
	 * Get the list of modes to display
	 * If availableModes is provided, filter to only those modes
	 * Otherwise, show all modes
	 */
	const modesToDisplay = availableModes
		? availableModes.map(mode => practiceModeInfo[mode])
		: Object.values(practiceModeInfo);

	/**
	 * Handle mode selection
	 */
	const handleModeSelect = (mode: PracticeMode) => {
		if (disabled) return;
		onSelect(mode);
	};

	/**
	 * Handle keyboard navigation
	 */
	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, mode: PracticeMode) => {
		if (disabled) return;

		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleModeSelect(mode);
		}
	};

	return (
		<div className="practice-mode-selector-qg">
			<div className="practice-mode-selector-header-qg">
				<h3 className="practice-mode-selector-title-qg">
					Choose Practice Mode
				</h3>
				<p className="practice-mode-selector-subtitle-qg">
					Select how you want to practice these flashcards
				</p>
			</div>

			<div className="practice-mode-grid-qg">
				{modesToDisplay.map((modeInfo) => {
					const isSelected = selectedMode === modeInfo.mode;
					const isLastUsed = lastUsedMode === modeInfo.mode;

					// Build class names
					let cardClassName = "practice-mode-card-qg";
					if (isSelected) {
						cardClassName += " practice-mode-card-selected-qg";
					}
					if (disabled) {
						cardClassName += " practice-mode-card-disabled-qg";
					}

					return (
						<div
							key={modeInfo.mode}
							className={cardClassName}
							onClick={() => handleModeSelect(modeInfo.mode)}
							onKeyDown={(e) => handleKeyDown(e, modeInfo.mode)}
							tabIndex={disabled ? -1 : 0}
							role="button"
							aria-label={`Select ${modeInfo.title} practice mode`}
							aria-pressed={isSelected}
							data-practice-mode={modeInfo.mode}
						>
							{/* Last used indicator */}
							{isLastUsed && !isSelected && (
								<div className="practice-mode-last-used-qg">
									Last Used
								</div>
							)}

							{/* Selected indicator */}
							{isSelected && (
								<div className="practice-mode-selected-indicator-qg">
									✓ Selected
								</div>
							)}

							{/* Mode icon */}
							<div className="practice-mode-icon-qg">
								{modeInfo.icon}
							</div>

							{/* Mode title */}
							<h4 className="practice-mode-title-qg">
								{modeInfo.title}
							</h4>

							{/* Mode description */}
							<p className="practice-mode-description-qg">
								{modeInfo.description}
							</p>

							{/* Mode features */}
							<ul className="practice-mode-features-qg">
								{modeInfo.features.map((feature, index) => (
									<li key={index} className="practice-mode-feature-qg">
										{feature}
									</li>
								))}
							</ul>
						</div>
					);
				})}
			</div>

			{/* Helper text */}
			<div className="practice-mode-selector-footer-qg">
				<p className="practice-mode-selector-hint-qg">
					💡 You can change the practice mode at any time from the deck settings
				</p>
			</div>
		</div>
	);
};

export default PracticeModeSelector;
