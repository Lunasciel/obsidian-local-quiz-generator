/**
 * Advanced Modes Module
 *
 * Provides consolidated settings UI for advanced generation modes (Consensus and Council).
 * This module contains:
 * - advancedModesSettings.ts - Main settings display function with ModeComparisonSection
 * - impactEstimateComponent.ts - Reusable cost/time impact display (Task 11)
 *
 * Task 10: Create Advanced Modes settings directory structure
 * Task 11: Create ImpactEstimateComponent
 * Task 12: Implement consolidated Advanced Modes section
 * Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

// Re-export from advancedModesSettings
export {
	// Types and Interfaces
	type AdvancedModesSettingsContext,

	// Constants
	SECTION_HEADING,
	SECTION_DESCRIPTION,
	SECTION_HELP_TOOLTIP,
	NO_MODELS_MESSAGE,

	// Helper Functions
	createToggleHandler,
	isModified,
	addModifiedIndicator,

	// Impact Calculation Functions (Task 12)
	calculateConsensusImpact,
	calculateCouncilImpact,

	// Main Display Functions
	displayAdvancedModesSettings,
	displayAdvancedModes,
} from "./advancedModesSettings";

// Re-export from impactEstimateComponent (Task 11)
export {
	// Types and Interfaces
	type ImpactEstimateConfig,
	type ImpactLevel,

	// Constants
	MAX_DOTS,
	IMPACT_THRESHOLDS,
	DEFAULT_WARNING_THRESHOLD,
	DEFAULT_WARNING_MESSAGE,
	COST_TOOLTIP,
	TIME_TOOLTIP,
	ARIA_LABELS,

	// Helper Functions
	getImpactLevel,
	calculateFilledDots,
	formatWarningMessage,
	getImpactLevelLabel,

	// Component Class
	ImpactEstimateComponent,

	// Factory Function
	createImpactEstimateComponent,
} from "./impactEstimateComponent";

// Default export for convenience
export { default } from "./advancedModesSettings";
