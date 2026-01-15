import { Setting, SliderComponent, ToggleComponent } from "obsidian";
import QuizGenerator from "../../main";
import { GENERATION_OPTIONS_HELP } from "../helpText";
import { DEFAULT_GENERATION_SETTINGS } from "./generationConfig";
import {
	addInfoIconToSetting,
	addHelpIcon,
	createHelpTip,
} from "../../ui/components/SettingsHelpText";
import {
	updateModifiedIndicator,
	createModifiedTooltip,
} from "../../ui/components/SettingsStyling";

/**
 * Configuration for a question type setting row.
 * Used to create consistent toggle/slider pairs for each question type.
 * Task 18: Enhanced with modified indicator support.
 */
interface QuestionTypeConfig {
	/** Display name for the question type */
	name: string;
	/** Help text configuration key */
	helpKey: keyof typeof GENERATION_OPTIONS_HELP;
	/** Current enabled state */
	enabled: boolean;
	/** Current quantity value */
	quantity: number;
	/** Default enabled state (for modified indicator) */
	defaultEnabled: boolean;
	/** Default quantity value (for modified indicator) */
	defaultQuantity: number;
	/** Callback when enabled state changes */
	onToggleChange: (value: boolean) => Promise<void>;
	/** Callback when quantity changes */
	onQuantityChange: (value: number) => Promise<void>;
	/** Optional note to display (e.g., embedding model requirement) */
	note?: string;
	/** Whether this is the first item in the list (for border styling) */
	isFirst?: boolean;
}

/**
 * Creates a paired question type row with toggle and quantity slider.
 * The slider is visually de-emphasized when the toggle is disabled.
 * Task 18: Now includes modified indicators for both toggle and slider.
 *
 * Requirements: 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3
 *
 * @param container - Parent container element
 * @param config - Question type configuration
 */
function createQuestionTypeRow(
	container: HTMLElement,
	config: QuestionTypeConfig
): void {
	const helpConfig = GENERATION_OPTIONS_HELP[config.helpKey] as {
		description: string;
		tooltip: string;
		quantity: string;
		note?: string;
	};

	// Create a wrapper div for the paired toggle/slider
	const rowContainer = container.createDiv("question-type-row-qg");
	if (!config.enabled) {
		rowContainer.addClass("question-type-disabled-qg");
	}

	// Track slider component for enabling/disabling
	let sliderComponent: SliderComponent | null = null;
	let sliderSetting: Setting | null = null;

	// Track current values for modified indicators
	let currentEnabled = config.enabled;
	let currentQuantity = config.quantity;

	// Toggle setting with the question type name
	const toggleSetting = new Setting(rowContainer)
		.setClass("question-type-toggle-qg")
		.setName(config.name)
		.setDesc(helpConfig.description)
		.addToggle((toggle: ToggleComponent) =>
			toggle
				.setValue(config.enabled)
				.onChange(async (value: boolean) => {
					currentEnabled = value;
					await config.onToggleChange(value);
					// Update visual state of the row
					if (value) {
						rowContainer.removeClass("question-type-disabled-qg");
						sliderSetting?.settingEl.removeClass("question-type-slider-disabled-qg");
					} else {
						rowContainer.addClass("question-type-disabled-qg");
						sliderSetting?.settingEl.addClass("question-type-slider-disabled-qg");
					}
					// Task 18: Update modified indicator for toggle
					updateModifiedIndicator(
						toggleSetting,
						value !== config.defaultEnabled,
						{ tooltip: createModifiedTooltip(`${config.name} enabled`, config.defaultEnabled) }
					);
				})
		);

	// Add first-item styling if needed
	if (config.isFirst) {
		toggleSetting.setClass("first-item-qg");
	}

	// Add info icon to toggle
	addInfoIconToSetting(toggleSetting, { tooltip: helpConfig.tooltip });

	// Task 18: Initial modified indicator for toggle
	updateModifiedIndicator(
		toggleSetting,
		config.enabled !== config.defaultEnabled,
		{ tooltip: createModifiedTooltip(`${config.name} enabled`, config.defaultEnabled) }
	);

	// Quantity slider setting
	sliderSetting = new Setting(rowContainer)
		.setClass("question-type-slider-qg")
		.setName("Quantity")
		.setDesc(helpConfig.quantity)
		.addSlider((slider: SliderComponent) => {
			sliderComponent = slider;
			slider
				.setValue(config.quantity)
				.setLimits(1, 20, 1)
				.onChange(async (value: number) => {
					currentQuantity = value;
					await config.onQuantityChange(value);
					// Task 18: Update modified indicator for slider
					updateModifiedIndicator(
						sliderSetting!,
						value !== config.defaultQuantity,
						{ tooltip: createModifiedTooltip(`${config.name} quantity`, config.defaultQuantity) }
					);
				})
				.setDynamicTooltip()
				.showTooltip();
		});

	// Apply disabled styling if toggle is off
	if (!config.enabled) {
		sliderSetting.settingEl.addClass("question-type-slider-disabled-qg");
	}

	// Task 18: Initial modified indicator for slider
	updateModifiedIndicator(
		sliderSetting,
		config.quantity !== config.defaultQuantity,
		{ tooltip: createModifiedTooltip(`${config.name} quantity`, config.defaultQuantity) }
	);

	// Add note if provided (e.g., embedding model requirement)
	if (config.note) {
		createHelpTip(sliderSetting.settingEl, config.note, "info");
	}
}

/**
 * Display Quiz Settings section.
 *
 * Task 16: Rename and reorganize Quiz Settings section
 * Task 18: Apply consistent styling across all sections
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3
 *
 * This section contains settings for configuring which question types
 * to generate and how many of each type. Each question type toggle is
 * visually paired with its corresponding quantity slider, and disabled
 * types are visually de-emphasized.
 */
const displayGenerationSettings = (containerEl: HTMLElement, plugin: QuizGenerator): void => {
	// Section heading with help icon
	const headingSetting = new Setting(containerEl).setName("Quiz Settings").setHeading();
	const headingEl = headingSetting.settingEl.querySelector(".setting-item-name");
	if (headingEl) {
		addHelpIcon(headingEl as HTMLElement, GENERATION_OPTIONS_HELP.section.tooltip);
	}

	// Main container for quiz settings
	const quizSettingsContainer = containerEl.createDiv("quiz-settings-container-qg");

	// ========================================================================
	// True/False Questions
	// ========================================================================
	createQuestionTypeRow(quizSettingsContainer, {
		name: "True or false",
		helpKey: "trueFalse",
		enabled: plugin.settings.generateTrueFalse,
		quantity: plugin.settings.numberOfTrueFalse,
		defaultEnabled: DEFAULT_GENERATION_SETTINGS.generateTrueFalse,
		defaultQuantity: DEFAULT_GENERATION_SETTINGS.numberOfTrueFalse,
		onToggleChange: async (value) => {
			plugin.settings.generateTrueFalse = value;
			await plugin.saveSettings();
		},
		onQuantityChange: async (value) => {
			plugin.settings.numberOfTrueFalse = value;
			await plugin.saveSettings();
		},
		isFirst: true,
	});

	// ========================================================================
	// Multiple Choice Questions
	// ========================================================================
	createQuestionTypeRow(quizSettingsContainer, {
		name: "Multiple choice",
		helpKey: "multipleChoice",
		enabled: plugin.settings.generateMultipleChoice,
		quantity: plugin.settings.numberOfMultipleChoice,
		defaultEnabled: DEFAULT_GENERATION_SETTINGS.generateMultipleChoice,
		defaultQuantity: DEFAULT_GENERATION_SETTINGS.numberOfMultipleChoice,
		onToggleChange: async (value) => {
			plugin.settings.generateMultipleChoice = value;
			await plugin.saveSettings();
		},
		onQuantityChange: async (value) => {
			plugin.settings.numberOfMultipleChoice = value;
			await plugin.saveSettings();
		},
	});

	// ========================================================================
	// Select All That Apply Questions
	// ========================================================================
	createQuestionTypeRow(quizSettingsContainer, {
		name: "Select all that apply",
		helpKey: "selectAllThatApply",
		enabled: plugin.settings.generateSelectAllThatApply,
		quantity: plugin.settings.numberOfSelectAllThatApply,
		defaultEnabled: DEFAULT_GENERATION_SETTINGS.generateSelectAllThatApply,
		defaultQuantity: DEFAULT_GENERATION_SETTINGS.numberOfSelectAllThatApply,
		onToggleChange: async (value) => {
			plugin.settings.generateSelectAllThatApply = value;
			await plugin.saveSettings();
		},
		onQuantityChange: async (value) => {
			plugin.settings.numberOfSelectAllThatApply = value;
			await plugin.saveSettings();
		},
	});

	// ========================================================================
	// Fill in the Blank Questions
	// ========================================================================
	createQuestionTypeRow(quizSettingsContainer, {
		name: "Fill in the blank",
		helpKey: "fillInTheBlank",
		enabled: plugin.settings.generateFillInTheBlank,
		quantity: plugin.settings.numberOfFillInTheBlank,
		defaultEnabled: DEFAULT_GENERATION_SETTINGS.generateFillInTheBlank,
		defaultQuantity: DEFAULT_GENERATION_SETTINGS.numberOfFillInTheBlank,
		onToggleChange: async (value) => {
			plugin.settings.generateFillInTheBlank = value;
			await plugin.saveSettings();
		},
		onQuantityChange: async (value) => {
			plugin.settings.numberOfFillInTheBlank = value;
			await plugin.saveSettings();
		},
	});

	// ========================================================================
	// Matching Questions
	// ========================================================================
	createQuestionTypeRow(quizSettingsContainer, {
		name: "Matching",
		helpKey: "matching",
		enabled: plugin.settings.generateMatching,
		quantity: plugin.settings.numberOfMatching,
		defaultEnabled: DEFAULT_GENERATION_SETTINGS.generateMatching,
		defaultQuantity: DEFAULT_GENERATION_SETTINGS.numberOfMatching,
		onToggleChange: async (value) => {
			plugin.settings.generateMatching = value;
			await plugin.saveSettings();
		},
		onQuantityChange: async (value) => {
			plugin.settings.numberOfMatching = value;
			await plugin.saveSettings();
		},
	});

	// ========================================================================
	// Short Answer Questions
	// ========================================================================
	createQuestionTypeRow(quizSettingsContainer, {
		name: "Short answer",
		helpKey: "shortAnswer",
		enabled: plugin.settings.generateShortAnswer,
		quantity: plugin.settings.numberOfShortAnswer,
		defaultEnabled: DEFAULT_GENERATION_SETTINGS.generateShortAnswer,
		defaultQuantity: DEFAULT_GENERATION_SETTINGS.numberOfShortAnswer,
		onToggleChange: async (value) => {
			plugin.settings.generateShortAnswer = value;
			await plugin.saveSettings();
		},
		onQuantityChange: async (value) => {
			plugin.settings.numberOfShortAnswer = value;
			await plugin.saveSettings();
		},
		note: GENERATION_OPTIONS_HELP.shortAnswer.note,
	});

	// ========================================================================
	// Long Answer Questions
	// ========================================================================
	createQuestionTypeRow(quizSettingsContainer, {
		name: "Long answer",
		helpKey: "longAnswer",
		enabled: plugin.settings.generateLongAnswer,
		quantity: plugin.settings.numberOfLongAnswer,
		defaultEnabled: DEFAULT_GENERATION_SETTINGS.generateLongAnswer,
		defaultQuantity: DEFAULT_GENERATION_SETTINGS.numberOfLongAnswer,
		onToggleChange: async (value) => {
			plugin.settings.generateLongAnswer = value;
			await plugin.saveSettings();
		},
		onQuantityChange: async (value) => {
			plugin.settings.numberOfLongAnswer = value;
			await plugin.saveSettings();
		},
		note: GENERATION_OPTIONS_HELP.longAnswer.note,
	});
};

export default displayGenerationSettings;
