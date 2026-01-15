/**
 * Model Management Settings Section
 *
 * Provides a centralized UI section in the plugin settings for managing
 * model configurations. This section serves as the source of truth for
 * all model configurations used across main generation, Consensus, and Council modes.
 *
 * Task 8: Now also includes the Generation Model selection dropdown, which was
 * previously in the now-removed "Generation Mode" section. This consolidates
 * model configuration and selection into a single logical section.
 *
 * Requirements: 1.2, 3.1, 4.1, 7.1, 8.7
 * Task 37: Add help text and tooltips throughout settings UI
 * Task 5.4: Section collapse state persistence
 * Task 8: Remove empty Generation Mode section - move Model Selection here
 */

import { Setting } from "obsidian";
import QuizGenerator from "../../main";
import { CollapsibleSection, OnToggleCallback } from "../../ui/components/CollapsibleSection";
import {
	ModelConfiguration,
	DEFAULT_MODEL_REGISTRY,
	getProviderDisplayName,
} from "./types";
import {
	getAllModels,
	getModelUsageInfo,
	formatModelUsage,
	tryAddModel,
	tryUpdateModel,
	tryDeleteModel,
	deleteModelAndCleanupReferences,
	getModelCount,
} from "./modelRegistry";
import {
	createReactiveModelSetting,
	ReactiveModelSettingResult,
} from "./reactiveDropdown";
import ConfirmModal from "../../ui/components/ConfirmModal";
import { ModelConfigModal } from "./modelConfigModal";
import { MODEL_MANAGEMENT_HELP, MODEL_CONFIG_HELP } from "../helpText";
import {
	addHelpIcon,
	addInfoIconToSetting,
	createHelpBox,
	createHoverTooltip,
} from "../../ui/components/SettingsHelpText";
import { noticeService } from "../../utils/noticeService";
import {
	SECTION_IDS,
	getSectionExpanded,
	setSectionExpanded,
} from "../sectionCollapseState";

const SECTION_DESCRIPTION =
	"Configure your AI models in one place. Models defined here can be used for main generation, " +
	"Consensus mode, and Council mode. This eliminates the need to enter the same API keys and settings multiple times.";

const EMPTY_STATE_MESSAGE =
	"No models configured yet. Click 'Add Model' to configure your first model.";

/**
 * Prominent empty state configuration for first-time users.
 * Requirements: 6.4, 6.5
 * Requirements: 6.4 - Show prominent "Add your first model" message when registry is empty
 */
const EMPTY_STATE_CONFIG = {
	icon: "🚀",
	title: "Get Started with AI Quiz Generation",
	description: "Add your first AI model to start generating quizzes from your notes.",
	steps: [
		"Click the 'Add Model' button below",
		"Choose OpenAI (cloud) or Ollama (local)",
		"Enter your API credentials and model settings",
		"Start generating quizzes!",
	],
	buttonText: "Add Your First Model",
} as const;

/**
 * Placeholder option for Generation Model dropdown when no model is selected.
 * Task 8: Moved from modelSettings.ts
 */
const NO_MODEL_SELECTED_PLACEHOLDER = "-- Select a model --";

/**
 * Display the Model Management settings section.
 *
 * This is the main entry point for the Model Management UI. It renders:
 * - Section heading and description
 * - List of configured models with usage indicators
 * - Edit and Delete buttons for each model
 * - Add Model button
 * - Generation Model selection dropdown (Task 8: moved from Generation Mode section)
 *
 * Returns a cleanup function for the reactive Generation Model dropdown.
 *
 * Requirements: 1.2, 3.1, 4.1, 7.1, 8.7
 * Task 8: Remove empty Generation Mode section - move Model Selection here
 */
const displayModelManagementSettings = (
	containerEl: HTMLElement,
	plugin: QuizGenerator,
	refreshSettings: () => void
): (() => void) | undefined => {
	// Track cleanup functions for reactive components
	const cleanupFunctions: Array<() => void> = [];
	// Section heading with help icon
	const headingSetting = new Setting(containerEl).setName("Model Management").setHeading();
	const headingEl = headingSetting.settingEl.querySelector(".setting-item-name");
	if (headingEl) {
		addHelpIcon(headingEl as HTMLElement, MODEL_MANAGEMENT_HELP.section.tooltip);
	}

	// Section description with help box
	createHelpBox(containerEl, {
		paragraphs: [SECTION_DESCRIPTION],
		bullets: [
			"Configure each model once - reuse across Main, Consensus, and Council modes",
			"Each model includes provider credentials, generation model, and embedding model",
			"Changes to a model apply everywhere it's used",
		],
	});

	// Ensure model registry exists
	if (!plugin.settings.modelRegistry) {
		plugin.settings.modelRegistry = { ...DEFAULT_MODEL_REGISTRY };
	}

	const registry = plugin.settings.modelRegistry;
	const models = getAllModels(registry);

	// Get persisted expand state (Task 5.4)
	const isExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.MODEL_MANAGEMENT
	);

	// Create toggle handler for state persistence (Task 5.4)
	const onToggle: OnToggleCallback = async (expanded: boolean): Promise<void> => {
		const newState = setSectionExpanded(
			plugin.settings.sectionCollapseState,
			SECTION_IDS.MODEL_MANAGEMENT,
			expanded
		);
		plugin.settings.sectionCollapseState = newState;
		await plugin.saveSettings();
	};

	// Model list section with models mode styling (Task 38: Visual Polish)
	// Uses persisted collapse state (Task 5.4)
	const modelSection = new CollapsibleSection(
		containerEl,
		"Configured Models",
		isExpanded,
		"models", // Use models-specific visual styling
		onToggle
	);
	// Set count badge to show number of models
	modelSection.setCount(models.length);

	// Model list container
	const modelListContainer = modelSection.contentEl.createDiv("model-list-container-qg");

	/**
	 * Render the model list
	 */
	const renderModelList = (): void => {
		modelListContainer.empty();

		const currentModels = getAllModels(plugin.settings.modelRegistry ?? DEFAULT_MODEL_REGISTRY);

		if (currentModels.length === 0) {
			// Enhanced empty state with prominent guidance (Requirements: 6.4, 6.5)
			renderEnhancedEmptyState(modelListContainer, openAddModal);
		} else {
			// Render each model
			for (const model of currentModels) {
				renderModelCard(modelListContainer, model);
			}
		}
	};

	/**
	 * Render enhanced empty state with prominent message and clear next steps.
	 * Requirements: 6.4 - Show prominent "Add your first model" message when registry is empty
	 * Requirements: 6.5 - Provide clear guidance on next steps
	 */
	const renderEnhancedEmptyState = (container: HTMLElement, onAddClick: () => void): void => {
		const emptyEl = container.createDiv("empty-models-state-qg empty-models-state-prominent-qg");

		// Icon
		const iconEl = emptyEl.createDiv("empty-state-icon-qg");
		iconEl.textContent = EMPTY_STATE_CONFIG.icon;

		// Title
		emptyEl.createEl("h3", {
			text: EMPTY_STATE_CONFIG.title,
			cls: "empty-state-title-qg",
		});

		// Description
		emptyEl.createEl("p", {
			text: EMPTY_STATE_CONFIG.description,
			cls: "empty-state-description-qg",
		});

		// Steps list
		const stepsEl = emptyEl.createDiv("empty-state-steps-qg");
		const stepsList = stepsEl.createEl("ol");
		for (const step of EMPTY_STATE_CONFIG.steps) {
			stepsList.createEl("li", { text: step });
		}

		// CTA Button (primary action)
		const buttonContainer = emptyEl.createDiv("empty-state-button-container-qg");
		const ctaButton = buttonContainer.createEl("button", {
			text: EMPTY_STATE_CONFIG.buttonText,
			cls: "mod-cta empty-state-cta-qg",
		});
		ctaButton.addEventListener("click", onAddClick);
	};

	/**
	 * Render a single model card
	 */
	const renderModelCard = (container: HTMLElement, model: ModelConfiguration): void => {
		const usageInfo = getModelUsageInfo(model.id, plugin.settings);
		const usageText = formatModelUsage(usageInfo);
		const providerName = getProviderDisplayName(model.providerConfig);

		// Build description parts
		const descParts: string[] = [
			`Provider: ${providerName}`,
			`Generation: ${model.providerConfig.textGenerationModel || "not set"}`,
			`Embedding: ${model.providerConfig.embeddingModel || "not set"}`,
		];

		// Add usage indicator if model is in use
		if (usageInfo.usageCount > 0) {
			descParts.push(`Used in: ${usageText}`);
		}

		const setting = new Setting(container)
			.setName(model.displayName)
			.setDesc(descParts.join(" | "))
			.addButton((button) =>
				button
					.setButtonText("Edit")
					.setClass("mod-cta")
					.setTooltip(MODEL_MANAGEMENT_HELP.editModel.tooltip)
					.onClick(() => openEditModal(model))
			)
			.addButton((button) =>
				button
					.setButtonText("Delete")
					.setClass("mod-warning")
					.setTooltip(
						usageInfo.usageCount > 0
							? MODEL_MANAGEMENT_HELP.deleteModel.warningInUse
							: MODEL_MANAGEMENT_HELP.deleteModel.tooltip
					)
					.onClick(() => handleDelete(model))
			);

		// Add usage indicator class if model is in use
		if (usageInfo.usageCount > 0) {
			setting.settingEl.addClass("model-in-use-qg");
		}

		// Add hover tooltip showing model details (generation and embedding models)
		const hasEmbeddingWarning = !model.providerConfig.embeddingModel;
		createHoverTooltip(setting.settingEl, createModelTooltipContent(model, hasEmbeddingWarning));
	};

	/**
	 * Create tooltip content for a model card
	 */
	const createModelTooltipContent = (model: ModelConfiguration, hasEmbeddingWarning: boolean): HTMLElement => {
		const content = document.createElement("div");

		// Generation model
		const genRow = document.createElement("div");
		genRow.className = "tooltip-row";
		genRow.innerHTML = `<span class="label">Generation:</span> <span class="value">${
			model.providerConfig.textGenerationModel || "not set"
		}</span>`;
		content.appendChild(genRow as Node);

		// Embedding model
		const embRow = document.createElement("div");
		embRow.className = "tooltip-row";
		embRow.innerHTML = `<span class="label">Embedding:</span> <span class="value">${
			model.providerConfig.embeddingModel || "not set"
		}</span>`;
		content.appendChild(embRow as Node);

		// Warning if no embedding model
		if (hasEmbeddingWarning) {
			const warning = document.createElement("div");
			warning.className = "tooltip-warning";
			warning.textContent = MODEL_CONFIG_HELP.embeddingModel.warning;
			content.appendChild(warning as Node);
		}

		return content;
	};

	/**
	 * Open the modal to add a new model
	 * Task 40: Shows success notice after adding model
	 */
	const openAddModal = (): void => {
		const registry = plugin.settings.modelRegistry ?? DEFAULT_MODEL_REGISTRY;
		const modal = new ModelConfigModal(plugin.app, {
			existingModel: null,
			registry,
			onSave: async (model) => {
				const result = tryAddModel(registry, model);

				if (!result.success) {
					noticeService.modelOperationFailed("add", result.error ?? "Unknown error");
					throw new Error(result.error ?? "Failed to add model");
				}

				await plugin.saveSettings();
				noticeService.modelAdded(model.displayName);
				renderModelList();
				updateModelCount();
			},
		});
		modal.open();
	};

	/**
	 * Open the modal to edit an existing model.
	 * Task 39: Shows confirmation when editing shared model
	 * Task 40: Shows success/error notices after editing model
	 */
	const openEditModal = (model: ModelConfiguration): void => {
		const usageInfo = getModelUsageInfo(model.id, plugin.settings);
		const registry = plugin.settings.modelRegistry ?? DEFAULT_MODEL_REGISTRY;

		const modal = new ModelConfigModal(plugin.app, {
			existingModel: model,
			registry,
			onSave: async (updatedModel) => {
				/**
				 * Perform the actual update
				 */
				const performUpdate = async (): Promise<void> => {
					const result = tryUpdateModel(registry, model.id, {
						displayName: updatedModel.displayName,
						providerConfig: updatedModel.providerConfig,
					});

					if (!result.success) {
						noticeService.modelOperationFailed("edit", result.error ?? "Unknown error");
						throw new Error(result.error ?? "Failed to update model");
					}

					await plugin.saveSettings();
					noticeService.modelUpdated(updatedModel.displayName);
					renderModelList();
				};

				// If model is used in multiple places, warn the user
				if (usageInfo.usageCount > 1) {
					const usageText = formatModelUsage(usageInfo);
					new ConfirmModal(
						plugin.app,
						"Update Shared Model",
						`This model is used in: ${usageText}.\n\n` +
							`Changes will apply to all locations using this model.`,
						performUpdate,
						{
							confirmText: "Apply Changes",
							cancelText: "Cancel",
							isDestructive: false,
						}
					).open();
				} else {
					// No confirmation needed, just update
					await performUpdate();
				}
			},
		});
		modal.open();
	};

	/**
	 * Handle model deletion with confirmation.
	 * Task 39: Uses destructive styling for delete confirmations
	 * Task 40: Shows success/error notices after deleting model
	 */
	const handleDelete = (model: ModelConfiguration): void => {
		const usageInfo = getModelUsageInfo(model.id, plugin.settings);

		if (usageInfo.usageCount > 0) {
			// Model is in use - show warning with deletion callback
			const usageText = formatModelUsage(usageInfo);
			new ConfirmModal(
				plugin.app,
				"Delete Model in Use",
				`This model is currently used in: ${usageText}.\n\n` +
					`Deleting it will remove it from these features. This action cannot be undone.`,
				async () => {
					// Delete with cleanup
					const registry = plugin.settings.modelRegistry ?? DEFAULT_MODEL_REGISTRY;
					deleteModelAndCleanupReferences(registry, plugin.settings, model.id);
					await plugin.saveSettings();
					noticeService.modelDeleted(model.displayName, true);
					renderModelList();
					updateModelCount();
				},
				{
					confirmText: "Delete",
					cancelText: "Cancel",
					isDestructive: true,
				}
			).open();
		} else {
			// Model is not in use - simple confirmation with destructive styling
			new ConfirmModal(
				plugin.app,
				"Delete Model",
				`Are you sure you want to delete "${model.displayName}"?\n\nThis action cannot be undone.`,
				async () => {
					const registry = plugin.settings.modelRegistry ?? DEFAULT_MODEL_REGISTRY;
					const result = tryDeleteModel(registry, model.id);

					if (!result.success) {
						noticeService.modelOperationFailed("delete", result.error ?? "Unknown error");
						return;
					}

					await plugin.saveSettings();
					noticeService.modelDeleted(model.displayName, false);
					renderModelList();
					updateModelCount();
				},
				{
					confirmText: "Delete",
					cancelText: "Cancel",
					isDestructive: true,
				}
			).open();
		}
	};

	/**
	 * Update the model count in the section header
	 * Task 38: Uses the new setCount method for count badge
	 */
	const updateModelCount = (): void => {
		const count = getModelCount(plugin.settings.modelRegistry ?? DEFAULT_MODEL_REGISTRY);
		modelSection.setCount(count);
	};

	// Initial render
	renderModelList();

	// Add Model button with tooltip
	new Setting(modelSection.contentEl).addButton((button) =>
		button
			.setButtonText("Add Model")
			.setCta()
			.setTooltip(MODEL_MANAGEMENT_HELP.addModel.tooltip)
			.onClick(openAddModal)
	);

	// ============================================================================
	// Generation Model Selection Dropdown (Task 8)
	// Moved from the now-removed "Generation Mode" section
	// This reactive dropdown updates automatically when models are added/edited/deleted
	// Requirements: 1.2, 8.7
	// ============================================================================
	renderGenerationModelDropdown(containerEl, plugin, cleanupFunctions);

	// Return cleanup function for all reactive components
	if (cleanupFunctions.length > 0) {
		return () => {
			for (const cleanupFn of cleanupFunctions) {
				try {
					cleanupFn();
				} catch (error) {
					console.error("[ModelManagementSettings] Error during cleanup:", error);
				}
			}
		};
	}

	return undefined;
};

/**
 * Render the Generation Model selection dropdown.
 *
 * This dropdown allows users to select which model to use for main quiz generation.
 * It is reactive and automatically updates when models are added, edited, or deleted.
 *
 * Task 8: Moved from the now-removed "Generation Mode" section.
 *
 * Requirements: 1.2, 8.7
 *
 * @param containerEl - The container to render the dropdown into
 * @param plugin - The plugin instance
 * @param cleanupFunctions - Array to push cleanup functions into
 */
function renderGenerationModelDropdown(
	containerEl: HTMLElement,
	plugin: QuizGenerator,
	cleanupFunctions: Array<() => void>
): void {
	// Guard against undefined settings or registry
	if (!plugin.settings?.modelRegistry) {
		return;
	}

	const registry = plugin.settings.modelRegistry;

	// Create the reactive model dropdown
	const result = createReactiveModelSetting(containerEl, {
		name: "Generation Model",
		description:
			"Select the model to use for quiz generation. " +
			"The generation model creates quiz questions, and the embedding model evaluates short/long answers.",
		registry,
		currentValue: plugin.settings.activeModelId ?? "",
		placeholder: NO_MODEL_SELECTED_PLACEHOLDER,
		onChange: async (value) => {
			// Store the selected model ID (null if placeholder selected)
			plugin.settings.activeModelId = value === "" ? null : value;
			await plugin.saveSettings();
		},
		// Show warning when a selected model is deleted
		showDeletedModelWarning: true,
		deletedModelText: "Model not found",
	});

	// Add info icon to model selection
	addInfoIconToSetting(result.setting, {
		tooltip: `${MODEL_CONFIG_HELP.generationModel.tooltip}. ${MODEL_CONFIG_HELP.embeddingModel.tooltip}.`,
	});

	// Store the cleanup function
	cleanupFunctions.push(result.cleanup);

	// Show currently selected model details if a model is selected
	const currentModelId = plugin.settings.activeModelId ?? "";
	if (currentModelId !== "") {
		const models = getAllModels(registry);
		const selectedModel = models.find((m) => m.id === currentModelId);
		if (selectedModel) {
			renderSelectedModelDetails(containerEl, selectedModel);
		}
	}
}

/**
 * Render details about the currently selected model.
 *
 * Task 8: Moved from modelSettings.ts
 *
 * @param containerEl - The container to render the details into
 * @param model - The selected model
 */
function renderSelectedModelDetails(
	containerEl: HTMLElement,
	model: ModelConfiguration
): void {
	const detailsEl = containerEl.createDiv("selected-model-details-qg");

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

export default displayModelManagementSettings;
