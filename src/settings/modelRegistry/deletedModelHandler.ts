/**
 * Deleted Model Handler
 *
 * Provides graceful handling of deleted model references across the plugin.
 * When models are deleted from the registry but still referenced in settings
 * (main model, consensus, council), this module handles:
 *
 * 1. Validation on settings load - identifies broken references
 * 2. Warning indicators in dropdowns - shows "Model not found" for invalid references
 * 3. Validation results - provides actionable error messages
 * 4. Cleanup utilities - removes broken references from settings
 *
 * Requirements: 8.3, 8.4
 * - 8.3: Handle deleted model references gracefully
 * - 8.4: Display warning indicator and prompt user to select different model
 *
 * @example
 * ```typescript
 * // Validate all model references on settings load
 * const result = validateModelReferences(settings);
 * if (!result.isValid) {
 *   console.warn('Broken model references found:', result.brokenReferences);
 *   // Optionally show notice to user
 *   if (result.brokenReferences.length > 0) {
 *     showDeletedModelWarning(result.brokenReferences);
 *   }
 * }
 *
 * // Clean up broken references
 * const cleanedSettings = cleanupBrokenReferences(settings);
 * ```
 */

import { ModelRegistry, ConsensusModelReference, CouncilModelReference } from "./types";
import { QuizSettings } from "../config";
import { modelExists, getModelById } from "./modelRegistry";

/**
 * Locations where a model can be referenced.
 */
export type ModelReferenceLocation =
	| "main"
	| "consensus"
	| "council"
	| "council-chair";

/**
 * Represents a broken model reference found during validation.
 */
export interface BrokenModelReference {
	/** The ID of the model that could not be found */
	modelId: string;

	/** Where this broken reference was found */
	location: ModelReferenceLocation;

	/** Human-readable description of where the reference was found */
	locationDescription: string;
}

/**
 * Result of validating model references in settings.
 */
export interface ModelReferenceValidationResult {
	/** Whether all model references are valid */
	isValid: boolean;

	/** List of broken references found */
	brokenReferences: BrokenModelReference[];

	/** Summary of validation suitable for logging or display */
	summary: string;

	/** Count of total references checked */
	totalReferencesChecked: number;

	/** Count of valid references found */
	validReferencesCount: number;

	/** Count of broken references found */
	brokenReferencesCount: number;
}

/**
 * Options for the validation function.
 */
export interface ValidationOptions {
	/** Whether to include disabled model references in validation */
	includeDisabled?: boolean;

	/** Whether to validate only specific locations */
	locationsToCheck?: ModelReferenceLocation[];
}

/**
 * Default validation options.
 */
const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
	includeDisabled: true,
	locationsToCheck: ["main", "consensus", "council", "council-chair"],
};

/**
 * Validate all model references in the settings against the registry.
 *
 * This function checks:
 * - The main/active model ID
 * - All consensus model references
 * - All council model references
 * - The council chair model (if configured strategy is used)
 *
 * Requirements: 8.3, 8.4
 *
 * @param settings - The quiz settings containing model references
 * @param options - Optional validation options
 * @returns Validation result with details about any broken references
 *
 * @example
 * ```typescript
 * const result = validateModelReferences(plugin.settings);
 * if (!result.isValid) {
 *   new Notice(`Found ${result.brokenReferencesCount} broken model references. Please check your settings.`);
 * }
 * ```
 */
export function validateModelReferences(
	settings: QuizSettings,
	options: ValidationOptions = DEFAULT_VALIDATION_OPTIONS
): ModelReferenceValidationResult {
	const opts = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
	const registry = settings.modelRegistry;
	const brokenReferences: BrokenModelReference[] = [];
	let totalChecked = 0;
	let validCount = 0;

	// Helper to check if a location should be validated
	const shouldCheck = (location: ModelReferenceLocation): boolean => {
		return !opts.locationsToCheck || opts.locationsToCheck.includes(location);
	};

	// Check main/active model
	if (shouldCheck("main") && settings.activeModelId) {
		totalChecked++;
		if (!modelExists(registry, settings.activeModelId)) {
			brokenReferences.push({
				modelId: settings.activeModelId,
				location: "main",
				locationDescription: "Main Generation Model",
			});
		} else {
			validCount++;
		}
	}

	// Check consensus model references
	if (shouldCheck("consensus") && settings.consensusSettings?.models) {
		for (const ref of settings.consensusSettings.models) {
			// Skip disabled if not including them
			if (!opts.includeDisabled && !ref.enabled) {
				continue;
			}

			totalChecked++;
			if (!modelExists(registry, ref.modelId)) {
				brokenReferences.push({
					modelId: ref.modelId,
					location: "consensus",
					locationDescription: `Consensus Mode Model`,
				});
			} else {
				validCount++;
			}
		}
	}

	// Check council model references
	if (shouldCheck("council") && settings.councilSettings?.models) {
		for (const ref of settings.councilSettings.models) {
			// Skip disabled if not including them
			if (!opts.includeDisabled && !ref.enabled) {
				continue;
			}

			totalChecked++;
			if (!modelExists(registry, ref.modelId)) {
				brokenReferences.push({
					modelId: ref.modelId,
					location: "council",
					locationDescription: `Council Mode Model`,
				});
			} else {
				validCount++;
			}
		}
	}

	// Check council chair model (only for configured strategy)
	if (
		shouldCheck("council-chair") &&
		settings.councilSettings?.chairModel?.selectionStrategy === "configured" &&
		settings.councilSettings.chairModel.configuredChairId
	) {
		totalChecked++;
		const chairId = settings.councilSettings.chairModel.configuredChairId;
		if (!modelExists(registry, chairId)) {
			brokenReferences.push({
				modelId: chairId,
				location: "council-chair",
				locationDescription: "Council Chair Model",
			});
		} else {
			validCount++;
		}
	}

	// Build summary
	const isValid = brokenReferences.length === 0;
	let summary: string;

	if (isValid) {
		summary =
			totalChecked === 0
				? "No model references to validate."
				: `All ${totalChecked} model reference(s) are valid.`;
	} else {
		const locations = [...new Set(brokenReferences.map((r) => r.locationDescription))];
		summary =
			`Found ${brokenReferences.length} broken model reference(s) in: ${locations.join(", ")}. ` +
			`These models may have been deleted from the Model Registry.`;
	}

	return {
		isValid,
		brokenReferences,
		summary,
		totalReferencesChecked: totalChecked,
		validReferencesCount: validCount,
		brokenReferencesCount: brokenReferences.length,
	};
}

/**
 * Check if a specific model ID is still valid in the registry.
 *
 * @param modelId - The model ID to check
 * @param registry - The model registry to check against
 * @returns true if the model exists, false otherwise
 */
export function isModelReferenceValid(
	modelId: string | null | undefined,
	registry: ModelRegistry
): boolean {
	if (!modelId) {
		return true; // null/undefined references are valid (just means "none selected")
	}
	return modelExists(registry, modelId);
}

/**
 * Get display information for a model reference.
 *
 * If the model exists, returns the display name.
 * If the model is deleted, returns a warning indicator with the model ID.
 *
 * Requirements: 8.4 - Display warning indicator for deleted model references
 *
 * @param modelId - The model ID to get display info for
 * @param registry - The model registry to look up the model
 * @returns Object with display text and validity status
 */
export function getModelReferenceDisplayInfo(
	modelId: string | null | undefined,
	registry: ModelRegistry
): {
	displayText: string;
	isValid: boolean;
	isDeleted: boolean;
} {
	if (!modelId) {
		return {
			displayText: "-- No model selected --",
			isValid: true,
			isDeleted: false,
		};
	}

	const model = getModelById(registry, modelId);

	if (model) {
		return {
			displayText: model.displayName,
			isValid: true,
			isDeleted: false,
		};
	}

	// Model not found - return warning indicator
	return {
		displayText: `\u26a0\ufe0f Model not found: ${modelId}`,
		isValid: false,
		isDeleted: true,
	};
}

/**
 * Result of cleaning up broken references.
 */
export interface CleanupResult {
	/** Whether any changes were made */
	hasChanges: boolean;

	/** The cleaned settings (same object reference, mutated) */
	settings: QuizSettings;

	/** List of references that were cleaned up */
	cleanedReferences: BrokenModelReference[];

	/** Summary message describing what was cleaned */
	summary: string;
}

/**
 * Clean up broken model references from settings.
 *
 * This function removes references to models that no longer exist in the registry.
 * Use this after validation to automatically fix broken references.
 *
 * WARNING: This mutates the settings object. Call saveSettings() after to persist.
 *
 * Requirements: 8.3 - Handle deleted model references gracefully
 *
 * @param settings - The quiz settings to clean up (will be mutated)
 * @returns Result describing what was cleaned up
 *
 * @example
 * ```typescript
 * const validation = validateModelReferences(settings);
 * if (!validation.isValid) {
 *   const cleanup = cleanupBrokenReferences(settings);
 *   if (cleanup.hasChanges) {
 *     await plugin.saveSettings();
 *     new Notice(`Cleaned up ${cleanup.cleanedReferences.length} broken model references.`);
 *   }
 * }
 * ```
 */
export function cleanupBrokenReferences(settings: QuizSettings): CleanupResult {
	const registry = settings.modelRegistry;
	const cleanedReferences: BrokenModelReference[] = [];

	// Clean main/active model
	if (settings.activeModelId && !modelExists(registry, settings.activeModelId)) {
		cleanedReferences.push({
			modelId: settings.activeModelId,
			location: "main",
			locationDescription: "Main Generation Model",
		});
		settings.activeModelId = null;
	}

	// Clean consensus model references
	if (settings.consensusSettings?.models) {
		const originalCount = settings.consensusSettings.models.length;
		const validRefs: ConsensusModelReference[] = [];

		for (const ref of settings.consensusSettings.models) {
			if (modelExists(registry, ref.modelId)) {
				validRefs.push(ref);
			} else {
				cleanedReferences.push({
					modelId: ref.modelId,
					location: "consensus",
					locationDescription: "Consensus Mode Model",
				});
			}
		}

		if (validRefs.length !== originalCount) {
			settings.consensusSettings.models = validRefs;
		}
	}

	// Clean council model references
	if (settings.councilSettings?.models) {
		const originalCount = settings.councilSettings.models.length;
		const validRefs: CouncilModelReference[] = [];

		for (const ref of settings.councilSettings.models) {
			if (modelExists(registry, ref.modelId)) {
				validRefs.push(ref);
			} else {
				cleanedReferences.push({
					modelId: ref.modelId,
					location: "council",
					locationDescription: "Council Mode Model",
				});
			}
		}

		if (validRefs.length !== originalCount) {
			settings.councilSettings.models = validRefs;
		}
	}

	// Clean council chair model
	if (
		settings.councilSettings?.chairModel?.selectionStrategy === "configured" &&
		settings.councilSettings.chairModel.configuredChairId
	) {
		const chairId = settings.councilSettings.chairModel.configuredChairId;
		if (!modelExists(registry, chairId)) {
			cleanedReferences.push({
				modelId: chairId,
				location: "council-chair",
				locationDescription: "Council Chair Model",
			});
			// Reset to undefined - user must reconfigure
			settings.councilSettings.chairModel.configuredChairId = undefined;
		}
	}

	// Build summary
	const hasChanges = cleanedReferences.length > 0;
	let summary: string;

	if (hasChanges) {
		const locations = [...new Set(cleanedReferences.map((r) => r.locationDescription))];
		summary = `Removed ${cleanedReferences.length} broken reference(s) from: ${locations.join(", ")}.`;
	} else {
		summary = "No broken references to clean up.";
	}

	return {
		hasChanges,
		settings,
		cleanedReferences,
		summary,
	};
}

/**
 * Get a user-friendly warning message for broken model references.
 *
 * Requirements: 8.4 - Prompt user to select different model
 *
 * @param brokenReferences - List of broken references to generate message for
 * @returns A user-friendly message suitable for display in a Notice
 */
export function getBrokenReferencesWarningMessage(
	brokenReferences: BrokenModelReference[]
): string {
	if (brokenReferences.length === 0) {
		return "";
	}

	if (brokenReferences.length === 1) {
		const ref = brokenReferences[0];
		return (
			`The model "${ref.modelId}" used for ${ref.locationDescription} was not found. ` +
			`It may have been deleted. Please select a different model in Settings.`
		);
	}

	// Multiple broken references
	const locations = [...new Set(brokenReferences.map((r) => r.locationDescription))];
	return (
		`${brokenReferences.length} model(s) were not found. ` +
		`Affected areas: ${locations.join(", ")}. ` +
		`Please update your model selections in Settings.`
	);
}

/**
 * Format broken references for logging or detailed display.
 *
 * @param brokenReferences - List of broken references
 * @returns Formatted string with details about each broken reference
 */
export function formatBrokenReferencesForLog(
	brokenReferences: BrokenModelReference[]
): string {
	if (brokenReferences.length === 0) {
		return "No broken model references found.";
	}

	const lines = [
		`Found ${brokenReferences.length} broken model reference(s):`,
		...brokenReferences.map(
			(ref) => `  - ${ref.locationDescription}: "${ref.modelId}"`
		),
	];

	return lines.join("\n");
}

/**
 * Options for handling broken references on settings load.
 */
export interface OnLoadHandlingOptions {
	/** Whether to log broken references to console */
	logToConsole?: boolean;

	/** Whether to automatically clean up broken references */
	autoCleanup?: boolean;

	/** Callback to show a user-facing warning */
	showWarning?: (message: string) => void;
}

/**
 * Default handling options for settings load.
 */
const DEFAULT_ON_LOAD_OPTIONS: OnLoadHandlingOptions = {
	logToConsole: true,
	autoCleanup: false,
	showWarning: undefined,
};

/**
 * Handle model reference validation on settings load.
 *
 * This is the main entry point for settings load validation.
 * It validates references, optionally cleans them up, and optionally notifies the user.
 *
 * Requirements: 8.3, 8.4
 *
 * @param settings - The loaded settings to validate
 * @param options - Options for how to handle broken references
 * @returns The validation result
 *
 * @example
 * ```typescript
 * // In plugin.loadSettings():
 * const validation = handleModelReferencesOnLoad(this.settings, {
 *   logToConsole: true,
 *   autoCleanup: false,
 *   showWarning: (msg) => new Notice(msg, 8000),
 * });
 *
 * if (!validation.isValid && validation.brokenReferencesCount > 0) {
 *   // User has been warned, they can fix in settings
 * }
 * ```
 */
export function handleModelReferencesOnLoad(
	settings: QuizSettings,
	options: OnLoadHandlingOptions = DEFAULT_ON_LOAD_OPTIONS
): ModelReferenceValidationResult {
	const opts = { ...DEFAULT_ON_LOAD_OPTIONS, ...options };

	// Validate all references
	const validation = validateModelReferences(settings);

	// Log if requested
	if (opts.logToConsole && !validation.isValid) {
		console.warn(
			"[DeletedModelHandler] " + formatBrokenReferencesForLog(validation.brokenReferences)
		);
	}

	// Show warning if callback provided and there are broken references
	if (opts.showWarning && !validation.isValid) {
		const message = getBrokenReferencesWarningMessage(validation.brokenReferences);
		opts.showWarning(message);
	}

	// Auto-cleanup if requested
	if (opts.autoCleanup && !validation.isValid) {
		const cleanup = cleanupBrokenReferences(settings);
		if (cleanup.hasChanges && opts.logToConsole) {
			console.log("[DeletedModelHandler] " + cleanup.summary);
		}
	}

	return validation;
}

/**
 * Check if consensus mode has any broken model references.
 *
 * @param settings - The quiz settings to check
 * @returns true if consensus has broken references, false otherwise
 */
export function consensusHasBrokenReferences(settings: QuizSettings): boolean {
	if (!settings.consensusSettings?.models) {
		return false;
	}

	const registry = settings.modelRegistry;
	return settings.consensusSettings.models.some(
		(ref) => !modelExists(registry, ref.modelId)
	);
}

/**
 * Check if council mode has any broken model references.
 *
 * @param settings - The quiz settings to check
 * @returns true if council has broken references, false otherwise
 */
export function councilHasBrokenReferences(settings: QuizSettings): boolean {
	const registry = settings.modelRegistry;

	// Check council models
	if (settings.councilSettings?.models) {
		const hasBrokenModel = settings.councilSettings.models.some(
			(ref) => !modelExists(registry, ref.modelId)
		);
		if (hasBrokenModel) {
			return true;
		}
	}

	// Check council chair
	if (
		settings.councilSettings?.chairModel?.selectionStrategy === "configured" &&
		settings.councilSettings.chairModel.configuredChairId
	) {
		const chairId = settings.councilSettings.chairModel.configuredChairId;
		if (!modelExists(registry, chairId)) {
			return true;
		}
	}

	return false;
}

/**
 * Get the count of broken references in a specific location.
 *
 * @param settings - The quiz settings to check
 * @param location - The location to count broken references in
 * @returns The number of broken references in that location
 */
export function getBrokenReferenceCount(
	settings: QuizSettings,
	location: ModelReferenceLocation
): number {
	const validation = validateModelReferences(settings, {
		locationsToCheck: [location],
	});
	return validation.brokenReferencesCount;
}
