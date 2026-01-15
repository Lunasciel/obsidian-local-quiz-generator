import { normalizePath, Setting } from "obsidian";
import QuizGenerator from "../../main";
import FolderSuggester from "../saving/folderSuggester";
import { flashcardSaveFormats, PRACTICE_MODE_DESCRIPTIONS, DEFAULT_KEYBOARD_SHORTCUTS, DEFAULT_FLASHCARD_SETTINGS } from "./flashcardConfig";
import { PracticeMode } from "../../utils/types";
import { CollapsibleSection } from "../../ui/components/CollapsibleSection";
import FlashcardReviewer from "../../services/flashcards/flashcardReviewer";
import DeckManager from "../../services/flashcards/deckManager";
import MetadataStorage from "../../services/flashcards/metadataStorage";
import { StatisticsModal } from "../../ui/statistics";
import { FLASHCARD_HELP, getTooltip } from "../helpText";
import {
	addInfoIconToSetting,
	addHelpIcon,
	createHelpTip,
	setDescWithWarning,
} from "../../ui/components/SettingsHelpText";
import {
	SECTION_IDS,
	getSectionExpanded,
	createSectionToggleHandler,
} from "../sectionCollapseState";

/**
 * Check if a setting value differs from its default
 */
const isModified = <T>(currentValue: T, defaultValue: T): boolean => {
	if (Array.isArray(currentValue) && Array.isArray(defaultValue)) {
		return JSON.stringify(currentValue) !== JSON.stringify(defaultValue);
	}
	if (typeof currentValue === 'object' && typeof defaultValue === 'object') {
		return JSON.stringify(currentValue) !== JSON.stringify(defaultValue);
	}
	return currentValue !== defaultValue;
};

/**
 * Add modified indicator to a setting if its value differs from default
 */
const addModifiedIndicator = (settingEl: HTMLElement, isModifiedValue: boolean): void => {
	if (!isModifiedValue) {
		return;
	}

	// Find the setting name element
	const nameEl = settingEl.querySelector('.setting-item-name');
	if (!nameEl) {
		return;
	}

	// Create indicator span using standard DOM or Obsidian API
	const indicator = document.createElement('span');
	indicator.className = 'modified-indicator-qg';
	indicator.textContent = '●';
	indicator.setAttribute('title', 'Modified from default');
	nameEl.appendChild(indicator as Node);
};

/**
 * Add dependency indicator to show when a setting depends on another
 * Task 17 Requirement 6.6: Add dependency indicators for related settings
 */
const addDependencyIndicator = (
	settingEl: HTMLElement,
	dependsOnEnabled: boolean,
	dependencyText: string
): void => {
	// Add visual state class for dependency
	if (!dependsOnEnabled) {
		settingEl.addClass('flashcard-setting-dependent-disabled-qg');
	}

	// Add dependency note below the setting
	const descEl = settingEl.querySelector('.setting-item-description');
	if (descEl) {
		const dependencyNote = document.createElement('div');
		dependencyNote.className = 'flashcard-dependency-note-qg';
		dependencyNote.innerHTML = `<span class="dependency-icon-qg">↳</span> ${dependencyText}`;
		descEl.appendChild(dependencyNote as Node);
	}
};

/**
 * Display flashcard-specific settings in the plugin settings tab
 * Implements requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6 from the settings-ui-cleanup spec
 *
 * Task 17: Reorganize Flashcards section
 * - Quick action buttons visually distinct at top (Requirement 6.2)
 * - Collapsible sub-sections (Requirement 6.1)
 * - Dependency indicators for related settings (Requirement 6.6)
 * - Consistent styling with modified indicators and help icons (Requirement 6.4)
 *
 * Organizes settings into logical collapsible sections:
 * - Storage & Organization
 * - Spaced Repetition
 * - Review Sessions
 * - Goals & Motivation
 */
const displayFlashcardSettings = (containerEl: HTMLElement, plugin: QuizGenerator): void => {
	// Section heading with help icon
	const headingSetting = new Setting(containerEl).setName("Flashcards").setHeading();
	const headingEl = headingSetting.settingEl.querySelector(".setting-item-name");
	if (headingEl) {
		addHelpIcon(headingEl as HTMLElement, FLASHCARD_HELP.section.tooltip);
	}

	// ========================================================================
	// QUICK ACTION BUTTONS (Requirement 6.2: visually distinct at top)
	// ========================================================================
	const quickActionsContainer = containerEl.createDiv("flashcard-quick-actions-qg");
	quickActionsContainer.setAttribute("role", "group");
	quickActionsContainer.setAttribute("aria-label", "Quick actions");

	// Review flashcards button (primary action)
	const reviewSetting = new Setting(quickActionsContainer)
		.setName("")
		.addButton(button =>
			button
				.setButtonText("Review flashcards")
				.setIcon("layers")
				.setTooltip(FLASHCARD_HELP.quickActions.review.tooltip)
				.setClass("mod-cta")
				.onClick(async () => {
					try {
						const reviewer = new FlashcardReviewer(plugin.app, plugin.settings);
						await reviewer.openFlashcardReview();
					} catch (error) {
						console.error("Failed to open flashcard review:", error);
					}
				})
		);
	reviewSetting.settingEl.addClass("flashcard-action-primary-qg");

	// Manage decks button
	const decksSetting = new Setting(quickActionsContainer)
		.setName("")
		.addButton(button =>
			button
				.setButtonText("Manage decks")
				.setIcon("folder-open")
				.setTooltip(FLASHCARD_HELP.quickActions.manageDecks.tooltip)
				.onClick(async () => {
					try {
						const deckManager = new DeckManager(plugin.app, plugin.settings);
						await deckManager.openDeckManager();
					} catch (error) {
						console.error("Failed to open deck manager:", error);
					}
				})
		);
	decksSetting.settingEl.addClass("flashcard-action-secondary-qg");

	// View statistics button
	const statsSetting = new Setting(quickActionsContainer)
		.setName("")
		.addButton(button =>
			button
				.setButtonText("View statistics")
				.setIcon("bar-chart")
				.setTooltip(FLASHCARD_HELP.quickActions.statistics.tooltip)
				.onClick(async () => {
					try {
						const metadataStorage = new MetadataStorage(plugin.app);
						const modal = new StatisticsModal(
							plugin.app,
							plugin.settings,
							metadataStorage,
							async (deckId: string) => {
								const reviewer = new FlashcardReviewer(plugin.app, plugin.settings);
								await reviewer.openFlashcardReview(deckId);
							}
						);
						await modal.open();
					} catch (error) {
						console.error("Failed to open statistics:", error);
					}
				})
		);
	statsSetting.settingEl.addClass("flashcard-action-secondary-qg");

	// Helper for creating section toggle handlers with persistence
	const createToggleHandler = (sectionId: string) =>
		createSectionToggleHandler(
			sectionId as typeof SECTION_IDS[keyof typeof SECTION_IDS],
			() => plugin.settings.sectionCollapseState,
			async (state) => {
				plugin.settings.sectionCollapseState = state;
				await plugin.saveSettings();
			}
		);

	// ========================================================================
	// SECTION 1: Storage & Organization (Requirement 6.1: collapsible)
	// ========================================================================
	const storageSection = new CollapsibleSection(
		containerEl,
		"Storage & Organization",
		getSectionExpanded(plugin.settings.sectionCollapseState, SECTION_IDS.FLASHCARDS_STORAGE),
		"default",
		createToggleHandler(SECTION_IDS.FLASHCARDS_STORAGE)
	);

	// Auto-save toggle
	const autoSaveSetting = new Setting(storageSection.contentEl)
		.setName("Automatically save flashcards")
		.setDesc(FLASHCARD_HELP.storage.autoSave.description);

	let autoSaveValue = plugin.settings.flashcardSettings?.autoSave ?? false;
	autoSaveSetting.addToggle(toggle =>
		toggle
			.setValue(autoSaveValue)
			.onChange(async (value) => {
				if (!plugin.settings.flashcardSettings) {
					return;
				}
				plugin.settings.flashcardSettings.autoSave = value;
				autoSaveValue = value;
				await plugin.saveSettings();
				// Update dependent settings visual state
				updateSavePathDependency(value);
			})
	);
	addInfoIconToSetting(autoSaveSetting, { tooltip: FLASHCARD_HELP.storage.autoSave.tooltip });
	addModifiedIndicator(
		autoSaveSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.autoSave ?? false, DEFAULT_FLASHCARD_SETTINGS.autoSave)
	);

	// Save path (depends on auto-save)
	const savePathSetting = new Setting(storageSection.contentEl)
		.setName("Flashcard save location")
		.setDesc(FLASHCARD_HELP.storage.savePath.description)
		.addSearch(search => {
			new FolderSuggester(plugin.app, search.inputEl);
			search
				.setValue(plugin.settings.flashcardSettings?.savePath ?? "/")
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.savePath = normalizePath(value.trim());
					await plugin.saveSettings();
				});
		});
	addInfoIconToSetting(savePathSetting, { tooltip: FLASHCARD_HELP.storage.savePath.tooltip });
	addModifiedIndicator(
		savePathSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.savePath ?? "/", DEFAULT_FLASHCARD_SETTINGS.savePath)
	);

	// Function to update save path dependency visual state
	const updateSavePathDependency = (autoSaveEnabled: boolean): void => {
		if (autoSaveEnabled) {
			savePathSetting.settingEl.removeClass('flashcard-setting-dependent-disabled-qg');
		} else {
			savePathSetting.settingEl.addClass('flashcard-setting-dependent-disabled-qg');
		}
	};

	// Initialize dependency state
	addDependencyIndicator(
		savePathSetting.settingEl,
		autoSaveValue,
		"Used when auto-save is enabled"
	);

	// ========================================================================
	// FOLDER ORGANIZATION SETTINGS (Requirement 6.1)
	// ========================================================================

	// Dedicated flashcard folder
	let pathPreviewEl: HTMLElement | null = null;
	const updatePathPreview = (): void => {
		if (!pathPreviewEl) return;

		const scheme = plugin.settings.flashcardSettings?.organizationScheme ?? "flat";
		const dedicatedFolder = plugin.settings.flashcardSettings?.dedicatedFolder ?? "Flashcards";

		let examplePath = "";
		switch (scheme) {
			case "flat":
				examplePath = `${dedicatedFolder}/flashcards-1.md`;
				break;
			case "mirror":
				examplePath = `${dedicatedFolder}/Notes/Chapter1/flashcards-1.md`;
				break;
			case "deck-based":
				examplePath = `${dedicatedFolder}/My Deck/flashcards-1.md`;
				break;
		}

		pathPreviewEl.textContent = examplePath;
	};

	const dedicatedFolderSetting = new Setting(storageSection.contentEl)
		.setName("Dedicated flashcard folder")
		.setDesc(FLASHCARD_HELP.storage.dedicatedFolder.description)
		.addSearch(search => {
			new FolderSuggester(plugin.app, search.inputEl);
			search
				.setValue(plugin.settings.flashcardSettings?.dedicatedFolder ?? "Flashcards")
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.dedicatedFolder = normalizePath(value.trim());
					await plugin.saveSettings();
					updatePathPreview();
				});
		});
	addInfoIconToSetting(dedicatedFolderSetting, { tooltip: FLASHCARD_HELP.storage.dedicatedFolder.tooltip });
	addModifiedIndicator(
		dedicatedFolderSetting.settingEl,
		isModified(
			plugin.settings.flashcardSettings?.dedicatedFolder ?? "Flashcards",
			DEFAULT_FLASHCARD_SETTINGS.dedicatedFolder
		)
	);

	// Organization scheme
	const organizationSchemeSetting = new Setting(storageSection.contentEl)
		.setName("Folder organization scheme")
		.setDesc(FLASHCARD_HELP.storage.organizationScheme.description)
		.addDropdown(dropdown =>
			dropdown
				.addOption("flat", "Flat - All flashcards in one folder")
				.addOption("mirror", "Mirror - Mirror source note's folder structure")
				.addOption("deck-based", "Deck-based - Organize by deck name")
				.setValue(plugin.settings.flashcardSettings?.organizationScheme ?? "flat")
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.organizationScheme = value as "flat" | "mirror" | "deck-based";
					await plugin.saveSettings();
					updatePathPreview();
				})
		);
	addInfoIconToSetting(organizationSchemeSetting, { tooltip: FLASHCARD_HELP.storage.organizationScheme.tooltip });
	addModifiedIndicator(
		organizationSchemeSetting.settingEl,
		isModified(
			plugin.settings.flashcardSettings?.organizationScheme ?? "flat",
			DEFAULT_FLASHCARD_SETTINGS.organizationScheme
		)
	);

	// Auto-migrate toggle with warning
	const autoMigrateSetting = new Setting(storageSection.contentEl)
		.setName("Auto-migrate on folder change");
	setDescWithWarning(
		autoMigrateSetting,
		FLASHCARD_HELP.storage.autoMigrate.description,
		FLASHCARD_HELP.storage.autoMigrate.warning ?? "This will move files in your vault."
	);
	autoMigrateSetting.addToggle(toggle =>
		toggle
			.setValue(plugin.settings.flashcardSettings?.autoMigrateOnChange ?? false)
			.onChange(async (value) => {
				if (!plugin.settings.flashcardSettings) {
					return;
				}
				plugin.settings.flashcardSettings.autoMigrateOnChange = value;
				await plugin.saveSettings();
			})
	);
	addInfoIconToSetting(autoMigrateSetting, { tooltip: FLASHCARD_HELP.storage.autoMigrate.tooltip });
	addModifiedIndicator(
		autoMigrateSetting.settingEl,
		isModified(
			plugin.settings.flashcardSettings?.autoMigrateOnChange ?? false,
			DEFAULT_FLASHCARD_SETTINGS.autoMigrateOnChange
		)
	);

	// Path preview
	const pathPreviewSetting = new Setting(storageSection.contentEl)
		.setName("Example flashcard path")
		.setDesc("Preview of where flashcard files will be saved based on current settings.");

	pathPreviewEl = pathPreviewSetting.settingEl.createDiv("flashcard-path-preview-qg");
	updatePathPreview();

	// Save format
	const saveFormatSetting = new Setting(storageSection.contentEl)
		.setName("Flashcard save format")
		.setDesc(FLASHCARD_HELP.storage.saveFormat.description)
		.addDropdown(dropdown =>
			dropdown
				.addOptions(flashcardSaveFormats)
				.setValue(plugin.settings.flashcardSettings?.saveFormat ?? "Callout")
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.saveFormat = value;
					await plugin.saveSettings();
					// Update inline separator dependency
					updateInlineSeparatorVisibility(value);
				})
		);
	addInfoIconToSetting(saveFormatSetting, { tooltip: FLASHCARD_HELP.storage.saveFormat.tooltip });
	addModifiedIndicator(
		saveFormatSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.saveFormat ?? "Callout", DEFAULT_FLASHCARD_SETTINGS.saveFormat)
	);

	// Material property
	const materialPropertySetting = new Setting(storageSection.contentEl)
		.setName("Flashcard material property")
		.setDesc(FLASHCARD_HELP.storage.materialProperty.description)
		.addText(text =>
			text
				.setPlaceholder("flashcard-sources")
				.setValue(plugin.settings.flashcardSettings?.flashcardMaterialProperty ?? "flashcard-sources")
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.flashcardMaterialProperty = value.trim();
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(materialPropertySetting, { tooltip: FLASHCARD_HELP.storage.materialProperty.tooltip });
	addModifiedIndicator(
		materialPropertySetting.settingEl,
		isModified(
			plugin.settings.flashcardSettings?.flashcardMaterialProperty ?? "flashcard-sources",
			DEFAULT_FLASHCARD_SETTINGS.flashcardMaterialProperty
		)
	);

	// Inline separator (depends on save format)
	const inlineSeparatorSetting = new Setting(storageSection.contentEl)
		.setName("Inline separator")
		.setDesc(FLASHCARD_HELP.storage.inlineSeparator.description)
		.addText(text =>
			text
				.setPlaceholder("::")
				.setValue(plugin.settings.flashcardSettings?.inlineSeparator ?? "::")
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.inlineSeparator = value.trim();
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(inlineSeparatorSetting, { tooltip: FLASHCARD_HELP.storage.inlineSeparator.tooltip });
	addModifiedIndicator(
		inlineSeparatorSetting.settingEl,
		isModified(
			plugin.settings.flashcardSettings?.inlineSeparator ?? "::",
			DEFAULT_FLASHCARD_SETTINGS.inlineSeparator
		)
	);

	// Function to update inline separator visibility based on save format
	const updateInlineSeparatorVisibility = (format: string): void => {
		if (format === "Spaced Repetition") {
			inlineSeparatorSetting.settingEl.removeClass('flashcard-setting-dependent-disabled-qg');
		} else {
			inlineSeparatorSetting.settingEl.addClass('flashcard-setting-dependent-disabled-qg');
		}
	};

	// Initialize inline separator dependency
	addDependencyIndicator(
		inlineSeparatorSetting.settingEl,
		(plugin.settings.flashcardSettings?.saveFormat ?? "Callout") === "Spaced Repetition",
		"Only used with Spaced Repetition format"
	);

	// Section reset button
	new Setting(storageSection.contentEl)
		.addButton(button => button
			.setButtonText("Reset storage settings to defaults")
			.setClass("mod-warning")
			.onClick(async () => {
				if (!plugin.settings.flashcardSettings) {
					return;
				}
				plugin.settings.flashcardSettings.autoSave = DEFAULT_FLASHCARD_SETTINGS.autoSave;
				plugin.settings.flashcardSettings.savePath = DEFAULT_FLASHCARD_SETTINGS.savePath;
				plugin.settings.flashcardSettings.saveFormat = DEFAULT_FLASHCARD_SETTINGS.saveFormat;
				plugin.settings.flashcardSettings.flashcardMaterialProperty = DEFAULT_FLASHCARD_SETTINGS.flashcardMaterialProperty;
				plugin.settings.flashcardSettings.inlineSeparator = DEFAULT_FLASHCARD_SETTINGS.inlineSeparator;
				plugin.settings.flashcardSettings.dedicatedFolder = DEFAULT_FLASHCARD_SETTINGS.dedicatedFolder;
				plugin.settings.flashcardSettings.organizationScheme = DEFAULT_FLASHCARD_SETTINGS.organizationScheme;
				plugin.settings.flashcardSettings.autoMigrateOnChange = DEFAULT_FLASHCARD_SETTINGS.autoMigrateOnChange;
				await plugin.saveSettings();
				// Clear and re-render the section
				containerEl.empty();
				displayFlashcardSettings(containerEl, plugin);
			})
		);

	// ========================================================================
	// SECTION 2: Spaced Repetition (Requirement 6.3: rarely changed, collapsed by default)
	// ========================================================================
	const spacedRepSection = new CollapsibleSection(
		containerEl,
		"Spaced Repetition",
		getSectionExpanded(plugin.settings.sectionCollapseState, SECTION_IDS.FLASHCARDS_REVIEW),
		"default",
		createToggleHandler(SECTION_IDS.FLASHCARDS_REVIEW)
	);

	// Add section description
	createHelpTip(
		spacedRepSection.contentEl,
		FLASHCARD_HELP.spacedRepetition.section.description,
		"info"
	);

	// Ease Factor Settings
	const defaultEaseSetting = new Setting(spacedRepSection.contentEl)
		.setName("Default ease factor")
		.setDesc(FLASHCARD_HELP.spacedRepetition.easeFactor.default.description)
		.addSlider(slider =>
			slider
				.setLimits(1.3, 3.0, 0.1)
				.setValue(plugin.settings.flashcardSettings?.defaultEaseFactor ?? 2.5)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.defaultEaseFactor = Math.round(value * 10) / 10;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(defaultEaseSetting, {
		tooltip: getTooltip(FLASHCARD_HELP.spacedRepetition.easeFactor.default)
	});
	addModifiedIndicator(
		defaultEaseSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.defaultEaseFactor ?? 2.5, DEFAULT_FLASHCARD_SETTINGS.defaultEaseFactor)
	);

	const minEaseSetting = new Setting(spacedRepSection.contentEl)
		.setName("Minimum ease factor")
		.setDesc(FLASHCARD_HELP.spacedRepetition.easeFactor.min.description)
		.addSlider(slider =>
			slider
				.setLimits(1.0, 2.0, 0.1)
				.setValue(plugin.settings.flashcardSettings?.minEaseFactor ?? 1.3)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.minEaseFactor = Math.round(value * 10) / 10;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(minEaseSetting, { tooltip: FLASHCARD_HELP.spacedRepetition.easeFactor.min.tooltip });
	addModifiedIndicator(
		minEaseSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.minEaseFactor ?? 1.3, DEFAULT_FLASHCARD_SETTINGS.minEaseFactor)
	);

	const maxEaseSetting = new Setting(spacedRepSection.contentEl)
		.setName("Maximum ease factor")
		.setDesc(FLASHCARD_HELP.spacedRepetition.easeFactor.max.description)
		.addSlider(slider =>
			slider
				.setLimits(2.0, 5.0, 0.1)
				.setValue(plugin.settings.flashcardSettings?.maxEaseFactor ?? 3.0)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.maxEaseFactor = Math.round(value * 10) / 10;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(maxEaseSetting, { tooltip: FLASHCARD_HELP.spacedRepetition.easeFactor.max.tooltip });
	addModifiedIndicator(
		maxEaseSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.maxEaseFactor ?? 3.0, DEFAULT_FLASHCARD_SETTINGS.maxEaseFactor)
	);

	// Confidence Rating Intervals
	const againIntervalSetting = new Setting(spacedRepSection.contentEl)
		.setName("'Again' interval (days)")
		.setDesc(FLASHCARD_HELP.spacedRepetition.intervals.again.description)
		.addSlider(slider =>
			slider
				.setLimits(1, 7, 1)
				.setValue(plugin.settings.flashcardSettings?.againInterval ?? 1)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.againInterval = value;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(againIntervalSetting, { tooltip: FLASHCARD_HELP.spacedRepetition.intervals.again.tooltip });
	addModifiedIndicator(
		againIntervalSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.againInterval ?? 1, DEFAULT_FLASHCARD_SETTINGS.againInterval)
	);

	const hardMultiplierSetting = new Setting(spacedRepSection.contentEl)
		.setName("'Hard' interval multiplier")
		.setDesc(FLASHCARD_HELP.spacedRepetition.intervals.hard.description)
		.addSlider(slider =>
			slider
				.setLimits(1.0, 2.0, 0.1)
				.setValue(plugin.settings.flashcardSettings?.hardIntervalMultiplier ?? 1.2)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.hardIntervalMultiplier = Math.round(value * 10) / 10;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(hardMultiplierSetting, { tooltip: FLASHCARD_HELP.spacedRepetition.intervals.hard.tooltip });
	addModifiedIndicator(
		hardMultiplierSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.hardIntervalMultiplier ?? 1.2, DEFAULT_FLASHCARD_SETTINGS.hardIntervalMultiplier)
	);

	const goodMultiplierSetting = new Setting(spacedRepSection.contentEl)
		.setName("'Good' interval multiplier")
		.setDesc(FLASHCARD_HELP.spacedRepetition.intervals.good.description)
		.addSlider(slider =>
			slider
				.setLimits(1.5, 4.0, 0.1)
				.setValue(plugin.settings.flashcardSettings?.goodIntervalMultiplier ?? 2.5)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.goodIntervalMultiplier = Math.round(value * 10) / 10;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(goodMultiplierSetting, { tooltip: FLASHCARD_HELP.spacedRepetition.intervals.good.tooltip });
	addModifiedIndicator(
		goodMultiplierSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.goodIntervalMultiplier ?? 2.5, DEFAULT_FLASHCARD_SETTINGS.goodIntervalMultiplier)
	);

	const easyMultiplierSetting = new Setting(spacedRepSection.contentEl)
		.setName("'Easy' interval multiplier")
		.setDesc(FLASHCARD_HELP.spacedRepetition.intervals.easy.description)
		.addSlider(slider =>
			slider
				.setLimits(2.0, 5.0, 0.1)
				.setValue(plugin.settings.flashcardSettings?.easyIntervalMultiplier ?? 3.0)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.easyIntervalMultiplier = Math.round(value * 10) / 10;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(easyMultiplierSetting, { tooltip: FLASHCARD_HELP.spacedRepetition.intervals.easy.tooltip });
	addModifiedIndicator(
		easyMultiplierSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.easyIntervalMultiplier ?? 3.0, DEFAULT_FLASHCARD_SETTINGS.easyIntervalMultiplier)
	);

	// Interval Constraints
	const minIntervalSetting = new Setting(spacedRepSection.contentEl)
		.setName("Minimum interval (days)")
		.setDesc(FLASHCARD_HELP.spacedRepetition.constraints.minInterval.description)
		.addSlider(slider =>
			slider
				.setLimits(1, 7, 1)
				.setValue(plugin.settings.flashcardSettings?.minInterval ?? 1)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.minInterval = value;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(minIntervalSetting, { tooltip: FLASHCARD_HELP.spacedRepetition.constraints.minInterval.tooltip });
	addModifiedIndicator(
		minIntervalSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.minInterval ?? 1, DEFAULT_FLASHCARD_SETTINGS.minInterval)
	);

	const maxIntervalSetting = new Setting(spacedRepSection.contentEl)
		.setName("Maximum interval (days)")
		.setDesc(FLASHCARD_HELP.spacedRepetition.constraints.maxInterval.description)
		.addSlider(slider =>
			slider
				.setLimits(30, 730, 10)
				.setValue(plugin.settings.flashcardSettings?.maxInterval ?? 365)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.maxInterval = value;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(maxIntervalSetting, { tooltip: FLASHCARD_HELP.spacedRepetition.constraints.maxInterval.tooltip });
	addModifiedIndicator(
		maxIntervalSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.maxInterval ?? 365, DEFAULT_FLASHCARD_SETTINGS.maxInterval)
	);

	const historyLengthSetting = new Setting(spacedRepSection.contentEl)
		.setName("Review history length")
		.setDesc(FLASHCARD_HELP.spacedRepetition.constraints.historyLength.description)
		.addSlider(slider =>
			slider
				.setLimits(10, 200, 10)
				.setValue(plugin.settings.flashcardSettings?.maxReviewHistoryLength ?? 50)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.maxReviewHistoryLength = value;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(historyLengthSetting, { tooltip: FLASHCARD_HELP.spacedRepetition.constraints.historyLength.tooltip });
	addModifiedIndicator(
		historyLengthSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.maxReviewHistoryLength ?? 50, DEFAULT_FLASHCARD_SETTINGS.maxReviewHistoryLength)
	);

	// Section reset button
	new Setting(spacedRepSection.contentEl)
		.addButton(button => button
			.setButtonText("Reset spaced repetition settings to defaults")
			.setClass("mod-warning")
			.onClick(async () => {
				if (!plugin.settings.flashcardSettings) {
					return;
				}
				plugin.settings.flashcardSettings.defaultEaseFactor = DEFAULT_FLASHCARD_SETTINGS.defaultEaseFactor;
				plugin.settings.flashcardSettings.minEaseFactor = DEFAULT_FLASHCARD_SETTINGS.minEaseFactor;
				plugin.settings.flashcardSettings.maxEaseFactor = DEFAULT_FLASHCARD_SETTINGS.maxEaseFactor;
				plugin.settings.flashcardSettings.againInterval = DEFAULT_FLASHCARD_SETTINGS.againInterval;
				plugin.settings.flashcardSettings.hardIntervalMultiplier = DEFAULT_FLASHCARD_SETTINGS.hardIntervalMultiplier;
				plugin.settings.flashcardSettings.goodIntervalMultiplier = DEFAULT_FLASHCARD_SETTINGS.goodIntervalMultiplier;
				plugin.settings.flashcardSettings.easyIntervalMultiplier = DEFAULT_FLASHCARD_SETTINGS.easyIntervalMultiplier;
				plugin.settings.flashcardSettings.minInterval = DEFAULT_FLASHCARD_SETTINGS.minInterval;
				plugin.settings.flashcardSettings.maxInterval = DEFAULT_FLASHCARD_SETTINGS.maxInterval;
				plugin.settings.flashcardSettings.maxReviewHistoryLength = DEFAULT_FLASHCARD_SETTINGS.maxReviewHistoryLength;
				await plugin.saveSettings();
				containerEl.empty();
				displayFlashcardSettings(containerEl, plugin);
			})
		);

	// ========================================================================
	// SECTION 3: Review Sessions
	// ========================================================================
	const reviewSessionSection = new CollapsibleSection(
		containerEl,
		"Review Sessions",
		getSectionExpanded(plugin.settings.sectionCollapseState, SECTION_IDS.FLASHCARDS_LEARNING),
		"default",
		createToggleHandler(SECTION_IDS.FLASHCARDS_LEARNING)
	);

	// Add section description
	createHelpTip(
		reviewSessionSection.contentEl,
		FLASHCARD_HELP.reviewSessions.section.description,
		"info"
	);

	const newCardsPerDaySetting = new Setting(reviewSessionSection.contentEl)
		.setName("Default new cards per day")
		.setDesc(FLASHCARD_HELP.reviewSessions.newCardsPerDay.description)
		.addSlider(slider =>
			slider
				.setLimits(1, 100, 1)
				.setValue(plugin.settings.flashcardSettings?.defaultNewCardsPerDay ?? 20)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.defaultNewCardsPerDay = value;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(newCardsPerDaySetting, {
		tooltip: getTooltip(FLASHCARD_HELP.reviewSessions.newCardsPerDay)
	});
	addModifiedIndicator(
		newCardsPerDaySetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.defaultNewCardsPerDay ?? 20, DEFAULT_FLASHCARD_SETTINGS.defaultNewCardsPerDay)
	);

	const reviewsPerDaySetting = new Setting(reviewSessionSection.contentEl)
		.setName("Default reviews per day")
		.setDesc(FLASHCARD_HELP.reviewSessions.reviewsPerDay.description)
		.addSlider(slider =>
			slider
				.setLimits(10, 500, 10)
				.setValue(plugin.settings.flashcardSettings?.defaultReviewsPerDay ?? 100)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.defaultReviewsPerDay = value;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(reviewsPerDaySetting, { tooltip: FLASHCARD_HELP.reviewSessions.reviewsPerDay.tooltip });
	addModifiedIndicator(
		reviewsPerDaySetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.defaultReviewsPerDay ?? 100, DEFAULT_FLASHCARD_SETTINGS.defaultReviewsPerDay)
	);

	// Practice modes selection
	const practiceModesHeading = new Setting(reviewSessionSection.contentEl)
		.setName("Default enabled practice modes")
		.setDesc(FLASHCARD_HELP.reviewSessions.practiceModes.description)
		.setClass("flashcard-practice-modes-setting");
	addInfoIconToSetting(practiceModesHeading, { tooltip: FLASHCARD_HELP.reviewSessions.practiceModes.tooltip });

	const practiceModeContainer = reviewSessionSection.contentEl.createDiv("flashcard-practice-modes-container");

	Object.values(PracticeMode).forEach((mode) => {
		const setting = new Setting(practiceModeContainer)
			.setName(PRACTICE_MODE_DESCRIPTIONS[mode])
			.addToggle(toggle => {
				const enabledModes = plugin.settings.flashcardSettings?.defaultEnabledPracticeModes ?? [];
				toggle
					.setValue(enabledModes.includes(mode))
					.onChange(async (value) => {
						if (!plugin.settings.flashcardSettings) {
							return;
						}
						const currentModes = plugin.settings.flashcardSettings.defaultEnabledPracticeModes;
						if (value && !currentModes.includes(mode)) {
							currentModes.push(mode);
						} else if (!value) {
							const index = currentModes.indexOf(mode);
							if (index > -1) {
								currentModes.splice(index, 1);
							}
						}
						await plugin.saveSettings();
					});
			});
		setting.settingEl.addClass("flashcard-practice-mode-item-qg");
	});

	const audioCuesSetting = new Setting(reviewSessionSection.contentEl)
		.setName("Enable audio cues by default")
		.setDesc(FLASHCARD_HELP.reviewSessions.audioCues.description)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.flashcardSettings?.defaultEnableAudioCues ?? false)
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.defaultEnableAudioCues = value;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(audioCuesSetting, { tooltip: FLASHCARD_HELP.reviewSessions.audioCues.tooltip });
	addModifiedIndicator(
		audioCuesSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.defaultEnableAudioCues ?? false, DEFAULT_FLASHCARD_SETTINGS.defaultEnableAudioCues)
	);

	const highContrastSetting = new Setting(reviewSessionSection.contentEl)
		.setName("Enable high contrast mode")
		.setDesc(FLASHCARD_HELP.reviewSessions.highContrast.description)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.flashcardSettings?.enableHighContrastMode ?? false)
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.enableHighContrastMode = value;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(highContrastSetting, { tooltip: FLASHCARD_HELP.reviewSessions.highContrast.tooltip });
	addModifiedIndicator(
		highContrastSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.enableHighContrastMode ?? false, DEFAULT_FLASHCARD_SETTINGS.enableHighContrastMode)
	);

	// Keyboard shortcuts heading
	const shortcutsHeading = new Setting(reviewSessionSection.contentEl)
		.setName("Keyboard shortcuts")
		.setDesc(FLASHCARD_HELP.reviewSessions.keyboardShortcuts.description)
		.setClass("flashcard-keyboard-shortcuts-setting");
	addInfoIconToSetting(shortcutsHeading, { tooltip: FLASHCARD_HELP.reviewSessions.keyboardShortcuts.tooltip });

	const shortcutsContainer = reviewSessionSection.contentEl.createDiv("flashcard-shortcuts-container");

	const shortcuts = [
		{ key: "revealAnswer", label: "Reveal answer", default: "Space" },
		{ key: "nextCard", label: "Next card", default: "ArrowRight" },
		{ key: "previousCard", label: "Previous card", default: "ArrowLeft" },
		{ key: "ratingAgain", label: "Rating: Again", default: "1" },
		{ key: "ratingHard", label: "Rating: Hard", default: "2" },
		{ key: "ratingGood", label: "Rating: Good", default: "3" },
		{ key: "ratingEasy", label: "Rating: Easy", default: "4" },
		{ key: "showHint", label: "Show hint", default: "h" },
	];

	shortcuts.forEach(({ key, label, default: defaultValue }) => {
		const setting = new Setting(shortcutsContainer)
			.setName(label)
			.addText(text => {
				const currentShortcuts = plugin.settings.flashcardSettings?.keyboardShortcuts;
				text
					.setPlaceholder(defaultValue)
					.setValue(currentShortcuts?.[key as keyof typeof currentShortcuts] ?? defaultValue)
					.onChange(async (value) => {
						if (!plugin.settings.flashcardSettings) {
							return;
						}
						if (!plugin.settings.flashcardSettings.keyboardShortcuts) {
							plugin.settings.flashcardSettings.keyboardShortcuts = { ...DEFAULT_KEYBOARD_SHORTCUTS };
						}
						plugin.settings.flashcardSettings.keyboardShortcuts[key as keyof typeof plugin.settings.flashcardSettings.keyboardShortcuts] = value.trim() || defaultValue;
						await plugin.saveSettings();
					});
			});
		setting.settingEl.addClass("flashcard-shortcut-item-qg");
	});

	// Section reset button
	new Setting(reviewSessionSection.contentEl)
		.addButton(button => button
			.setButtonText("Reset review session settings to defaults")
			.setClass("mod-warning")
			.onClick(async () => {
				if (!plugin.settings.flashcardSettings) {
					return;
				}
				plugin.settings.flashcardSettings.defaultNewCardsPerDay = DEFAULT_FLASHCARD_SETTINGS.defaultNewCardsPerDay;
				plugin.settings.flashcardSettings.defaultReviewsPerDay = DEFAULT_FLASHCARD_SETTINGS.defaultReviewsPerDay;
				plugin.settings.flashcardSettings.defaultEnabledPracticeModes = [...DEFAULT_FLASHCARD_SETTINGS.defaultEnabledPracticeModes];
				plugin.settings.flashcardSettings.defaultEnableAudioCues = DEFAULT_FLASHCARD_SETTINGS.defaultEnableAudioCues;
				plugin.settings.flashcardSettings.enableHighContrastMode = DEFAULT_FLASHCARD_SETTINGS.enableHighContrastMode;
				plugin.settings.flashcardSettings.keyboardShortcuts = { ...DEFAULT_KEYBOARD_SHORTCUTS };
				await plugin.saveSettings();
				containerEl.empty();
				displayFlashcardSettings(containerEl, plugin);
			})
		);

	// ========================================================================
	// SECTION 4: Goals & Motivation
	// ========================================================================
	const goalsSection = new CollapsibleSection(
		containerEl,
		"Goals & Motivation",
		false,
		"default"
	);

	// Add section description
	createHelpTip(
		goalsSection.contentEl,
		FLASHCARD_HELP.goals.section.description,
		"info"
	);

	const dailyCardGoalSetting = new Setting(goalsSection.contentEl)
		.setName("Daily card goal")
		.setDesc(FLASHCARD_HELP.goals.dailyCardGoal.description)
		.addSlider(slider =>
			slider
				.setLimits(5, 200, 5)
				.setValue(plugin.settings.flashcardSettings?.dailyCardGoal ?? 20)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.dailyCardGoal = value;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(dailyCardGoalSetting, { tooltip: FLASHCARD_HELP.goals.dailyCardGoal.tooltip });
	addModifiedIndicator(
		dailyCardGoalSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.dailyCardGoal ?? 20, DEFAULT_FLASHCARD_SETTINGS.dailyCardGoal)
	);

	const dailyTimeGoalSetting = new Setting(goalsSection.contentEl)
		.setName("Daily time goal (minutes)")
		.setDesc(FLASHCARD_HELP.goals.dailyTimeGoal.description)
		.addSlider(slider =>
			slider
				.setLimits(5, 120, 5)
				.setValue(plugin.settings.flashcardSettings?.dailyTimeGoal ?? 15)
				.setDynamicTooltip()
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.dailyTimeGoal = value;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(dailyTimeGoalSetting, { tooltip: FLASHCARD_HELP.goals.dailyTimeGoal.tooltip });
	addModifiedIndicator(
		dailyTimeGoalSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.dailyTimeGoal ?? 15, DEFAULT_FLASHCARD_SETTINGS.dailyTimeGoal)
	);

	const streakNotificationsSetting = new Setting(goalsSection.contentEl)
		.setName("Enable streak notifications")
		.setDesc(FLASHCARD_HELP.goals.streakNotifications.description)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.flashcardSettings?.enableStreakNotifications ?? true)
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.enableStreakNotifications = value;
					await plugin.saveSettings();
				})
		);
	addInfoIconToSetting(streakNotificationsSetting, { tooltip: FLASHCARD_HELP.goals.streakNotifications.tooltip });
	addModifiedIndicator(
		streakNotificationsSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.enableStreakNotifications ?? true, DEFAULT_FLASHCARD_SETTINGS.enableStreakNotifications)
	);

	const statusBarSetting = new Setting(goalsSection.contentEl)
		.setName("Show flashcard count in status bar")
		.setDesc(FLASHCARD_HELP.goals.statusBar.description)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.flashcardSettings?.showFlashcardCountInStatusBar ?? true)
				.onChange(async (value) => {
					if (!plugin.settings.flashcardSettings) {
						return;
					}
					plugin.settings.flashcardSettings.showFlashcardCountInStatusBar = value;
					await plugin.saveSettings();
					// Reinitialize status bar to apply changes
					await plugin.initializeFlashcardCountStatusBar();
				})
		);
	addInfoIconToSetting(statusBarSetting, { tooltip: FLASHCARD_HELP.goals.statusBar.tooltip });
	addModifiedIndicator(
		statusBarSetting.settingEl,
		isModified(plugin.settings.flashcardSettings?.showFlashcardCountInStatusBar ?? true, DEFAULT_FLASHCARD_SETTINGS.showFlashcardCountInStatusBar)
	);

	// Section reset button
	new Setting(goalsSection.contentEl)
		.addButton(button => button
			.setButtonText("Reset goals settings to defaults")
			.setClass("mod-warning")
			.onClick(async () => {
				if (!plugin.settings.flashcardSettings) {
					return;
				}
				plugin.settings.flashcardSettings.dailyCardGoal = DEFAULT_FLASHCARD_SETTINGS.dailyCardGoal;
				plugin.settings.flashcardSettings.dailyTimeGoal = DEFAULT_FLASHCARD_SETTINGS.dailyTimeGoal;
				plugin.settings.flashcardSettings.enableStreakNotifications = DEFAULT_FLASHCARD_SETTINGS.enableStreakNotifications;
				await plugin.saveSettings();
				containerEl.empty();
				displayFlashcardSettings(containerEl, plugin);
			})
		);

	// ========================================================================
	// Global Reset Button
	// ========================================================================
	new Setting(containerEl)
		.setName("Reset all flashcard settings")
		.setDesc("Reset all flashcard settings to their default values. This cannot be undone.")
		.addButton(button => button
			.setButtonText("Reset all to defaults")
			.setClass("mod-danger")
			.onClick(async () => {
				if (!plugin.settings.flashcardSettings) {
					return;
				}
				// Reset all settings to defaults
				plugin.settings.flashcardSettings = { ...DEFAULT_FLASHCARD_SETTINGS };
				await plugin.saveSettings();
				containerEl.empty();
				displayFlashcardSettings(containerEl, plugin);
			})
		);
};

export default displayFlashcardSettings;
