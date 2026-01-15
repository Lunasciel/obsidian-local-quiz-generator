/**
 * @file advancedModesSettings.ts
 * @description Advanced Generation Modes Settings Section
 *
 * This file implements the consolidated settings interface for advanced generation modes,
 * combining Consensus and Council mode configurations into a single unified section.
 *
 * Task 10: Create Advanced Modes settings directory structure
 * Task 12: Implement consolidated Advanced Modes section
 * Task 13: Migrate Consensus settings to Advanced Modes
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.7
 *
 * Section Structure:
 * - Mode Comparison component at top (shows Main/Consensus/Council comparison cards)
 * - Collapsible Consensus sub-section with full settings (models, parameters, options)
 * - Collapsible Council sub-section with enable toggle and impact estimate
 * - Each sub-section includes ImpactEstimateComponent for cost/time visualization
 */

import { Modal, Notice, Setting } from "obsidian";
import type QuizGenerator from "../../main";
import { CollapsibleSection, OnToggleCallback } from "../../ui/components/CollapsibleSection";
import {
	SECTION_IDS,
	getSectionExpanded,
	setSectionExpanded,
} from "../sectionCollapseState";
import { addHelpIcon, createModeExplanation } from "../../ui/components/SettingsHelpText";
import { MODE_HELP, CONSENSUS_HELP, COUNCIL_HELP } from "../helpText";
import {
	ModeComparisonSection,
	getActiveGenerationMode,
	GenerationMode,
} from "../../ui/components/ModeComparisonSection";
import {
	ImpactEstimateComponent,
	createImpactEstimateComponent,
	ImpactEstimateConfig,
} from "./impactEstimateComponent";
import {
	DEFAULT_CONSENSUS_SETTINGS,
	estimateCostImpact,
	estimateTimeImpact,
	CONSENSUS_CONSTANTS,
	CONSENSUS_WARNINGS,
	validateConsensusSettings,
	createDefaultConsensusModelReference,
} from "../consensus/consensusConfig";
import {
	DEFAULT_COUNCIL_SETTINGS,
	estimateCouncilCostImpact,
	estimateCouncilTimeImpact,
	COUNCIL_CONSTANTS,
	COUNCIL_WARNINGS,
	COUNCIL_HELP_TEXT,
	createDefaultCouncilModelReference,
	validateChairSelection,
} from "../council/councilConfig";
import { CouncilModelReference } from "../modelRegistry/types";
import { Provider } from "../../generators/providers";
import {
	getAllModels,
	formatModelForDisplay,
	ModelConfiguration,
	ConsensusModelReference,
	createModelResolver,
	getModelUsageInfo,
	DEFAULT_MODEL_REGISTRY,
} from "../modelRegistry";
import ConsensusPrivacyWarningModal from "../../ui/components/ConsensusPrivacyWarningModal";

// Re-export ImpactEstimateConfig from the dedicated component (Task 11)
// This maintains backwards compatibility for imports from advancedModesSettings
export type { ImpactEstimateConfig } from "./impactEstimateComponent";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Context object passed to the Advanced Modes settings display function.
 * Contains all dependencies needed for rendering and updating settings.
 */
export interface AdvancedModesSettingsContext {
	/** The main plugin instance */
	plugin: QuizGenerator;
	/** Callback to refresh the entire settings panel */
	refreshSettings: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Section heading text for the Advanced Generation Modes section.
 */
export const SECTION_HEADING = "Advanced Generation Modes";

/**
 * Section description explaining the purpose of advanced modes.
 */
export const SECTION_DESCRIPTION =
	"Configure advanced generation modes that use multiple AI models to improve quiz quality. " +
	"Both modes can significantly increase cost and generation time compared to single-model generation.";

/**
 * Help tooltip text for the section heading.
 */
export const SECTION_HELP_TOOLTIP =
	"Advanced modes use multiple AI models working together to generate higher-quality quiz questions. " +
	"Choose between Consensus (models must agree) or Council (structured debate with a chair).";

/**
 * Empty state message when no models are configured.
 */
export const NO_MODELS_MESSAGE =
	"No models configured in the Model Registry. Add models in the Model Management section above to enable advanced generation modes.";

/**
 * Placeholder option for dropdown when selecting models.
 */
const SELECT_MODEL_PLACEHOLDER = "-- Select a model from registry --";

// ============================================================================
// Modal Classes for Consensus Model Management
// ============================================================================

/**
 * Modal for selecting a model from the registry to add to consensus.
 * Uses dropdown instead of manual text entry.
 *
 * Task 13: Migrate Consensus settings to Advanced Modes
 * Requirements: 2.1, 2.2, 2.4, 2.5, 2.6
 */
class ConsensusModelSelectModal extends Modal {
	private readonly plugin: QuizGenerator;
	private readonly existingModelIds: string[];
	private readonly onSelect: (reference: ConsensusModelReference) => void;
	private selectedModelId: string = "";
	private weight: number = 1.0;
	private enabled: boolean = true;

	constructor(
		plugin: QuizGenerator,
		existingModelIds: string[],
		onSelect: (reference: ConsensusModelReference) => void
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.existingModelIds = existingModelIds;
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", { text: "Add Consensus Model" });

		// Get models from registry
		const registry = this.plugin.settings.modelRegistry ?? DEFAULT_MODEL_REGISTRY;
		const allModels = getAllModels(registry);

		// Check if there are any models to choose from
		if (allModels.length === 0) {
			contentEl.createEl("p", {
				cls: "setting-item-description",
				text: NO_MODELS_MESSAGE,
			});

			new Setting(contentEl).addButton(button =>
				button.setButtonText("Close").onClick(() => this.close())
			);
			return;
		}

		// Filter out models already in consensus
		const availableModels = allModels.filter(
			model => !this.existingModelIds.includes(model.id)
		);

		if (availableModels.length === 0) {
			contentEl.createEl("p", {
				cls: "setting-item-description",
				text: "All configured models are already added to Consensus. Add more models in Model Management to use them here.",
			});

			new Setting(contentEl).addButton(button =>
				button.setButtonText("Close").onClick(() => this.close())
			);
			return;
		}

		// Help text explaining the selection
		contentEl.createEl("p", {
			cls: "setting-item-description",
			text: "Select a model from the registry to add to Consensus mode. The model will use its configured generation and embedding models.",
		});

		// Build dropdown options
		const dropdownOptions: Record<string, string> = {
			"": SELECT_MODEL_PLACEHOLDER,
		};

		for (const model of availableModels) {
			// Format: "{DisplayName} ({Provider}: {GenerationModel} / {EmbeddingModel})"
			// Mark models that are already used elsewhere
			const usageInfo = getModelUsageInfo(model.id, this.plugin.settings);
			let displayText = formatModelForDisplay(model);

			// Add usage indicator if model is used elsewhere
			if (usageInfo.usageCount > 0) {
				const usageLocations = usageInfo.usageLocations
					.filter(loc => loc !== "consensus")
					.map(loc => {
						switch (loc) {
							case "main": return "Main";
							case "council": return "Council";
							case "chair": return "Chair";
							default: return loc;
						}
					});
				if (usageLocations.length > 0) {
					displayText += ` [Also in: ${usageLocations.join(", ")}]`;
				}
			}

			dropdownOptions[model.id] = displayText;
		}

		// Model selection dropdown
		new Setting(contentEl)
			.setName("Select Model")
			.setDesc(
				"Choose a model from the central registry. " +
				"The generation model creates quiz questions, the embedding model evaluates answers."
			)
			.addDropdown(dropdown =>
				dropdown
					.addOptions(dropdownOptions)
					.setValue(this.selectedModelId)
					.onChange(value => {
						this.selectedModelId = value;
					})
			);

		// Weight slider
		new Setting(contentEl)
			.setName("Model Weight")
			.setDesc(
				"Weight for this model in consensus voting (1.0 = equal weight). " +
				"Higher weights give this model more influence in reaching consensus."
			)
			.addSlider(slider =>
				slider
					.setLimits(0.1, 3.0, 0.1)
					.setValue(this.weight)
					.setDynamicTooltip()
					.onChange(value => {
						this.weight = Math.round(value * 10) / 10;
					})
			);

		// Enabled toggle
		new Setting(contentEl)
			.setName("Enabled")
			.setDesc("Enable this model for consensus generation.")
			.addToggle(toggle =>
				toggle.setValue(this.enabled).onChange(value => {
					this.enabled = value;
				})
			);

		// Buttons
		new Setting(contentEl)
			.addButton(button =>
				button.setButtonText("Cancel").onClick(() => this.close())
			)
			.addButton(button =>
				button
					.setButtonText("Add Model")
					.setCta()
					.onClick(() => {
						if (!this.selectedModelId || this.selectedModelId === "") {
							new Notice("Please select a model from the dropdown");
							return;
						}

						// Create the model reference
						const reference = createDefaultConsensusModelReference(
							this.selectedModelId,
							this.weight,
							this.enabled
						);

						this.onSelect(reference);
						this.close();
					})
			);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for editing a consensus model reference (weight and enabled status).
 * Uses the new reference-based architecture where model config comes from registry.
 *
 * Task 13: Migrate Consensus settings to Advanced Modes
 * Requirements: 2.4, 2.5
 */
class ConsensusModelReferenceEditModal extends Modal {
	private readonly plugin: QuizGenerator;
	private readonly reference: ConsensusModelReference;
	private readonly modelConfig: ModelConfiguration | null;
	private readonly onSave: (reference: ConsensusModelReference) => void;
	private weight: number;
	private enabled: boolean;

	constructor(
		plugin: QuizGenerator,
		reference: ConsensusModelReference,
		modelConfig: ModelConfiguration | null,
		onSave: (reference: ConsensusModelReference) => void
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.reference = reference;
		this.modelConfig = modelConfig;
		this.onSave = onSave;
		this.weight = reference.weight;
		this.enabled = reference.enabled;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", { text: "Edit Consensus Model" });

		// Show model information (read-only, from registry)
		if (this.modelConfig) {
			const infoEl = contentEl.createDiv("model-info-display-qg");

			infoEl.createEl("p", {
				cls: "setting-item-description",
				text: `Display Name: ${this.modelConfig.displayName}`,
			});
			infoEl.createEl("p", {
				cls: "setting-item-description",
				text: `Generation Model: ${this.modelConfig.providerConfig.textGenerationModel || "<not set>"}`,
			});
			infoEl.createEl("p", {
				cls: "setting-item-description",
				text: `Embedding Model: ${this.modelConfig.providerConfig.embeddingModel || "<not set>"}`,
			});

			// Show usage info
			const usageInfo = getModelUsageInfo(this.reference.modelId, this.plugin.settings);
			if (usageInfo.usageCount > 1) {
				const usageLocations = usageInfo.usageLocations
					.filter(loc => loc !== "consensus")
					.map(loc => {
						switch (loc) {
							case "main": return "Main Generation";
							case "council": return "Council";
							case "chair": return "Council Chair";
							default: return loc;
						}
					});
				if (usageLocations.length > 0) {
					infoEl.createEl("p", {
						cls: "setting-item-description consensus-also-used-indicator-qg",
						text: `Also used in: ${usageLocations.join(", ")}`,
					});
				}
			}

			infoEl.createEl("p", {
				cls: "setting-item-description",
				text: "To change model configuration, edit it in Model Management.",
			});
		} else {
			contentEl.createEl("p", {
				cls: "setting-item-description warning-text-qg",
				text: `Warning: Model "${this.reference.modelId}" not found in registry. It may have been deleted.`,
			});
		}

		// Weight slider (editable)
		new Setting(contentEl)
			.setName("Model Weight")
			.setDesc(
				"Weight for this model in consensus voting (1.0 = equal weight). " +
				"Higher weights give this model more influence."
			)
			.addSlider(slider =>
				slider
					.setLimits(0.1, 3.0, 0.1)
					.setValue(this.weight)
					.setDynamicTooltip()
					.onChange(value => {
						this.weight = Math.round(value * 10) / 10;
					})
			);

		// Enabled toggle (editable)
		new Setting(contentEl)
			.setName("Enabled")
			.setDesc("Enable this model for consensus generation.")
			.addToggle(toggle =>
				toggle.setValue(this.enabled).onChange(value => {
					this.enabled = value;
				})
			);

		// Buttons
		new Setting(contentEl)
			.addButton(button =>
				button.setButtonText("Cancel").onClick(() => this.close())
			)
			.addButton(button =>
				button
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						const updatedReference: ConsensusModelReference = {
							modelId: this.reference.modelId,
							weight: this.weight,
							enabled: this.enabled,
						};
						this.onSave(updatedReference);
						this.close();
					})
			);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for selecting a model from the registry to add to Council.
 * Filters out models already in the council.
 *
 * Task 14: Council settings migration
 */
class CouncilModelSelectModal extends Modal {
	private readonly plugin: QuizGenerator;
	private readonly existingModelIds: string[];
	private readonly onSelect: (reference: CouncilModelReference) => void;
	private selectedModelId: string = "";
	private weight: number = 1.0;
	private enabled: boolean = true;

	constructor(
		plugin: QuizGenerator,
		existingModelIds: string[],
		onSelect: (reference: CouncilModelReference) => void
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.existingModelIds = existingModelIds;
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", { text: "Add Model to Council" });

		// Get all models from registry
		const allModels = getAllModels(this.plugin.settings.modelRegistry);

		if (allModels.length === 0) {
			contentEl.createEl("p", {
				cls: "setting-item-description",
				text: NO_MODELS_MESSAGE,
			});
			new Setting(contentEl).addButton(button =>
				button.setButtonText("Close").onClick(() => this.close())
			);
			return;
		}

		// Filter out models already in council
		const availableModels = allModels.filter(
			model => !this.existingModelIds.includes(model.id)
		);

		if (availableModels.length === 0) {
			contentEl.createEl("p", {
				cls: "setting-item-description",
				text: "All configured models are already added to Council. Add more models in Model Management to use them here.",
			});

			new Setting(contentEl).addButton(button =>
				button.setButtonText("Close").onClick(() => this.close())
			);
			return;
		}

		// Help text
		contentEl.createEl("p", {
			cls: "setting-item-description",
			text: "Select a model from the registry to add to Council mode. The model will use its configured generation and embedding models.",
		});

		// Details container (for selected model info)
		const detailsContainer = contentEl.createDiv("selected-model-details-qg");

		// Build dropdown options
		const dropdownOptions: Record<string, string> = {
			"": SELECT_MODEL_PLACEHOLDER,
		};

		for (const model of availableModels) {
			// Get usage info
			const usageInfo = getModelUsageInfo(model.id, this.plugin.settings);
			let displayText = formatModelForDisplay(model);

			// Add usage indicator if model is used elsewhere
			if (usageInfo.usageCount > 0) {
				const usageLocations = usageInfo.usageLocations
					.filter(loc => loc !== "council")
					.map(loc => {
						switch (loc) {
							case "main": return "Main";
							case "consensus": return "Consensus";
							case "chair": return "Chair";
							default: return loc;
						}
					});
				if (usageLocations.length > 0) {
					displayText += ` [Also in: ${usageLocations.join(", ")}]`;
				}
			}

			dropdownOptions[model.id] = displayText;
		}

		// Model selection dropdown
		new Setting(contentEl)
			.setName("Select Model")
			.setDesc(
				"Choose a model from the central registry. " +
				"The generation model creates quiz questions, the embedding model evaluates answers."
			)
			.addDropdown(dropdown =>
				dropdown
					.addOptions(dropdownOptions)
					.setValue(this.selectedModelId)
					.onChange(value => {
						this.selectedModelId = value;
						this.updateSelectedModelDetails(detailsContainer, availableModels);
					})
			);

		// Weight slider
		new Setting(contentEl)
			.setName("Model Weight")
			.setDesc(
				"Weight for this model in council ranking (1.0 = equal weight). " +
				"Higher weights give this model more influence in rankings and debate."
			)
			.addSlider(slider =>
				slider
					.setLimits(0.1, 3.0, 0.1)
					.setValue(this.weight)
					.setDynamicTooltip()
					.onChange(value => {
						this.weight = Math.round(value * 10) / 10;
					})
			);

		// Enabled toggle
		new Setting(contentEl)
			.setName("Enabled")
			.setDesc("Enable this model for council debate.")
			.addToggle(toggle =>
				toggle.setValue(this.enabled).onChange(value => {
					this.enabled = value;
				})
			);

		// Buttons
		new Setting(contentEl)
			.addButton(button =>
				button.setButtonText("Cancel").onClick(() => this.close())
			)
			.addButton(button =>
				button
					.setButtonText("Add Model")
					.setCta()
					.onClick(() => {
						if (!this.selectedModelId || this.selectedModelId === "") {
							new Notice("Please select a model from the dropdown");
							return;
						}

						// Create the model reference
						const reference: CouncilModelReference = {
							modelId: this.selectedModelId,
							weight: this.weight,
							enabled: this.enabled,
						};

						this.onSelect(reference);
						this.close();
					})
			);
	}

	private updateSelectedModelDetails(
		container: HTMLElement,
		availableModels: ModelConfiguration[]
	): void {
		container.empty();

		if (!this.selectedModelId || this.selectedModelId === "") {
			return;
		}

		const selectedModel = availableModels.find(m => m.id === this.selectedModelId);
		if (!selectedModel) {
			return;
		}

		const genModel = selectedModel.providerConfig.textGenerationModel || "<not set>";
		const embModel = selectedModel.providerConfig.embeddingModel || "<not set>";

		container.createEl("p", {
			cls: "setting-item-description",
			text: `Generation Model: ${genModel}`,
		});
		container.createEl("p", {
			cls: "setting-item-description",
			text: `Embedding Model: ${embModel}`,
		});

		if (!selectedModel.providerConfig.embeddingModel) {
			const warningEl = container.createEl("p", {
				cls: "setting-item-description warning-text-qg",
			});
			warningEl.textContent =
				"Warning: No embedding model configured. Short/long answer evaluation may not work.";
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for editing a council model reference (weight and enabled status).
 * Uses the new reference-based architecture where model config comes from registry.
 *
 * Task 14: Council settings migration
 */
class CouncilModelReferenceEditModal extends Modal {
	private readonly plugin: QuizGenerator;
	private readonly reference: CouncilModelReference;
	private readonly modelConfig: ModelConfiguration | null;
	private readonly onSave: (reference: CouncilModelReference) => void;
	private weight: number;
	private enabled: boolean;

	constructor(
		plugin: QuizGenerator,
		reference: CouncilModelReference,
		modelConfig: ModelConfiguration | null,
		onSave: (reference: CouncilModelReference) => void
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.reference = reference;
		this.modelConfig = modelConfig;
		this.onSave = onSave;
		this.weight = reference.weight;
		this.enabled = reference.enabled;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", { text: "Edit Council Model" });

		// Show model information (read-only, from registry)
		if (this.modelConfig) {
			const infoEl = contentEl.createDiv("model-info-display-qg");

			infoEl.createEl("p", {
				cls: "setting-item-description",
				text: `Display Name: ${this.modelConfig.displayName}`,
			});
			infoEl.createEl("p", {
				cls: "setting-item-description",
				text: `Generation Model: ${this.modelConfig.providerConfig.textGenerationModel || "<not set>"}`,
			});
			infoEl.createEl("p", {
				cls: "setting-item-description",
				text: `Embedding Model: ${this.modelConfig.providerConfig.embeddingModel || "<not set>"}`,
			});

			// Show usage info
			const usageInfo = getModelUsageInfo(this.reference.modelId, this.plugin.settings);
			if (usageInfo.usageCount > 1) {
				const usageLocations = usageInfo.usageLocations
					.filter(loc => loc !== "council")
					.map(loc => {
						switch (loc) {
							case "main": return "Main Generation";
							case "consensus": return "Consensus";
							case "chair": return "Council Chair";
							default: return loc;
						}
					});
				if (usageLocations.length > 0) {
					infoEl.createEl("p", {
						cls: "setting-item-description council-also-used-indicator-qg",
						text: `Also used in: ${usageLocations.join(", ")}`,
					});
				}
			}

			infoEl.createEl("p", {
				cls: "setting-item-description",
				text: "To change model configuration, edit it in Model Management.",
			});
		} else {
			contentEl.createEl("p", {
				cls: "setting-item-description warning-text-qg",
				text: `Warning: Model "${this.reference.modelId}" not found in registry. It may have been deleted.`,
			});
		}

		// Weight slider (editable)
		new Setting(contentEl)
			.setName("Model Weight")
			.setDesc(
				"Weight for this model in council ranking (1.0 = equal weight). " +
				"Higher weights give this model more influence."
			)
			.addSlider(slider =>
				slider
					.setLimits(0.1, 3.0, 0.1)
					.setValue(this.weight)
					.setDynamicTooltip()
					.onChange(value => {
						this.weight = Math.round(value * 10) / 10;
					})
			);

		// Enabled toggle (editable)
		new Setting(contentEl)
			.setName("Enabled")
			.setDesc("Enable this model for council debate.")
			.addToggle(toggle =>
				toggle.setValue(this.enabled).onChange(value => {
					this.enabled = value;
				})
			);

		// Buttons
		new Setting(contentEl)
			.addButton(button =>
				button.setButtonText("Cancel").onClick(() => this.close())
			)
			.addButton(button =>
				button
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						const updatedReference: CouncilModelReference = {
							modelId: this.reference.modelId,
							weight: this.weight,
							enabled: this.enabled,
						};
						this.onSave(updatedReference);
						this.close();
					})
			);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Add hover tooltip to a consensus model entry showing generation and embedding model details.
 * Task 13: Requirements 9.6 - Show which models will be used when hovering over Consensus model entries
 */
function addModelHoverTooltip(
	settingEl: HTMLElement,
	modelConfig: ModelConfiguration | null,
	hasEmbeddingWarning: boolean
): void {
	if (!modelConfig) return;

	let tooltipEl: HTMLElement | null = null;

	const showTooltip = (event: MouseEvent): void => {
		if (tooltipEl) return;

		tooltipEl = document.createElement("div");
		tooltipEl.className = "model-hover-tooltip-qg";

		// Header
		const header = tooltipEl.createDiv("tooltip-header");
		header.textContent = modelConfig.displayName;

		// Generation model row
		const genRow = tooltipEl.createDiv("tooltip-row");
		const genLabel = genRow.createSpan("label");
		genLabel.textContent = "Generation:";
		const genValue = genRow.createSpan("value");
		genValue.textContent = modelConfig.providerConfig.textGenerationModel || "not set";

		// Embedding model row
		const embRow = tooltipEl.createDiv("tooltip-row");
		const embLabel = embRow.createSpan("label");
		embLabel.textContent = "Embedding:";
		const embValue = embRow.createSpan("value");
		embValue.textContent = modelConfig.providerConfig.embeddingModel || "not set";

		// Warning if no embedding model
		if (hasEmbeddingWarning) {
			const warning = tooltipEl.createDiv("tooltip-warning");
			warning.textContent = "⚠ No embedding model - answer evaluation disabled";
		}

		// Position tooltip near mouse
		document.body.appendChild(tooltipEl as Node);
		const rect = settingEl.getBoundingClientRect();
		tooltipEl.style.position = "fixed";
		tooltipEl.style.top = `${rect.top}px`;
		tooltipEl.style.left = `${rect.right + 10}px`;

		// Adjust if off-screen
		const tooltipRect = tooltipEl.getBoundingClientRect();
		if (tooltipRect.right > window.innerWidth) {
			tooltipEl.style.left = `${rect.left - tooltipRect.width - 10}px`;
		}
		if (tooltipRect.bottom > window.innerHeight) {
			tooltipEl.style.top = `${window.innerHeight - tooltipRect.height - 10}px`;
		}
	};

	const hideTooltip = (): void => {
		if (tooltipEl) {
			tooltipEl.remove();
			tooltipEl = null;
		}
	};

	settingEl.addEventListener("mouseenter", showTooltip);
	settingEl.addEventListener("mouseleave", hideTooltip);
	settingEl.addEventListener("click", hideTooltip);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a toggle handler for collapsible sections that persists state.
 *
 * @param plugin - The plugin instance to save settings to
 * @param sectionId - The section ID from SECTION_IDS
 * @returns A callback function for the CollapsibleSection onToggle prop
 */
export function createToggleHandler(
	plugin: QuizGenerator,
	sectionId: typeof SECTION_IDS[keyof typeof SECTION_IDS]
): OnToggleCallback {
	return async (expanded: boolean): Promise<void> => {
		const newState = setSectionExpanded(
			plugin.settings.sectionCollapseState,
			sectionId,
			expanded
		);
		plugin.settings.sectionCollapseState = newState;
		await plugin.saveSettings();
	};
}

/**
 * Check if a setting value differs from its default.
 *
 * @param currentValue - The current value to check
 * @param defaultValue - The default value to compare against
 * @returns True if the values are different
 */
export function isModified<T>(currentValue: T, defaultValue: T): boolean {
	if (Array.isArray(currentValue) && Array.isArray(defaultValue)) {
		return JSON.stringify(currentValue) !== JSON.stringify(defaultValue);
	}
	if (typeof currentValue === "object" && typeof defaultValue === "object") {
		return JSON.stringify(currentValue) !== JSON.stringify(defaultValue);
	}
	return currentValue !== defaultValue;
}

/**
 * Add modified indicator to a setting if its value differs from default.
 *
 * @param settingEl - The setting element to add the indicator to
 * @param modified - Whether the setting is modified
 */
export function addModifiedIndicator(settingEl: HTMLElement, modified: boolean): void {
	if (!modified) {
		return;
	}

	const nameEl = settingEl.querySelector(".setting-item-name");
	if (!nameEl) {
		return;
	}

	const indicator = document.createElement("span");
	indicator.className = "modified-indicator-qg";
	indicator.textContent = "\u25cf"; // Unicode bullet
	indicator.setAttribute("title", "Modified from default");
	nameEl.appendChild(indicator as Node);
}

// ============================================================================
// Impact Estimate Calculation Helpers
// ============================================================================

/**
 * Calculate the impact estimate config for Consensus mode.
 *
 * @param plugin - The plugin instance
 * @returns Impact estimate configuration for display
 */
export function calculateConsensusImpact(plugin: QuizGenerator): ImpactEstimateConfig {
	const consensusSettings = plugin.settings.consensusSettings ?? DEFAULT_CONSENSUS_SETTINGS;
	const enabledModels = consensusSettings.models?.filter((m: { enabled: boolean }) => m.enabled) ?? [];
	const numModels = enabledModels.length;
	const maxIterations = consensusSettings.maxIterations ?? DEFAULT_CONSENSUS_SETTINGS.maxIterations;

	// Use the consensus config's estimator functions
	const costMultiplier = numModels >= CONSENSUS_CONSTANTS.MIN_MODELS
		? estimateCostImpact(numModels, maxIterations)
		: 1.0;
	const timeMultiplier = numModels >= CONSENSUS_CONSTANTS.MIN_MODELS
		? estimateTimeImpact(numModels, maxIterations)
		: 1.0;

	return {
		costMultiplier,
		timeMultiplier,
		showWarning: true,
		warningThreshold: 5,
	};
}

/**
 * Calculate the impact estimate config for Council mode.
 *
 * @param plugin - The plugin instance
 * @returns Impact estimate configuration for display
 */
export function calculateCouncilImpact(plugin: QuizGenerator): ImpactEstimateConfig {
	const councilSettings = plugin.settings.councilSettings ?? DEFAULT_COUNCIL_SETTINGS;
	const enabledModels = councilSettings.models?.filter((m: { enabled: boolean }) => m.enabled) ?? [];
	const numModels = enabledModels.length;
	const enableCritique = councilSettings.enableCritique ?? DEFAULT_COUNCIL_SETTINGS.enableCritique;
	const enableRanking = councilSettings.enableRanking ?? DEFAULT_COUNCIL_SETTINGS.enableRanking;

	// Use the council config's estimator functions (takes numModels, enableCritique, enableRanking)
	const costMultiplier = numModels >= COUNCIL_CONSTANTS.MIN_MODELS
		? estimateCouncilCostImpact(numModels, enableCritique, enableRanking)
		: 1.0;
	const timeMultiplier = numModels >= COUNCIL_CONSTANTS.MIN_MODELS
		? estimateCouncilTimeImpact(numModels, enableCritique, enableRanking)
		: 1.0;

	return {
		costMultiplier,
		timeMultiplier,
		showWarning: true,
		warningThreshold: 5,
	};
}

// ============================================================================
// Main Display Function
// ============================================================================

/**
 * Display the consolidated Advanced Generation Modes settings section.
 *
 * This function creates the main section container with:
 * - Section heading with help icon
 * - Mode Comparison component showing Main/Consensus/Council cards
 * - Collapsible Consensus sub-section with enable toggle and impact estimate
 * - Collapsible Council sub-section with enable toggle and impact estimate
 *
 * Structure:
 * ```
 * +------------------------------------------+
 * | Advanced Generation Modes            [?] |
 * +------------------------------------------+
 * | [Mode Comparison Cards]                  |
 * +------------------------------------------+
 * | > Consensus Mode               [toggle]  |
 * |   - Mode explanation                     |
 * |   - Enable toggle                        |
 * |   - Impact Estimate display              |
 * |   - (Full settings in Task 13)           |
 * +------------------------------------------+
 * | > Council Mode                 [toggle]  |
 * |   - Mode explanation                     |
 * |   - Enable toggle                        |
 * |   - Impact Estimate display              |
 * |   - (Full settings in Task 14)           |
 * +------------------------------------------+
 * ```
 *
 * @param containerEl - The container element to render settings into
 * @param context - The settings context containing plugin instance and callbacks
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
export function displayAdvancedModesSettings(
	containerEl: HTMLElement,
	context: AdvancedModesSettingsContext
): void {
	const { plugin, refreshSettings } = context;

	// Create section heading with help icon
	const headingSetting = new Setting(containerEl)
		.setName(SECTION_HEADING)
		.setHeading();

	const headingEl = headingSetting.settingEl.querySelector(".setting-item-name");
	if (headingEl) {
		addHelpIcon(headingEl as HTMLElement, SECTION_HELP_TOOLTIP);
	}

	// Add section description
	containerEl.createEl("p", {
		text: SECTION_DESCRIPTION,
		cls: "setting-item-description advanced-modes-description-qg",
	});

	// Determine the currently active generation mode
	const consensusEnabled = plugin.settings.consensusSettings?.enabled ?? false;
	const councilEnabled = plugin.settings.councilSettings?.enabled ?? false;
	const activeMode = getActiveGenerationMode(consensusEnabled, councilEnabled);

	// Create Mode Comparison container and render the ModeComparisonSection
	const modeComparisonContainer = containerEl.createDiv({
		cls: "mode-comparison-container-qg",
	});

	// Instantiate the ModeComparisonSection component
	const modeComparisonSection = new ModeComparisonSection(modeComparisonContainer, activeMode);

	// Get section expanded states
	const consensusExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.CONSENSUS
	);
	const councilExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.COUNCIL
	);

	// =========================================================================
	// Consensus Mode Sub-Section
	// =========================================================================
	const consensusSection = new CollapsibleSection(
		containerEl,
		"Consensus Mode",
		consensusExpanded,
		"consensus",
		createToggleHandler(plugin, SECTION_IDS.CONSENSUS)
	);

	// Add status badge to indicate enabled/disabled state
	if (consensusEnabled) {
		consensusSection.setStatusBadge("Enabled", true);
	}

	// Mode explanation box
	createModeExplanation(consensusSection.contentEl, {
		description: MODE_HELP.consensus.fullDescription,
		analogy: MODE_HELP.consensus.analogy,
		characteristics: MODE_HELP.consensus.labels.join(" • "),
		note: MODE_HELP.comparison.mainModelNote,
	});

	// Enable toggle for Consensus mode
	const consensusEnableSetting = new Setting(consensusSection.contentEl)
		.setName("Enable Consensus Mode")
		.setDesc(CONSENSUS_HELP.enable.description)
		.addToggle(toggle => {
			toggle
				.setValue(consensusEnabled)
				.onChange(async (value) => {
					// Initialize consensus settings if needed
					if (!plugin.settings.consensusSettings) {
						plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
					}

					if (value) {
						// Check if there are enough models configured
						const modelCount = plugin.settings.consensusSettings.models?.filter(
							(m: { enabled: boolean }) => m.enabled
						).length ?? 0;

						if (modelCount < CONSENSUS_CONSTANTS.MIN_MODELS) {
							new Notice(
								`Consensus mode requires at least ${CONSENSUS_CONSTANTS.MIN_MODELS} models. ` +
								`Configure models in the Consensus Models section below.`,
								5000
							);
						}

						// Disable council mode if enabling consensus (mutually exclusive)
						if (plugin.settings.councilSettings?.enabled) {
							plugin.settings.councilSettings.enabled = false;
						}
					}

					plugin.settings.consensusSettings.enabled = value;
					await plugin.saveSettings();

					// Update the mode comparison section to reflect new active mode
					const newActiveMode = getActiveGenerationMode(
						value,
						plugin.settings.councilSettings?.enabled ?? false
					);
					modeComparisonSection.setActiveMode(newActiveMode);

					// Refresh to update UI state
					refreshSettings();
				});
		});

	// Add modified indicator
	addModifiedIndicator(
		consensusEnableSetting.settingEl,
		isModified(consensusEnabled, DEFAULT_CONSENSUS_SETTINGS.enabled)
	);

	// Impact Estimate for Consensus mode
	const consensusImpactContainer = consensusSection.contentEl.createDiv({
		cls: "advanced-modes-impact-container-qg",
	});

	const consensusImpactLabel = consensusImpactContainer.createEl("h4", {
		cls: "advanced-modes-impact-label-qg",
		text: "Resource Impact",
	});

	const consensusImpactComponent = createImpactEstimateComponent(
		consensusImpactContainer,
		calculateConsensusImpact(plugin)
	);

	// =========================================================================
	// Consensus Mode Full Settings (Task 13: Migrated from consensusSettings.ts)
	// =========================================================================

	// Add feature enable prompt when consensus is disabled
	if (!consensusEnabled) {
		const promptEl = consensusSection.contentEl.createDiv("feature-enable-prompt-qg");
		const iconEl = promptEl.createDiv("feature-prompt-icon-qg");
		iconEl.textContent = "ⓘ";

		const textEl = promptEl.createDiv("feature-prompt-text-qg");
		const titleEl = textEl.createEl("strong");
		titleEl.textContent = "Multi-Model Consensus is disabled.";

		const descriptionEl = textEl.createEl("div");
		descriptionEl.textContent = "Enable it above and select at least 2 AI models from the Model Registry to improve quiz quality through consensus validation. Each model will independently analyze questions, and only questions that meet the consensus threshold will be included.";
	}

	// Data sharing status display (when enabled)
	if (consensusEnabled) {
		// Get providers from models (references to model registry)
		const resolver = createModelResolver(plugin.settings);
		const enabledProviders: Provider[] = [];

		// Resolve providers from model references
		if (plugin.settings.consensusSettings?.models && plugin.settings.consensusSettings.models.length > 0) {
			const enabledRefs = plugin.settings.consensusSettings.models.filter((m: { enabled: boolean }) => m.enabled);
			for (const ref of enabledRefs) {
				const modelConfig = resolver.tryResolve(ref.modelId);
				if (modelConfig) {
					enabledProviders.push(modelConfig.providerConfig.provider);
				}
			}
		}

		const uniqueProviders = Array.from(new Set(enabledProviders));
		const hasNonLocalProviders = uniqueProviders.some(p => p !== Provider.OLLAMA);
		const localOnlyMode = plugin.settings.consensusSettings?.privacyPreferences?.localOnlyMode ?? false;

		const statusContainer = consensusSection.contentEl.createDiv({
			cls: `consensus-data-sharing-status ${
				!hasNonLocalProviders || localOnlyMode ? "status-local-only" : "status-multi-provider"
			}`,
		});

		const statusIcon = statusContainer.createDiv({ cls: "consensus-data-sharing-status-icon" });
		statusIcon.textContent = !hasNonLocalProviders || localOnlyMode ? "🔒" : "🌐";

		const statusText = statusContainer.createDiv({ cls: "consensus-data-sharing-status-text" });

		if (!hasNonLocalProviders || localOnlyMode) {
			const titleEl = statusText.createDiv({
				cls: "consensus-data-sharing-status-title",
			});
			titleEl.textContent = "Local-only mode";
			const descEl = statusText.createDiv({
				cls: "consensus-data-sharing-status-description",
			});
			descEl.textContent = "Your content stays on your machine. Only local Ollama models are used.";
		} else {
			const titleEl2 = statusText.createDiv({
				cls: "consensus-data-sharing-status-title",
			});
			titleEl2.textContent = "Multi-provider mode";
			const providerList = uniqueProviders.join(", ");
			const descEl2 = statusText.createDiv({
				cls: "consensus-data-sharing-status-description",
			});
			descEl2.textContent = `Your content will be sent to: ${providerList}`;
		}
	}

	// -------------------------------------------------------------------------
	// Consensus Models Sub-Section
	// -------------------------------------------------------------------------
	const consensusModelsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.CONSENSUS_MODELS
	);

	const consensusModelsSection = new CollapsibleSection(
		consensusSection.contentEl,
		"Consensus Models",
		consensusModelsExpanded,
		"consensus",
		createToggleHandler(plugin, SECTION_IDS.CONSENSUS_MODELS)
	);

	consensusModelsSection.contentEl.createEl("p", {
		text: `Select at least ${CONSENSUS_CONSTANTS.MIN_MODELS} models from the Model Registry to participate in consensus. Each model will independently analyze quiz questions and answers.`,
		cls: "setting-item-description",
	});

	// Ensure model registry exists
	if (!plugin.settings.modelRegistry) {
		plugin.settings.modelRegistry = { ...DEFAULT_MODEL_REGISTRY };
	}

	// Initialize the model resolver
	const modelResolver = createModelResolver(plugin.settings);

	// Get all models from registry for display/selection
	const registryModels = getAllModels(plugin.settings.modelRegistry);

	// Model list container - uses model references from the registry
	const modelListContainer = consensusModelsSection.contentEl.createDiv("consensus-models-list");

	// Function to update the model list display
	const updateModelList = (): void => {
		modelListContainer.empty();

		// Use model references from the registry
		const modelReferences = plugin.settings.consensusSettings?.models ?? [];
		const hasModels = modelReferences.length > 0;

		if (!hasModels) {
			// Empty state
			const noModelsEl = modelListContainer.createEl("div", {
				cls: "no-models-prompt-qg",
			});

			if (registryModels.length === 0) {
				// No models in registry at all
				noModelsEl.innerHTML = `
					<p>No models available.</p>
					<p>${NO_MODELS_MESSAGE}</p>
				`;
			} else {
				// Models exist in registry but none selected for consensus
				noModelsEl.innerHTML = `
					<p>No models selected for Consensus yet.</p>
					<p>Click "Add Model from Registry" below to select models.</p>
					<p>You need at least ${CONSENSUS_CONSTANTS.MIN_MODELS} models to enable consensus mode.</p>
				`;
			}
		} else {
			// Render model references (from registry)
			modelReferences.forEach((reference: ConsensusModelReference, index: number) => {
				// Resolve the model from registry
				const modelConfig = modelResolver.tryResolve(reference.modelId);

				// Get usage info for "Also used in" indicator
				const usageInfo = getModelUsageInfo(reference.modelId, plugin.settings);
				const otherUsages = usageInfo.usageLocations
					.filter(loc => loc !== "consensus")
					.map(loc => {
						switch (loc) {
							case "main": return "Main";
							case "council": return "Council";
							case "chair": return "Chair";
							default: return loc;
						}
					});

				// Build description
				let description = "";
				if (modelConfig) {
					const provider = modelConfig.providerConfig.provider === Provider.OPENAI
						? "OpenAI Compatible" : "Ollama";
					const genModel = modelConfig.providerConfig.textGenerationModel || "none";
					const embModel = modelConfig.providerConfig.embeddingModel || "none";
					description = `${provider}: ${genModel} / ${embModel} | Weight: ${reference.weight} | ${
						reference.enabled ? "✓ Enabled" : "✗ Disabled"
					}`;
				} else {
					description = `⚠️ Model not found in registry | Weight: ${reference.weight} | ${
						reference.enabled ? "✓ Enabled" : "✗ Disabled"
					}`;
				}

				// Add "Also used in" indicator (Requirements 7.4)
				if (otherUsages.length > 0) {
					description += ` | Also in: ${otherUsages.join(", ")}`;
				}

				const setting = new Setting(modelListContainer as HTMLElement)
					.setName(modelConfig?.displayName ?? reference.modelId)
					.setDesc(description)
					.addButton(button =>
						button
							.setButtonText("Edit")
							.setClass("mod-cta")
							.onClick(() => {
								const modal = new ConsensusModelReferenceEditModal(
									plugin,
									reference,
									modelConfig,
									async updatedReference => {
										if (!plugin.settings.consensusSettings) return;
										if (!plugin.settings.consensusSettings.models) {
											plugin.settings.consensusSettings.models = [];
										}
										plugin.settings.consensusSettings.models[index] = updatedReference;
										await plugin.saveSettings();
										updateModelList();
										consensusImpactComponent.update(calculateConsensusImpact(plugin));
									}
								);
								modal.open();
							})
					)
					.addButton(button =>
						button
							.setButtonText("Remove")
							.setClass("mod-warning")
							.onClick(async () => {
								if (!plugin.settings.consensusSettings) return;
								if (!plugin.settings.consensusSettings.models) return;
								plugin.settings.consensusSettings.models.splice(index, 1);
								await plugin.saveSettings();
								updateModelList();
								consensusImpactComponent.update(calculateConsensusImpact(plugin));
							})
					);

				// Add CSS class for warning if model not found
				if (!modelConfig) {
					setting.settingEl.addClass("consensus-model-warning-qg");
				}

				// Add CSS class for "also used" indicator
				if (otherUsages.length > 0) {
					setting.settingEl.addClass("consensus-model-shared-qg");
				}

				// Add hover tooltip showing generation/embedding model details (Requirements 9.6)
				const hasEmbeddingWarning = modelConfig ? !modelConfig.providerConfig.embeddingModel : false;
				addModelHoverTooltip(setting.settingEl, modelConfig, hasEmbeddingWarning);
			});
		}
	};

	updateModelList();

	// Add model button - uses new dropdown modal for registry selection
	const noModelsInRegistry = registryModels.length === 0;
	const addModelSetting = new Setting(consensusModelsSection.contentEl);
	addModelSetting.addButton(button => {
		button
			.setButtonText("Add Model from Registry")
			.setCta()
			.setDisabled(noModelsInRegistry)
			.setTooltip(
				noModelsInRegistry
					? "Add models in the Model Management section first"
					: "Select a model from the registry to add to Consensus"
			)
			.onClick(() => {
				// Get existing model IDs from model references
				const existingIds = plugin.settings.consensusSettings?.models?.map((m: { modelId: string }) => m.modelId) ?? [];

				const modal = new ConsensusModelSelectModal(
					plugin,
					existingIds,
					async (newReference: ConsensusModelReference) => {
						if (!plugin.settings.consensusSettings) {
							plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
						}

						// Initialize models array if needed
						if (!plugin.settings.consensusSettings.models) {
							plugin.settings.consensusSettings.models = [];
						}

						// Add the new reference
						plugin.settings.consensusSettings.models.push(newReference);

						await plugin.saveSettings();
						updateModelList();
						consensusImpactComponent.update(calculateConsensusImpact(plugin));

						new Notice(`Model added to Consensus`, 3000);
					}
				);
				modal.open();
			});
	});

	// -------------------------------------------------------------------------
	// Consensus Parameters Sub-Section
	// -------------------------------------------------------------------------
	const consensusParamsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.CONSENSUS_PARAMETERS
	);

	const parametersSection = new CollapsibleSection(
		consensusSection.contentEl,
		"Consensus Parameters",
		consensusParamsExpanded,
		"default",
		createToggleHandler(plugin, SECTION_IDS.CONSENSUS_PARAMETERS)
	);

	const minModelsSetting = new Setting(parametersSection.contentEl)
		.setName("Minimum models required")
		.setDesc(CONSENSUS_HELP.minModels.description)
		.addSlider(slider =>
			slider
				.setLimits(
					CONSENSUS_CONSTANTS.MIN_MODELS,
					CONSENSUS_CONSTANTS.MAX_RECOMMENDED_MODELS,
					1
				)
				.setValue(
					plugin.settings.consensusSettings?.minModelsRequired ??
						DEFAULT_CONSENSUS_SETTINGS.minModelsRequired
				)
				.setDynamicTooltip()
				.onChange(async value => {
					if (!plugin.settings.consensusSettings) {
						plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
					}
					plugin.settings.consensusSettings.minModelsRequired = value;
					await plugin.saveSettings();
				})
		);
	addModifiedIndicator(
		minModelsSetting.settingEl,
		isModified(
			plugin.settings.consensusSettings?.minModelsRequired ??
				DEFAULT_CONSENSUS_SETTINGS.minModelsRequired,
			DEFAULT_CONSENSUS_SETTINGS.minModelsRequired
		)
	);

	const thresholdSetting = new Setting(parametersSection.contentEl)
		.setName("Consensus threshold (%)")
		.setDesc(`${CONSENSUS_HELP.threshold.description} ${CONSENSUS_HELP.threshold.recommendation}`)
		.addSlider(slider =>
			slider
				.setLimits(
					CONSENSUS_CONSTANTS.MIN_THRESHOLD_PERCENT,
					CONSENSUS_CONSTANTS.MAX_THRESHOLD_PERCENT,
					5
				)
				.setValue(
					(plugin.settings.consensusSettings?.consensusThreshold ??
						DEFAULT_CONSENSUS_SETTINGS.consensusThreshold) * 100
				)
				.setDynamicTooltip()
				.onChange(async value => {
					if (!plugin.settings.consensusSettings) {
						plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
					}
					plugin.settings.consensusSettings.consensusThreshold = value / 100;
					await plugin.saveSettings();

					// Warn if threshold is very high
					if (value >= 80) {
						new Notice(CONSENSUS_WARNINGS.HIGH_THRESHOLD, 6000);
					}
				})
		);
	addModifiedIndicator(
		thresholdSetting.settingEl,
		isModified(
			plugin.settings.consensusSettings?.consensusThreshold ??
				DEFAULT_CONSENSUS_SETTINGS.consensusThreshold,
			DEFAULT_CONSENSUS_SETTINGS.consensusThreshold
		)
	);

	const maxIterationsSetting = new Setting(parametersSection.contentEl)
		.setName("Maximum consensus iterations")
		.setDesc(`${CONSENSUS_HELP.iterations.description} ${CONSENSUS_HELP.iterations.impact}`)
		.addSlider(slider =>
			slider
				.setLimits(
					CONSENSUS_CONSTANTS.MIN_ITERATIONS,
					CONSENSUS_CONSTANTS.MAX_ITERATIONS,
					1
				)
				.setValue(
					plugin.settings.consensusSettings?.maxIterations ??
						DEFAULT_CONSENSUS_SETTINGS.maxIterations
				)
				.setDynamicTooltip()
				.onChange(async value => {
					if (!plugin.settings.consensusSettings) {
						plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
					}
					plugin.settings.consensusSettings.maxIterations = value;
					await plugin.saveSettings();
					consensusImpactComponent.update(calculateConsensusImpact(plugin));

					// Warn if iterations are very high
					if (value > 5) {
						new Notice(CONSENSUS_WARNINGS.MANY_ITERATIONS, 6000);
					}
				})
		);
	addModifiedIndicator(
		maxIterationsSetting.settingEl,
		isModified(
			plugin.settings.consensusSettings?.maxIterations ??
				DEFAULT_CONSENSUS_SETTINGS.maxIterations,
			DEFAULT_CONSENSUS_SETTINGS.maxIterations
		)
	);

	// -------------------------------------------------------------------------
	// Consensus Options Sub-Section
	// -------------------------------------------------------------------------
	const consensusOptionsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.CONSENSUS_OPTIONS
	);

	const optionsSection = new CollapsibleSection(
		consensusSection.contentEl,
		"Additional Options",
		consensusOptionsExpanded,
		"default",
		createToggleHandler(plugin, SECTION_IDS.CONSENSUS_OPTIONS)
	);

	new Setting(optionsSection.contentEl)
		.setName("Enable source validation")
		.setDesc(`${CONSENSUS_HELP.sourceValidation.description} ${CONSENSUS_HELP.sourceValidation.impact}`)
		.addToggle(toggle =>
			toggle
				.setValue(
					plugin.settings.consensusSettings?.enableSourceValidation ??
						DEFAULT_CONSENSUS_SETTINGS.enableSourceValidation
				)
				.onChange(async value => {
					if (!plugin.settings.consensusSettings) {
						plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
					}
					plugin.settings.consensusSettings.enableSourceValidation = value;
					await plugin.saveSettings();
				})
		);

	new Setting(optionsSection.contentEl)
		.setName("Enable caching")
		.setDesc(CONSENSUS_HELP.caching.description)
		.addToggle(toggle =>
			toggle
				.setValue(
					plugin.settings.consensusSettings?.enableCaching ??
						DEFAULT_CONSENSUS_SETTINGS.enableCaching
				)
				.onChange(async value => {
					if (!plugin.settings.consensusSettings) {
						plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
					}
					plugin.settings.consensusSettings.enableCaching = value;
					await plugin.saveSettings();
				})
		);

	new Setting(optionsSection.contentEl)
		.setName("Show audit trail")
		.setDesc(CONSENSUS_HELP.auditTrail.description)
		.addToggle(toggle =>
			toggle
				.setValue(
					plugin.settings.consensusSettings?.showAuditTrail ??
						DEFAULT_CONSENSUS_SETTINGS.showAuditTrail
				)
				.onChange(async value => {
					if (!plugin.settings.consensusSettings) {
						plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
					}
					plugin.settings.consensusSettings.showAuditTrail = value;
					await plugin.saveSettings();
				})
		);

	new Setting(optionsSection.contentEl)
		.setName("Fallback to single model")
		.setDesc(CONSENSUS_HELP.fallback.description)
		.addToggle(toggle =>
			toggle
				.setValue(
					plugin.settings.consensusSettings?.fallbackToSingleModel ??
						DEFAULT_CONSENSUS_SETTINGS.fallbackToSingleModel
				)
				.onChange(async value => {
					if (!plugin.settings.consensusSettings) {
						plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
					}
					plugin.settings.consensusSettings.fallbackToSingleModel = value;
					await plugin.saveSettings();
				})
		);

	// Reset consensus settings button
	new Setting(consensusSection.contentEl)
		.setName("Reset consensus settings")
		.setDesc("Reset all consensus settings to their default values. This cannot be undone.")
		.addButton(button =>
			button
				.setButtonText("Reset to defaults")
				.setClass("mod-warning")
				.onClick(async () => {
					plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
					await plugin.saveSettings();
					refreshSettings();
				})
		);

	// =========================================================================
	// Council Mode Sub-Section
	// =========================================================================
	const councilSection = new CollapsibleSection(
		containerEl,
		"Council Mode",
		councilExpanded,
		"council",
		createToggleHandler(plugin, SECTION_IDS.COUNCIL)
	);

	// Add status badge to indicate enabled/disabled state
	if (councilEnabled) {
		councilSection.setStatusBadge("Enabled", true);
	}

	// Mode explanation box
	createModeExplanation(councilSection.contentEl, {
		description: MODE_HELP.council.fullDescription,
		analogy: MODE_HELP.council.analogy,
		characteristics: MODE_HELP.council.labels.join(" • "),
		note: MODE_HELP.comparison.mainModelNote,
	});

	// Enable toggle for Council mode
	const councilEnableSetting = new Setting(councilSection.contentEl)
		.setName("Enable Council Mode")
		.setDesc(COUNCIL_HELP.enable.description)
		.addToggle(toggle => {
			toggle
				.setValue(councilEnabled)
				.onChange(async (value) => {
					// Initialize council settings if needed
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}

					if (value) {
						// Check if there are enough models configured
						const modelCount = plugin.settings.councilSettings.models?.filter(
							(m: { enabled: boolean }) => m.enabled
						).length ?? 0;

						if (modelCount < COUNCIL_CONSTANTS.MIN_MODELS) {
							new Notice(
								`Council mode requires at least ${COUNCIL_CONSTANTS.MIN_MODELS} models. ` +
								`Configure models in the Council Models section below.`,
								5000
							);
						}

						// Disable consensus mode if enabling council (mutually exclusive)
						if (plugin.settings.consensusSettings?.enabled) {
							plugin.settings.consensusSettings.enabled = false;
						}
					}

					plugin.settings.councilSettings.enabled = value;
					await plugin.saveSettings();

					// Update the mode comparison section to reflect new active mode
					const newActiveMode = getActiveGenerationMode(
						plugin.settings.consensusSettings?.enabled ?? false,
						value
					);
					modeComparisonSection.setActiveMode(newActiveMode);

					// Refresh to update UI state
					refreshSettings();
				});
		});

	// Add modified indicator
	addModifiedIndicator(
		councilEnableSetting.settingEl,
		isModified(councilEnabled, DEFAULT_COUNCIL_SETTINGS.enabled)
	);

	// Impact Estimate for Council mode
	const councilImpactContainer = councilSection.contentEl.createDiv({
		cls: "advanced-modes-impact-container-qg",
	});

	const councilImpactLabel = councilImpactContainer.createEl("h4", {
		cls: "advanced-modes-impact-label-qg",
		text: "Resource Impact",
	});

	const councilImpactComponent = createImpactEstimateComponent(
		councilImpactContainer,
		calculateCouncilImpact(plugin)
	);

	// Model count indicator
	const councilModelCount = plugin.settings.councilSettings?.models?.filter(
		(m: { enabled: boolean }) => m.enabled
	).length ?? 0;

	const councilModelInfo = councilSection.contentEl.createDiv({
		cls: "advanced-modes-model-info-qg",
	});

	if (councilModelCount === 0) {
		councilModelInfo.innerHTML = `
			<span class="model-count-warning-qg">⚠️ No models configured</span>
			<span class="model-count-hint-qg">Configure models in the full Council settings (Task 14)</span>
		`;
	} else if (councilModelCount < COUNCIL_CONSTANTS.MIN_MODELS) {
		councilModelInfo.innerHTML = `
			<span class="model-count-warning-qg">⚠️ ${councilModelCount} model(s) configured</span>
			<span class="model-count-hint-qg">At least ${COUNCIL_CONSTANTS.MIN_MODELS} models required for council</span>
		`;
	} else {
		const hasConfiguredChair = plugin.settings.councilSettings?.chairModel?.configuredChairId ||
			plugin.settings.councilSettings?.chairModel?.selectionStrategy !== "configured";
		councilModelInfo.innerHTML = `
			<span class="model-count-qg">✓ ${councilModelCount} models configured</span>
			${hasConfiguredChair
				? `<span class="chair-indicator-qg">Chair model assigned</span>`
				: `<span class="model-count-warning-qg">⚠️ No chair model selected</span>`
			}
		`;
	}

	// =========================================================================
	// Council Mode Full Settings (Task 14: Migrated from councilSettings.ts)
	// =========================================================================

	// Add feature enable prompt when council is disabled
	if (!councilEnabled) {
		const promptEl = councilSection.contentEl.createDiv("feature-enable-prompt-qg");
		const iconEl = promptEl.createDiv("feature-prompt-icon-qg");
		iconEl.textContent = "ⓘ";

		const textEl = promptEl.createDiv("feature-prompt-text-qg");
		const titleEl = textEl.createEl("strong");
		titleEl.textContent = "LLM Council is disabled.";

		const descriptionEl = textEl.createEl("div");
		descriptionEl.textContent = "Enable it above and configure at least 2 AI models to use structured debate for high-quality quiz generation. Council mode uses multiple models in a debate process with a chair model that synthesizes the final output.";
	}

	// Data sharing status display (when enabled)
	if (councilEnabled) {
		// Get providers from models (references to model registry)
		const resolver = createModelResolver(plugin.settings);
		const councilEnabledProviders: Provider[] = [];

		// Resolve providers from model references
		if (plugin.settings.councilSettings?.models && plugin.settings.councilSettings.models.length > 0) {
			const enabledRefs = plugin.settings.councilSettings.models.filter((m: CouncilModelReference) => m.enabled);
			for (const ref of enabledRefs) {
				const modelConfig = resolver.tryResolve(ref.modelId);
				if (modelConfig) {
					councilEnabledProviders.push(modelConfig.providerConfig.provider);
				}
			}
		}

		const uniqueCouncilProviders = Array.from(new Set(councilEnabledProviders));
		const hasNonLocalCouncilProviders = uniqueCouncilProviders.some(p => p !== Provider.OLLAMA);

		const councilStatusContainer = councilSection.contentEl.createDiv({
			cls: `council-data-sharing-status ${
				!hasNonLocalCouncilProviders ? "status-local-only" : "status-multi-provider"
			}`,
		});

		const councilStatusIcon = councilStatusContainer.createDiv({ cls: "council-data-sharing-status-icon" });
		councilStatusIcon.textContent = !hasNonLocalCouncilProviders ? "🔒" : "🌐";

		const councilStatusText = councilStatusContainer.createDiv({ cls: "council-data-sharing-status-text" });

		if (!hasNonLocalCouncilProviders) {
			const titleEl = councilStatusText.createDiv({
				cls: "council-data-sharing-status-title",
			});
			titleEl.textContent = "Local-only mode";
			const descEl = councilStatusText.createDiv({
				cls: "council-data-sharing-status-description",
			});
			descEl.textContent = "Your content stays on your machine. Only local Ollama models are used.";
		} else {
			const titleEl2 = councilStatusText.createDiv({
				cls: "council-data-sharing-status-title",
			});
			titleEl2.textContent = "Multi-provider mode";
			const providerList = uniqueCouncilProviders.join(", ");
			const descEl2 = councilStatusText.createDiv({
				cls: "council-data-sharing-status-description",
			});
			descEl2.textContent = `Your content will be sent to: ${providerList}`;
		}
	}

	// -------------------------------------------------------------------------
	// Council Models Sub-Section
	// -------------------------------------------------------------------------
	const councilModelsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.COUNCIL_MODELS
	);

	const councilModelsSection = new CollapsibleSection(
		councilSection.contentEl,
		"Council Models",
		councilModelsExpanded,
		"council",
		createToggleHandler(plugin, SECTION_IDS.COUNCIL_MODELS)
	);

	councilModelsSection.contentEl.createEl("p", {
		text: `Configure at least ${COUNCIL_CONSTANTS.MIN_MODELS} models to participate in council debate. Each model will independently generate quiz content, critique other responses, and rank outputs.`,
		cls: "setting-item-description",
	});

	// Get all models from registry for display/selection
	const councilRegistryModels = getAllModels(plugin.settings.modelRegistry ?? DEFAULT_MODEL_REGISTRY);

	// Council model list container - uses model references from the registry
	const councilModelListContainer = councilModelsSection.contentEl.createDiv("council-models-list");

	// Create model resolver for council
	const councilModelResolver = createModelResolver(plugin.settings);

	// Chair dropdown reference for reactive updates
	const chairContainerRef: { current: HTMLElement | null } = { current: null };

	// Function to update the council model list display
	const updateCouncilModelList = (): void => {
		councilModelListContainer.empty();

		// Use model references from the registry
		const councilModelReferences = plugin.settings.councilSettings?.models ?? [];
		const hasCouncilModels = councilModelReferences.length > 0;

		if (!hasCouncilModels) {
			// Empty state
			const noModelsEl = councilModelListContainer.createEl("div", {
				cls: "no-models-prompt-qg",
			});

			if (councilRegistryModels.length === 0) {
				// No models in registry at all
				noModelsEl.innerHTML = `
					<p>No models available.</p>
					<p>${NO_MODELS_MESSAGE}</p>
				`;
			} else {
				// Models exist in registry but none selected for council
				noModelsEl.innerHTML = `
					<p>No models selected for Council yet.</p>
					<p>Click "Add Model from Registry" below to select models.</p>
					<p>You need at least ${COUNCIL_CONSTANTS.MIN_MODELS} models to enable council mode.</p>
				`;
			}
		} else {
			// Render model references (from registry)
			councilModelReferences.forEach((reference: CouncilModelReference, index: number) => {
				// Resolve the model from registry
				const modelConfig = councilModelResolver.tryResolve(reference.modelId);

				// Get usage info for "Also used in" indicator
				const usageInfo = getModelUsageInfo(reference.modelId, plugin.settings);
				const otherUsages = usageInfo.usageLocations
					.filter(loc => loc !== "council")
					.map(loc => {
						switch (loc) {
							case "main": return "Main";
							case "consensus": return "Consensus";
							case "chair": return "Chair";
							default: return loc;
						}
					});

				// Build description
				let description = "";
				if (modelConfig) {
					const provider = modelConfig.providerConfig.provider === Provider.OPENAI
						? "OpenAI Compatible" : "Ollama";
					const genModel = modelConfig.providerConfig.textGenerationModel || "none";
					const embModel = modelConfig.providerConfig.embeddingModel || "none";
					description = `${provider}: ${genModel} / ${embModel} | Weight: ${reference.weight} | ${
						reference.enabled ? "✓ Enabled" : "✗ Disabled"
					}`;
				} else {
					description = `⚠️ Model not found in registry | Weight: ${reference.weight} | ${
						reference.enabled ? "✓ Enabled" : "✗ Disabled"
					}`;
				}

				// Add "Also used in" indicator
				if (otherUsages.length > 0) {
					description += ` | Also in: ${otherUsages.join(", ")}`;
				}

				const setting = new Setting(councilModelListContainer as HTMLElement)
					.setName(modelConfig?.displayName ?? reference.modelId)
					.setDesc(description)
					.addButton(button =>
						button
							.setButtonText("Edit")
							.setClass("mod-cta")
							.onClick(() => {
								const modal = new CouncilModelReferenceEditModal(
									plugin,
									reference,
									modelConfig,
									async updatedReference => {
										if (!plugin.settings.councilSettings) return;
										if (!plugin.settings.councilSettings.models) {
											plugin.settings.councilSettings.models = [];
										}

										// Check if disabling the chair model
										const strategy = plugin.settings.councilSettings.chairModel.selectionStrategy;
										const configuredChairId = plugin.settings.councilSettings.chairModel.configuredChairId;
										if (
											strategy === "configured" &&
											configuredChairId === reference.modelId &&
											reference.enabled === true &&
											updatedReference.enabled === false
										) {
											new Notice(
												`Warning: You are disabling the configured chair model. Please select a different chair or re-enable this model.`,
												5000
											);
										}

										plugin.settings.councilSettings.models[index] = updatedReference;
										await plugin.saveSettings();
										updateCouncilModelList();
										councilImpactComponent.update(calculateCouncilImpact(plugin));
										updateCouncilChairDropdown();
									}
								);
								modal.open();
							})
					)
					.addButton(button =>
						button
							.setButtonText("Remove")
							.setClass("mod-warning")
							.onClick(async () => {
								if (!plugin.settings.councilSettings) return;
								if (!plugin.settings.councilSettings.models) return;

								// Check if removing the chair model
								const strategy = plugin.settings.councilSettings.chairModel.selectionStrategy;
								const configuredChairId = plugin.settings.councilSettings.chairModel.configuredChairId;
								if (strategy === "configured" && configuredChairId === reference.modelId) {
									new Notice(
										`Warning: You are removing the configured chair model. The chair selection will be cleared.`,
										5000
									);
									plugin.settings.councilSettings.chairModel.configuredChairId = undefined;
								}

								plugin.settings.councilSettings.models.splice(index, 1);
								await plugin.saveSettings();
								updateCouncilModelList();
								councilImpactComponent.update(calculateCouncilImpact(plugin));
								updateCouncilChairDropdown();
							})
					);

				// Add CSS class for warning if model not found
				if (!modelConfig) {
					setting.settingEl.addClass("council-model-warning-qg");
				}

				// Add CSS class for "also used" indicator
				if (otherUsages.length > 0) {
					setting.settingEl.addClass("council-model-shared-qg");
				}

				// Add hover tooltip showing generation/embedding model details
				const hasEmbeddingWarning = modelConfig ? !modelConfig.providerConfig.embeddingModel : false;
				addModelHoverTooltip(setting.settingEl, modelConfig, hasEmbeddingWarning);
			});
		}
	};

	updateCouncilModelList();

	// Add model button - uses dropdown modal for registry selection
	const noCouncilModelsInRegistry = councilRegistryModels.length === 0;
	const addCouncilModelSetting = new Setting(councilModelsSection.contentEl);
	addCouncilModelSetting.addButton(button => {
		button
			.setButtonText("Add Model from Registry")
			.setCta()
			.setDisabled(noCouncilModelsInRegistry)
			.setTooltip(
				noCouncilModelsInRegistry
					? "Add models in the Model Management section first"
					: "Select a model from the registry to add to Council"
			)
			.onClick(() => {
				// Get existing model IDs from model references
				const existingIds = plugin.settings.councilSettings?.models?.map((m: CouncilModelReference) => m.modelId) ?? [];

				const modal = new CouncilModelSelectModal(
					plugin,
					existingIds,
					async (newReference: CouncilModelReference) => {
						if (!plugin.settings.councilSettings) {
							plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
						}

						// Initialize models array if needed
						if (!plugin.settings.councilSettings.models) {
							plugin.settings.councilSettings.models = [];
						}

						// Add the new reference
						plugin.settings.councilSettings.models.push(newReference);

						await plugin.saveSettings();
						updateCouncilModelList();
						councilImpactComponent.update(calculateCouncilImpact(plugin));
						updateCouncilChairDropdown();

						new Notice(`Model added to Council`, 3000);
					}
				);
				modal.open();
			});
	});

	// -------------------------------------------------------------------------
	// Chair Model Configuration Sub-Section
	// -------------------------------------------------------------------------
	const councilChairExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.COUNCIL_CHAIR
	);

	const chairSection = new CollapsibleSection(
		councilSection.contentEl,
		"Chair Model Configuration",
		councilChairExpanded,
		"default",
		createToggleHandler(plugin, SECTION_IDS.COUNCIL_CHAIR)
	);

	// Store reference to chair section container for reactive updates
	chairContainerRef.current = chairSection.contentEl;

	chairSection.contentEl.createEl("p", {
		text: COUNCIL_HELP_TEXT.SYNTHESIS_PHASE,
		cls: "setting-item-description",
	});

	// Chair selection strategy
	const councilStrategy = plugin.settings.councilSettings?.chairModel?.selectionStrategy ?? "highest-ranked";
	const currentChairId = plugin.settings.councilSettings?.chairModel?.configuredChairId;

	const chairStrategySetting = new Setting(chairSection.contentEl)
		.setName("Chair selection strategy")
		.setDesc("How to select which model serves as the chair for synthesis")
		.addDropdown(dropdown => {
			dropdown
				.addOption("highest-ranked", "Highest-Ranked")
				.addOption("configured", "Configured Model")
				.addOption("rotating", "Rotating")
				.setValue(councilStrategy)
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}
					if (!plugin.settings.councilSettings.chairModel) {
						plugin.settings.councilSettings.chairModel = { ...DEFAULT_COUNCIL_SETTINGS.chairModel };
					}
					plugin.settings.councilSettings.chairModel.selectionStrategy = value as any;
					await plugin.saveSettings();
					// Re-render chair dropdown
					renderCouncilChairDropdown();
				});
		});

	addModifiedIndicator(
		chairStrategySetting.settingEl,
		isModified(councilStrategy, DEFAULT_COUNCIL_SETTINGS.chairModel.selectionStrategy)
	);

	// Chair dropdown container
	const chairDropdownContainer = chairSection.contentEl.createDiv("council-chair-dropdown-container");

	// Function to render/update the chair dropdown
	const renderCouncilChairDropdown = (): void => {
		chairDropdownContainer.empty();

		const enabledModelRefs = (plugin.settings.councilSettings?.models ?? []).filter(
			(m: CouncilModelReference) => m.enabled
		);
		const strategy = plugin.settings.councilSettings?.chairModel?.selectionStrategy ?? "highest-ranked";
		const chairId = plugin.settings.councilSettings?.chairModel?.configuredChairId;

		// If no enabled models, show helpful prompt
		if (enabledModelRefs.length === 0) {
			const noModelsEl = chairDropdownContainer.createDiv({
				cls: "no-chair-models-prompt-qg"
			});
			noModelsEl.innerHTML = `
				<p style="color: var(--text-warning); margin-top: 8px;">
					<strong>⚠️ No enabled models available for chair selection</strong>
				</p>
				<p style="margin-top: 4px; color: var(--text-muted);">
					Add and enable at least one model in the "Council Models" section above.
				</p>
			`;
			return;
		}

		const chairModelSetting = new Setting(chairDropdownContainer)
			.setName("Chair model")
			.setDesc(
				strategy === "configured"
					? "This model will synthesize the final quiz from all model outputs"
					: `Chair will be selected ${strategy === "highest-ranked" ? "by highest peer ranking" : "by rotation"}. Select a model here to override automatic selection.`
			);

		chairModelSetting.addDropdown(dropdown => {
			// Add "Auto" option for non-configured strategies
			if (strategy !== "configured") {
				dropdown.addOption("__auto__", `Auto (${strategy === "highest-ranked" ? "Highest-Ranked" : "Rotating"})`);
			}

			// Populate dropdown from registry-based model references
			enabledModelRefs.forEach((ref: CouncilModelReference) => {
				const modelConfig = councilModelResolver.tryResolve(ref.modelId);
				if (modelConfig) {
					const providerName = modelConfig.providerConfig.provider === Provider.OPENAI ? "OpenAI" : "Ollama";
					const genModel = modelConfig.providerConfig.textGenerationModel || "unknown";

					// Get usage info for "Also used in" indicator
					const usageInfo = getModelUsageInfo(ref.modelId, plugin.settings);
					let displayText = `${modelConfig.displayName} (${providerName}: ${genModel})`;
					if (usageInfo.usageCount > 1) {
						const otherLocations = usageInfo.usageLocations
							.filter(loc => loc !== "council" && loc !== "chair")
							.map(loc => {
								switch (loc) {
									case "main": return "Main";
									case "consensus": return "Consensus";
									default: return loc;
								}
							});
						if (otherLocations.length > 0) {
							displayText += ` [Also in: ${otherLocations.join(", ")}]`;
						}
					}

					dropdown.addOption(ref.modelId, displayText);
				} else {
					// Model reference exists but model not found in registry
					dropdown.addOption(ref.modelId, `${ref.modelId} (not found in registry)`);
				}
			});

			// Determine current value
			let currentValue = "__auto__";
			if (strategy === "configured" && chairId) {
				currentValue = chairId;
			} else if (chairId && chairId !== "__auto__") {
				currentValue = chairId;
			} else if (strategy === "configured" && enabledModelRefs.length > 0) {
				currentValue = enabledModelRefs[0].modelId;
			}

			dropdown
				.setValue(currentValue)
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}
					if (!plugin.settings.councilSettings.chairModel) {
						plugin.settings.councilSettings.chairModel = { ...DEFAULT_COUNCIL_SETTINGS.chairModel };
					}

					if (value === "__auto__") {
						plugin.settings.councilSettings.chairModel.configuredChairId = undefined;
					} else {
						plugin.settings.councilSettings.chairModel.configuredChairId = value;
						plugin.settings.councilSettings.chairModel.selectionStrategy = "configured";
					}

					await plugin.saveSettings();
				});
		});

		addModifiedIndicator(
			chairModelSetting.settingEl,
			isModified(chairId ?? "", DEFAULT_COUNCIL_SETTINGS.chairModel.configuredChairId ?? "")
		);

		// Validate and show warning if needed
		if (chairId && strategy === "configured") {
			const allModels = plugin.settings.councilSettings?.models ?? [];
			const chairModelRef = allModels.find((m: CouncilModelReference) => m.modelId === chairId);

			if (!chairModelRef) {
				const warningEl = chairDropdownContainer.createDiv({ cls: "council-chair-warning-qg" });
				warningEl.innerHTML = `
					<span class="warning-icon">⚠️</span>
					<span class="warning-message">Selected chair "${chairId}" has been removed. Please select a different chair model.</span>
				`;
			} else if (!chairModelRef.enabled) {
				const warningEl = chairDropdownContainer.createDiv({ cls: "council-chair-warning-qg" });
				warningEl.innerHTML = `
					<span class="warning-icon">⚠️</span>
					<span class="warning-message">Selected chair "${chairId}" is currently disabled. Please enable this model or select a different chair.</span>
				`;
			}
		}
	};

	// Update function for reactive updates
	const updateCouncilChairDropdown = (): void => {
		renderCouncilChairDropdown();
	};

	renderCouncilChairDropdown();

	// Synthesis weight
	const synthesisWeightSetting = new Setting(chairSection.contentEl)
		.setName("Chair synthesis weight")
		.setDesc(
			"Weight given to chair model in final synthesis (1.0 = standard weight, higher values give chair more influence)"
		)
		.addSlider(slider =>
			slider
				.setLimits(
					COUNCIL_CONSTANTS.MIN_SYNTHESIS_WEIGHT,
					COUNCIL_CONSTANTS.MAX_SYNTHESIS_WEIGHT,
					0.1
				)
				.setValue(
					plugin.settings.councilSettings?.chairModel?.synthesisWeight ??
						DEFAULT_COUNCIL_SETTINGS.chairModel.synthesisWeight
				)
				.setDynamicTooltip()
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}
					if (!plugin.settings.councilSettings.chairModel) {
						plugin.settings.councilSettings.chairModel = { ...DEFAULT_COUNCIL_SETTINGS.chairModel };
					}
					plugin.settings.councilSettings.chairModel.synthesisWeight =
						Math.round(value * 10) / 10;
					await plugin.saveSettings();
				})
		);
	addModifiedIndicator(
		synthesisWeightSetting.settingEl,
		isModified(
			plugin.settings.councilSettings?.chairModel?.synthesisWeight ??
				DEFAULT_COUNCIL_SETTINGS.chairModel.synthesisWeight,
			DEFAULT_COUNCIL_SETTINGS.chairModel.synthesisWeight
		)
	);

	// -------------------------------------------------------------------------
	// Council Process Configuration Sub-Section
	// -------------------------------------------------------------------------
	const councilProcessExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.COUNCIL_PROCESS
	);

	const processSection = new CollapsibleSection(
		councilSection.contentEl,
		"Process Configuration",
		councilProcessExpanded,
		"default",
		createToggleHandler(plugin, SECTION_IDS.COUNCIL_PROCESS)
	);

	// Minimum models required
	const councilMinModelsSetting = new Setting(processSection.contentEl)
		.setName("Minimum models required")
		.setDesc(
			"Minimum number of models that must successfully respond for council to proceed"
		)
		.addSlider(slider =>
			slider
				.setLimits(
					COUNCIL_CONSTANTS.MIN_MODELS,
					COUNCIL_CONSTANTS.MAX_RECOMMENDED_MODELS,
					1
				)
				.setValue(
					plugin.settings.councilSettings?.minModelsRequired ??
						DEFAULT_COUNCIL_SETTINGS.minModelsRequired
				)
				.setDynamicTooltip()
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}
					plugin.settings.councilSettings.minModelsRequired = value;
					await plugin.saveSettings();
				})
		);
	addModifiedIndicator(
		councilMinModelsSetting.settingEl,
		isModified(
			plugin.settings.councilSettings?.minModelsRequired ??
				DEFAULT_COUNCIL_SETTINGS.minModelsRequired,
			DEFAULT_COUNCIL_SETTINGS.minModelsRequired
		)
	);

	// Enable critique phase
	const critiqueSetting = new Setting(processSection.contentEl)
		.setName("Enable critique phase")
		.setDesc(COUNCIL_HELP_TEXT.CRITIQUE_PHASE)
		.addToggle(toggle =>
			toggle
				.setValue(
					plugin.settings.councilSettings?.enableCritique ??
						DEFAULT_COUNCIL_SETTINGS.enableCritique
				)
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}
					plugin.settings.councilSettings.enableCritique = value;
					await plugin.saveSettings();
					councilImpactComponent.update(calculateCouncilImpact(plugin));

					// Warn if both critique and ranking are disabled
					if (!value && !plugin.settings.councilSettings.enableRanking) {
						new Notice(COUNCIL_WARNINGS.NO_CRITIQUE_OR_RANKING, 6000);
					}
				})
		);
	addModifiedIndicator(
		critiqueSetting.settingEl,
		isModified(
			plugin.settings.councilSettings?.enableCritique ??
				DEFAULT_COUNCIL_SETTINGS.enableCritique,
			DEFAULT_COUNCIL_SETTINGS.enableCritique
		)
	);

	// Enable ranking phase
	const rankingSetting = new Setting(processSection.contentEl)
		.setName("Enable ranking phase")
		.setDesc(COUNCIL_HELP_TEXT.RANKING_PHASE)
		.addToggle(toggle =>
			toggle
				.setValue(
					plugin.settings.councilSettings?.enableRanking ??
						DEFAULT_COUNCIL_SETTINGS.enableRanking
				)
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}
					plugin.settings.councilSettings.enableRanking = value;
					await plugin.saveSettings();
					councilImpactComponent.update(calculateCouncilImpact(plugin));

					// Warn if both critique and ranking are disabled
					if (!value && !plugin.settings.councilSettings.enableCritique) {
						new Notice(COUNCIL_WARNINGS.NO_CRITIQUE_OR_RANKING, 6000);
					}
				})
		);
	addModifiedIndicator(
		rankingSetting.settingEl,
		isModified(
			plugin.settings.councilSettings?.enableRanking ??
				DEFAULT_COUNCIL_SETTINGS.enableRanking,
			DEFAULT_COUNCIL_SETTINGS.enableRanking
		)
	);

	// -------------------------------------------------------------------------
	// Council Timeouts Sub-Section
	// -------------------------------------------------------------------------
	const councilTimeoutsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.COUNCIL_TIMEOUTS
	);

	const timeoutsSection = new CollapsibleSection(
		councilSection.contentEl,
		"Phase Timeouts",
		councilTimeoutsExpanded,
		"default",
		createToggleHandler(plugin, SECTION_IDS.COUNCIL_TIMEOUTS)
	);

	timeoutsSection.contentEl.createEl("p", {
		text: "Configure maximum wait time for each phase of the council process",
		cls: "setting-item-description",
	});

	// Helper to create timeout setting
	const createTimeoutSetting = (
		container: HTMLElement,
		name: string,
		desc: string,
		phase: keyof typeof DEFAULT_COUNCIL_SETTINGS.phaseTimeouts
	): void => {
		// Safely get timeout value with fallback
		const getTimeoutValue = (): number => {
			const timeouts = plugin.settings.councilSettings?.phaseTimeouts;
			if (timeouts && typeof timeouts[phase] === 'number') {
				return timeouts[phase];
			}
			return DEFAULT_COUNCIL_SETTINGS.phaseTimeouts[phase];
		};

		const setting = new Setting(container)
			.setName(name)
			.setDesc(desc)
			.addSlider(slider =>
				slider
					.setLimits(10000, 300000, 5000)
					.setValue(getTimeoutValue())
					.setDynamicTooltip()
					.onChange(async value => {
						if (!plugin.settings.councilSettings) {
							plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
						}
						if (!plugin.settings.councilSettings.phaseTimeouts) {
							plugin.settings.councilSettings.phaseTimeouts = { ...DEFAULT_COUNCIL_SETTINGS.phaseTimeouts };
						}
						plugin.settings.councilSettings.phaseTimeouts[phase] = value;
						await plugin.saveSettings();

						// Warn if timeout is very high
						if (value > 120000) {
							new Notice(COUNCIL_WARNINGS.VERY_HIGH_TIMEOUT, 5000);
						}
					})
			);

		// Add display of timeout in seconds
		const valueDisplay = setting.settingEl.createDiv({
			cls: "timeout-value-display",
		});
		valueDisplay.style.fontSize = "0.9em";
		valueDisplay.style.color = "var(--text-muted)";
		valueDisplay.textContent = `(${getTimeoutValue() / 1000}s)`;

		addModifiedIndicator(
			setting.settingEl,
			isModified(
				getTimeoutValue(),
				DEFAULT_COUNCIL_SETTINGS.phaseTimeouts[phase]
			)
		);
	};

	createTimeoutSetting(
		timeoutsSection.contentEl,
		"Parallel query timeout",
		"Maximum time to wait for initial model responses",
		"parallelQuery"
	);
	createTimeoutSetting(
		timeoutsSection.contentEl,
		"Critique phase timeout",
		"Maximum time to wait for critique responses",
		"critique"
	);
	createTimeoutSetting(
		timeoutsSection.contentEl,
		"Ranking phase timeout",
		"Maximum time to wait for ranking responses",
		"ranking"
	);
	createTimeoutSetting(
		timeoutsSection.contentEl,
		"Synthesis phase timeout",
		"Maximum time to wait for chair synthesis",
		"synthesis"
	);

	// -------------------------------------------------------------------------
	// Council Options Sub-Section
	// -------------------------------------------------------------------------
	const councilOptionsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.COUNCIL_OPTIONS
	);

	const councilOptionsSection = new CollapsibleSection(
		councilSection.contentEl,
		"Additional Options",
		councilOptionsExpanded,
		"default",
		createToggleHandler(plugin, SECTION_IDS.COUNCIL_OPTIONS)
	);

	new Setting(councilOptionsSection.contentEl)
		.setName("Show debate trail")
		.setDesc(COUNCIL_HELP_TEXT.DEBATE_TRAIL)
		.addToggle(toggle =>
			toggle
				.setValue(
					plugin.settings.councilSettings?.showDebateTrail ??
						DEFAULT_COUNCIL_SETTINGS.showDebateTrail
				)
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}
					plugin.settings.councilSettings.showDebateTrail = value;
					await plugin.saveSettings();
				})
		);

	new Setting(councilOptionsSection.contentEl)
		.setName("Enable caching")
		.setDesc(COUNCIL_HELP_TEXT.CACHING)
		.addToggle(toggle =>
			toggle
				.setValue(
					plugin.settings.councilSettings?.enableCaching ??
						DEFAULT_COUNCIL_SETTINGS.enableCaching
				)
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}
					plugin.settings.councilSettings.enableCaching = value;
					await plugin.saveSettings();
				})
		);

	new Setting(councilOptionsSection.contentEl)
		.setName("Fallback to single model")
		.setDesc(
			"If council fails or insufficient models are available, fall back to standard single-model generation"
		)
		.addToggle(toggle =>
			toggle
				.setValue(
					plugin.settings.councilSettings?.fallbackToSingleModel ??
						DEFAULT_COUNCIL_SETTINGS.fallbackToSingleModel
				)
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}
					plugin.settings.councilSettings.fallbackToSingleModel = value;
					await plugin.saveSettings();
				})
		);

	// Reset council settings button
	new Setting(councilSection.contentEl)
		.setName("Reset council settings")
		.setDesc("Reset all council settings to their default values. This cannot be undone.")
		.addButton(button =>
			button
				.setButtonText("Reset to defaults")
				.setClass("mod-warning")
				.onClick(async () => {
					plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					await plugin.saveSettings();
					refreshSettings();
				})
		);
}

/**
 * Display the Advanced Modes section using the simplified API.
 * This is a convenience wrapper around displayAdvancedModesSettings.
 *
 * @param containerEl - The container element to render settings into
 * @param plugin - The plugin instance
 * @param refreshSettings - Optional callback to refresh settings
 */
export function displayAdvancedModes(
	containerEl: HTMLElement,
	plugin: QuizGenerator,
	refreshSettings?: () => void
): void {
	displayAdvancedModesSettings(containerEl, {
		plugin,
		refreshSettings: refreshSettings ?? (() => {}),
	});
}

export default displayAdvancedModesSettings;
