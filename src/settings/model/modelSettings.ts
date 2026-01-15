/**
 * Main Generation Settings Section
 *
 * @deprecated This file is deprecated as of Task 22 (settings-ui-cleanup).
 * The Generation Model selection dropdown has been moved to:
 * `src/settings/modelRegistry/modelManagementSettings.ts`
 *
 * This file is kept for backwards compatibility with existing tests.
 * New code should NOT use this file - the Generation Model dropdown
 * is now integrated into the Model Management section.
 *
 * Migration completed in:
 * - Task 8: Remove empty Generation Mode section
 * - Task 9: Move Model Selection to Model Management section
 * - Task 22: Clean up deprecated code and add deprecation notices
 *
 * Original description:
 * Provides UI for selecting the model to use for main (single-model) quiz generation.
 * In this mode, a single model generates quizzes independently - fast and cost-effective.
 *
 * This section uses the centralized model registry for model selection via dropdown,
 * eliminating the need to configure provider credentials directly here.
 *
 * The model selection dropdown is reactive and automatically updates when models are
 * added, updated, or deleted from the registry without requiring a settings panel refresh.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5, 8.1, 8.2, 8.5, 8.7, 9.2
 * Task 7: Update Model Selection dropdown in modelSettings.ts
 * Task 37: Add help text and tooltips throughout settings UI
 */

import { Setting } from "obsidian";
import QuizGenerator from "../../main";
import {
	getAllModels,
	DEFAULT_MODEL_REGISTRY,
	ModelConfiguration,
	createReactiveModelSetting,
	ReactiveModelSettingResult,
} from "../modelRegistry";
import { MODE_HELP, MODEL_CONFIG_HELP } from "../helpText";
import {
	addInfoIconToSetting,
	createModeExplanation,
} from "../../ui/components/SettingsHelpText";

/**
 * Mode explanation text displayed at the top of the section.
 * Requirements: 8.1, 8.2
 */
const MODE_EXPLANATION =
	"Single model generates quizzes independently. Fast and cost-effective. " +
	"For higher quality with multiple model validation, enable Consensus or Council mode below.";

/**
 * Empty state message when no models are configured.
 * Requirements: 2.3, 6.5
 */
const NO_MODELS_MESSAGE =
	"No models configured yet.";

/**
 * Empty state guidance text when no models are configured.
 * Requirements: 6.5 - Provide clear guidance on next steps
 */
const NO_MODELS_GUIDANCE =
	"Add models in the Model Management section above to enable quiz generation.";

/**
 * Placeholder option for dropdown when no model is selected.
 */
const NO_MODEL_SELECTED_PLACEHOLDER = "-- Select a model --";

/**
 * Result interface for the displayModelSettings function.
 * Includes a cleanup function that MUST be called when the settings panel is closed
 * to properly unsubscribe from model registry events and prevent memory leaks.
 *
 * Requirements: 8.5, 8.6
 */
export interface ModelSettingsResult {
	/**
	 * Cleanup function that unsubscribes from model registry events.
	 * MUST be called when the settings panel is closed to prevent memory leaks.
	 */
	cleanup: () => void;
}

/**
 * Display the Main Generation settings section.
 *
 * This function renders:
 * - Mode explanation text (heading is added by parent in settings.ts)
 * - Model selection dropdown (or empty state message)
 *
 * The selected model ID is stored in `settings.activeModelId` and references
 * a model in `settings.modelRegistry`.
 *
 * The dropdown is reactive and automatically updates when models are added,
 * updated, or deleted from the registry. The returned cleanup function MUST
 * be called when the settings panel is closed to prevent memory leaks.
 *
 * Note: The section heading "Generation Mode" is rendered by the parent
 * displayGenerationModeSection() in settings.ts to unify the mode comparison
 * and model selection into a single cohesive section.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5, 8.1, 8.2, 8.5, 8.7, 9.2
 */
const displayModelSettings = (
	containerEl: HTMLElement,
	plugin: QuizGenerator,
	refreshSettings: () => void
): ModelSettingsResult => {
	// Track cleanup functions for reactive components
	const cleanupFunctions: Array<() => void> = [];

	// Note: Section heading is now rendered by parent (settings.ts displayGenerationModeSection)
	// to unify "Generation Mode" section with mode comparison and model selection

	// Mode explanation box with analogy and characteristics
	createModeExplanation(containerEl, {
		description: MODE_HELP.main.fullDescription,
		analogy: MODE_HELP.main.analogy,
		characteristics: MODE_HELP.main.labels.join(" • "),
		note: MODE_HELP.comparison.modeSelectionTip,
	});

	// Guard against undefined settings (shouldn't happen in practice, but handle gracefully)
	if (!plugin.settings) {
		renderEmptyState(containerEl);
		return { cleanup: () => {} };
	}

	// Ensure model registry exists
	if (!plugin.settings.modelRegistry) {
		plugin.settings.modelRegistry = { ...DEFAULT_MODEL_REGISTRY };
	}

	const registry = plugin.settings.modelRegistry;
	const models = getAllModels(registry);

	if (models.length === 0) {
		// Empty state: No models configured
		// Note: The reactive dropdown will handle updates when models are added,
		// so we still create it even when empty to enable reactive behavior
		renderEmptyState(containerEl);
	}

	// Always render the reactive dropdown (it handles empty state internally)
	// This ensures the dropdown updates immediately when models are added
	const dropdownResult = renderReactiveModelDropdown(containerEl, plugin, refreshSettings);
	if (dropdownResult) {
		cleanupFunctions.push(dropdownResult.cleanup);
	}

	// Return the cleanup function that cleans up all reactive components
	return {
		cleanup: () => {
			for (const cleanupFn of cleanupFunctions) {
				cleanupFn();
			}
		},
	};
};

/**
 * Render the empty state when no models are configured.
 * Shows a disabled-looking UI with clear guidance.
 *
 * Requirements: 2.3, 6.5 - Disable model-dependent controls when no models exist
 */
function renderEmptyState(containerEl: HTMLElement): void {
	const emptyStateEl = containerEl.createDiv("empty-model-state-qg model-dependent-disabled-qg");

	// Warning icon
	const iconEl = emptyStateEl.createDiv("empty-model-icon-qg");
	iconEl.textContent = "⚠️";

	// Message
	const messageEl = emptyStateEl.createEl("p", {
		cls: "empty-model-message-qg",
	});
	messageEl.textContent = NO_MODELS_MESSAGE;

	// Guidance
	const guidanceEl = emptyStateEl.createEl("p", {
		cls: "empty-model-guidance-qg",
	});
	guidanceEl.textContent = NO_MODELS_GUIDANCE;
}

/**
 * Render a reactive model selection dropdown.
 *
 * This dropdown automatically updates when models are added, updated, or deleted
 * from the registry. It subscribes to model registry events and refreshes the
 * dropdown options without requiring a full settings panel refresh.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.5, 8.7
 *
 * @param containerEl - The container to render the dropdown into
 * @param plugin - The plugin instance
 * @param refreshSettings - Callback to refresh the settings panel
 * @returns The reactive dropdown result with cleanup function, or null if no registry
 */
function renderReactiveModelDropdown(
	containerEl: HTMLElement,
	plugin: QuizGenerator,
	refreshSettings: () => void
): ReactiveModelSettingResult | null {
	// Guard against missing settings or registry
	if (!plugin.settings?.modelRegistry) {
		return null;
	}

	const registry = plugin.settings.modelRegistry;

	// Create a container for the model details that can be updated reactively
	let detailsContainerEl: HTMLElement | null = null;

	// Track the current model ID for updating details
	let currentModelId = plugin.settings.activeModelId ?? "";

	// Helper function to update model details display
	const updateModelDetails = (modelId: string): void => {
		// Remove previous details container if it exists
		if (detailsContainerEl) {
			detailsContainerEl.remove();
			detailsContainerEl = null;
		}

		// Only show details if a model is selected
		if (modelId !== "") {
			const models = getAllModels(registry);
			const selectedModel = models.find((m) => m.id === modelId);
			if (selectedModel) {
				detailsContainerEl = containerEl.createDiv("selected-model-details-qg");
				renderSelectedModelDetailsInto(detailsContainerEl, selectedModel);
			}
		}
	};

	// Create the reactive model dropdown using the new reactive API
	const result = createReactiveModelSetting(containerEl, {
		name: "Generation Model",
		description:
			"Select the model to use for quiz generation. " +
			"The generation model creates quiz questions, and the embedding model evaluates short/long answers.",
		registry,
		currentValue: currentModelId,
		placeholder: NO_MODEL_SELECTED_PLACEHOLDER,
		onChange: async (value) => {
			// Store the selected model ID (null if placeholder selected)
			plugin.settings.activeModelId = value === "" ? null : value;
			currentModelId = value;
			await plugin.saveSettings();

			// Update the model details display
			updateModelDetails(value);

			// Note: We don't call refreshSettings() here to avoid full panel refresh
			// The reactive dropdown handles its own updates
		},
		// Show warning when a selected model is deleted
		showDeletedModelWarning: true,
		deletedModelText: "Model not found",
	});

	// Add info icon to model selection
	addInfoIconToSetting(result.setting, {
		tooltip: `${MODEL_CONFIG_HELP.generationModel.tooltip}. ${MODEL_CONFIG_HELP.embeddingModel.tooltip}.`,
	});

	// Show initial model details if a model is selected
	updateModelDetails(currentModelId);

	// Wrap the cleanup to also clean up the details container
	const originalCleanup = result.cleanup;
	const wrappedResult: ReactiveModelSettingResult = {
		...result,
		cleanup: () => {
			// Clean up the details container
			if (detailsContainerEl) {
				detailsContainerEl.remove();
				detailsContainerEl = null;
			}
			// Call the original cleanup
			originalCleanup();
		},
	};

	return wrappedResult;
}

/**
 * Render the model selection dropdown (legacy non-reactive version).
 *
 * @deprecated Use renderReactiveModelDropdown instead for reactive updates.
 *
 * Requirements: 2.1, 2.2, 2.5, 9.2
 */
function renderModelDropdown(
	containerEl: HTMLElement,
	plugin: QuizGenerator,
	models: ModelConfiguration[],
	refreshSettings: () => void
): void {
	// Build dropdown options
	// Key is model ID, value is display text
	const dropdownOptions: Record<string, string> = {
		"": NO_MODEL_SELECTED_PLACEHOLDER,
	};

	for (const model of models) {
		// Format: "{DisplayName} ({Provider}: {GenerationModel} / {EmbeddingModel})"
		const { formatModelForDisplay } = require("../modelRegistry");
		dropdownOptions[model.id] = formatModelForDisplay(model);
	}

	// Get current selection
	const currentModelId = plugin.settings.activeModelId ?? "";

	// Validate that current selection still exists
	const validSelection = currentModelId === "" || models.some((m) => m.id === currentModelId);
	const effectiveSelection = validSelection ? currentModelId : "";

	// If selection was invalid, clear it
	if (!validSelection && currentModelId !== "") {
		plugin.settings.activeModelId = null;
		plugin.saveSettings();
	}

	const modelSetting = new Setting(containerEl)
		.setName("Generation Model")
		.setDesc(
			"Select the model to use for quiz generation. " +
			"The generation model creates quiz questions, and the embedding model evaluates short/long answers."
		)
		.addDropdown((dropdown) =>
			dropdown
				.addOptions(dropdownOptions)
				.setValue(effectiveSelection)
				.onChange(async (value) => {
					// Store the selected model ID (null if placeholder selected)
					plugin.settings.activeModelId = value === "" ? null : value;
					await plugin.saveSettings();
					refreshSettings();
				})
		);

	// Add info icon to model selection
	addInfoIconToSetting(modelSetting, {
		tooltip: `${MODEL_CONFIG_HELP.generationModel.tooltip}. ${MODEL_CONFIG_HELP.embeddingModel.tooltip}.`,
	});

	// Show currently selected model details if one is selected
	if (effectiveSelection !== "") {
		const selectedModel = models.find((m) => m.id === effectiveSelection);
		if (selectedModel) {
			renderSelectedModelDetails(containerEl, selectedModel);
		}
	}
}

/**
 * Render details about the currently selected model into a given container.
 *
 * This is the core implementation that renders model details into a provided element.
 * Used by both the reactive and legacy dropdown rendering functions.
 *
 * Requirements: 9.2
 */
function renderSelectedModelDetailsInto(
	detailsEl: HTMLElement,
	model: ModelConfiguration
): void {
	// Generation model info
	const genModelEl = detailsEl.createEl("p", {
		cls: "setting-item-description",
	});
	genModelEl.innerHTML =
		`<strong>Generation:</strong> ${model.providerConfig.textGenerationModel || "<em>not set</em>"} — ` +
		"<em>Creates quiz questions from your notes.</em>";

	// Embedding model info
	const embModelEl = detailsEl.createEl("p", {
		cls: "setting-item-description",
	});

	if (model.providerConfig.embeddingModel) {
		embModelEl.innerHTML =
			`<strong>Embedding:</strong> ${model.providerConfig.embeddingModel} — ` +
			"<em>Evaluates your short/long answer responses.</em>";
	} else {
		embModelEl.innerHTML =
			"<strong>Embedding:</strong> <em>not set</em> — " +
			"<span class='warning-text-qg'>Short/long answer evaluation may not work correctly.</span>";
	}
}

/**
 * Render details about the currently selected model.
 *
 * This is the legacy version that creates its own container div.
 *
 * @deprecated Use renderSelectedModelDetailsInto instead for more control.
 *
 * Requirements: 9.2
 */
function renderSelectedModelDetails(
	containerEl: HTMLElement,
	model: ModelConfiguration
): void {
	const detailsEl = containerEl.createDiv("selected-model-details-qg");
	renderSelectedModelDetailsInto(detailsEl, model);
}

/**
 * @deprecated This function is deprecated. The Generation Model dropdown
 * is now rendered by `displayModelManagementSettings` in `modelManagementSettings.ts`.
 * This export is kept for backwards compatibility with existing tests.
 */
export default displayModelSettings;
