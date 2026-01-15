/**
 * SettingsStyling - Consistent Styling Utilities for Settings UI
 *
 * Task 18: Apply consistent styling across all sections
 * Requirements: 7.1, 7.2, 7.3, 7.5
 *
 * This module provides reusable utilities and components for maintaining
 * consistent styling across all settings sections in the plugin.
 *
 * Key features:
 * - Modified indicators for settings that differ from defaults
 * - Empty state rendering with consistent styling
 * - Section heading helpers with help icons
 * - CSS class name constants for type safety
 */

import { Setting } from "obsidian";

// ==========================================================================
// CSS Class Name Constants
// ==========================================================================

/**
 * CSS class names for consistent styling throughout settings UI.
 * Using constants prevents typos and enables IDE autocompletion.
 */
export const CSS_CLASSES = {
	// Modified indicators
	MODIFIED_INDICATOR: "modified-indicator-qg",

	// Empty states
	EMPTY_STATE: "settings-empty-state-qg",
	EMPTY_STATE_COMPACT: "settings-empty-state-compact-qg",
	EMPTY_ICON: "empty-icon-qg",
	EMPTY_TITLE: "empty-title-qg",
	EMPTY_DESCRIPTION: "empty-description-qg",
	EMPTY_ACTION: "empty-action-qg",

	// Settings sections
	SETTING_ITEM: "setting-item-qg",
	RESET_BUTTON_CONTAINER: "settings-reset-button-container-qg",

	// Info/help icons (from SettingsHelpText.ts)
	INFO_ICON: "settings-info-icon-qg",
	HELP_BOX: "setting-help-box-qg",
	HELP_TIP: "setting-help-tip-qg",

	// Section styling
	SECTION_DIVIDER: "settings-section-divider-qg",
} as const;

// ==========================================================================
// Modified Indicator Types and Functions
// ==========================================================================

/**
 * Configuration for a modified indicator.
 */
export interface ModifiedIndicatorConfig {
	/** The symbol to display (default: "●") */
	symbol?: string;
	/** Tooltip text explaining that the value differs from default */
	tooltip?: string;
	/** Whether to animate the indicator (default: true) */
	animate?: boolean;
}

/**
 * Default configuration for modified indicators.
 */
const DEFAULT_MODIFIED_CONFIG: Required<ModifiedIndicatorConfig> = {
	symbol: "●",
	tooltip: "Modified from default",
	animate: true,
};

/**
 * Add a modified indicator to a setting when its value differs from the default.
 *
 * The indicator appears as a small pulsing dot next to the setting name,
 * providing visual feedback that the setting has been customized.
 *
 * @param setting - The Obsidian Setting to add the indicator to
 * @param isModified - Whether the setting value differs from the default
 * @param config - Optional configuration for the indicator
 * @returns The indicator element, or null if not modified
 *
 * @example
 * ```typescript
 * const setting = new Setting(containerEl)
 *   .setName("Temperature")
 *   .addSlider(...);
 *
 * addModifiedIndicator(setting, currentTemp !== DEFAULT_TEMP, {
 *   tooltip: "Temperature differs from default (0.7)"
 * });
 * ```
 */
export function addModifiedIndicator(
	setting: Setting,
	isModified: boolean,
	config: ModifiedIndicatorConfig = {}
): HTMLElement | null {
	if (!isModified) {
		return null;
	}

	const mergedConfig = { ...DEFAULT_MODIFIED_CONFIG, ...config };
	const nameEl = setting.settingEl.querySelector(".setting-item-name");

	if (!nameEl) {
		return null;
	}

	// Check if indicator already exists
	const existingIndicator = nameEl.querySelector(`.${CSS_CLASSES.MODIFIED_INDICATOR}`);
	if (existingIndicator) {
		return existingIndicator as HTMLElement;
	}

	const indicator = document.createElement("span");
	indicator.className = CSS_CLASSES.MODIFIED_INDICATOR;
	indicator.textContent = mergedConfig.symbol;
	indicator.setAttribute("title", mergedConfig.tooltip);
	indicator.setAttribute("aria-label", mergedConfig.tooltip);

	if (!mergedConfig.animate) {
		indicator.style.animation = "none";
	}

	nameEl.appendChild(indicator as Node);
	return indicator;
}

/**
 * Remove the modified indicator from a setting.
 *
 * @param setting - The Obsidian Setting to remove the indicator from
 */
export function removeModifiedIndicator(setting: Setting): void {
	const nameEl = setting.settingEl.querySelector(".setting-item-name");
	if (!nameEl) {
		return;
	}

	const indicator = nameEl.querySelector(`.${CSS_CLASSES.MODIFIED_INDICATOR}`);
	if (indicator) {
		indicator.remove();
	}
}

/**
 * Update a modified indicator based on whether the value differs from default.
 *
 * This is a convenience function that adds or removes the indicator as needed.
 *
 * @param setting - The Obsidian Setting to update
 * @param isModified - Whether the setting value differs from the default
 * @param config - Optional configuration for the indicator
 */
export function updateModifiedIndicator(
	setting: Setting,
	isModified: boolean,
	config: ModifiedIndicatorConfig = {}
): void {
	if (isModified) {
		addModifiedIndicator(setting, true, config);
	} else {
		removeModifiedIndicator(setting);
	}
}

// ==========================================================================
// Empty State Types and Functions
// ==========================================================================

/**
 * Configuration for an empty state display.
 */
export interface EmptyStateConfig {
	/** Icon to display (emoji or text) */
	icon?: string;
	/** Title text */
	title: string;
	/** Description text */
	description?: string;
	/** Action button configuration */
	action?: {
		text: string;
		onClick: () => void;
		isPrimary?: boolean;
	};
	/** Whether to use compact styling */
	compact?: boolean;
}

/**
 * Create an empty state display element.
 *
 * Empty states provide helpful guidance when a section has no content,
 * such as when no models are configured or no items exist.
 *
 * @param container - The parent element to append the empty state to
 * @param config - Configuration for the empty state
 * @returns The created empty state element
 *
 * @example
 * ```typescript
 * createEmptyState(containerEl, {
 *   icon: "📚",
 *   title: "No flashcard decks",
 *   description: "Create a deck to start organizing your flashcards.",
 *   action: {
 *     text: "Create Deck",
 *     onClick: () => openCreateDeckModal(),
 *     isPrimary: true
 *   }
 * });
 * ```
 */
export function createEmptyState(
	container: HTMLElement,
	config: EmptyStateConfig
): HTMLElement {
	const baseClass = config.compact
		? `${CSS_CLASSES.EMPTY_STATE} ${CSS_CLASSES.EMPTY_STATE_COMPACT}`
		: CSS_CLASSES.EMPTY_STATE;

	const emptyEl = document.createElement("div");
	emptyEl.className = baseClass;

	// Icon
	if (config.icon) {
		const iconEl = document.createElement("div");
		iconEl.className = CSS_CLASSES.EMPTY_ICON;
		iconEl.textContent = config.icon;
		iconEl.setAttribute("aria-hidden", "true");
		emptyEl.appendChild(iconEl as Node);
	}

	// Title
	const titleEl = document.createElement("h4");
	titleEl.className = CSS_CLASSES.EMPTY_TITLE;
	titleEl.textContent = config.title;
	emptyEl.appendChild(titleEl as Node);

	// Description
	if (config.description) {
		const descEl = document.createElement("p");
		descEl.className = CSS_CLASSES.EMPTY_DESCRIPTION;
		descEl.textContent = config.description;
		emptyEl.appendChild(descEl as Node);
	}

	// Action button
	if (config.action) {
		const actionContainer = document.createElement("div");
		actionContainer.className = CSS_CLASSES.EMPTY_ACTION;

		const button = document.createElement("button");
		button.textContent = config.action.text;
		if (config.action.isPrimary) {
			button.className = "mod-cta";
		}
		button.addEventListener("click", config.action.onClick);

		actionContainer.appendChild(button as Node);
		emptyEl.appendChild(actionContainer as Node);
	}

	container.appendChild(emptyEl as Node);
	return emptyEl;
}

/**
 * Remove an empty state from a container.
 *
 * @param container - The container to remove the empty state from
 */
export function removeEmptyState(container: HTMLElement): void {
	const emptyEl = container.querySelector(`.${CSS_CLASSES.EMPTY_STATE}`);
	if (emptyEl) {
		emptyEl.remove();
	}
}

// ==========================================================================
// Section Styling Helpers
// ==========================================================================

/**
 * Add consistent styling class to a setting item.
 *
 * @param setting - The Obsidian Setting to style
 */
export function applySettingItemStyle(setting: Setting): void {
	setting.settingEl.addClass(CSS_CLASSES.SETTING_ITEM);
}

/**
 * Create a section divider element.
 *
 * @param container - The container to append the divider to
 * @returns The created divider element
 */
export function createSectionDivider(container: HTMLElement): HTMLElement {
	const divider = document.createElement("hr");
	divider.className = CSS_CLASSES.SECTION_DIVIDER;
	container.appendChild(divider as Node);
	return divider;
}

/**
 * Create a reset button container with consistent styling.
 *
 * @param container - The container to append the reset button section to
 * @param onReset - Callback when reset is clicked
 * @param buttonText - Text for the reset button (default: "Reset to Defaults")
 * @returns The created Setting for the reset button
 */
export function createResetButtonSection(
	container: HTMLElement,
	onReset: () => void,
	buttonText = "Reset to Defaults"
): Setting {
	const resetContainer = container.createDiv(CSS_CLASSES.RESET_BUTTON_CONTAINER);

	const setting = new Setting(resetContainer)
		.setName("")
		.setDesc("Reset all settings in this section to their default values.")
		.addButton((button) =>
			button
				.setButtonText(buttonText)
				.setWarning()
				.onClick(onReset)
		);

	return setting;
}

// ==========================================================================
// Utility Functions
// ==========================================================================

/**
 * Check if a value differs from its default.
 *
 * Handles arrays, objects, and primitive types.
 *
 * @param current - The current value
 * @param defaultValue - The default value
 * @returns True if the values differ
 */
export function isDifferentFromDefault<T>(current: T, defaultValue: T): boolean {
	if (current === defaultValue) {
		return false;
	}

	// Handle null/undefined
	if (current == null || defaultValue == null) {
		return current !== defaultValue;
	}

	// Handle arrays
	if (Array.isArray(current) && Array.isArray(defaultValue)) {
		if (current.length !== defaultValue.length) {
			return true;
		}
		return current.some((item, index) => isDifferentFromDefault(item, defaultValue[index]));
	}

	// Handle objects
	if (typeof current === "object" && typeof defaultValue === "object") {
		const currentKeys = Object.keys(current as object);
		const defaultKeys = Object.keys(defaultValue as object);

		if (currentKeys.length !== defaultKeys.length) {
			return true;
		}

		return currentKeys.some((key) =>
			isDifferentFromDefault(
				(current as Record<string, unknown>)[key],
				(defaultValue as Record<string, unknown>)[key]
			)
		);
	}

	// Primitive comparison
	return current !== defaultValue;
}

/**
 * Format a default value for display in a tooltip.
 *
 * @param defaultValue - The default value to format
 * @returns A human-readable string representation
 */
export function formatDefaultForTooltip(defaultValue: unknown): string {
	if (defaultValue === null) {
		return "none";
	}
	if (defaultValue === undefined) {
		return "not set";
	}
	if (typeof defaultValue === "boolean") {
		return defaultValue ? "enabled" : "disabled";
	}
	if (typeof defaultValue === "number") {
		return String(defaultValue);
	}
	if (typeof defaultValue === "string") {
		return defaultValue || "(empty)";
	}
	if (Array.isArray(defaultValue)) {
		return defaultValue.length > 0 ? defaultValue.join(", ") : "(empty)";
	}
	return String(defaultValue);
}

/**
 * Create a tooltip message for a modified indicator.
 *
 * @param settingName - The name of the setting
 * @param defaultValue - The default value
 * @returns A formatted tooltip message
 */
export function createModifiedTooltip(settingName: string, defaultValue: unknown): string {
	const formattedDefault = formatDefaultForTooltip(defaultValue);
	return `${settingName} differs from default (${formattedDefault})`;
}
