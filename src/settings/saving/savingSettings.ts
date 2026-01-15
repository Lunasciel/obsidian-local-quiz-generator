import { normalizePath, Setting } from "obsidian";
import QuizGenerator from "../../main";
import FolderSuggester from "./folderSuggester";
import { saveFormats, DEFAULT_SAVING_SETTINGS } from "./savingConfig";
import { SAVING_OPTIONS_HELP } from "../helpText";
import {
	addInfoIconToSetting,
	addHelpIcon,
} from "../../ui/components/SettingsHelpText";
import {
	updateModifiedIndicator,
	createModifiedTooltip,
} from "../../ui/components/SettingsStyling";

/**
 * Display Saving Options section.
 *
 * Task 5.1: Reorganize settings sections order
 * Task 5.3: Add inline help text to settings
 * Task 18: Apply consistent styling across all sections
 * Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3
 *
 * This section contains settings for how and where quizzes are saved.
 * It appears after the quiz generation options section.
 */
const displaySavingSettings = (containerEl: HTMLElement, plugin: QuizGenerator): void => {
	// Section heading with help icon
	const headingSetting = new Setting(containerEl).setName("Saving Options").setHeading();
	const headingEl = headingSetting.settingEl.querySelector(".setting-item-name");
	if (headingEl) {
		addHelpIcon(headingEl as HTMLElement, SAVING_OPTIONS_HELP.section.tooltip);
	}

	// Auto-save setting
	const autoSaveSetting = new Setting(containerEl)
		.setName("Automatically save questions")
		.setDesc(SAVING_OPTIONS_HELP.autoSave.description)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.autoSave)
				.onChange(async (value) => {
					plugin.settings.autoSave = value;
					await plugin.saveSettings();
					// Task 18: Update modified indicator
					updateModifiedIndicator(
						autoSaveSetting,
						value !== DEFAULT_SAVING_SETTINGS.autoSave,
						{ tooltip: createModifiedTooltip("Auto-save", DEFAULT_SAVING_SETTINGS.autoSave) }
					);
				})
		);
	addInfoIconToSetting(autoSaveSetting, { tooltip: SAVING_OPTIONS_HELP.autoSave.tooltip });
	// Task 18: Initial modified indicator check
	updateModifiedIndicator(
		autoSaveSetting,
		plugin.settings.autoSave !== DEFAULT_SAVING_SETTINGS.autoSave,
		{ tooltip: createModifiedTooltip("Auto-save", DEFAULT_SAVING_SETTINGS.autoSave) }
	);

	// Save location setting
	const saveLocationSetting = new Setting(containerEl)
		.setName("Save location")
		.setDesc(SAVING_OPTIONS_HELP.saveLocation.description)
		.addSearch(search => {
			new FolderSuggester(plugin.app, search.inputEl);
			search
				.setValue(plugin.settings.savePath)
				.onChange(async (value) => {
					const normalizedPath = normalizePath(value.trim());
					plugin.settings.savePath = normalizedPath;
					await plugin.saveSettings();
					// Task 18: Update modified indicator
					updateModifiedIndicator(
						saveLocationSetting,
						normalizedPath !== DEFAULT_SAVING_SETTINGS.savePath,
						{ tooltip: createModifiedTooltip("Save location", DEFAULT_SAVING_SETTINGS.savePath) }
					);
				});
		});
	addInfoIconToSetting(saveLocationSetting, { tooltip: SAVING_OPTIONS_HELP.saveLocation.tooltip });
	// Task 18: Initial modified indicator check
	updateModifiedIndicator(
		saveLocationSetting,
		plugin.settings.savePath !== DEFAULT_SAVING_SETTINGS.savePath,
		{ tooltip: createModifiedTooltip("Save location", DEFAULT_SAVING_SETTINGS.savePath) }
	);

	// Save format setting
	const saveFormatSetting = new Setting(containerEl)
		.setName("Save format")
		.setDesc(SAVING_OPTIONS_HELP.saveFormat.description)
		.addDropdown(dropdown =>
			dropdown
				.addOptions(saveFormats)
				.setValue(plugin.settings.saveFormat)
				.onChange(async (value) => {
					plugin.settings.saveFormat = value;
					await plugin.saveSettings();
					// Task 18: Update modified indicator
					updateModifiedIndicator(
						saveFormatSetting,
						value !== DEFAULT_SAVING_SETTINGS.saveFormat,
						{ tooltip: createModifiedTooltip("Save format", DEFAULT_SAVING_SETTINGS.saveFormat) }
					);
				})
		);
	addInfoIconToSetting(saveFormatSetting, { tooltip: SAVING_OPTIONS_HELP.saveFormat.tooltip });
	// Task 18: Initial modified indicator check
	updateModifiedIndicator(
		saveFormatSetting,
		plugin.settings.saveFormat !== DEFAULT_SAVING_SETTINGS.saveFormat,
		{ tooltip: createModifiedTooltip("Save format", DEFAULT_SAVING_SETTINGS.saveFormat) }
	);

	// Quiz material property setting
	const quizMaterialSetting = new Setting(containerEl)
		.setName("Quiz material property")
		.setDesc(SAVING_OPTIONS_HELP.quizMaterialProperty.description)
		.addText(text =>
			text
				.setValue(plugin.settings.quizMaterialProperty)
				.setPlaceholder(SAVING_OPTIONS_HELP.quizMaterialProperty.placeholder)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					plugin.settings.quizMaterialProperty = trimmedValue;
					await plugin.saveSettings();
					// Task 18: Update modified indicator
					updateModifiedIndicator(
						quizMaterialSetting,
						trimmedValue !== DEFAULT_SAVING_SETTINGS.quizMaterialProperty,
						{ tooltip: createModifiedTooltip("Quiz material property", DEFAULT_SAVING_SETTINGS.quizMaterialProperty) }
					);
				})
		);
	addInfoIconToSetting(quizMaterialSetting, { tooltip: SAVING_OPTIONS_HELP.quizMaterialProperty.tooltip });
	// Task 18: Initial modified indicator check
	updateModifiedIndicator(
		quizMaterialSetting,
		plugin.settings.quizMaterialProperty !== DEFAULT_SAVING_SETTINGS.quizMaterialProperty,
		{ tooltip: createModifiedTooltip("Quiz material property", DEFAULT_SAVING_SETTINGS.quizMaterialProperty) }
	);

	// Inline separator setting
	const inlineSeparatorSetting = new Setting(containerEl)
		.setName("Inline separator")
		.setDesc(SAVING_OPTIONS_HELP.inlineSeparator.description)
		.addText(text =>
			text
				.setValue(plugin.settings.inlineSeparator)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					plugin.settings.inlineSeparator = trimmedValue;
					await plugin.saveSettings();
					// Task 18: Update modified indicator
					updateModifiedIndicator(
						inlineSeparatorSetting,
						trimmedValue !== DEFAULT_SAVING_SETTINGS.inlineSeparator,
						{ tooltip: createModifiedTooltip("Inline separator", DEFAULT_SAVING_SETTINGS.inlineSeparator) }
					);
				})
		);
	addInfoIconToSetting(inlineSeparatorSetting, { tooltip: SAVING_OPTIONS_HELP.inlineSeparator.tooltip });
	// Task 18: Initial modified indicator check
	updateModifiedIndicator(
		inlineSeparatorSetting,
		plugin.settings.inlineSeparator !== DEFAULT_SAVING_SETTINGS.inlineSeparator,
		{ tooltip: createModifiedTooltip("Inline separator", DEFAULT_SAVING_SETTINGS.inlineSeparator) }
	);

	// Multiline separator setting
	const multilineSeparatorSetting = new Setting(containerEl)
		.setName("Multiline separator")
		.setDesc(SAVING_OPTIONS_HELP.multilineSeparator.description)
		.addText(text =>
			text
				.setValue(plugin.settings.multilineSeparator)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					plugin.settings.multilineSeparator = trimmedValue;
					await plugin.saveSettings();
					// Task 18: Update modified indicator
					updateModifiedIndicator(
						multilineSeparatorSetting,
						trimmedValue !== DEFAULT_SAVING_SETTINGS.multilineSeparator,
						{ tooltip: createModifiedTooltip("Multiline separator", DEFAULT_SAVING_SETTINGS.multilineSeparator) }
					);
				})
		);
	addInfoIconToSetting(multilineSeparatorSetting, { tooltip: SAVING_OPTIONS_HELP.multilineSeparator.tooltip });
	// Task 18: Initial modified indicator check
	updateModifiedIndicator(
		multilineSeparatorSetting,
		plugin.settings.multilineSeparator !== DEFAULT_SAVING_SETTINGS.multilineSeparator,
		{ tooltip: createModifiedTooltip("Multiline separator", DEFAULT_SAVING_SETTINGS.multilineSeparator) }
	);
};

export default displaySavingSettings;
