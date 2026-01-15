/**
 * @file councilSettings.ts
 * @description Council model configuration UI for LLM Council mode
 *
 * @deprecated This file is deprecated as of Task 22 (settings-ui-cleanup).
 * The active implementation has been migrated to:
 * `src/settings/advancedModes/advancedModesSettings.ts`
 *
 * This file is kept for backwards compatibility with existing tests.
 * New code should import from `advancedModesSettings.ts` instead.
 *
 * Migration completed in:
 * - Task 14: Migrate Council settings to Advanced Modes
 * - Task 15: Update main settings.ts to use displayAdvancedModesSettings()
 * - Task 22: Clean up deprecated code and add deprecation notices
 *
 * Original description:
 * This file implements the settings interface for configuring the LLM Council feature,
 * which enables multiple AI models to participate in a structured debate process for
 * high-quality quiz generation.
 */

/**
 * Council Settings Section
 *
 * @deprecated See file-level deprecation notice above.
 *
 * Task 37: Add help text and tooltips throughout settings UI
 * Requirements: 8.1, 8.4, 8.6, 8.7, 10.1, 10.2, 10.4
 */

import { Modal, Notice, Setting } from "obsidian";
import QuizGenerator from "../../main";
import { CollapsibleSection, OnToggleCallback } from "../../ui/components/CollapsibleSection";
import {
	DEFAULT_COUNCIL_SETTINGS,
	validateCouncilSettings,
	validateChairModelConfig,
	estimateCouncilCostImpact,
	estimateCouncilTimeImpact,
	COUNCIL_CONSTANTS,
	COUNCIL_WARNINGS,
	COUNCIL_HELP_TEXT,
	createDefaultCouncilModelConfig,
	createDefaultCouncilModelReference,
} from "./councilConfig";
import { ConsensusModelConfig } from "../../consensus/types";
import { Provider, providers } from "../../generators/providers";
import { DEFAULT_SETTINGS } from "../config";
import {
	getAllModels,
	formatModelForDisplay,
	ModelConfiguration,
	CouncilModelReference,
	createModelResolver,
	getModelUsageInfo,
	DEFAULT_MODEL_REGISTRY,
	ModelRegistry,
} from "../modelRegistry";
import { COUNCIL_HELP, MODE_HELP } from "../helpText";
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

// ============================================================================
// Mode Explanation Constants (Requirements 8.1, 8.4, 8.6, 8.7)
// ============================================================================

/**
 * Mode explanation text for council mode.
 * Requirements: 8.4
 */
const MODE_EXPLANATION =
	"Models engage in structured debate with a chairperson moderating. " +
	"Phases include: proposals, critique, ranking, and final synthesis by the chair. " +
	"Quality through argumentation and discussion.";

/**
 * Mode characteristics for council mode.
 * Requirements: 8.7
 */
const MODE_CHARACTERISTICS = "Highest quality • Structured debate • Chair synthesizes • Highest cost";

/**
 * Mode analogy for council mode (for help/tooltip).
 * Requirements: 8.6
 */
const MODE_ANALOGY =
	"Like an expert panel discussing together, with the chair synthesizing the best solution from the debate.";

/**
 * Mode comparison note explaining when main model is NOT used.
 * Requirements: 9.7
 */
const MODE_USAGE_NOTE =
	"When Council mode is enabled, ONLY the Council models' generation models (including the chair) are used for debate and quiz creation. " +
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
 * Add hover tooltip to a council model entry showing generation and embedding model details.
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
 * Modal for adding multiple council models at once
 *
 * @deprecated This class is deprecated as of Task 22 (settings-ui-cleanup).
 * The active implementation is in `advancedModesSettings.ts`.
 * This export is kept for backwards compatibility with existing tests.
 *
 * This modal allows users to select multiple AI models simultaneously from available providers
 * and add them in bulk to their council configuration. Models are grouped by provider
 * (OpenAI, Ollama) for easier navigation and selection.
 *
 * **Requirements:**
 * - 1.1: Multi-select interface for choosing council models
 * - 1.2: Allow selection of 2 or more models simultaneously
 * - 1.3: Add all selected models to council with default configuration values
 * - 1.5: Generate unique model IDs with default weight and enabled status
 * - 1.6: Show which models are already configured to prevent duplicates
 * - 1.7: Prevent duplicate additions with validation
 * - 4.1: Group models by provider for easier navigation
 * - 4.2: Display hover tooltips with model information
 * - 4.3: Provide visual feedback for selections
 *
 * **Usage Example:**
 * ```typescript
 * const modal = new CouncilModelMultiSelectModal(
 *   plugin,
 *   existingCouncilModels,
 *   (newConfigs) => {
 *     // Add new configs to council
 *     plugin.settings.councilSettings.councilModels.push(...newConfigs);
 *     plugin.saveSettings();
 *   }
 * );
 * modal.open();
 * ```
 */
export class CouncilModelMultiSelectModal extends Modal {
	private readonly plugin: QuizGenerator;
	private readonly existingModels: ConsensusModelConfig[];
	private readonly onSave: (configs: ConsensusModelConfig[]) => void;
	/** Map of model ID to ConsensusModelConfig for tracking user selections */
	private selectedConfigs: Map<string, ConsensusModelConfig>;

	/**
	 * Creates a new CouncilModelMultiSelectModal
	 *
	 * @param plugin - The QuizGenerator plugin instance
	 * @param existingModels - Array of currently configured council models (used to prevent duplicates)
	 * @param onSave - Callback function invoked when user saves their selection.
	 *                 Receives array of new ConsensusModelConfig objects to add to council.
	 */
	constructor(
		plugin: QuizGenerator,
		existingModels: ConsensusModelConfig[],
		onSave: (configs: ConsensusModelConfig[]) => void
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.existingModels = existingModels;
		this.onSave = onSave;
		this.selectedConfigs = new Map();
	}

	/**
	 * Opens the modal and renders the multi-select interface
	 *
	 * Renders:
	 * - Help text explaining the selection process (Requirement 4.2)
	 * - Provider sections with grouped model checkboxes (Requirement 4.1)
	 * - Selection counter showing number of selected models (Requirement 4.3)
	 * - Cancel and "Add Selected" buttons
	 */
	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Add Multiple Council Models" });

		// Enhanced help text explaining model selection (Requirement 4.2)
		const helpContainer = contentEl.createDiv({
			cls: "council-multiselect-help-qg",
		});

		helpContainer.createEl("p", {
			text: "Select models to add to the council. Models are grouped by provider for easier navigation.",
			cls: "setting-item-description",
		});

		helpContainer.createEl("p", {
			text: "💡 Tip: Hover over each model to see detailed information about its capabilities and characteristics.",
			cls: "setting-item-description",
		});

		// Container for model list
		const modelListContainer = contentEl.createDiv({
			cls: "council-model-multiselect-qg",
		});

		// Render provider sections
		this.renderProviderSection(modelListContainer, Provider.OPENAI);
		this.renderProviderSection(modelListContainer, Provider.OLLAMA);

		// Selection counter
		const counterEl = contentEl.createDiv({
			cls: "council-selection-counter-qg",
		});
		const updateCounter = () => {
			counterEl.textContent = `Selected: ${this.selectedConfigs.size} model${this.selectedConfigs.size !== 1 ? "s" : ""}`;
		};
		updateCounter();

		// Buttons
		const buttonContainer = new Setting(contentEl);
		buttonContainer
			.addButton(button =>
				button
					.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					})
			)
			.addButton(button =>
				button
					.setButtonText("Add Selected")
					.setCta()
					.onClick(() => {
						this.handleSave();
					})
			);

		// Store counter update function for use in checkbox handlers
		(this as any).updateCounter = updateCounter;
	}

	/**
	 * Closes the modal and cleans up the UI
	 *
	 * Called automatically when modal is closed. Clears all modal content
	 * and resets internal state.
	 */
	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Render a provider section with model checkboxes
	 *
	 * Groups models by provider (OpenAI, Ollama) for easier navigation. Each section
	 * displays a provider header followed by checkboxes for available models.
	 *
	 * **Behavior:**
	 * - Disables checkboxes for models already configured in council (Requirement 1.6)
	 * - Shows "Already configured" indicator for duplicates (Requirement 1.7)
	 * - Displays model information with tooltips (Requirement 4.2)
	 * - Updates selection counter when checkboxes change (Requirement 4.3)
	 *
	 * @param container - Parent HTML element to render the provider section into
	 * @param provider - The Provider enum value (OPENAI, OLLAMA, etc.)
	 */
	private renderProviderSection(container: HTMLElement, provider: Provider): void {
		const sectionEl = container.createDiv({
			cls: "council-provider-section-qg",
		});

		// Provider header
		const headerEl = sectionEl.createEl("h3", {
			text: providers[provider],
			cls: "council-provider-header-qg",
		});

		// Get available models for this provider
		const availableModels = this.getAvailableModelsForProvider(provider);

		if (availableModels.length === 0) {
			sectionEl.createEl("p", {
				text: "No common models available for this provider.",
				cls: "setting-item-description",
			});
			return;
		}

		// Render checkboxes for each model
		availableModels.forEach(modelInfo => {
			this.createModelCheckbox(sectionEl, provider, modelInfo);
		});
	}

	/**
	 * Get available models for a provider
	 *
	 * Returns a curated list of common model options for the specified provider,
	 * with comprehensive metadata for display and tooltips.
	 *
	 * **Supported Providers:**
	 * - OpenAI: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
	 * - Ollama: Llama 2, Mistral, Qwen (local models)
	 *
	 * **Model Metadata Includes:**
	 * - `name`: Internal model identifier (e.g., "gpt-4", "llama2")
	 * - `displayName`: User-friendly display name (e.g., "GPT-4", "Llama 2")
	 * - `description`: Brief one-line description of model capabilities
	 * - `tooltip`: Comprehensive tooltip with detailed model information (Requirement 4.2)
	 * - `characteristics`: Array of tags describing model properties (e.g., "Fast", "Low cost")
	 *
	 * @param provider - The Provider enum value to get models for
	 * @returns Array of model metadata objects, empty array if provider has no predefined models
	 */
	private getAvailableModelsForProvider(provider: Provider): Array<{
		name: string;
		displayName: string;
		description: string;
		tooltip: string;
		characteristics: string[];
	}> {
		if (provider === Provider.OPENAI) {
			return [
				{
					name: "gpt-4",
					displayName: "GPT-4",
					description: "Most capable OpenAI model, best for complex reasoning",
					tooltip: "GPT-4 is OpenAI's most advanced model with superior reasoning capabilities. Ideal for complex quiz generation requiring deep understanding and nuanced question creation. Higher cost but best quality.",
					characteristics: ["High quality", "Complex reasoning", "Premium cost"],
				},
				{
					name: "gpt-4-turbo",
					displayName: "GPT-4 Turbo",
					description: "Faster and more affordable GPT-4 variant",
					tooltip: "GPT-4 Turbo provides GPT-4 level quality at faster speeds and lower cost. Excellent balance of performance and efficiency for quiz generation. Supports larger context windows.",
					characteristics: ["Fast", "Cost-effective", "Large context"],
				},
				{
					name: "gpt-3.5-turbo",
					displayName: "GPT-3.5 Turbo",
					description: "Fast and cost-effective model",
					tooltip: "GPT-3.5 Turbo is a fast, economical option suitable for straightforward quiz generation. Best for simpler content where speed and cost matter more than advanced reasoning.",
					characteristics: ["Very fast", "Low cost", "Good for simple tasks"],
				},
			];
		} else if (provider === Provider.OLLAMA) {
			return [
				{
					name: "llama2",
					displayName: "Llama 2",
					description: "Meta's open-source model, runs locally",
					tooltip: "Llama 2 is Meta's open-source model running entirely on your local machine. No API costs, complete privacy, but requires local computational resources. Good general-purpose performance.",
					characteristics: ["Local/Private", "No API cost", "General purpose"],
				},
				{
					name: "mistral",
					displayName: "Mistral",
					description: "Efficient open-source model, runs locally",
					tooltip: "Mistral is an efficient open-source model optimized for performance. Runs locally with good speed and quality balance. Excellent for privacy-conscious users with moderate hardware.",
					characteristics: ["Local/Private", "Efficient", "Balanced performance"],
				},
				{
					name: "qwen",
					displayName: "Qwen",
					description: "Alibaba's open-source model, runs locally",
					tooltip: "Qwen is Alibaba's powerful open-source model with strong multilingual capabilities. Runs locally, excellent for diverse content. Good reasoning with privacy benefits.",
					characteristics: ["Local/Private", "Multilingual", "Strong reasoning"],
				},
			];
		}
		return [];
	}

	/**
	 * Create a checkbox for a model with enhanced tooltips and interaction handlers
	 *
	 * Renders a complete model option with:
	 * - Checkbox for selection (disabled if already configured)
	 * - Model name with provider badge
	 * - Model description
	 * - Characteristic tags (e.g., "Fast", "Low cost", "Local/Private")
	 * - "Already configured" indicator if model exists in council
	 * - Comprehensive tooltips showing all model information
	 *
	 * The checkbox change handler:
	 * 1. Creates a ConsensusModelConfig with unique ID when checked
	 * 2. Adds config to selectedConfigs Map
	 * 3. Updates selection counter
	 * 4. Removes from Map when unchecked
	 *
	 * **Requirements:**
	 * - 4.2: Add hover tooltips and descriptions to model options
	 * - 1.6: Show which models are already configured
	 * - 1.7: Prevent duplicate additions
	 * - 4.3: Update counter dynamically
	 *
	 * @param container - Parent HTML element to render the checkbox into
	 * @param provider - The Provider enum value for this model
	 * @param modelInfo - Model metadata object with name, display info, tooltip, and characteristics
	 */
	private createModelCheckbox(
		container: HTMLElement,
		provider: Provider,
		modelInfo: {
			name: string;
			displayName: string;
			description: string;
			tooltip: string;
			characteristics: string[];
		}
	): void {
		// Check if model is already configured
		const isAlreadyConfigured = this.existingModels.some(
			m =>
				m.provider === provider &&
				m.providerConfig.textGenerationModel === modelInfo.name
		);

		const optionEl = container.createDiv({
			cls: `council-model-option-qg ${isAlreadyConfigured ? "disabled" : ""}`,
		});

		// Add comprehensive tooltip to the entire option (Requirement 4.2)
		if (isAlreadyConfigured) {
			// Special tooltip for already configured models
			optionEl.setAttribute(
				"title",
				`Already configured: This model is already part of your council configuration. You cannot add it again to prevent duplicates.`
			);
		} else {
			// Detailed tooltip with provider, characteristics, and description
			const providerName = providers[provider] || provider;
			const characteristicsText = modelInfo.characteristics.join(" • ");
			optionEl.setAttribute(
				"title",
				`${providerName} - ${modelInfo.displayName}\n\n${modelInfo.tooltip}\n\nCharacteristics: ${characteristicsText}`
			);
		}

		// Checkbox
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.className = "council-model-checkbox-qg";
		checkbox.disabled = isAlreadyConfigured;
		// Add tooltip to checkbox itself for better accessibility (Requirement 4.2)
		checkbox.setAttribute(
			"title",
			isAlreadyConfigured
				? "Cannot select - already configured in council"
				: `Select ${modelInfo.displayName} for council`
		);
		optionEl.appendChild(checkbox as Node);

		// Model info container
		const infoEl = optionEl.createDiv({ cls: "council-model-info-qg" });

		// Model name with provider indicator
		const nameEl = infoEl.createEl("div", {
			cls: "council-model-name-qg",
		});
		nameEl.textContent = modelInfo.displayName;

		// Add provider badge
		const providerBadge = nameEl.createEl("span", {
			text: providers[provider] || provider,
			cls: "council-model-provider-badge-qg",
		});

		// Model description
		infoEl.createEl("div", {
			text: modelInfo.description,
			cls: "council-model-desc-qg",
		});

		// Model characteristics tags (Requirement 4.2 - display characteristics on hover)
		if (modelInfo.characteristics && modelInfo.characteristics.length > 0) {
			const characteristicsEl = infoEl.createEl("div", {
				cls: "council-model-characteristics-qg",
			});
			modelInfo.characteristics.forEach(characteristic => {
				characteristicsEl.createEl("span", {
					text: characteristic,
					cls: "council-characteristic-tag-qg",
				});
			});
		}

		// Already configured indicator with tooltip
		if (isAlreadyConfigured) {
			const alreadyConfiguredEl = optionEl.createEl("span", {
				text: "Already configured",
				cls: "council-already-configured-qg",
			});
			// Additional tooltip for the indicator itself (Requirement 4.2)
			alreadyConfiguredEl.setAttribute(
				"title",
				"This model is already in your council. Remove it first if you want to reconfigure it."
			);
		}

		// Checkbox change handler
		checkbox.addEventListener("change", () => {
			if (checkbox.checked) {
				// Create model config and add to selection
				const modelId = `${provider.toLowerCase()}-${modelInfo.name}-${Date.now()}`;
				const config = createDefaultCouncilModelConfig(
					modelId,
					provider,
					this.createModelSettings(provider, modelInfo.name)
				);
				this.selectedConfigs.set(modelId, config);
			} else {
				// Remove from selection
				const keyToRemove = Array.from(this.selectedConfigs.keys()).find(key =>
					key.includes(modelInfo.name)
				);
				if (keyToRemove) {
					this.selectedConfigs.delete(keyToRemove);
				}
			}

			// Update counter
			if ((this as any).updateCounter) {
				(this as any).updateCounter();
			}
		});
	}

	/**
	 * Create settings object for a model based on provider and model name
	 *
	 * Generates a QuizSettings object with provider-specific configuration.
	 * The settings inherit from the plugin's current settings and add
	 * provider-specific fields (API keys, base URLs, model names).
	 *
	 * **Provider-Specific Settings:**
	 * - **OpenAI**: Sets openAITextGenModel, openAIApiKey, openAIBaseURL
	 * - **Ollama**: Sets ollamaTextGenModel, ollamaBaseURL
	 *
	 * @param provider - The Provider enum value (OPENAI, OLLAMA, etc.)
	 * @param modelName - The internal model name (e.g., "gpt-4", "llama2")
	 * @returns QuizSettings object configured for the specified provider and model
	 */
	private createModelSettings(provider: Provider, modelName: string): any {
		const baseSettings = { ...this.plugin.settings };

		if (provider === Provider.OPENAI) {
			return {
				...baseSettings,
				provider: Provider.OPENAI,
				openAITextGenModel: modelName,
				openAIApiKey: baseSettings.openAIApiKey || "",
				openAIBaseURL: baseSettings.openAIBaseURL || "https://api.openai.com/v1",
			};
		} else if (provider === Provider.OLLAMA) {
			return {
				...baseSettings,
				provider: Provider.OLLAMA,
				ollamaTextGenModel: modelName,
				ollamaBaseURL: baseSettings.ollamaBaseURL || "http://localhost:11434",
			};
		}

		return baseSettings;
	}

	/**
	 * Validate and save selected models
	 * Requirements: 1.2, 1.3, 1.5, 1.7, 4.3, 4.5
	 */
	private handleSave(): void {
		// Validate at least one model is selected (Requirement 1.2, 4.3)
		if (this.selectedConfigs.size === 0) {
			new Notice("Please select at least one model", 5000);
			return;
		}

		// Convert map to array
		const configs = Array.from(this.selectedConfigs.values());

		// Prevent duplicate model IDs with existing council models (Requirement 1.7)
		const existingIds = new Set(this.existingModels.map(m => m.id));
		const duplicates: string[] = [];

		for (const config of configs) {
			if (existingIds.has(config.id)) {
				duplicates.push(config.id);
			}
		}

		if (duplicates.length > 0) {
			new Notice(
				`Cannot add models with duplicate IDs: ${duplicates.join(", ")}. Please try again.`,
				5000
			);
			return;
		}

		// Check for already-configured models and show warning (Requirement 4.5)
		// Uses providerConfig.textGenerationModel for comparison (Requirement 6.2)
		const alreadyConfigured: string[] = [];
		for (const config of configs) {
			const isDuplicate = this.existingModels.some(
				m =>
					m.provider === config.provider &&
					m.providerConfig.textGenerationModel === config.providerConfig.textGenerationModel
			);
			if (isDuplicate) {
				const modelName = config.providerConfig.textGenerationModel;
				alreadyConfigured.push(modelName);
			}
		}

		if (alreadyConfigured.length > 0) {
			new Notice(
				`Warning: The following models are already configured: ${alreadyConfigured.join(", ")}`,
				5000
			);
		}

		// Call onSave callback with validated configs (Requirement 1.3, 1.5)
		this.onSave(configs);

		// Close modal
		this.close();
	}
}

/**
 * Modal for editing individual council model configuration
 * Reuses the same model configuration pattern as consensus
 */
class CouncilModelConfigModal extends Modal {
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
			this.tempConfig = createDefaultCouncilModelConfig(
				`model-${Date.now()}`,
				(this.plugin.settings.provider as Provider) || Provider.OLLAMA,
				{ ...this.plugin.settings }
			);
		}
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.modelConfig ? "Edit Council Model" : "Add Council Model",
		});

		// Model ID
		new Setting(contentEl)
			.setName("Model ID")
			.setDesc("Unique identifier for this model (e.g., 'gpt4-primary', 'claude-council')")
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
						(this.tempConfig.providerConfig as any).provider = value as Provider;
					})
			);

		// Model Name (provider-specific)
		if (this.tempConfig.provider === Provider.OPENAI) {
			const openAIConfig = this.tempConfig.providerConfig as any;
			new Setting(contentEl)
				.setName("Model Name")
				.setDesc("OpenAI model name (e.g., gpt-4, gpt-3.5-turbo)")
				.addText(text =>
					text
						.setValue(openAIConfig.textGenerationModel || "gpt-4")
						.setPlaceholder("gpt-4")
						.onChange(value => {
							openAIConfig.textGenerationModel = value.trim();
						})
				);

			new Setting(contentEl)
				.setName("API Key")
				.setDesc("OpenAI API key for this model")
				.addText(text => {
					text.inputEl.type = "password";
					text
						.setValue(openAIConfig.apiKey || "")
						.setPlaceholder("sk-...")
						.onChange(value => {
							openAIConfig.apiKey = value.trim();
						});
				});

			new Setting(contentEl)
				.setName("Base URL")
				.setDesc("API base URL (for OpenAI-compatible providers)")
				.addText(text =>
					text
						.setValue(
							openAIConfig.baseUrl ||
								"https://api.openai.com/v1"
						)
						.setPlaceholder("https://api.openai.com/v1")
						.onChange(value => {
							openAIConfig.baseUrl = value.trim();
						})
				);
		} else if (this.tempConfig.provider === Provider.OLLAMA) {
			const ollamaConfig = this.tempConfig.providerConfig as any;
			new Setting(contentEl)
				.setName("Model Name")
				.setDesc("Ollama model name (e.g., llama2, mistral)")
				.addText(text =>
					text
						.setValue(ollamaConfig.textGenerationModel || "llama2")
						.setPlaceholder("llama2")
						.onChange(value => {
							ollamaConfig.textGenerationModel = value.trim();
						})
				);

			new Setting(contentEl)
				.setName("Base URL")
				.setDesc("Ollama server URL")
				.addText(text =>
					text
						.setValue(
							ollamaConfig.baseUrl || "http://localhost:11434"
						)
						.setPlaceholder("http://localhost:11434")
						.onChange(value => {
							ollamaConfig.baseUrl = value.trim();
						})
				);
		}

		// Model Weight
		new Setting(contentEl)
			.setName("Model Weight")
			.setDesc(
				"Weight for this model in council (1.0 = equal weight). Higher weights give this model more influence in rankings."
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
			.setDesc("Enable this model for council generation")
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

						// Validate provider-specific settings
						const providerConfig = this.tempConfig.providerConfig as any;
						if (this.tempConfig.provider === Provider.OPENAI) {
							if (
								!providerConfig.textGenerationModel ||
								providerConfig.textGenerationModel.trim() === ""
							) {
								new Notice("Model name cannot be empty");
								return;
							}
							if (
								!providerConfig.apiKey ||
								providerConfig.apiKey.trim() === ""
							) {
								new Notice("API key cannot be empty");
								return;
							}
						} else if (this.tempConfig.provider === Provider.OLLAMA) {
							if (
								!providerConfig.textGenerationModel ||
								providerConfig.textGenerationModel.trim() === ""
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
 * Modal for selecting a model from the registry to add to council.
 * Uses dropdown instead of manual text entry.
 *
 * Requirements: 2.1, 2.2, 2.4, 2.5, 2.6
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
		contentEl.createEl("h2", { text: "Add Council Model" });

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

		// Help text explaining the selection
		contentEl.createEl("p", {
			cls: "setting-item-description",
			text: "Select a model from the registry to add to Council mode. The model will use its configured generation and embedding models.",
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
						const reference = createDefaultCouncilModelReference(
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
 * Modal for editing a council model reference (weight and enabled status).
 * Uses the new reference-based architecture where model config comes from registry.
 *
 * Requirements: 2.4, 2.5
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
 * Update the chair dropdown by clearing and re-rendering
 *
 * This function implements the reactive chair dropdown update mechanism that ensures
 * the chair selection dropdown always reflects the current state of enabled council models.
 * It performs a complete refresh of the chair dropdown UI and validation state.
 *
 * **Update Process:**
 * 1. Retrieves current council configuration (enabled models, strategy, chair ID)
 * 2. Clears existing chair dropdown and related UI elements
 * 3. Re-renders chair dropdown with current enabled models
 * 4. Validates current chair selection:
 *    - If chair model was deleted → shows error indicator and highlights dropdown
 *    - If chair model is disabled → shows warning indicator and highlights dropdown
 *    - If chair is valid → removes any warnings and error highlights
 * 5. Updates all visual indicators (warnings, error messages, CSS highlighting)
 *
 * **Call this function after:**
 * - Models are added to council (individual or bulk add) - Requirement 2.8
 * - Models are removed from council - Requirement 2.8
 * - A model's enabled status changes - Requirement 2.8
 * - Chair selection strategy changes - Requirement 2.8
 * - After editing any model configuration - Requirement 2.8
 *
 * **Requirements:**
 * - 2.7: Display warning indicator when selected chair is invalid
 * - 2.8: Update dropdown reactively when model changes occur
 * - 4.5: Implement error state highlighting with CSS classes
 *
 * **Implementation Note:**
 * The function carefully preserves the chair section's description text while clearing
 * other child elements, ensuring proper labeling after updates. Uses
 * `council-validation-error-qg` CSS class for error highlighting.
 *
 * @param chairContainerRef - Reference object with `current` property containing chair section
 *                            container element. Uses ref pattern for mutable container reference.
 * @param plugin - The QuizGenerator plugin instance for accessing council settings
 * @param onConfigChange - Optional callback invoked when user changes chair configuration.
 *                         Useful for triggering summary updates or other UI refreshes.
 */
const updateChairDropdown = (
	chairContainerRef: { current: HTMLElement | null },
	plugin: QuizGenerator,
	onConfigChange?: () => void
): void => {
	if (!chairContainerRef.current) {
		return;
	}

	// Get current state - use registry-based models exclusively (Requirements 2.2, 2.3)
	const modelReferences = plugin.settings.councilSettings?.models ?? [];
	const enabledModelRefs = modelReferences.filter(m => m.enabled);
	const strategy = plugin.settings.councilSettings?.chairModel.selectionStrategy ?? "highest-ranked";
	const currentChairId = plugin.settings.councilSettings?.chairModel.configuredChairId;

	// Clear existing chair dropdown and related elements
	// Remove all children except the descriptive text at the top
	const childrenToRemove: HTMLElement[] = [];
	Array.from(chairContainerRef.current.children).forEach((child) => {
		// Keep the initial help text paragraph, remove everything else
		if (!(child.classList.contains('setting-item-description') && child.textContent?.includes('synthesis'))) {
			childrenToRemove.push(child as HTMLElement);
		}
	});
	childrenToRemove.forEach(child => child.remove());

	// Re-render chair dropdown using registry references
	renderChairDropdown(
		chairContainerRef.current,
		enabledModelRefs,
		strategy,
		currentChairId,
		plugin,
		onConfigChange
	);

	// Validate current selection and show warning if invalid (Requirement 2.7)
	// Add error highlighting for invalid chair configurations (Requirement 4.5)
	if (currentChairId && strategy === "configured") {
		const allModels = plugin.settings.councilSettings?.models ?? [];
		const chairModelRef = allModels.find(m => m.modelId === currentChairId);

		if (!chairModelRef) {
			// Chair model reference not found (model may have been removed from council)
			const errorMessage = `Selected chair "${currentChairId}" has been removed. Please select a different chair model.`;
			addWarningIndicator(chairContainerRef.current, errorMessage);

			// Add error highlighting to chair dropdown (Requirement 4.5)
			const chairDropdown = chairContainerRef.current?.querySelector("select");
			addErrorHighlight(chairDropdown as HTMLElement, "council-validation-error-qg");

			// Add error message to container
			addErrorMessage(chairContainerRef.current, errorMessage);
		} else if (!chairModelRef.enabled) {
			// Chair model exists but is disabled
			const errorMessage = `Selected chair "${currentChairId}" is currently disabled. Please enable this model or select a different chair.`;
			addWarningIndicator(chairContainerRef.current, errorMessage);

			// Add error highlighting to chair dropdown (Requirement 4.5)
			const chairDropdown = chairContainerRef.current?.querySelector("select");
			addErrorHighlight(chairDropdown as HTMLElement, "council-validation-error-qg");

			// Add error message to container
			addErrorMessage(chairContainerRef.current, errorMessage);
		} else {
			// Chair is valid - remove any warnings and error highlights (Requirement 4.5)
			removeWarningIndicator(chairContainerRef.current);

			// Remove error highlighting from chair dropdown
			const chairDropdown = chairContainerRef.current?.querySelector("select");
			removeErrorHighlight(chairDropdown as HTMLElement, "council-validation-error-qg");

			// Remove error messages
			removeErrorMessage(chairContainerRef.current);
		}
	} else {
		// Not using configured strategy or no chair selected - clear warnings and error highlights
		removeWarningIndicator(chairContainerRef.current);

		// Remove error highlighting from chair dropdown
		const chairDropdown = chairContainerRef.current?.querySelector("select");
		removeErrorHighlight(chairDropdown as HTMLElement, "council-validation-error-qg");

		// Remove error messages
		removeErrorMessage(chairContainerRef.current);
	}
};

/**
 * Add a visual warning indicator to a container element
 * Requirements: 2.7
 *
 * @param containerEl - The container element to add the warning to
 * @param message - The warning message to display
 */
const addWarningIndicator = (containerEl: HTMLElement, message: string): void => {
	// Remove any existing warnings first
	removeWarningIndicator(containerEl);

	const warningEl = containerEl.createDiv({
		cls: "council-chair-warning-qg"
	});
	warningEl.innerHTML = `
		<span class="warning-icon">⚠️</span>
		<span class="warning-message">${message}</span>
	`;
};

/**
 * Add error highlighting to an element with validation errors
 * Requirements: 4.5 - Implement error state highlighting
 *
 * @param element - The element to highlight with error state
 * @param errorClass - Optional specific error class (defaults to council-validation-error-qg)
 */
const addErrorHighlight = (element: HTMLElement | null, errorClass: string = "council-validation-error-qg"): void => {
	if (!element) return;
	element.classList.add(errorClass);
};

/**
 * Remove error highlighting from an element
 * Requirements: 4.5 - Remove highlights when errors resolved
 *
 * @param element - The element to remove error highlighting from
 * @param errorClass - Optional specific error class to remove (defaults to council-validation-error-qg)
 */
const removeErrorHighlight = (element: HTMLElement | null, errorClass: string = "council-validation-error-qg"): void => {
	if (!element) return;
	element.classList.remove(errorClass);
};

/**
 * Add error message display to a container
 * Requirements: 4.5 - Display validation error messages
 *
 * @param containerEl - The container element to add error message to
 * @param message - The error message to display
 */
const addErrorMessage = (containerEl: HTMLElement, message: string): void => {
	// Remove any existing error messages first
	removeErrorMessage(containerEl);

	const errorEl = containerEl.createDiv({
		cls: "council-validation-error-message-qg"
	});
	errorEl.innerHTML = `
		<span class="error-icon">❌</span>
		<span class="error-text">${message}</span>
	`;
};

/**
 * Remove error message display from a container
 * Requirements: 4.5 - Remove error messages when resolved
 *
 * @param containerEl - The container element to remove error message from
 */
const removeErrorMessage = (containerEl: HTMLElement): void => {
	containerEl.querySelectorAll(".council-validation-error-message-qg").forEach(el => el.remove());
};

/**
 * Remove warning indicators from a container element
 * Requirements: 2.7
 *
 * @param containerEl - The container element to remove warnings from
 */
const removeWarningIndicator = (containerEl: HTMLElement): void => {
	containerEl.querySelectorAll(".council-chair-warning-qg").forEach(el => el.remove());
};

/**
 * Get the current active chair model ID based on strategy and configuration
 * Requirements: 2.11
 *
 * @param plugin - The QuizGenerator plugin instance
 * @returns The ID of the current active chair model, or null if none
 */
const getCurrentChairModel = (plugin: QuizGenerator): string | null => {
	const councilSettings = plugin.settings.councilSettings;
	if (!councilSettings) {
		return null;
	}

	const strategy = councilSettings.chairModel.selectionStrategy;
	const configuredChairId = councilSettings.chairModel.configuredChairId;
	// Use registry-based model references
	const enabledModelRefs = (councilSettings.models ?? []).filter(
		(m: CouncilModelReference) => m.enabled
	);

	// If strategy is "configured", return the configured chair if it exists
	if (strategy === "configured" && configuredChairId) {
		// Verify the configured chair exists in enabled models
		const chairExists = enabledModelRefs.some(
			(m: CouncilModelReference) => m.modelId === configuredChairId
		);
		if (chairExists) {
			return configuredChairId;
		}
		return null; // Configured chair is invalid
	}

	// For "highest-ranked" strategy, we can't determine at config time
	// Return a placeholder indicating the strategy
	if (strategy === "highest-ranked") {
		return "__auto_highest_ranked__";
	}

	// For "rotating" strategy, we can't determine at config time
	// Return a placeholder indicating the strategy
	if (strategy === "rotating") {
		return "__auto_rotating__";
	}

	return null;
};

/**
 * Display information about the current active chair model
 * Requirements: 2.12
 *
 * @param containerEl - The container element to add the info display to
 * @param plugin - The QuizGenerator plugin instance
 */
const showCurrentChairInfo = (containerEl: HTMLElement, plugin: QuizGenerator): void => {
	// Remove any existing info displays first
	containerEl.querySelectorAll(".chair-current-info-qg").forEach(el => el.remove());

	const currentChairId = getCurrentChairModel(plugin);
	if (!currentChairId) {
		return;
	}

	let displayText = "";
	const strategy = plugin.settings.councilSettings?.chairModel.selectionStrategy ?? "highest-ranked";

	// Determine what to display based on the chair ID
	if (currentChairId === "__auto_highest_ranked__") {
		displayText = "Auto (determined by highest peer ranking at runtime)";
	} else if (currentChairId === "__auto_rotating__") {
		displayText = "Auto (rotates among all models in round-robin fashion)";
	} else {
		// Specific configured model
		displayText = currentChairId;
	}

	const infoEl = containerEl.createDiv({ cls: "chair-current-info-qg" });
	infoEl.innerHTML = `
		<span class="info-icon">ℹ️</span>
		<span>Current chair: <strong>${displayText}</strong></span>
	`;
};

/**
 * Apply visual styling to chair dropdown based on selection mode
 * Requirements: 2.9
 *
 * @param dropdownSetting - The Setting element containing the dropdown
 * @param strategy - The chair selection strategy
 * @param currentChairId - The currently selected chair model ID
 */
const styleChairDropdown = (
	dropdownSetting: Setting,
	strategy: string,
	currentChairId: string | undefined
): void => {
	// Find the dropdown element within the setting element
	const dropdownEl = dropdownSetting.settingEl.querySelector("select");
	if (!dropdownEl) {
		return;
	}

	// Remove any existing chair state classes
	dropdownEl.classList.remove("chair-configured-qg", "chair-automatic-qg");

	// Add appropriate class based on strategy and configuration
	if (strategy === "configured" && currentChairId && currentChairId !== "__auto__") {
		// User has explicitly configured a specific chair model
		dropdownEl.classList.add("chair-configured-qg");
	} else {
		// Using automatic chair selection (highest-ranked or rotating)
		dropdownEl.classList.add("chair-automatic-qg");
	}
};

/**
 * Render the chair model dropdown
 * Requirements: 2.1, 2.2, 2.3, 2.5, 2.6
 *
 * Uses registry-based model references exclusively.
 *
 * @param containerEl - The container element to render the dropdown in
 * @param enabledModelRefs - Array of enabled council model references from the registry
 * @param strategy - Current chair selection strategy
 * @param currentChairId - Currently selected chair model ID
 * @param plugin - The QuizGenerator plugin instance
 * @param onConfigChange - Optional callback to invoke when configuration changes
 * @returns Reference to the created Setting element, or null if no models available
 */
const renderChairDropdown = (
	containerEl: HTMLElement,
	enabledModelRefs: CouncilModelReference[],
	strategy: string,
	currentChairId: string | undefined,
	plugin: QuizGenerator,
	onConfigChange?: () => void
): Setting | null => {
	// Get resolver for model resolution
	const resolver = createModelResolver(plugin.settings);

	// If no enabled models, show helpful prompt (Requirements: 2.1, 2.4)
	if (enabledModelRefs.length === 0) {
		const noModelsEl = containerEl.createDiv({
			cls: "no-chair-models-prompt-qg"
		});
		noModelsEl.innerHTML = `
			<p style="color: var(--text-warning); margin-top: 8px;">
				<strong>⚠️ No enabled models available for chair selection</strong>
			</p>
			<p style="margin-top: 4px; color: var(--text-muted);">
				To configure a chair model:
			</p>
			<ol style="margin-left: 20px; color: var(--text-muted);">
				<li>Add at least one model in the "Council Models" section above</li>
				<li>Enable the model by checking the "Enabled" toggle</li>
				<li>Return here to select it as the chair model</li>
			</ol>
		`;
		return null;
	}

	// Always show dropdown when models exist (Requirement 2.2)
	// Create the setting with description based on strategy (Requirement 2.3)
	const chairModelSetting = new Setting(containerEl)
		.setName("Chair model")
		.setDesc(
			strategy === "configured"
				? "This model will synthesize the final quiz from all model outputs"
				: `Chair will be selected ${strategy === "highest-ranked" ? "by highest peer ranking" : "by rotation"}. Select a model here to override automatic selection.`
		);

	chairModelSetting.addDropdown(dropdown => {
		// Add "Auto" option for non-configured strategies (Requirement 2.6)
		if (strategy !== "configured") {
			dropdown.addOption("__auto__", `Auto (${strategy === "highest-ranked" ? "Highest-Ranked" : "Rotating"})`);
		}

		// Populate dropdown from registry-based model references
		enabledModelRefs.forEach(ref => {
			const modelConfig = resolver.tryResolve(ref.modelId);
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
				// Model reference exists but model not found in registry (orphaned reference)
				dropdown.addOption(ref.modelId, `${ref.modelId} (not found in registry)`);
			}
		});

		// Determine current value
		let currentValue = "__auto__";
		if (strategy === "configured" && currentChairId) {
			currentValue = currentChairId;
		} else if (currentChairId && currentChairId !== "__auto__") {
			currentValue = currentChairId;
		} else if (strategy === "configured") {
			// Default to first enabled model when strategy is configured but no chair is set
			if (enabledModelRefs.length > 0) {
				currentValue = enabledModelRefs[0].modelId;
			}
		}

		dropdown
			.setValue(currentValue)
			.onChange(async value => {
				if (!plugin.settings.councilSettings) {
					plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
				}

				// Handle selection changes (Requirement 2.5)
				if (value === "__auto__") {
					// User selected Auto - clear configured chair
					plugin.settings.councilSettings.chairModel.configuredChairId = undefined;
				} else {
					// User selected a specific model - set as configured chair
					plugin.settings.councilSettings.chairModel.configuredChairId = value;
					plugin.settings.councilSettings.chairModel.selectionStrategy = "configured";
				}

				await plugin.saveSettings();

				// Notify about configuration change (Requirement 4.6, 4.7)
				if (onConfigChange) {
					onConfigChange();
				}
			});
	});

	// Add modified indicator
	addModifiedIndicator(
		chairModelSetting.settingEl,
		isModified(currentChairId ?? "", DEFAULT_COUNCIL_SETTINGS.chairModel.configuredChairId ?? "")
	);

	// Apply visual state styling to the dropdown (Requirement 2.9)
	styleChairDropdown(chairModelSetting, strategy, currentChairId);

	// Show current chair info display (Requirement 2.12)
	showCurrentChairInfo(containerEl, plugin);

	return chairModelSetting;
};

/**
 * Create and render the configuration summary display
 * Requirements: 4.6, 4.7 - Show total enabled models, configured chair, and strategy
 *
 * Uses registry-based model references exclusively.
 *
 * @param containerEl - The container element to render the summary in
 * @param plugin - The QuizGenerator plugin instance
 * @returns Reference to the summary element for dynamic updates
 */
const renderConfigurationSummary = (
	containerEl: HTMLElement,
	plugin: QuizGenerator
): HTMLElement => {
	// Remove any existing summary first
	const existingSummary = containerEl.querySelector(".council-config-summary-qg");
	if (existingSummary) {
		existingSummary.remove();
	}

	const councilSettings = plugin.settings.councilSettings;
	if (!councilSettings) {
		return containerEl.createDiv({ cls: "council-config-summary-qg" });
	}

	// Get resolver for model resolution
	const resolver = createModelResolver(plugin.settings);

	// Calculate summary data using registry-based models exclusively
	const modelReferences = councilSettings.models ?? [];
	const enabledModels = modelReferences.filter(ref => ref.enabled);
	const totalModels = modelReferences.length;

	const strategy = councilSettings.chairModel.selectionStrategy;
	const configuredChairId = councilSettings.chairModel.configuredChairId;
	const councilEnabled = councilSettings.enabled;

	// Determine current chair display text
	let chairDisplayText = "None configured";
	let chairStatusClass = "chair-status-none";

	if (strategy === "configured" && configuredChairId) {
		const chairRef = modelReferences.find(ref => ref.modelId === configuredChairId);
		if (!chairRef) {
			chairDisplayText = `${configuredChairId} (⚠️ Not found)`;
			chairStatusClass = "chair-status-error";
		} else if (!chairRef.enabled) {
			// Try to get display name from registry
			const modelConfig = resolver.tryResolve(configuredChairId);
			const displayName = modelConfig?.displayName ?? configuredChairId;
			chairDisplayText = `${displayName} (⚠️ Disabled)`;
			chairStatusClass = "chair-status-warning";
		} else {
			// Try to get display name from registry
			const modelConfig = resolver.tryResolve(configuredChairId);
			chairDisplayText = modelConfig?.displayName ?? configuredChairId;
			chairStatusClass = "chair-status-valid";
		}
	} else if (strategy === "highest-ranked") {
		chairDisplayText = "Auto (Highest-Ranked)";
		chairStatusClass = "chair-status-auto";
	} else if (strategy === "rotating") {
		chairDisplayText = "Auto (Rotating)";
		chairStatusClass = "chair-status-auto";
	}

	// Strategy display text with description
	let strategyDisplayText = "";
	let strategyDescription = "";
	if (strategy === "configured") {
		strategyDisplayText = "Configured Model";
		strategyDescription = "A specific model is always used as chair";
	} else if (strategy === "highest-ranked") {
		strategyDisplayText = "Highest-Ranked";
		strategyDescription = "Chair is determined by highest peer ranking";
	} else if (strategy === "rotating") {
		strategyDisplayText = "Rotating";
		strategyDescription = "Chair rotates among all models";
	}

	// Create summary container
	const summaryEl = containerEl.createDiv({
		cls: "council-config-summary-qg"
	});

	// Council status indicator
	const statusEl = summaryEl.createDiv({ cls: "council-status-indicator-qg" });
	statusEl.innerHTML = `
		<div class="status-badge-qg ${councilEnabled ? 'status-enabled' : 'status-disabled'}">
			${councilEnabled ? '✓ Council Enabled' : '○ Council Disabled'}
		</div>
	`;

	// Summary grid
	const gridEl = summaryEl.createDiv({ cls: "council-summary-grid-qg" });

	// Models summary card
	const modelsCard = gridEl.createDiv({ cls: "summary-card-qg" });
	modelsCard.innerHTML = `
		<div class="summary-card-header-qg">
			<span class="summary-icon-qg">👥</span>
			<span class="summary-title-qg">Council Models</span>
		</div>
		<div class="summary-card-content-qg">
			<div class="summary-stat-qg">
				<span class="summary-stat-value-qg">${enabledModels.length}</span>
				<span class="summary-stat-label-qg">enabled</span>
			</div>
			<div class="summary-stat-divider-qg">/</div>
			<div class="summary-stat-qg">
				<span class="summary-stat-value-qg">${totalModels}</span>
				<span class="summary-stat-label-qg">total</span>
			</div>
		</div>
		${enabledModels.length < councilSettings.minModelsRequired ? `
			<div class="summary-card-warning-qg">
				⚠️ Need ${councilSettings.minModelsRequired - enabledModels.length} more enabled
			</div>
		` : ''}
	`;

	// Chair model summary card
	const chairCard = gridEl.createDiv({ cls: "summary-card-qg" });
	chairCard.innerHTML = `
		<div class="summary-card-header-qg">
			<span class="summary-icon-qg">🪑</span>
			<span class="summary-title-qg">Chair Model</span>
		</div>
		<div class="summary-card-content-qg">
			<div class="chair-display-qg ${chairStatusClass}">
				${chairDisplayText}
			</div>
		</div>
	`;

	// Strategy summary card
	const strategyCard = gridEl.createDiv({ cls: "summary-card-qg" });
	strategyCard.innerHTML = `
		<div class="summary-card-header-qg">
			<span class="summary-icon-qg">⚙️</span>
			<span class="summary-title-qg">Selection Strategy</span>
		</div>
		<div class="summary-card-content-qg">
			<div class="strategy-display-qg">
				${strategyDisplayText}
			</div>
			<div class="strategy-description-qg">
				${strategyDescription}
			</div>
		</div>
	`;

	return summaryEl;
};

/**
 * Display council settings in the plugin settings tab
 * Implements LLM Council configuration UI
 *
 * Requirements: 8.1, 8.4, 8.6, 8.7, 9.7
 */
const displayCouncilSettings = (containerEl: HTMLElement, plugin: QuizGenerator): void => {
	// Section heading with help icon
	const headingSetting = new Setting(containerEl).setName("LLM Council").setHeading();
	const headingEl = headingSetting.settingEl.querySelector(".setting-item-name");
	if (headingEl) {
		addHelpIcon(headingEl as HTMLElement, MODE_HELP.council.tooltip);
	}

	// Mode explanation box using shared component
	createModeExplanation(containerEl, {
		description: MODE_HELP.council.fullDescription,
		analogy: MODE_HELP.council.analogy,
		characteristics: MODE_HELP.council.labels.join(" • "),
		note: MODE_HELP.comparison.mainModelNote,
	});

	// Configuration Summary Display (Requirements 4.6, 4.7)
	// Place at top for visibility
	let summaryContainerEl: HTMLElement | null = null;
	const updateConfigurationSummary = (): void => {
		if (summaryContainerEl) {
			renderConfigurationSummary(summaryContainerEl, plugin);
		}
	};

	// Create container for summary
	summaryContainerEl = containerEl.createDiv({ cls: "council-summary-container-qg" });
	renderConfigurationSummary(summaryContainerEl, plugin);

	// Check if council is enabled
	const councilEnabled = plugin.settings.councilSettings?.enabled ?? false;

	// Add feature enable prompt when council is disabled
	if (!councilEnabled) {
		const promptEl = containerEl.createDiv("feature-enable-prompt-qg");
		const iconEl = promptEl.createDiv("feature-prompt-icon-qg");
		iconEl.textContent = "ⓘ";

		const textEl = promptEl.createDiv("feature-prompt-text-qg");
		const titleEl = textEl.createEl("strong");
		titleEl.textContent = "LLM Council is disabled.";

		const descriptionEl = textEl.createEl("div");
		descriptionEl.textContent = "Enable it below and configure at least 2 AI models to use structured debate for high-quality quiz generation. Council mode uses multiple models in a debate process with a chair model that synthesizes the final output.";
	}

	// ========================================================================
	// SECTION 1: Enable/Disable Council
	// ========================================================================
	const enabledSetting = new Setting(containerEl)
		.setName("Enable council mode")
		.setDesc(`${COUNCIL_HELP.enable.description} ${COUNCIL_HELP.enable.impact}`)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.councilSettings?.enabled ?? false)
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}

					// If enabling, validate before enabling
					if (value) {
						const validation = validateCouncilSettings(
							plugin.settings.councilSettings
						);
						if (!validation.isValid) {
							// Show notice about validation failure
							new Notice(
								`Cannot enable council mode: ${validation.error}`,
								5000
							);

							// Add error highlighting to enable toggle (Requirement 4.5)
							addErrorHighlight(enabledSetting.settingEl, "enable-toggle-error-qg");

							// Add error message to the setting container
							addErrorMessage(enabledSetting.settingEl, validation.error || "Validation failed");

							plugin.settings.councilSettings.enabled = false;
							await plugin.saveSettings();

							// Re-render settings to update toggle state
							displayCouncilSettings(containerEl, plugin);
							return;
						}

						// Remove error highlighting if validation passes (Requirement 4.5)
						removeErrorHighlight(enabledSetting.settingEl, "enable-toggle-error-qg");
						removeErrorMessage(enabledSetting.settingEl);

						// Show data privacy warning based on registry models
						const modelResolver = createModelResolver(plugin.settings);
						const enabledModelRefs = plugin.settings.councilSettings.models.filter(
							(m: CouncilModelReference) => m.enabled
						);
						const enabledProviders = enabledModelRefs
							.map((ref: CouncilModelReference) => {
								const modelConfig = modelResolver.tryResolve(ref.modelId);
								return modelConfig?.providerConfig?.provider;
							})
							.filter((p: Provider | undefined): p is Provider => p !== undefined);
						const uniqueProviders = Array.from(new Set(enabledProviders));
						const hasNonLocalProviders = uniqueProviders.some(
							p => p !== Provider.OLLAMA
						);

						if (hasNonLocalProviders && enabledModelRefs.length > 0) {
							new Notice(COUNCIL_WARNINGS.DATA_PRIVACY, 6000);
						}

						plugin.settings.councilSettings.enabled = true;

						// Remove any error highlighting when successfully enabled (Requirement 4.5)
						removeErrorHighlight(enabledSetting.settingEl, "enable-toggle-error-qg");
						removeErrorMessage(enabledSetting.settingEl);
					} else {
						// Disabling council
						plugin.settings.councilSettings.enabled = false;

						// Remove any error highlighting when disabled (Requirement 4.5)
						removeErrorHighlight(enabledSetting.settingEl, "enable-toggle-error-qg");
						removeErrorMessage(enabledSetting.settingEl);
					}

					await plugin.saveSettings();
					displayCouncilSettings(containerEl, plugin);
				})
		);
	addModifiedIndicator(
		enabledSetting.settingEl,
		isModified(
			plugin.settings.councilSettings?.enabled ?? false,
			DEFAULT_COUNCIL_SETTINGS.enabled
		)
	);

	// ========================================================================
	// SECTION 2: Model Configuration
	// Task 38: Visual Polish - Use council mode styling
	// Task 5.4: Section collapse state persistence
	// ========================================================================

	// Helper to create toggle handler for sections (Task 5.4)
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

	// Get persisted expand state (Task 5.4)
	const councilModelsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.COUNCIL_MODELS
	);

	const modelSection = new CollapsibleSection(
		containerEl,
		"Council Models",
		councilModelsExpanded,
		"council", // Use council-specific visual styling
		createToggleHandler(SECTION_IDS.COUNCIL_MODELS)
	);

	modelSection.contentEl.createEl("p", {
		text: `Configure at least ${COUNCIL_CONSTANTS.MIN_MODELS} models to participate in council debate. Each model will independently generate quiz content, critique other responses, and rank outputs.`,
		cls: "setting-item-description",
	});

	// Get resolver for model resolution
	const resolver = createModelResolver(plugin.settings);

	// Get all models from registry for empty state detection (Requirements: 6.5)
	const registryModels = getAllModels(plugin.settings.modelRegistry);

	// Model list - uses registry-based model references exclusively
	const updateModelList = (): void => {
		const modelListContainer =
			modelSection.contentEl.querySelector(".council-models-list");
		if (!modelListContainer) return;

		modelListContainer.empty();

		// Get model references from registry-based architecture
		const modelReferences = plugin.settings.councilSettings?.models ?? [];

		// Update configuration summary when model list changes (Requirement 4.6)
		updateConfigurationSummary();

		// Check if any models are configured
		if (modelReferences.length === 0) {
			const noModelsEl = modelListContainer.createEl("div", {
				cls: "no-models-prompt-qg",
			});
			noModelsEl.innerHTML = `
				<p>No models configured yet.</p>
				<p>Click "Add Model from Registry" below to select a model.</p>
				<p>You need at least ${COUNCIL_CONSTANTS.MIN_MODELS} models to enable council mode.</p>
			`;
		} else {
			// Render registry-based model references (Requirements 2.1, 2.4, 2.5)
			modelReferences.forEach((ref, index) => {
				// Resolve the model from registry
				const modelConfig = resolver.tryResolve(ref.modelId);
				const displayName = modelConfig ? modelConfig.displayName : `${ref.modelId} (not found)`;
				const genModel = modelConfig?.providerConfig.textGenerationModel || "<not set>";
				const providerName = modelConfig
					? (modelConfig.providerConfig.provider === Provider.OPENAI ? "OpenAI" : "Ollama")
					: "Unknown";

				// Get usage info for "Also used in" indicator
				const usageInfo = getModelUsageInfo(ref.modelId, plugin.settings);
				let usageIndicator = "";
				if (usageInfo.usageCount > 1) {
					const otherLocations = usageInfo.usageLocations
						.filter(loc => loc !== "council")
						.map(loc => {
							switch (loc) {
								case "main": return "Main";
								case "consensus": return "Consensus";
								case "chair": return "Chair";
								default: return loc;
							}
						});
					if (otherLocations.length > 0) {
						usageIndicator = ` | Also in: ${otherLocations.join(", ")}`;
					}
				}

				const setting = new Setting(modelListContainer as HTMLElement)
					.setName(displayName)
					.setDesc(
						`${providerName}: ${genModel} | Weight: ${ref.weight} | ${
							ref.enabled ? "✓ Enabled" : "✗ Disabled"
						}${usageIndicator}`
					);

				// Add data attribute for identifying models
				setting.settingEl.setAttribute("data-model-id", ref.modelId);

				// Mark as missing if model not found in registry
				if (!modelConfig) {
					setting.settingEl.addClass("council-model-missing-qg");
				}

				setting
					.addButton(button =>
						button
							.setButtonText("Edit")
							.setClass("mod-cta")
							.onClick(() => {
								const modal = new CouncilModelReferenceEditModal(
									plugin,
									ref,
									modelConfig,
									async updatedRef => {
										if (!plugin.settings.councilSettings) return;

										// Validation: Check if disabling this model invalidates chair selection
										const strategy = plugin.settings.councilSettings.chairModel.selectionStrategy;
										const configuredChairId = plugin.settings.councilSettings.chairModel.configuredChairId;

										// Show warning if disabling the configured chair model
										if (
											strategy === "configured" &&
											configuredChairId === ref.modelId &&
											ref.enabled === true &&
											updatedRef.enabled === false
										) {
											new Notice(
												`Warning: You are disabling the configured chair model "${displayName}". Please select a different chair or re-enable this model.`,
												5000
											);
										}

										// Update the reference
										plugin.settings.councilSettings.models![index] = updatedRef;
										await plugin.saveSettings();
										updateModelList();
										updateCostTimeDisplay();
										updateChairDropdown(chairContainerRef, plugin, updateConfigurationSummary);
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

								// Validation: Check if deleting this model invalidates chair selection
								const strategy = plugin.settings.councilSettings.chairModel.selectionStrategy;
								const configuredChairId = plugin.settings.councilSettings.chairModel.configuredChairId;

								// Show warning if removing the configured chair model
								if (strategy === "configured" && configuredChairId === ref.modelId) {
									new Notice(
										`Warning: You are removing the configured chair model "${displayName}". The chair selection will be cleared.`,
										5000
									);
									// Clear the chair selection
									plugin.settings.councilSettings.chairModel.configuredChairId = undefined;
								}

								// Remove the reference
								plugin.settings.councilSettings.models!.splice(index, 1);
								await plugin.saveSettings();
								updateModelList();
								updateCostTimeDisplay();
								updateChairDropdown(chairContainerRef, plugin, updateConfigurationSummary);
							})
					);

				// Add hover tooltip showing generation/embedding model details (Requirements 9.6)
				const hasEmbeddingWarning = modelConfig ? !modelConfig.providerConfig.embeddingModel : false;
				addModelHoverTooltip(setting.settingEl, modelConfig, hasEmbeddingWarning);
			});
		}
	};

	const modelListEl = modelSection.contentEl.createDiv("council-models-list");
	updateModelList();

	// Add model buttons
	// Requirements: 6.5 - Disable model-dependent controls when no models exist
	const noModelsInRegistry = registryModels.length === 0;
	const buttonSetting = new Setting(modelSection.contentEl);

	// Add Model from Registry button (new architecture)
	buttonSetting.addButton(button => {
		button
			.setButtonText("Add Model from Registry")
			.setCta()
			.setDisabled(noModelsInRegistry)
			.setTooltip(
				noModelsInRegistry
					? "Add models in the Model Management section first"
					: "Select a model from the registry to add to Council"
			)
			.onClick(() => {
				// Get existing model IDs from references
				const existingModelIds = (plugin.settings.councilSettings?.models ?? [])
					.map(ref => ref.modelId);

				const modal = new CouncilModelSelectModal(
					plugin,
					existingModelIds,
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

						// Show success notice
						new Notice("Model added to Council", 3000);

						// Update UI
						updateModelList();
						updateCostTimeDisplay();
						updateChairDropdown(chairContainerRef, plugin, updateConfigurationSummary);

						// Highlight the newly added model
						setTimeout(() => {
							const newModelEl = modelListEl.querySelector(
								`[data-model-id="${newReference.modelId}"]`
							);
							if (newModelEl) {
								newModelEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
								newModelEl.addClass("council-model-newly-added-qg");
								setTimeout(() => {
									newModelEl.removeClass("council-model-newly-added-qg");
								}, 2000);
							}
						}, 100);
					}
				);
				modal.open();
			});
	});

	// Legacy buttons removed - using registry-based model selection exclusively

	// ========================================================================
	// SECTION 3: Chair Model Configuration
	// Task 5.4: Section collapse state persistence
	// ========================================================================
	const councilChairExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.COUNCIL_CHAIR
	);

	const chairSection = new CollapsibleSection(
		containerEl,
		"Chair Model Configuration",
		councilChairExpanded,
		"default",
		createToggleHandler(SECTION_IDS.COUNCIL_CHAIR)
	);

	// Store reference to chair section container for reactive updates (Requirement 2.8)
	const chairContainerRef: { current: HTMLElement | null } = {
		current: chairSection.contentEl
	};

	chairSection.contentEl.createEl("p", {
		text: COUNCIL_HELP_TEXT.SYNTHESIS_PHASE,
		cls: "setting-item-description",
	});

	// Add inline help text for chair model configuration
	const chairHelpEl = chairSection.contentEl.createEl("div", {
		cls: "setting-help-text-qg"
	});
	chairHelpEl.innerHTML = `
		<p><strong>About the Chair Model:</strong></p>
		<p>The chair model synthesizes the final quiz from all model outputs, critiques, and rankings. It acts as the final decision-maker in the council process.</p>
		<p>Choose a selection strategy to determine which model serves as the chair:</p>
		<ul>
			<li><strong>Configured Model:</strong> Manually select a specific model to always act as chair</li>
			<li><strong>Highest-Ranked:</strong> Automatically use the model that received the highest peer rankings</li>
			<li><strong>Rotating:</strong> Rotate the chair role among all models in round-robin fashion</li>
		</ul>
	`;

	// Chair selection strategy
	const chairStrategySetting = new Setting(chairSection.contentEl)
		.setName("Chair selection strategy")
		.setDesc("How to select which model serves as the chair for synthesis")
		.addDropdown(dropdown => {
			dropdown
				.addOption("highest-ranked", "Highest-Ranked")
				.addOption("configured", "Configured Model")
				.addOption("rotating", "Rotating")
				.setValue(
					plugin.settings.councilSettings?.chairModel.selectionStrategy ??
						DEFAULT_COUNCIL_SETTINGS.chairModel.selectionStrategy
				)
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}
					plugin.settings.councilSettings.chairModel.selectionStrategy = value as any;
					await plugin.saveSettings();
					// Update chair dropdown when strategy changes (Requirement 2.8)
					updateChairDropdown(chairContainerRef, plugin, updateConfigurationSummary);
					// Update configuration summary when strategy changes (Requirement 4.7)
					updateConfigurationSummary();
				});

			// Add help text for selected strategy
			const strategy = plugin.settings.councilSettings?.chairModel.selectionStrategy ??
				DEFAULT_COUNCIL_SETTINGS.chairModel.selectionStrategy;
			const helpText = COUNCIL_HELP_TEXT.CHAIR_SELECTION_STRATEGIES[strategy];
			if (helpText) {
				const helpEl = chairSection.contentEl.createEl("p", {
					cls: "setting-item-description",
					text: helpText,
				});
				helpEl.style.marginTop = "8px";
				helpEl.style.fontStyle = "italic";
				helpEl.style.color = "var(--text-muted)";
			}
		});
	addModifiedIndicator(
		chairStrategySetting.settingEl,
		isModified(
			plugin.settings.councilSettings?.chairModel.selectionStrategy ??
				DEFAULT_COUNCIL_SETTINGS.chairModel.selectionStrategy,
			DEFAULT_COUNCIL_SETTINGS.chairModel.selectionStrategy
		)
	);

	// Always show chair model dropdown when enabled (Requirement 2.2)
	// Use registry-based model references exclusively
	const enabledModelRefs = (plugin.settings.councilSettings?.models ?? []).filter(
		(m: CouncilModelReference) => m.enabled
	);
	const currentChairId = plugin.settings.councilSettings?.chairModel.configuredChairId;
	const strategy = plugin.settings.councilSettings?.chairModel.selectionStrategy ?? "highest-ranked";

	// Use the refactored renderChairDropdown function with registry references
	renderChairDropdown(
		chairSection.contentEl,
		enabledModelRefs,
		strategy,
		currentChairId,
		plugin,
		updateConfigurationSummary
	);

	// Validate current selection and show warning if invalid (Requirement 2.7)
	if (currentChairId && strategy === "configured") {
		const allModels = plugin.settings.councilSettings?.models ?? [];
		const chairModelRef = allModels.find((m: CouncilModelReference) => m.modelId === currentChairId);

		if (!chairModelRef) {
			// Chair model reference was removed
			addWarningIndicator(
				chairContainerRef.current!,
				`Selected chair "${currentChairId}" has been removed. Please select a different chair model.`
			);
		} else if (!chairModelRef.enabled) {
			// Chair model exists but is disabled
			addWarningIndicator(
				chairContainerRef.current!,
				`Selected chair "${currentChairId}" is currently disabled. Please enable this model or select a different chair.`
			);
		}
		// If chair is valid, no warning is shown (removeWarningIndicator is called in addWarningIndicator)
	}

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
					plugin.settings.councilSettings?.chairModel.synthesisWeight ??
						DEFAULT_COUNCIL_SETTINGS.chairModel.synthesisWeight
				)
				.setDynamicTooltip()
				.onChange(async value => {
					if (!plugin.settings.councilSettings) {
						plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					}
					plugin.settings.councilSettings.chairModel.synthesisWeight =
						Math.round(value * 10) / 10;
					await plugin.saveSettings();
				})
		);
	addModifiedIndicator(
		synthesisWeightSetting.settingEl,
		isModified(
			plugin.settings.councilSettings?.chairModel.synthesisWeight ??
				DEFAULT_COUNCIL_SETTINGS.chairModel.synthesisWeight,
			DEFAULT_COUNCIL_SETTINGS.chairModel.synthesisWeight
		)
	);

	// ========================================================================
	// SECTION 4: Process Configuration
	// Task 5.4: Section collapse state persistence
	// ========================================================================
	const councilProcessExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.COUNCIL_PROCESS
	);

	const processSection = new CollapsibleSection(
		containerEl,
		"Process Configuration",
		councilProcessExpanded,
		"default",
		createToggleHandler(SECTION_IDS.COUNCIL_PROCESS)
	);

	// Minimum models required
	const minModelsSetting = new Setting(processSection.contentEl)
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
		minModelsSetting.settingEl,
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
					updateCostTimeDisplay();

					// Warn if both critique and ranking are disabled
					if (
						!value &&
						!plugin.settings.councilSettings.enableRanking
					) {
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
					updateCostTimeDisplay();

					// Warn if both critique and ranking are disabled
					if (
						!value &&
						!plugin.settings.councilSettings.enableCritique
					) {
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

	// ========================================================================
	// SECTION 5: Timeouts
	// Task 5.4: Section collapse state persistence
	// ========================================================================
	const councilTimeoutsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.COUNCIL_TIMEOUTS
	);

	const timeoutsSection = new CollapsibleSection(
		containerEl,
		"Phase Timeouts",
		councilTimeoutsExpanded,
		"default",
		createToggleHandler(SECTION_IDS.COUNCIL_TIMEOUTS)
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
	) => {
		const setting = new Setting(container)
			.setName(name)
			.setDesc(desc)
			.addSlider(slider =>
				slider
					.setLimits(
						COUNCIL_CONSTANTS.MIN_TIMEOUT,
						COUNCIL_CONSTANTS.MAX_TIMEOUT,
						COUNCIL_CONSTANTS.TIMEOUT_STEP
					)
					.setValue(
						plugin.settings.councilSettings?.phaseTimeouts[phase] ??
							DEFAULT_COUNCIL_SETTINGS.phaseTimeouts[phase]
					)
					.setDynamicTooltip()
					.onChange(async value => {
						if (!plugin.settings.councilSettings) {
							plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
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
		valueDisplay.textContent = `(${
			(plugin.settings.councilSettings?.phaseTimeouts[phase] ??
				DEFAULT_COUNCIL_SETTINGS.phaseTimeouts[phase]) / 1000
		}s)`;

		addModifiedIndicator(
			setting.settingEl,
			isModified(
				plugin.settings.councilSettings?.phaseTimeouts[phase] ??
					DEFAULT_COUNCIL_SETTINGS.phaseTimeouts[phase],
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

	// ========================================================================
	// SECTION 6: Additional Options
	// Task 5.4: Section collapse state persistence
	// ========================================================================
	const councilOptionsExpanded = getSectionExpanded(
		plugin.settings.sectionCollapseState,
		SECTION_IDS.COUNCIL_OPTIONS
	);

	const optionsSection = new CollapsibleSection(
		containerEl,
		"Additional Options",
		councilOptionsExpanded,
		"default",
		createToggleHandler(SECTION_IDS.COUNCIL_OPTIONS)
	);

	new Setting(optionsSection.contentEl)
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

	new Setting(optionsSection.contentEl)
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

	new Setting(optionsSection.contentEl)
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

	// ========================================================================
	// SECTION 7: Cost and Time Impact
	// ========================================================================
	let costTimeDisplayEl: HTMLElement | null = null;

	const updateCostTimeDisplay = (): void => {
		if (!costTimeDisplayEl) return;

		// Use registry-based models for cost calculation
		const numEnabledModels =
			(plugin.settings.councilSettings?.models ?? []).filter(
				(m: CouncilModelReference) => m.enabled
			).length;
		const enableCritique =
			plugin.settings.councilSettings?.enableCritique ??
			DEFAULT_COUNCIL_SETTINGS.enableCritique;
		const enableRanking =
			plugin.settings.councilSettings?.enableRanking ??
			DEFAULT_COUNCIL_SETTINGS.enableRanking;

		if (numEnabledModels < COUNCIL_CONSTANTS.MIN_MODELS) {
			costTimeDisplayEl.innerHTML = `
				<div style="color: var(--text-error); font-weight: bold;">
					⚠ At least ${COUNCIL_CONSTANTS.MIN_MODELS} enabled models required for council
				</div>
			`;
			return;
		}

		const costImpact = estimateCouncilCostImpact(
			numEnabledModels,
			enableCritique,
			enableRanking
		);
		const timeImpact = estimateCouncilTimeImpact(
			numEnabledModels,
			enableCritique,
			enableRanking
		);

		let costColor = "var(--text-normal)";
		if (costImpact >= 8) {
			costColor = "var(--text-error)";
		} else if (costImpact >= 5) {
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
		if (costImpact >= 6) {
			const warningMsg = COUNCIL_WARNINGS.HIGH_COST.replace(
				"{multiplier}",
				costImpact.toFixed(1)
			);
			costTimeDisplayEl.innerHTML += `
				<div style="margin-top: 8px; padding: 8px; background: var(--background-modifier-error); border-radius: 4px; color: var(--text-error); font-size: 0.9em;">
					${warningMsg}
				</div>
			`;
		}

		if (numEnabledModels > COUNCIL_CONSTANTS.MAX_RECOMMENDED_MODELS) {
			costTimeDisplayEl.innerHTML += `
				<div style="margin-top: 8px; padding: 8px; background: var(--background-modifier-error); border-radius: 4px; color: var(--text-warning); font-size: 0.9em;">
					${COUNCIL_WARNINGS.MANY_MODELS}
				</div>
			`;
		}
	};

	const costTimeSetting = new Setting(containerEl)
		.setName("Impact Estimate")
		.setDesc(
			"Estimated cost and time impact of current council configuration compared to single-model generation"
		);

	costTimeDisplayEl = costTimeSetting.settingEl.createDiv("council-cost-time-display");
	updateCostTimeDisplay();

	// ========================================================================
	// Reset Button
	// ========================================================================
	new Setting(containerEl)
		.setName("Reset council settings")
		.setDesc("Reset all council settings to their default values. This cannot be undone.")
		.addButton(button =>
			button
				.setButtonText("Reset to defaults")
				.setClass("mod-warning")
				.onClick(async () => {
					plugin.settings.councilSettings = { ...DEFAULT_COUNCIL_SETTINGS };
					await plugin.saveSettings();
					displayCouncilSettings(containerEl, plugin);
				})
		);
};

/**
 * @deprecated Use `displayAdvancedModesSettings` from `advancedModesSettings.ts` instead.
 * This export is kept for backwards compatibility with existing tests.
 */
export default displayCouncilSettings;
