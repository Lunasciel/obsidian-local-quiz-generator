/**
 * Settings Tab for the Quiz Generator Plugin
 *
 * This file defines the main settings panel organization and section ordering.
 * The settings are organized into clearly labeled, logical sections following
 * the design specification from task 5.1 (Settings Simplification).
 *
 * Section Order (per design document - updated per Task 15):
 * 1. General Settings - Basic plugin behavior settings
 * 2. Model Management - Central model registry + Generation Model selection
 * 3. Advanced Generation Modes - Consolidated Consensus + Council configuration
 * 4. Quiz Generation Options - Question types and quantities
 * 5. Saving Options - Quiz file saving configuration
 * 6. Flashcards - Flashcard-specific settings (additional feature)
 *
 * Note: The "Generation Mode" section was removed in Task 8 as it was empty.
 * - Model Selection dropdown moved to Model Management section
 * - ModeComparisonSection moved to Advanced Modes section (Task 12)
 * - Consensus settings migrated to Advanced Modes section (Task 13)
 * - Council settings migrated to Advanced Modes section (Task 14)
 * - Main settings.ts updated to use single displayAdvancedModesSettings() (Task 15)
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2, 6.6
 * Task 5.4: Section collapse state persistence
 * Task 8: Remove empty Generation Mode section
 * Task 13: Migrate Consensus settings to Advanced Modes
 * Task 14: Migrate Council settings to Advanced Modes
 * Task 15: Update main settings.ts to use Advanced Modes
 */

import { App, PluginSettingTab, Setting } from "obsidian";
import QuizGenerator from "../main";
import displayGeneralSettings from "./general/generalSettings";
import displayModelManagementSettings from "./modelRegistry/modelManagementSettings";
import displayGenerationSettings from "./generation/generationSettings";
import displaySavingSettings from "./saving/savingSettings";
import displayFlashcardSettings from "./flashcards/flashcardSettings";
import { displayAdvancedModesSettings } from "./advancedModes/advancedModesSettings";
import {
	SECTION_IDS,
	SectionId,
	getSectionExpanded,
	setSectionExpanded,
	SectionCollapseState,
} from "./sectionCollapseState";

/**
 * Settings tab for the Quiz Generator plugin.
 *
 * Organizes settings into clearly labeled, collapsible sections with
 * proper visual hierarchy and logical grouping.
 *
 * The section order follows the design specification (updated per Task 15):
 * 1. General Settings (first) - Basic plugin configuration
 * 2. Model Management (second, prominent) - Central model registry + Generation Model selection
 * 3. Advanced Generation Modes - Consolidated Consensus + Council settings
 * 4. Quiz Generation Options - Question types and quantities
 * 5. Saving Options - Save format and location
 * 6. Flashcards - Spaced repetition settings
 *
 * Note: Generation Mode section removed in Task 8 - model dropdown moved to Model Management.
 * Consensus settings migrated to Advanced Modes in Task 13.
 * Council settings migrated to Advanced Modes in Task 14.
 * This file now uses displayAdvancedModesSettings() for consolidated advanced modes (Task 15).
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2, 6.3, 6.6
 * Task 5.4: Section collapse state persistence
 * Task 8: Remove empty Generation Mode section
 * Task 13: Migrate Consensus settings to Advanced Modes
 * Task 14: Migrate Council settings to Advanced Modes
 * Task 15: Update main settings.ts to use Advanced Modes
 */
export default class QuizSettingsTab extends PluginSettingTab {
	private readonly plugin: QuizGenerator;

	/**
	 * Array of cleanup functions for reactive components.
	 * These are called when the settings panel is hidden/closed.
	 *
	 * Requirements: 8.5, 8.6
	 */
	private cleanupFunctions: Array<() => void> = [];

	constructor(app: App, plugin: QuizGenerator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Get the expanded state for a specific section.
	 * Task 5.4: Section collapse state persistence
	 */
	public getSectionExpanded(sectionId: SectionId): boolean {
		return getSectionExpanded(this.plugin.settings.sectionCollapseState, sectionId);
	}

	/**
	 * Create a callback to persist section collapse state changes.
	 * Task 5.4: Section collapse state persistence
	 */
	public createToggleHandler(sectionId: SectionId): (expanded: boolean) => void {
		return async (expanded: boolean): Promise<void> => {
			const newState = setSectionExpanded(
				this.plugin.settings.sectionCollapseState,
				sectionId,
				expanded
			);
			this.plugin.settings.sectionCollapseState = newState;
			await this.plugin.saveSettings();
		};
	}

	/**
	 * Called when the settings panel is hidden/closed.
	 *
	 * Cleans up all reactive components (dropdowns, event listeners) to prevent
	 * memory leaks. This is crucial for proper event emitter cleanup.
	 *
	 * Requirements: 8.5, 8.6
	 */
	hide(): void {
		// Call all cleanup functions
		for (const cleanupFn of this.cleanupFunctions) {
			try {
				cleanupFn();
			} catch (error) {
				console.error("[QuizSettingsTab] Error during cleanup:", error);
			}
		}
		// Clear the cleanup array
		this.cleanupFunctions = [];
	}

	/**
	 * Display the settings panel with sections in the specified order.
	 *
	 * The section order is carefully designed to present settings in a
	 * logical flow, with the most important and frequently accessed
	 * settings appearing first.
	 *
	 * Task 8: Removed empty Generation Mode section
	 * - Model Selection dropdown moved to Model Management section
	 * - ModeComparisonSection will be added to Advanced Modes section (Task 10-15)
	 *
	 * Requirements: 1.1, 1.2, 1.3, 6.1, 6.2
	 */
	display(): void {
		const { containerEl } = this;

		// Clean up any previous reactive components before re-rendering
		this.hide();

		containerEl.empty();

		const refreshSettings = this.display.bind(this);

		// ====================================================================
		// SECTION 1: General Settings (first)
		// Basic plugin behavior settings like note paths, randomization, language
		// The heading is rendered inside displayGeneralSettings
		// Requirements: 6.1
		// ====================================================================
		displayGeneralSettings(containerEl, this.plugin);

		// ====================================================================
		// SECTION 2: Model Management (second, prominent)
		// Central model registry - single source of truth for all AI models
		// Now also includes Generation Model selection dropdown (Task 8)
		// This is prominently placed as it's the foundation for all generation
		// Requirements: 1.2, 3.1, 6.1, 6.4, 6.5, 8.7
		// ====================================================================
		const modelManagementCleanup = displayModelManagementSettings(
			containerEl,
			this.plugin,
			refreshSettings
		);
		if (modelManagementCleanup) {
			this.cleanupFunctions.push(modelManagementCleanup);
		}

		// ====================================================================
		// SECTION 3: Advanced Generation Modes (consolidated Consensus + Council)
		// Multi-model consensus and LLM council configuration
		// Task 13: Migrated Consensus settings to Advanced Modes
		// Task 14: Will migrate Council settings to Advanced Modes
		// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2
		// ====================================================================
		displayAdvancedModesSettings(containerEl, {
			plugin: this.plugin,
			refreshSettings,
		});

		// ====================================================================
		// SECTION 4: Quiz Generation Options
		// Question types and quantities configuration
		// Requirements: 6.1
		// ====================================================================
		displayGenerationSettings(containerEl, this.plugin);

		// ====================================================================
		// SECTION 5: Saving Options
		// Quiz file saving format and location settings
		// Requirements: 6.1
		// ====================================================================
		displaySavingSettings(containerEl, this.plugin);

		// ====================================================================
		// SECTION 6: Flashcards
		// Flashcard-specific settings for spaced repetition feature
		// This is an optional/additional feature section
		// ====================================================================
		displayFlashcardSettings(containerEl, this.plugin);
	}
}
