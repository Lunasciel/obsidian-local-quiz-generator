/**
 * Reactive Model Dropdown
 *
 * Provides a factory function to create model selection dropdowns that automatically
 * update when the model registry changes. This enables reactive UI updates without
 * requiring a settings panel refresh or Obsidian restart.
 *
 * The reactive dropdown subscribes to model registry events and updates its options
 * automatically when models are added, updated, or deleted.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 *
 * @example
 * ```typescript
 * const { dropdown, cleanup } = createReactiveModelDropdown({
 *   containerEl,
 *   registry,
 *   currentValue: settings.activeModelId ?? "",
 *   onChange: async (modelId) => {
 *     settings.activeModelId = modelId || null;
 *     await saveSettings();
 *   },
 *   placeholder: "-- Select a model --",
 * });
 *
 * // When the dropdown is no longer needed (e.g., settings panel closed)
 * cleanup();
 * ```
 */

import { DropdownComponent, Setting } from "obsidian";
import {
	ModelConfiguration,
	ModelRegistry,
	formatModelForDisplay,
} from "./types";
import { getAllModels, getModelById } from "./modelRegistry";
import {
	modelRegistryEvents,
	ModelRegistryEventType,
	ModelRegistryEvent,
} from "./eventEmitter";

/**
 * Configuration options for creating a reactive model dropdown.
 */
export interface ReactiveModelDropdownOptions {
	/**
	 * The model registry to get models from.
	 */
	registry: ModelRegistry;

	/**
	 * The currently selected model ID.
	 * Use empty string "" for no selection.
	 */
	currentValue: string;

	/**
	 * Callback invoked when the selected model changes.
	 * The callback receives the model ID, or empty string if placeholder is selected.
	 */
	onChange: (modelId: string) => void | Promise<void>;

	/**
	 * Placeholder text shown when no model is selected.
	 * @default "-- Select a model --"
	 */
	placeholder?: string;

	/**
	 * Whether to include the placeholder option in the dropdown.
	 * @default true
	 */
	includePlaceholder?: boolean;

	/**
	 * Custom formatter for model display text.
	 * @default formatModelForDisplay
	 */
	formatModel?: (model: ModelConfiguration) => string;

	/**
	 * Filter function to exclude certain models from the dropdown.
	 * Return true to include the model, false to exclude.
	 */
	filterModels?: (model: ModelConfiguration) => boolean;

	/**
	 * Text to show when the selected model was deleted.
	 * @default "Model not found"
	 */
	deletedModelText?: string;

	/**
	 * Whether to show a warning indicator when the selected model doesn't exist.
	 * @default true
	 */
	showDeletedModelWarning?: boolean;
}

/**
 * Result of creating a reactive model dropdown.
 */
export interface ReactiveModelDropdownResult {
	/**
	 * The Obsidian DropdownComponent instance.
	 */
	dropdown: DropdownComponent;

	/**
	 * Cleanup function to unsubscribe from events and release resources.
	 * MUST be called when the dropdown is no longer needed to prevent memory leaks.
	 */
	cleanup: () => void;

	/**
	 * Manually refresh the dropdown options.
	 * Useful if you need to force a refresh outside of registry events.
	 */
	refresh: () => void;

	/**
	 * Get the current selected value.
	 */
	getValue: () => string;

	/**
	 * Set the selected value programmatically.
	 */
	setValue: (value: string) => void;
}

/**
 * Default placeholder text for model dropdowns.
 */
export const DEFAULT_PLACEHOLDER = "-- Select a model --";

/**
 * Default text shown when a selected model no longer exists.
 */
export const DEFAULT_DELETED_MODEL_TEXT = "Model not found";

/**
 * Build dropdown options from the model registry.
 *
 * @param registry - The model registry
 * @param options - Configuration options
 * @returns Record of model ID to display text
 */
function buildDropdownOptions(
	registry: ModelRegistry,
	options: ReactiveModelDropdownOptions
): Record<string, string> {
	const dropdownOptions: Record<string, string> = {};

	// Add placeholder option if configured
	if (options.includePlaceholder !== false) {
		dropdownOptions[""] = options.placeholder ?? DEFAULT_PLACEHOLDER;
	}

	// Get all models and apply filter if provided
	let models = getAllModels(registry);
	if (options.filterModels) {
		models = models.filter(options.filterModels);
	}

	// Sort models by display name for consistent ordering
	models.sort((a, b) => a.displayName.localeCompare(b.displayName));

	// Add each model to the dropdown options
	const formatFn = options.formatModel ?? formatModelForDisplay;
	for (const model of models) {
		dropdownOptions[model.id] = formatFn(model);
	}

	return dropdownOptions;
}

/**
 * Check if the current selection is valid (exists in the registry).
 *
 * @param registry - The model registry
 * @param currentValue - The currently selected model ID
 * @returns true if the selection is valid or empty
 */
function isValidSelection(registry: ModelRegistry, currentValue: string): boolean {
	if (currentValue === "") {
		return true;
	}
	return getModelById(registry, currentValue) !== undefined;
}

/**
 * Create a reactive model selection dropdown.
 *
 * This function creates a dropdown that automatically updates its options
 * when the model registry changes. It subscribes to model registry events
 * and refreshes the dropdown whenever models are added, updated, or deleted.
 *
 * IMPORTANT: The cleanup function MUST be called when the dropdown is no longer
 * needed (e.g., when the settings panel is closed) to prevent memory leaks.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 *
 * @param containerEl - The HTML element to render the dropdown into
 * @param options - Configuration options for the dropdown
 * @returns Object containing the dropdown, cleanup function, and utility methods
 *
 * @example
 * ```typescript
 * // Basic usage
 * const { dropdown, cleanup } = createReactiveModelDropdown({
 *   registry: plugin.settings.modelRegistry,
 *   currentValue: plugin.settings.activeModelId ?? "",
 *   onChange: async (modelId) => {
 *     plugin.settings.activeModelId = modelId || null;
 *     await plugin.saveSettings();
 *   },
 * });
 *
 * // With custom filter
 * const { dropdown, cleanup } = createReactiveModelDropdown({
 *   registry,
 *   currentValue: "",
 *   onChange: handleChange,
 *   filterModels: (model) => model.providerConfig.provider === Provider.OPENAI,
 * });
 *
 * // Cleanup when done
 * cleanup();
 * ```
 */
export function createReactiveModelDropdown(
	containerEl: HTMLElement,
	options: ReactiveModelDropdownOptions
): ReactiveModelDropdownResult {
	// Track current value separately to handle deleted models
	let currentValue = options.currentValue;

	// Track if we've been cleaned up
	let isCleanedUp = false;

	// Create the dropdown component
	const dropdown = new DropdownComponent(containerEl);

	/**
	 * Refresh the dropdown options from the registry.
	 */
	const refresh = (): void => {
		if (isCleanedUp) {
			return;
		}

		// Build new options
		const dropdownOptions = buildDropdownOptions(options.registry, options);

		// Check if current selection is still valid
		const validSelection = isValidSelection(options.registry, currentValue);

		// If selection is invalid and we should show a warning, add a special option
		if (!validSelection && currentValue !== "" && options.showDeletedModelWarning !== false) {
			const deletedText = options.deletedModelText ?? DEFAULT_DELETED_MODEL_TEXT;
			dropdownOptions[currentValue] = `\u26a0\ufe0f ${deletedText}: ${currentValue}`;
		}

		// Clear existing options and add new ones
		// Note: Obsidian's DropdownComponent doesn't have a clear method,
		// so we need to rebuild the select element's options
		const selectEl = dropdown.selectEl;
		selectEl.empty();

		for (const [value, text] of Object.entries(dropdownOptions)) {
			// Create option element and set value/text properties directly
			// (can't use createEl with value property since Obsidian's createEl doesn't support it)
			const optionEl = document.createElement("option");
			optionEl.value = value;
			optionEl.text = text;

			// Add warning styling for deleted model option
			if (value === currentValue && !validSelection && value !== "") {
				optionEl.classList.add("model-deleted-warning-qg");
			}

			selectEl.add(optionEl);
		}

		// Set the current value
		dropdown.setValue(validSelection ? currentValue : currentValue);
	};

	/**
	 * Handle registry change events.
	 */
	const handleRegistryChange = (event: ModelRegistryEvent): void => {
		if (isCleanedUp) {
			return;
		}

		// Refresh dropdown options
		refresh();

		// If the current selection was deleted, we keep showing it with a warning
		// The onChange callback is NOT triggered automatically - user must explicitly select a new model
		// This follows Requirement 8.4: display warning indicator for deleted model references
	};

	// Subscribe to registry events
	const unsubscribe = modelRegistryEvents.on("registry-changed", handleRegistryChange);

	// Set up the dropdown
	refresh();
	dropdown.setValue(currentValue);
	dropdown.onChange((value) => {
		if (isCleanedUp) {
			return;
		}
		currentValue = value;
		options.onChange(value);
	});

	/**
	 * Cleanup function to unsubscribe and release resources.
	 */
	const cleanup = (): void => {
		if (isCleanedUp) {
			return;
		}
		isCleanedUp = true;
		unsubscribe();
	};

	/**
	 * Get the current selected value.
	 */
	const getValue = (): string => {
		return currentValue;
	};

	/**
	 * Set the selected value programmatically.
	 */
	const setValue = (value: string): void => {
		if (isCleanedUp) {
			return;
		}
		currentValue = value;
		dropdown.setValue(value);
		refresh();
	};

	return {
		dropdown,
		cleanup,
		refresh,
		getValue,
		setValue,
	};
}

/**
 * Configuration options for creating a reactive model dropdown with Setting.
 */
export interface ReactiveModelSettingOptions extends ReactiveModelDropdownOptions {
	/**
	 * The name/title of the setting.
	 */
	name: string;

	/**
	 * The description text for the setting.
	 */
	description: string;
}

/**
 * Result of creating a reactive model setting.
 */
export interface ReactiveModelSettingResult extends ReactiveModelDropdownResult {
	/**
	 * The Obsidian Setting component.
	 */
	setting: Setting;
}

/**
 * Create a reactive model dropdown within an Obsidian Setting component.
 *
 * This is a convenience wrapper that creates a Setting with a reactive dropdown,
 * handling the integration between Obsidian's Setting API and the reactive dropdown.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 *
 * @param containerEl - The HTML element to render the setting into
 * @param options - Configuration options including setting name and description
 * @returns Object containing the setting, dropdown, cleanup function, and utility methods
 *
 * @example
 * ```typescript
 * const { setting, dropdown, cleanup } = createReactiveModelSetting(containerEl, {
 *   name: "Generation Model",
 *   description: "Select the model to use for quiz generation.",
 *   registry: plugin.settings.modelRegistry,
 *   currentValue: plugin.settings.activeModelId ?? "",
 *   onChange: async (modelId) => {
 *     plugin.settings.activeModelId = modelId || null;
 *     await plugin.saveSettings();
 *   },
 * });
 *
 * // Cleanup when settings panel closes
 * cleanup();
 * ```
 */
export function createReactiveModelSetting(
	containerEl: HTMLElement,
	options: ReactiveModelSettingOptions
): ReactiveModelSettingResult {
	// Track cleanup state
	let isCleanedUp = false;
	let dropdownResult: ReactiveModelDropdownResult | null = null;

	// Create the setting
	const setting = new Setting(containerEl)
		.setName(options.name)
		.setDesc(options.description)
		.addDropdown((dropdown) => {
			// Create the reactive dropdown in the dropdown callback
			// Note: We need to use the dropdown's containerEl (the control container)
			// But since addDropdown already creates the dropdown, we work with it directly

			// Get the parent element of the dropdown's select element
			const selectEl = dropdown.selectEl;

			// Build and set initial options
			const dropdownOptions = buildDropdownOptions(options.registry, options);
			dropdown.addOptions(dropdownOptions);

			// Set initial value
			const validSelection = isValidSelection(options.registry, options.currentValue);
			dropdown.setValue(validSelection ? options.currentValue : options.currentValue);

			// Handle changes
			let currentValue = options.currentValue;
			dropdown.onChange((value) => {
				if (isCleanedUp) {
					return;
				}
				currentValue = value;
				options.onChange(value);
			});

			// Subscribe to registry events
			const handleRegistryChange = (event: ModelRegistryEvent): void => {
				if (isCleanedUp) {
					return;
				}

				// Build new options
				const newOptions = buildDropdownOptions(options.registry, options);

				// Check if current selection is still valid
				const stillValid = isValidSelection(options.registry, currentValue);

				// Add warning option for deleted model
				if (!stillValid && currentValue !== "" && options.showDeletedModelWarning !== false) {
					const deletedText = options.deletedModelText ?? DEFAULT_DELETED_MODEL_TEXT;
					newOptions[currentValue] = `\u26a0\ufe0f ${deletedText}: ${currentValue}`;
				}

				// Update the select element
				selectEl.empty();
				for (const [value, text] of Object.entries(newOptions)) {
					const optionEl = document.createElement("option");
					optionEl.value = value;
					optionEl.text = text;
					if (value === currentValue && !stillValid && value !== "") {
						optionEl.classList.add("model-deleted-warning-qg");
					}
					selectEl.add(optionEl);
				}

				// Restore the selected value
				dropdown.setValue(currentValue);
			};

			const unsubscribe = modelRegistryEvents.on("registry-changed", handleRegistryChange);

			// Store result for external access
			dropdownResult = {
				dropdown,
				cleanup: () => {
					if (!isCleanedUp) {
						isCleanedUp = true;
						unsubscribe();
					}
				},
				refresh: () => {
					if (!isCleanedUp) {
						handleRegistryChange({
							type: "registry-changed",
							modelId: "",
							timestamp: Date.now(),
						});
					}
				},
				getValue: () => currentValue,
				setValue: (value: string) => {
					if (!isCleanedUp) {
						currentValue = value;
						dropdown.setValue(value);
					}
				},
			};
		});

	// Return the combined result
	// We need to handle the case where addDropdown hasn't completed yet
	// Use non-null assertion since addDropdown is synchronous and always executes the callback
	const finalResult = dropdownResult!;
	if (!finalResult) {
		// This shouldn't happen with Obsidian's synchronous addDropdown
		throw new Error("Failed to create reactive model dropdown - addDropdown callback not executed");
	}

	// TypeScript needs explicit extraction to avoid spread issues
	const result: ReactiveModelSettingResult = {
		setting,
		dropdown: finalResult.dropdown,
		cleanup: finalResult.cleanup,
		refresh: finalResult.refresh,
		getValue: finalResult.getValue,
		setValue: finalResult.setValue,
	};

	return result;
}

/**
 * Helper type for tracking multiple reactive dropdowns.
 * Useful when you have multiple dropdowns that need cleanup together.
 */
export interface ReactiveDropdownManager {
	/**
	 * Add a dropdown to be managed.
	 */
	add(result: ReactiveModelDropdownResult): void;

	/**
	 * Cleanup all managed dropdowns.
	 */
	cleanupAll(): void;

	/**
	 * Refresh all managed dropdowns.
	 */
	refreshAll(): void;

	/**
	 * Get the count of managed dropdowns.
	 */
	count(): number;
}

/**
 * Create a manager for multiple reactive dropdowns.
 *
 * This is useful when you have multiple dropdowns on a settings page
 * that all need to be cleaned up when the page is closed.
 *
 * @returns A manager object for tracking and cleaning up multiple dropdowns
 *
 * @example
 * ```typescript
 * const manager = createReactiveDropdownManager();
 *
 * const mainDropdown = createReactiveModelDropdown(container1, options1);
 * manager.add(mainDropdown);
 *
 * const consensusDropdown = createReactiveModelDropdown(container2, options2);
 * manager.add(consensusDropdown);
 *
 * // Later, when settings panel closes
 * manager.cleanupAll();
 * ```
 */
export function createReactiveDropdownManager(): ReactiveDropdownManager {
	const dropdowns: ReactiveModelDropdownResult[] = [];

	return {
		add(result: ReactiveModelDropdownResult): void {
			dropdowns.push(result);
		},

		cleanupAll(): void {
			for (const dropdown of dropdowns) {
				dropdown.cleanup();
			}
			dropdowns.length = 0; // Clear the array
		},

		refreshAll(): void {
			for (const dropdown of dropdowns) {
				dropdown.refresh();
			}
		},

		count(): number {
			return dropdowns.length;
		},
	};
}
