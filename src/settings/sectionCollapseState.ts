/**
 * Section Collapse State Persistence
 *
 * Provides functionality to save and restore the expanded/collapsed state of
 * settings sections across sessions. This improves user experience by remembering
 * their preferred section layout.
 *
 * Task 5.4: Implement section collapse state persistence
 * Task 8: Removed GENERATION_MODE, added ADVANCED_MODES (for future use in Task 10-15)
 * Requirement 6.6: Remember collapsed/expanded state of settings sections across sessions
 */

/**
 * Unique identifiers for each collapsible section in the settings panel.
 * These keys are used to store and retrieve collapse state.
 *
 * Section Order (updated per Task 8):
 * 1. General Settings
 * 2. Model Management (includes Generation Model dropdown)
 * 3. Advanced Modes (will contain Consensus + Council + ModeComparison - Task 10-15)
 * 4. Quiz Generation Options
 * 5. Saving Options
 * 6. Flashcards
 *
 * Note: GENERATION_MODE is deprecated as of Task 8. The section was removed and
 * its model dropdown moved to Model Management. Kept for backwards compatibility
 * with existing user settings.
 */
export const SECTION_IDS = {
	GENERAL: "general",
	MODEL_MANAGEMENT: "modelManagement",
	/**
	 * @deprecated Removed in Task 8. Kept for backwards compatibility with existing settings.
	 * Use ADVANCED_MODES instead for the consolidated advanced generation modes section.
	 */
	GENERATION_MODE: "generationMode",
	/**
	 * New consolidated section for advanced generation modes (Task 10-15).
	 * Will contain ModeComparisonSection, Consensus, and Council settings.
	 */
	ADVANCED_MODES: "advancedModes",
	CONSENSUS: "consensus",
	CONSENSUS_MODELS: "consensusModels",
	CONSENSUS_PARAMETERS: "consensusParameters",
	CONSENSUS_OPTIONS: "consensusOptions",
	COUNCIL: "council",
	COUNCIL_MODELS: "councilModels",
	COUNCIL_CHAIR: "councilChair",
	COUNCIL_PROCESS: "councilProcess",
	COUNCIL_TIMEOUTS: "councilTimeouts",
	COUNCIL_OPTIONS: "councilOptions",
	QUIZ_GENERATION: "quizGeneration",
	SAVING_OPTIONS: "savingOptions",
	FLASHCARDS: "flashcards",
	FLASHCARDS_STORAGE: "flashcardsStorage",
	FLASHCARDS_REVIEW: "flashcardsReview",
	FLASHCARDS_LEARNING: "flashcardsLearning",
} as const;

export type SectionId = typeof SECTION_IDS[keyof typeof SECTION_IDS];

/**
 * Collapse state for all settings sections.
 * Maps section IDs to their expanded state (true = expanded, false = collapsed).
 */
export interface SectionCollapseState {
	[sectionId: string]: boolean;
}

/**
 * Default collapse states for each section.
 * Sections that are most commonly used are expanded by default.
 *
 * Task 8: Added ADVANCED_MODES, CONSENSUS, COUNCIL. Kept GENERATION_MODE for backwards compatibility.
 */
export const DEFAULT_SECTION_COLLAPSE_STATE: SectionCollapseState = {
	[SECTION_IDS.GENERAL]: false,
	[SECTION_IDS.MODEL_MANAGEMENT]: true,
	// Deprecated: GENERATION_MODE - kept for backwards compatibility
	[SECTION_IDS.GENERATION_MODE]: true,
	// New: Advanced Modes section (Task 10-15)
	[SECTION_IDS.ADVANCED_MODES]: true,
	[SECTION_IDS.CONSENSUS]: false,
	[SECTION_IDS.CONSENSUS_MODELS]: false,
	[SECTION_IDS.CONSENSUS_PARAMETERS]: false,
	[SECTION_IDS.CONSENSUS_OPTIONS]: false,
	[SECTION_IDS.COUNCIL]: false,
	[SECTION_IDS.COUNCIL_MODELS]: false,
	[SECTION_IDS.COUNCIL_CHAIR]: false,
	[SECTION_IDS.COUNCIL_PROCESS]: false,
	[SECTION_IDS.COUNCIL_TIMEOUTS]: false,
	[SECTION_IDS.COUNCIL_OPTIONS]: false,
	[SECTION_IDS.QUIZ_GENERATION]: true,
	[SECTION_IDS.SAVING_OPTIONS]: false,
	[SECTION_IDS.FLASHCARDS]: false,
	[SECTION_IDS.FLASHCARDS_STORAGE]: false,
	[SECTION_IDS.FLASHCARDS_REVIEW]: false,
	[SECTION_IDS.FLASHCARDS_LEARNING]: false,
};

/**
 * Get the expanded state for a specific section.
 *
 * @param sectionCollapseState - The collapse state object from settings
 * @param sectionId - The section ID to get state for
 * @returns The expanded state (true = expanded, false = collapsed)
 */
export function getSectionExpanded(
	sectionCollapseState: SectionCollapseState | undefined,
	sectionId: SectionId
): boolean {
	// If no state exists, use default
	if (!sectionCollapseState) {
		return DEFAULT_SECTION_COLLAPSE_STATE[sectionId] ?? false;
	}

	// If section state exists, use it; otherwise use default
	if (sectionId in sectionCollapseState) {
		return sectionCollapseState[sectionId];
	}

	return DEFAULT_SECTION_COLLAPSE_STATE[sectionId] ?? false;
}

/**
 * Update the expanded state for a specific section.
 *
 * @param sectionCollapseState - The current collapse state object
 * @param sectionId - The section ID to update
 * @param expanded - The new expanded state
 * @returns A new collapse state object with the updated state
 */
export function setSectionExpanded(
	sectionCollapseState: SectionCollapseState | undefined,
	sectionId: SectionId,
	expanded: boolean
): SectionCollapseState {
	const currentState = sectionCollapseState ?? {};
	return {
		...currentState,
		[sectionId]: expanded,
	};
}

/**
 * Create a toggle handler for a collapsible section that persists state.
 *
 * @param sectionId - The section ID
 * @param getSectionCollapseState - Function to get current collapse state from settings
 * @param setSectionCollapseState - Function to update collapse state in settings
 * @returns A callback function to be called when section is toggled
 */
export function createSectionToggleHandler(
	sectionId: SectionId,
	getSectionCollapseState: () => SectionCollapseState | undefined,
	setSectionCollapseState: (state: SectionCollapseState) => Promise<void>
): (expanded: boolean) => void {
	return async (expanded: boolean): Promise<void> => {
		const currentState = getSectionCollapseState();
		const newState = setSectionExpanded(currentState, sectionId, expanded);
		await setSectionCollapseState(newState);
	};
}

/**
 * Initialize section collapse state with defaults for any missing sections.
 *
 * @param sectionCollapseState - The current collapse state (may be partial)
 * @returns Complete collapse state with all sections defined
 */
export function initializeSectionCollapseState(
	sectionCollapseState: SectionCollapseState | undefined
): SectionCollapseState {
	if (!sectionCollapseState) {
		return { ...DEFAULT_SECTION_COLLAPSE_STATE };
	}

	// Merge with defaults for any missing sections
	return {
		...DEFAULT_SECTION_COLLAPSE_STATE,
		...sectionCollapseState,
	};
}

/**
 * Migrate deprecated section IDs to their new equivalents.
 *
 * This function handles the migration of collapse state when section IDs are renamed
 * or deprecated. Currently handles:
 * - GENERATION_MODE (deprecated) -> ADVANCED_MODES
 *
 * Task 19: Verify section collapse state persistence
 * Requirements: 7.4
 *
 * @param sectionCollapseState - The current collapse state (may contain deprecated IDs)
 * @returns Migrated collapse state with deprecated IDs converted to new ones
 */
export function migrateSectionCollapseState(
	sectionCollapseState: SectionCollapseState | undefined
): SectionCollapseState {
	if (!sectionCollapseState) {
		return { ...DEFAULT_SECTION_COLLAPSE_STATE };
	}

	const migratedState = { ...sectionCollapseState };

	// Migration: GENERATION_MODE -> ADVANCED_MODES
	// If user had GENERATION_MODE set but ADVANCED_MODES is not set,
	// preserve their preference by copying to ADVANCED_MODES
	if (
		SECTION_IDS.GENERATION_MODE in migratedState &&
		!(SECTION_IDS.ADVANCED_MODES in migratedState)
	) {
		migratedState[SECTION_IDS.ADVANCED_MODES] =
			migratedState[SECTION_IDS.GENERATION_MODE];
	}

	// Merge with defaults for any missing sections
	return {
		...DEFAULT_SECTION_COLLAPSE_STATE,
		...migratedState,
	};
}

/**
 * Full initialization with migration support.
 *
 * Combines migration of deprecated section IDs with initialization of defaults.
 * This should be called when loading settings to ensure:
 * 1. Deprecated section IDs are migrated
 * 2. All section IDs have default values
 *
 * Task 19: Verify section collapse state persistence
 * Requirements: 7.4
 *
 * @param sectionCollapseState - The current collapse state from saved settings
 * @returns Complete, migrated collapse state
 */
export function initializeAndMigrateSectionCollapseState(
	sectionCollapseState: SectionCollapseState | undefined
): SectionCollapseState {
	return migrateSectionCollapseState(sectionCollapseState);
}
