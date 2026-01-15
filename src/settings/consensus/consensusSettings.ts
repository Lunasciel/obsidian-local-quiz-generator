/**
 * Consensus Settings Section
 *
 * @deprecated This file is deprecated as of Task 22 (settings-ui-cleanup).
 * The active implementation has been migrated to:
 * `src/settings/advancedModes/advancedModesSettings.ts`
 *
 * This file is kept for backwards compatibility with existing tests.
 * New code should import from `advancedModesSettings.ts` instead.
 *
 * Migration completed in:
 * - Task 13: Migrate Consensus settings to Advanced Modes
 * - Task 15: Update main settings.ts to use displayAdvancedModesSettings()
 * - Task 22: Clean up deprecated code and add deprecation notices
 *
 * Original documentation:
 * Task 37: Add help text and tooltips throughout settings UI
 * Task 5.4: Section collapse state persistence
 * Requirements: 6.6, 8.1, 8.3, 8.5, 8.7, 10.1, 10.2, 10.3
 */

import { Modal, Notice, Setting } from "obsidian";
import QuizGenerator from "../../main";
import { CollapsibleSection, OnToggleCallback } from "../../ui/components/CollapsibleSection";
import {
	DEFAULT_CONSENSUS_SETTINGS,
	validateConsensusSettings,
	estimateCostImpact,
	estimateTimeImpact,
	CONSENSUS_CONSTANTS,
	CONSENSUS_WARNINGS,
	createDefaultConsensusModelConfig,
	createDefaultConsensusModelReference,
} from "./consensusConfig";
import { ConsensusModelConfig } from "../../consensus/types";
import { Provider, providers } from "../../generators/providers";
import { DEFAULT_SETTINGS } from "../config";
import ConsensusPrivacyWarningModal from "../../ui/components/ConsensusPrivacyWarningModal";
import {
	getAllModels,
	formatModelForDisplay,
	ModelConfiguration,
	ConsensusModelReference,
	createModelResolver,
	getModelUsageInfo,
	DEFAULT_MODEL_REGISTRY,
} from "../modelRegistry";
import { CONSENSUS_HELP, MODE_HELP } from "../helpText";
import {
	addHelpIcon,
	addInfoIconToSetting,
	createModeExplanation,
} from "../../ui/components/SettingsHelpText";
import {
	SECTION_IDS,
	getSectionExpanded,
	setSectionExpanded,
} from "../sectionCollapseState";

/**
 * Check if a setting value differs from its default
 */
const isModified = <T>(currentValue: T, defaultValue: T): boolean => {
	if (Array.isArray(currentValue) && Array.isArray(defaultValue)) {
		return JSON.stringify(currentValue) !== JSON.stringify(defaultValue);
	}
	if (typeof currentValue === "object" && typeof defaultValue === "object") {
		return JSON.stringify(currentValue) !== JSON.stringify(defaultValue);
	}
	return currentValue !== defaultValue;
};

/**
 * Add modified indicator to a setting if its value differs from default
 */
const addModifiedIndicator = (settingEl: HTMLElement, isModified: boolean): void => {
	if (!isModified) {
		return;
	}

	const nameEl = settingEl.querySelector(".setting-item-name");
	if (!nameEl) {
		return;
	}

	const indicator = document.createElement("span");
	indicator.className = "modified-indicator-qg";
	indicator.textContent = "●";
	indicator.setAttribute("title", "Modified from default");
	nameEl.appendChild(indicator as Node);
};

/**
 * Mode explanation text for consensus mode.
 * Requirements: 8.1, 8.3, 8.5, 8.7
 */
const MODE_EXPLANATION =
	"Multiple models work independently and in parallel. Only questions where models agree are accepted. " +
	"Quality through agreement. Multiple rounds allow models to reconsider after seeing alternative answers.";

/**
 * Mode characteristics for consensus mode.
 * Requirements: 8.7
 */
const MODE_CHARACTERISTICS = "Higher quality • Independent validation • Requires agreement • Higher cost";

/**
 * Mode analogy for consensus mode (for help/tooltip).
 * Requirements: 8.5
 */
const MODE_ANALOGY =
	"Like multiple doctors independently diagnosing - only accepting diagnoses where all doctors agree.";

/**
 * Mode comparison note explaining when main model is NOT used.
 * Requirements: 9.7
 */
const MODE_USAGE_NOTE =
	"When Consensus mode is enabled, ONLY the Consensus models' generation models are used for quiz creation. " +
	"The Main generation model is NOT used.";

/**
 * Empty state message when no models are configured in the registry.
 * Requirements: 2.3
 */
const NO_MODELS_MESSAGE =
	"No models configured in the Model Registry. Add models in the Model Management section above.";

/**
 * Placeholder option for dropdown when selecting models.
 */
const SELECT_MODEL_PLACEHOLDER = "-- Select a model from registry --";

/**
 * Add hover tooltip to a consensus/council model entry showing generation and embedding model details.
 * Requirements: 9.6 - Show which models will be used when hovering over Consensus/Council model entries
 */
const addModelHoverTooltip = (
	settingEl: HTMLElement,
	modelConfig: ModelConfiguration | null,
	hasEmbeddingWarning: boolean
): void => {
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
};

/**
 * Modal for editing individual consensus model configuration
 */
class ConsensusModelConfigModal extends Modal {
	private readonly plugin: QuizGenerator;
	private readonly modelConfig: ConsensusModelConfig | null;
	private readonly onSave: (config: ConsensusModelConfig) => void;
	private tempConfig: ConsensusModelConfig;

	constructor(
		plugin: QuizGenerator,
		modelConfig: ConsensusModelConfig | null,
		onSave: (config: ConsensusModelConfig) => void
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.modelConfig = modelConfig;
		this.onSave = onSave;

		// Initialize temp config
		if (modelConfig) {
			// Editing existing model - deep copy
			this.tempConfig = {
				...modelConfig,
				providerConfig: { ...modelConfig.providerConfig },
				quizSettings: { ...modelConfig.quizSettings },
			};
		} else {
			// Creating new model - use defaults from current plugin settings
			this.tempConfig = createDefaultConsensusModelConfig(
				`model-${Date.now()}`,
				this.plugin.settings.provider as Provider,
				{ ...this.plugin.settings }
			);
		}
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.modelConfig ? "Edit Consensus Model" : "Add Consensus Model",
		});

		// Model ID
		new Setting(contentEl)
			.setName("Model ID")
			.setDesc("Unique identifier for this model (e.g., 'gpt4-primary', 'claude-backup')")
			.addText(text =>
				text
					.setValue(this.tempConfig.id)
					.setPlaceholder("model-id")
					.onChange(value => {
						this.tempConfig.id = value.trim();
					})
			);

		// Provider
		new Setting(contentEl)
			.setName("Provider")
			.setDesc("AI provider for this model")
			.addDropdown(dropdown =>
				dropdown
					.addOptions(providers)
					.setValue(this.tempConfig.provider)
					.onChange(value => {
						this.tempConfig.provider = value as Provider;
						// Reset providerConfig to match selection
						(this.tempConfig.providerConfig as any).provider = value as Provider;
					})
			);

		// Model Name (provider-specific) - Uses providerConfig (Requirement 6.2)
		if (this.tempConfig.provider === Provider.OPENAI) {
			new Setting(contentEl)
				.setName("Model Name")
				.setDesc("OpenAI model name (e.g., gpt-4, gpt-3.5-turbo)")
				.addText(text =>
					text
						.setValue(this.tempConfig.providerConfig.textGenerationModel || "gpt-4")
						.setPlaceholder("gpt-4")
						.onChange(value => {
							(this.tempConfig.providerConfig as any).textGenerationModel = value.trim();
						})
				);

			new Setting(contentEl)
				.setName("API Key")
				.setDesc("OpenAI API key for this model")
				.addText(text => {
					text.inputEl.type = "password";
					text
						.setValue((this.tempConfig.providerConfig as any).apiKey || "")
						.setPlaceholder("sk-...")
						.onChange(value => {
							(this.tempConfig.providerConfig as any).apiKey = value.trim();
						});
				});

			new Setting(contentEl)
				.setName("Base URL")
				.setDesc("API base URL (for OpenAI-compatible providers)")
				.addText(text =>
					text
						.setValue(
							this.tempConfig.providerConfig.baseUrl ||
								"https://api.openai.com/v1"
						)
						.setPlaceholder("https://api.openai.com/v1")
						.onChange(value => {
							(this.tempConfig.providerConfig as any).baseUrl = value.trim();
						})
				);
		} else if (this.tempConfig.provider === Provider.OLLAMA) {
			new Setting(contentEl)
				.setName("Model Name")
				.setDesc("Ollama model name (e.g., llama2, mistral)")
				.addText(text =>
					text
						.setValue(this.tempConfig.providerConfig.textGenerationModel || "llama2")
						.setPlaceholder("llama2")
						.onChange(value => {
							(this.tempConfig.providerConfig as any).textGenerationModel = value.trim();
						})
				);

			new Setting(contentEl)
				.setName("Base URL")
				.setDesc("Ollama server URL")
				.addText(text =>
					text
						.setValue(
							this.tempConfig.providerConfig.baseUrl || "http://localhost:11434"
						)
						.setPlaceholder("http://localhost:11434")
						.onChange(value => {
							(this.tempConfig.providerConfig as any).baseUrl = value.trim();
						})
				);
		}

		// Model Weight
		new Setting(contentEl)
			.setName("Model Weight")
			.setDesc(
				"Weight for this model in consensus (1.0 = equal weight). Higher weights give this model more influence."
			)
			.addSlider(slider =>
				slider
					.setLimits(0.1, 3.0, 0.1)
					.setValue(this.tempConfig.weight)
					.setDynamicTooltip()
					.onChange(value => {
						this.tempConfig.weight = Math.round(value * 10) / 10;
					})
			);

		// Enabled Toggle
		new Setting(contentEl)
			.setName("Enabled")
			.setDesc("Enable this model for consensus generation")
			.addToggle(toggle =>
				toggle.setValue(this.tempConfig.enabled).onChange(value => {
					this.tempConfig.enabled = value;
				})
			);

		// Buttons
		new Setting(contentEl)
			.addButton(button =>
				button
					.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					})
			)
			.addButton(button =>
				button
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						// Validate model ID
						if (!this.tempConfig.id || this.tempConfig.id.trim() === "") {
							new Notice("Model ID cannot be empty");
							return;
						}

						// Validate provider-specific settings (using providerConfig)
						if (this.tempConfig.provider === Provider.OPENAI) {
							if (
								!this.tempConfig.providerConfig.textGenerationModel ||
								this.tempConfig.providerConfig.textGenerationModel.trim() === ""
							) {
								new Notice("Model name cannot be empty");
								return;
							}
							if (
								!(this.tempConfig.providerConfig as any).apiKey ||
								(this.tempConfig.providerConfig as any).apiKey.trim() === ""
							) {
								new Notice("API key cannot be empty");
								return;
							}
						} else if (this.tempConfig.provider === Provider.OLLAMA) {
							if (
								!this.tempConfig.providerConfig.textGenerationModel ||
								this.tempConfig.providerConfig.textGenerationModel.trim() === ""
							) {
								new Notice("Model name cannot be empty");
								return;
							}
						}

						this.onSave(this.tempConfig);
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
 * Modal for selecting a model from the registry to add to consensus.
 * Uses dropdown instead of manual text entry.
 *
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

		// Show selected model details (if a model is selected)
		const detailsContainer = contentEl.createDiv("selected-model-details-qg");
		this.updateSelectedModelDetails(detailsContainer, availableModels);

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
 * Modal for editing a consensus model reference (weight and enabled status).
 * Uses the new reference-based architecture where model config comes from registry.
 *
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
 * Display consensus settings in the plugin settings tab
 * Implements requirements 5.1-5.6 from the multi-model consensus spec
 *
 * Updated to use registry-based model selection.
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 7.4, 8.1, 8.3, 8.7, 10.7
 */
const displayConsensusSettings = (containerEl: HTMLElement, plugin: QuizGenerator): void => {
	// Section heading with help icon
	const headingSetting = new Setting(containerEl).setName("Multi-Model Consensus").setHeading();
	const headingEl = headingSetting.settingEl.querySelector(".setting-item-name");
	if (headingEl) {
		addHelpIcon(headingEl as HTMLElement, MODE_HELP.consensus.tooltip);
	}

	// Mode explanation box with analogy and characteristics
	createModeExplanation(containerEl, {
		description: MODE_HELP.consensus.fullDescription,
		analogy: MODE_HELP.consensus.analogy,
		characteristics: MODE_HELP.consensus.labels.join(" • "),
		note: MODE_HELP.comparison.mainModelNote,
	});

	// Check if consensus is enabled
	const consensusEnabled = plugin.settings.consensusSettings?.enabled ?? false;

	// Add feature enable prompt when consensus is disabled
	if (!consensusEnabled) {
		const promptEl = containerEl.createDiv("feature-enable-prompt-qg");
		const iconEl = promptEl.createDiv("feature-prompt-icon-qg");
		iconEl.textContent = "ⓘ";

		const textEl = promptEl.createDiv("feature-prompt-text-qg");
		const titleEl = textEl.createEl("strong");
		titleEl.textContent = "Multi-Model Consensus is disabled.";

		const descriptionEl = textEl.createEl("div");
		descriptionEl.textContent = "Enable it below and select at least 2 AI models from the Model Registry to improve quiz quality through consensus validation. Each model will independently analyze questions, and only questions that meet the consensus threshold will be included.";
	}

	const enabledSetting = new Setting(containerEl)
		.setName("Enable consensus mode")
		.setDesc(CONSENSUS_HELP.enable.description)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.consensusSettings?.enabled ?? false)
				.onChange(async value => {
					if (!plugin.settings.consensusSettings) {
						plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
					}

					// If enabling, check for privacy warning requirement
					if (value) {
						// Validate before enabling
						const validation = validateConsensusSettings(
							plugin.settings.consensusSettings
						);
						if (!validation.isValid) {
							new Notice(
								`Cannot enable consensus: ${validation.error}`,
								5000
							);
							plugin.settings.consensusSettings.enabled = false;
							await plugin.saveSettings();
							displayConsensusSettings(containerEl, plugin);
							return;
						}

						// Get enabled models and their providers from the model registry
						const enabledModels = plugin.settings.consensusSettings.models.filter(
							(m: { enabled: boolean }) => m.enabled
						);
						const enabledProviders: Provider[] = enabledModels
							.map((m: { modelId: string }) => {
								const modelConfig = plugin.settings.modelRegistry?.models?.[m.modelId];
								return modelConfig?.providerConfig?.provider;
							})
							.filter((p: Provider | undefined): p is Provider => p !== undefined);
						const uniqueProviders = Array.from(new Set(enabledProviders));

						// Check if privacy warning needs to be shown
						const needsPrivacyWarning =
							!plugin.settings.consensusSettings.privacyPreferences
								?.privacyWarningAcknowledged ||
							uniqueProviders.some(
								p =>
									!plugin.settings.consensusSettings?.privacyPreferences?.approvedProviders.includes(
										p
									)
							);

						if (needsPrivacyWarning && enabledModels.length > 0) {
							// Show privacy warning modal
							const modal = new ConsensusPrivacyWarningModal(
								plugin.app,
								enabledProviders,
								async (localOnlyMode: boolean) => {
									// User accepted - update privacy preferences
									if (!plugin.settings.consensusSettings!.privacyPreferences) {
										plugin.settings.consensusSettings!.privacyPreferences = {
											privacyWarningAcknowledged: true,
											privacyWarningAcknowledgedAt: Date.now(),
											localOnlyMode,
											approvedProviders: uniqueProviders,
										};
									} else {
										plugin.settings.consensusSettings!.privacyPreferences.privacyWarningAcknowledged = true;
										plugin.settings.consensusSettings!.privacyPreferences.privacyWarningAcknowledgedAt =
											Date.now();
										plugin.settings.consensusSettings!.privacyPreferences.localOnlyMode =
											localOnlyMode;
										plugin.settings.consensusSettings!.privacyPreferences.approvedProviders =
											uniqueProviders;
									}

									// If local-only mode selected, disable non-Ollama models
									if (localOnlyMode) {
										for (const modelRef of plugin.settings.consensusSettings!.models) {
											const modelConfig = plugin.settings.modelRegistry?.models?.[modelRef.modelId];
											if (modelConfig?.providerConfig?.provider !== Provider.OLLAMA) {
												modelRef.enabled = false;
											}
										}
									}

									// Enable consensus
									plugin.settings.consensusSettings!.enabled = true;
									await plugin.saveSettings();
									displayConsensusSettings(containerEl, plugin);

									new Notice("Consensus mode enabled", 3000);
								},
								() => {
									// User cancelled - don't enable
									plugin.settings.consensusSettings!.enabled = false;
									toggle.setValue(false);
								}
							);
							modal.open();
							return;
						}

						// No warning needed, just enable
						plugin.settings.consensusSettings.enabled = true;
					} else {
						// Disabling consensus
						plugin.settings.consensusSettings.enabled = false;
					}

					await plugin.saveSettings();
					displayConsensusSettings(containerEl, plugin);
				})
		);
	addModifiedIndicator(
		enabledSetting.settingEl,
		isModified(
			plugin.settings.consensusSettings?.enabled ?? false,
			DEFAULT_CONSENSUS_SETTINGS.enabled
		)
	);

	// Only show remaining settings if consensus is disabled OR we're configuring
	// (to allow configuration before enabling)

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

		const statusContainer = containerEl.createDiv({
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

	// Helper to create toggle handler for sections (Task 5.4)
	// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 7.4
	const createToggleHandler = (sectionId: string): OnToggleCallback => {
		return async (expanded: boolean): Promise<void> => {
			const newState = setSectionExpanded(
				plugin.settings.sectionCollapseState,
				sectionId as typeof SECTION_IDS[keyof typeof SECTION_IDS],
				expanded
			);
			plugin.settings.sectionCollapseState = newState;
			await plugin.saveSettings();
		};
	};

	// Get persisted expand state, falling back to !consensusEnabled if not set
	const consensusModelsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.CONSENSUS_MODELS
	);

	const modelSection = new CollapsibleSection(
		containerEl,
		"Consensus Models",
		consensusModelsExpanded,
		"consensus", // Use consensus-specific visual styling
		createToggleHandler(SECTION_IDS.CONSENSUS_MODELS)
	);

	modelSection.contentEl.createEl("p", {
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

	// Model list - uses model references from the registry
	const updateModelList = (): void => {
		const modelListContainer =
			modelSection.contentEl.querySelector(".consensus-models-list");
		if (!modelListContainer) return;

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
			modelReferences.forEach((reference, index) => {
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
										updateCostTimeDisplay();
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
								updateCostTimeDisplay();
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

	const modelListEl = modelSection.contentEl.createDiv("consensus-models-list");
	updateModelList();

	// Add model button - uses new dropdown modal for registry selection
	// Requirements: 6.5 - Disable model-dependent controls when no models exist
	const noModelsInRegistry = registryModels.length === 0;
	const addModelSetting = new Setting(modelSection.contentEl);
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
						updateCostTimeDisplay();

						new Notice(`Model added to Consensus`, 3000);
					}
				);
				modal.open();
			});
	});

	// Task 5.4: Section collapse state persistence
	const consensusParamsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.CONSENSUS_PARAMETERS
	);

	const parametersSection = new CollapsibleSection(
		containerEl,
		"Consensus Parameters",
		consensusParamsExpanded,
		"default",
		createToggleHandler(SECTION_IDS.CONSENSUS_PARAMETERS)
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
					updateCostTimeDisplay();

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

	const consensusOptionsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.CONSENSUS_OPTIONS
	);

	const optionsSection = new CollapsibleSection(
		containerEl,
		"Additional Options",
		consensusOptionsExpanded,
		"default",
		createToggleHandler(SECTION_IDS.CONSENSUS_OPTIONS)
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

	let costTimeDisplayEl: HTMLElement | null = null;

	const updateCostTimeDisplay = (): void => {
		if (!costTimeDisplayEl) return;

		// Calculate enabled models from model references
		const numEnabledModels = plugin.settings.consensusSettings?.models?.filter(
			(m: { enabled: boolean }) => m.enabled
		).length ?? 0;

		const maxIterations =
			plugin.settings.consensusSettings?.maxIterations ??
			DEFAULT_CONSENSUS_SETTINGS.maxIterations;

		if (numEnabledModels < CONSENSUS_CONSTANTS.MIN_MODELS) {
			costTimeDisplayEl.innerHTML = `
				<div style="color: var(--text-error); font-weight: bold;">
					⚠ At least ${CONSENSUS_CONSTANTS.MIN_MODELS} enabled models required for consensus
				</div>
			`;
			return;
		}

		const costImpact = estimateCostImpact(numEnabledModels, maxIterations);
		const timeImpact = estimateTimeImpact(numEnabledModels, maxIterations);

		let costColor = "var(--text-normal)";
		if (costImpact >= 5) {
			costColor = "var(--text-error)";
		} else if (costImpact >= 3) {
			costColor = "var(--text-warning)";
		}

		costTimeDisplayEl.innerHTML = `
			<div style="padding: 12px; background: var(--background-secondary); border-radius: 6px; font-family: var(--font-monospace);">
				<div style="margin-bottom: 8px;">
					<span style="color: var(--text-muted);">Enabled Models:</span>
					<strong style="margin-left: 8px;">${numEnabledModels}</strong>
				</div>
				<div style="margin-bottom: 8px;">
					<span style="color: var(--text-muted);">Estimated Cost Impact:</span>
					<strong style="margin-left: 8px; color: ${costColor};">${costImpact.toFixed(1)}x normal cost</strong>
				</div>
				<div>
					<span style="color: var(--text-muted);">Estimated Time Impact:</span>
					<strong style="margin-left: 8px;">${timeImpact.toFixed(1)}x normal time</strong>
				</div>
			</div>
		`;

		// Show warnings
		if (costImpact >= 4) {
			const warningMsg = CONSENSUS_WARNINGS.HIGH_COST.replace(
				"{multiplier}",
				costImpact.toFixed(1)
			);
			costTimeDisplayEl.innerHTML += `
				<div style="margin-top: 8px; padding: 8px; background: var(--background-modifier-error); border-radius: 4px; color: var(--text-error); font-size: 0.9em;">
					${warningMsg}
				</div>
			`;
		}

		if (numEnabledModels > CONSENSUS_CONSTANTS.MAX_RECOMMENDED_MODELS) {
			costTimeDisplayEl.innerHTML += `
				<div style="margin-top: 8px; padding: 8px; background: var(--background-modifier-error); border-radius: 4px; color: var(--text-warning); font-size: 0.9em;">
					${CONSENSUS_WARNINGS.MANY_MODELS}
				</div>
			`;
		}
	};

	const costTimeSetting = new Setting(containerEl)
		.setName("Impact Estimate")
		.setDesc(
			"Estimated cost and time impact of current consensus configuration compared to single-model generation."
		);

	costTimeDisplayEl = costTimeSetting.settingEl.createDiv("consensus-cost-time-display");
	updateCostTimeDisplay();

	new Setting(containerEl)
		.setName("Reset consensus settings")
		.setDesc("Reset all consensus settings to their default values. This cannot be undone.")
		.addButton(button =>
			button
				.setButtonText("Reset to defaults")
				.setClass("mod-warning")
				.onClick(async () => {
					plugin.settings.consensusSettings = { ...DEFAULT_CONSENSUS_SETTINGS };
					await plugin.saveSettings();
					displayConsensusSettings(containerEl, plugin);
				})
		);
};

/**
 * @deprecated Use `displayAdvancedModesSettings` from `advancedModesSettings.ts` instead.
 * This export is kept for backwards compatibility with existing tests.
 */
export default displayConsensusSettings;
