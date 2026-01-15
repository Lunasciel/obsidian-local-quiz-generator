import { Setting } from "obsidian";
import QuizGenerator from "../../main";
import { languages, DEFAULT_GENERAL_SETTINGS } from "./generalConfig";
import { GENERAL_HELP } from "../helpText";
import {
	addInfoIconToSetting,
	addHelpIcon,
} from "../../ui/components/SettingsHelpText";
import {
	updateModifiedIndicator,
	createModifiedTooltip,
} from "../../ui/components/SettingsStyling";

/**
 * Display General Settings section.
 *
 * Task 5.1: Reorganize settings sections order
 * Task 5.3: Add inline help text to settings
 * Task 18: Apply consistent styling across all sections
 * Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3
 *
 * This section contains basic plugin configuration options that don't
 * depend on AI model configuration. It appears first in the settings panel.
 */
const displayGeneralSettings = (containerEl: HTMLElement, plugin: QuizGenerator): void => {
	// Section heading with help icon
	const headingSetting = new Setting(containerEl).setName("General Settings").setHeading();
	const headingEl = headingSetting.settingEl.querySelector(".setting-item-name");
	if (headingEl) {
		addHelpIcon(headingEl as HTMLElement, GENERAL_HELP.section.tooltip);
	}

	// Show note path setting
	const notePathSetting = new Setting(containerEl)
		.setName("Show note path")
		.setDesc(GENERAL_HELP.notePath.description)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.showNotePath)
				.onChange(async (value) => {
					plugin.settings.showNotePath = value;
					await plugin.saveSettings();
					// Task 18: Update modified indicator
					updateModifiedIndicator(
						notePathSetting,
						value !== DEFAULT_GENERAL_SETTINGS.showNotePath,
						{ tooltip: createModifiedTooltip("Show note path", DEFAULT_GENERAL_SETTINGS.showNotePath) }
					);
				})
		);
	addInfoIconToSetting(notePathSetting, { tooltip: GENERAL_HELP.notePath.tooltip });
	// Task 18: Initial modified indicator check
	updateModifiedIndicator(
		notePathSetting,
		plugin.settings.showNotePath !== DEFAULT_GENERAL_SETTINGS.showNotePath,
		{ tooltip: createModifiedTooltip("Show note path", DEFAULT_GENERAL_SETTINGS.showNotePath) }
	);

	// Show folder path setting
	const folderPathSetting = new Setting(containerEl)
		.setName("Show folder path")
		.setDesc(GENERAL_HELP.folderPath.description)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.showFolderPath)
				.onChange(async (value) => {
					plugin.settings.showFolderPath = value;
					await plugin.saveSettings();
					// Task 18: Update modified indicator
					updateModifiedIndicator(
						folderPathSetting,
						value !== DEFAULT_GENERAL_SETTINGS.showFolderPath,
						{ tooltip: createModifiedTooltip("Show folder path", DEFAULT_GENERAL_SETTINGS.showFolderPath) }
					);
				})
		);
	addInfoIconToSetting(folderPathSetting, { tooltip: GENERAL_HELP.folderPath.tooltip });
	// Task 18: Initial modified indicator check
	updateModifiedIndicator(
		folderPathSetting,
		plugin.settings.showFolderPath !== DEFAULT_GENERAL_SETTINGS.showFolderPath,
		{ tooltip: createModifiedTooltip("Show folder path", DEFAULT_GENERAL_SETTINGS.showFolderPath) }
	);

	// Include subfolder notes setting
	const subfolderSetting = new Setting(containerEl)
		.setName("Include notes in subfolders")
		.setDesc(GENERAL_HELP.includeSubfolders.description)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.includeSubfolderNotes)
				.onChange(async (value) => {
					plugin.settings.includeSubfolderNotes = value;
					await plugin.saveSettings();
					// Task 18: Update modified indicator
					updateModifiedIndicator(
						subfolderSetting,
						value !== DEFAULT_GENERAL_SETTINGS.includeSubfolderNotes,
						{ tooltip: createModifiedTooltip("Include notes in subfolders", DEFAULT_GENERAL_SETTINGS.includeSubfolderNotes) }
					);
				})
		);
	addInfoIconToSetting(subfolderSetting, { tooltip: GENERAL_HELP.includeSubfolders.tooltip });
	// Task 18: Initial modified indicator check
	updateModifiedIndicator(
		subfolderSetting,
		plugin.settings.includeSubfolderNotes !== DEFAULT_GENERAL_SETTINGS.includeSubfolderNotes,
		{ tooltip: createModifiedTooltip("Include notes in subfolders", DEFAULT_GENERAL_SETTINGS.includeSubfolderNotes) }
	);

	// Randomize question order setting
	const randomizeSetting = new Setting(containerEl)
		.setName("Randomize question order")
		.setDesc(GENERAL_HELP.randomizeQuestions.description)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.randomizeQuestions)
				.onChange(async (value) => {
					plugin.settings.randomizeQuestions = value;
					await plugin.saveSettings();
					// Task 18: Update modified indicator
					updateModifiedIndicator(
						randomizeSetting,
						value !== DEFAULT_GENERAL_SETTINGS.randomizeQuestions,
						{ tooltip: createModifiedTooltip("Randomize question order", DEFAULT_GENERAL_SETTINGS.randomizeQuestions) }
					);
				})
		);
	addInfoIconToSetting(randomizeSetting, { tooltip: GENERAL_HELP.randomizeQuestions.tooltip });
	// Task 18: Initial modified indicator check
	updateModifiedIndicator(
		randomizeSetting,
		plugin.settings.randomizeQuestions !== DEFAULT_GENERAL_SETTINGS.randomizeQuestions,
		{ tooltip: createModifiedTooltip("Randomize question order", DEFAULT_GENERAL_SETTINGS.randomizeQuestions) }
	);

	// Language setting
	const languageSetting = new Setting(containerEl)
		.setName("Language")
		.setDesc(GENERAL_HELP.language.description)
		.addDropdown(dropdown =>
			dropdown
				.addOptions(languages)
				.setValue(plugin.settings.language)
				.onChange(async (value: string) => {
					plugin.settings.language = value;
					await plugin.saveSettings();
					// Task 18: Update modified indicator
					updateModifiedIndicator(
						languageSetting,
						value !== DEFAULT_GENERAL_SETTINGS.language,
						{ tooltip: createModifiedTooltip("Language", DEFAULT_GENERAL_SETTINGS.language) }
					);
				})
		);
	addInfoIconToSetting(languageSetting, { tooltip: GENERAL_HELP.language.tooltip });
	// Task 18: Initial modified indicator check
	updateModifiedIndicator(
		languageSetting,
		plugin.settings.language !== DEFAULT_GENERAL_SETTINGS.language,
		{ tooltip: createModifiedTooltip("Language", DEFAULT_GENERAL_SETTINGS.language) }
	);
};

export default displayGeneralSettings;
