import { Menu, MenuItem, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { DEFAULT_SETTINGS, QuizSettings } from "./settings/config";
import SelectorModal from "./ui/selector/selectorModal";
import QuizSettingsTab from "./settings/settings";
import QuizReviewer from "./services/quizReviewer";
import FlashcardReviewer from "./services/flashcards/flashcardReviewer";
import DeckManager from "./services/flashcards/deckManager";
import DeckLookupService from "./services/flashcards/deckLookup";
import MetadataStorage from "./services/flashcards/metadataStorage";
import StatisticsService from "./services/flashcards/statisticsService";
import StreakNotificationService from "./services/flashcards/streakNotificationService";
import DailyGoalNotificationService from "./services/flashcards/dailyGoalNotificationService";
import ConfirmModal from "./ui/components/ConfirmModal";
import { StatisticsModal } from "./ui/statistics";
import { DEFAULT_FLASHCARD_SETTINGS } from "./settings/flashcards/flashcardConfig";
import {
	migrateToRegistryWithBackup,
	needsRegistryMigration,
	getSettingsVersion,
	SETTINGS_VERSION,
	MigrationResult,
	handleModelReferencesOnLoad,
} from "./settings/modelRegistry";

export default class QuizGenerator extends Plugin {
	public settings: QuizSettings = DEFAULT_SETTINGS;
	private streakNotificationService: StreakNotificationService | null = null;
	private dailyGoalNotificationService: DailyGoalNotificationService | null = null;
	private streakStatusBarItem: HTMLElement | null = null;
	private flashcardCountStatusBarItem: HTMLElement | null = null;

	async onload(): Promise<void> {
		// Quiz commands
		this.addCommand({
			id: "quiz-open-generator",
			name: "Quiz: Open generator",
			callback: (): void => {
				new SelectorModal(this.app, this.settings).open();
			}
		});

		this.addCommand({
			id: "quiz-open-from-active-note",
			name: "Quiz: Open from active note",
			callback: (): void => {
				new QuizReviewer(this.app, this.settings).openQuiz(this.app.workspace.getActiveFile());
			}
		});

		// Quiz ribbon icon
		this.addRibbonIcon("brain-circuit", "Quiz: Open generator", (): void => {
			new SelectorModal(this.app, this.settings).open();
		});

		// Flashcard commands - Requirement 4.3: prefix all with "Flashcards:"
		this.addCommand({
			id: "flashcards-generate-from-active-note",
			name: "Flashcards: Generate from active note",
			callback: async (): Promise<void> => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					return;
				}
				const reviewer = new FlashcardReviewer(this.app, this.settings);
				await reviewer.generateFlashcardsFromNote(activeFile);
			}
		});

		this.addCommand({
			id: "flashcards-review",
			name: "Flashcards: Review",
			callback: async (): Promise<void> => {
				const reviewer = new FlashcardReviewer(this.app, this.settings);
				await reviewer.openFlashcardReview();
			}
		});

		this.addCommand({
			id: "flashcards-manage-decks",
			name: "Flashcards: Manage decks",
			callback: async (): Promise<void> => {
				const deckManager = new DeckManager(this.app, this.settings);
				await deckManager.openDeckManager();
			}
		});

		this.addCommand({
			id: "flashcards-view-statistics",
			name: "Flashcards: View statistics",
			callback: async (): Promise<void> => {
				const metadataStorage = new MetadataStorage(this.app);
				const modal = new StatisticsModal(
					this.app,
					this.settings,
					metadataStorage,
					async (deckId: string) => {
						const reviewer = new FlashcardReviewer(this.app, this.settings);
						await reviewer.openFlashcardReview(deckId);
					}
				);
				await modal.open();
			}
		});

		// Flashcard ribbon buttons - Requirement 6.3: distinct buttons for Generate and Review
		this.addRibbonIcon("plus-circle", "Flashcards: Generate from active note", async (): Promise<void> => {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				return;
			}
			const reviewer = new FlashcardReviewer(this.app, this.settings);
			await reviewer.generateFlashcardsFromNote(activeFile);
		});

		this.addRibbonIcon("layers", "Review flashcards", async (): Promise<void> => {
			const reviewer = new FlashcardReviewer(this.app, this.settings);
			await reviewer.openFlashcardReview();
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile): void => {
				if (file instanceof TFile && file.extension === "md") {
					// Quiz context menu item
					menu.addItem((item: MenuItem): void => {
						item
							.setTitle("Open quiz from this note")
							.setIcon("scroll-text")
							.onClick((): void => {
								new QuizReviewer(this.app, this.settings).openQuiz(file);
							});
					});

					// Flashcards submenu - Requirements 4.1, 4.2, 4.4, 4.6
					const hasFlashcards = this.findFlashcardsForNote(file).length > 0;

					menu.addItem((item: MenuItem): void => {
						item
							.setTitle("Flashcards")
							.setIcon("layers");

						const submenu = (item as any).setSubmenu() as Menu;

						// Review flashcards - only show if flashcards exist (Requirement 4.4)
						if (hasFlashcards) {
							submenu.addItem((subItem: MenuItem): void => {
								subItem
									.setTitle("Review flashcards")
									.setIcon("play")
									.onClick(async (): Promise<void> => {
										await this.openFlashcardsFromNote(file);
									});
								// Tooltip for review action (Requirement 4.6)
								(subItem as any).dom?.setAttribute("aria-label", "Open and review flashcards generated from this note");
							});
						}

						// Generate flashcards - always available
						submenu.addItem((subItem: MenuItem): void => {
							subItem
								.setTitle("Generate flashcards")
								.setIcon("plus")
								.onClick(async (): Promise<void> => {
									const reviewer = new FlashcardReviewer(this.app, this.settings);
									await reviewer.generateFlashcardsFromNote(file);
								});
							// Tooltip for generate action (Requirement 4.6)
							(subItem as any).dom?.setAttribute("aria-label", "Generate new flashcards from this note's content");
						});

						// View statistics - only show if flashcards exist (Requirement 4.4)
						if (hasFlashcards) {
							submenu.addItem((subItem: MenuItem): void => {
								subItem
									.setTitle("View statistics")
									.setIcon("bar-chart")
									.onClick(async (): Promise<void> => {
										await this.viewNoteStatistics(file);
									});
								// Tooltip for statistics action (Requirement 4.6)
								(subItem as any).dom?.setAttribute("aria-label", "View learning statistics for flashcards from this note");
							});
						}
					});
				}
			})
		);

		await this.loadSettings();
		this.addSettingTab(new QuizSettingsTab(this.app, this));

		// Initialize streak notification service (Requirement 8.1)
		await this.initializeStreakTracking();

		// Initialize daily goal notification service (Requirement 8.2)
		await this.initializeDailyGoalNotifications();

		// Initialize flashcard count status bar indicator (Requirements 6.4, 6.5)
		await this.initializeFlashcardCountStatusBar();
	}

	async onunload(): Promise<void> {
		// Clean up daily goal notification service
		if (this.dailyGoalNotificationService) {
			this.dailyGoalNotificationService.destroy();
		}
	}

	async loadSettings(): Promise<void> {
		const rawData = await this.loadData();

		// Check if migration is needed based on settingsVersion
		// Migration is needed if version < REGISTRY_V2 (2) and has legacy fields
		if (rawData && needsRegistryMigration(rawData)) {
			const currentVersion = getSettingsVersion(rawData);
			console.log(
				`[QuizGenerator] Settings migration needed (version ${currentVersion} < ${SETTINGS_VERSION.REGISTRY_V2}), starting migration...`
			);

			// Perform migration with file-based backup for safety
			const migrationResult = await migrateToRegistryWithBackup(
				rawData,
				this.app,
				{ pluginVersion: this.manifest?.version || "1.0.0" }
			);

			// Log migration results
			this.logMigrationResult(migrationResult);

			if (migrationResult.success) {
				// Migration successful - merge with defaults and use migrated settings
				this.settings = Object.assign(
					{},
					DEFAULT_SETTINGS,
					migrationResult.settings
				) as QuizSettings;

				// Save migrated settings to persist the migration
				if (migrationResult.migrated) {
					await this.saveData(this.settings);
					console.log("[QuizGenerator] Migrated settings saved successfully");

					// Show user-friendly notification with details
					this.showMigrationNotice(migrationResult);
				}
			} else {
				// Migration failed - try to restore from backup or fall back to defaults
				await this.handleMigrationFailure(migrationResult, rawData);
			}
		} else {
			// No migration needed - use standard Object.assign pattern
			this.settings = Object.assign({}, DEFAULT_SETTINGS, rawData);
		}

		// Validate model references after loading settings
		// This catches broken references from deleted models (Requirement 8.3, 8.4)
		this.validateModelReferencesOnLoad();
	}

	/**
	 * Validate model references after settings are loaded.
	 *
	 * This handles the case where models have been deleted from the registry
	 * but are still referenced in settings (main model, consensus, council).
	 * Shows a user-friendly warning if broken references are found.
	 *
	 * Requirements: 8.3, 8.4
	 * - 8.3: Handle deleted model references gracefully
	 * - 8.4: Display warning indicator and prompt user to select different model
	 */
	private validateModelReferencesOnLoad(): void {
		// Only validate if we have a model registry
		if (!this.settings.modelRegistry) {
			return;
		}

		const validation = handleModelReferencesOnLoad(this.settings, {
			logToConsole: true,
			autoCleanup: false, // Don't auto-cleanup - let user decide in settings
			showWarning: (message: string) => {
				// Show notice with longer duration for important warnings
				new Notice(message, 8000);
			},
		});

		// Log summary for debugging
		if (!validation.isValid) {
			console.log(
				`[QuizGenerator] Model reference validation: ${validation.summary}`
			);
		}
	}

	/**
	 * Log migration results for debugging and support purposes.
	 *
	 * @param result - The migration result to log
	 *
	 * Requirements: 7.1, 7.3 - Log migration action for debugging
	 */
	private logMigrationResult(result: MigrationResult): void {
		if (!result.migrated) {
			console.log("[QuizGenerator] No migration performed");
			return;
		}

		console.log("[QuizGenerator] Migration completed:");
		console.log(`  - Success: ${result.success}`);
		console.log(`  - Models migrated: ${result.migratedModels}`);
		console.log(`  - Consensus references: ${result.migratedConsensusRefs}`);
		console.log(`  - Council references: ${result.migratedCouncilRefs}`);
		console.log(`  - Legacy fields removed: ${result.removedLegacyFields.length}`);

		if (result.backup) {
			console.log(`  - Backup created at: ${result.backup.path}`);
		}

		if (result.warnings.length > 0) {
			console.warn("[QuizGenerator] Migration warnings:");
			for (const warning of result.warnings) {
				console.warn(`  - ${warning}`);
			}
		}

		if (result.errors.length > 0) {
			console.error("[QuizGenerator] Migration errors:");
			for (const error of result.errors) {
				console.error(`  - ${error}`);
			}
		}
	}

	/**
	 * Show migration notice to user with appropriate messaging.
	 *
	 * @param result - The migration result containing details to display
	 *
	 * Requirements: 1.5, 7.1 - Notify user via one-time notice that settings have been upgraded
	 */
	private showMigrationNotice(result: MigrationResult): void {
		// Build notice message with migration details
		const modelCount = result.migratedModels;
		const hasWarnings = result.warnings.length > 0;

		let message = `Quiz Generator settings migrated to new format. ${modelCount} model(s) configured.`;

		// Add info about backup if created
		if (result.backup) {
			message += " A backup was created.";
		}

		// If there were warnings, indicate that
		if (hasWarnings) {
			new Notice(
				`${message} Some items may need attention - check plugin settings.`,
				8000
			);
		} else {
			new Notice(message, 5000);
		}
	}

	/**
	 * Handle migration failure gracefully by restoring from backup or using defaults.
	 *
	 * @param result - The failed migration result
	 * @param originalData - The original settings data before migration attempt
	 *
	 * Requirements: 7.4 - If migration fails, preserve original settings and notify user
	 */
	private async handleMigrationFailure(
		result: MigrationResult,
		originalData: unknown
	): Promise<void> {
		console.error("[QuizGenerator] Migration failed");
		console.error(`  - Errors: ${result.errors.join(", ")}`);

		// If a backup was created before migration failed, the backup service
		// preserves it. The migrateToRegistryWithBackup function returns the
		// original settings when migration fails, so we use those.
		if (result.backup) {
			console.log(`[QuizGenerator] Backup available at: ${result.backup.path}`);
			new Notice(
				"Settings migration failed. Your original settings were preserved. " +
				"Please check the console for details or reconfigure in settings.",
				10000
			);
		} else {
			new Notice(
				"Settings migration failed. Using default settings. " +
				"Please reconfigure your models in the settings.",
				10000
			);
		}

		// Use the settings returned by migration (which should be the backup/original)
		// or fall back to merging original data with defaults
		if (result.settings && Object.keys(result.settings).length > 0) {
			this.settings = Object.assign(
				{},
				DEFAULT_SETTINGS,
				result.settings
			) as QuizSettings;
		} else if (originalData && typeof originalData === "object") {
			// Fall back to original data merged with defaults
			this.settings = Object.assign(
				{},
				DEFAULT_SETTINGS,
				originalData
			) as QuizSettings;
		} else {
			// Last resort: use defaults
			this.settings = { ...DEFAULT_SETTINGS };
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Open flashcards associated with a source note
	 * Handles three cases: no flashcards (offer to generate), single deck (open directly),
	 * multiple decks (show selector modal)
	 * Implements Requirement 1.1, 1.2, 1.3, 1.4, 1.5
	 * @param sourceNote - The source note to open flashcards for
	 */
	private async openFlashcardsFromNote(sourceNote: TFile): Promise<void> {
		const lookupService = new DeckLookupService(this.app, this.settings);
		const result = await lookupService.findDecksForNote(sourceNote.path);

		if (!result.found || result.decks.length === 0) {
			// No flashcards found - offer to generate (Requirement 1.2)
			new ConfirmModal(
				this.app,
				"No flashcards found",
				"Would you like to generate flashcards from this note?",
				async () => {
					const reviewer = new FlashcardReviewer(this.app, this.settings);
					await reviewer.generateFlashcardsFromNote(sourceNote);
				},
				"Generate",
				"Cancel"
			).open();
			return;
		}

		if (result.decks.length === 1) {
			// Single deck - open directly for review (Requirement 1.4)
			const reviewer = new FlashcardReviewer(this.app, this.settings);
			await reviewer.openFlashcardReview(result.decks[0].id);
			return;
		}

		// Multiple decks - show DeckSelectionModal (Requirement 1.3)
		const { default: DeckSelectionModal } = await import("./ui/flashcards/DeckSelectionModal");
		new DeckSelectionModal(
			this.app,
			result.decks,
			async (selectedDeck) => {
				const reviewer = new FlashcardReviewer(this.app, this.settings);
				await reviewer.openFlashcardReview(selectedDeck.id);
			}
		).open();
	}

	/**
	 * Find flashcard files that were generated from a source note
	 * Queries metadataCache for frontmatter flashcard-sources property
	 * @param sourceNote - The source note to find flashcards for
	 * @returns Array of flashcard TFile objects
	 */
	private findFlashcardsForNote(sourceNote: TFile): TFile[] {
		const allFiles = this.app.vault.getMarkdownFiles();
		const flashcardFiles: TFile[] = [];
		const flashcardMaterialProperty =
			this.settings.flashcardSettings?.flashcardMaterialProperty ||
			DEFAULT_FLASHCARD_SETTINGS.flashcardMaterialProperty;

		for (const file of allFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			const sources = cache?.frontmatter?.[flashcardMaterialProperty];

			if (sources && this.containsSourceNote(sources, sourceNote)) {
				flashcardFiles.push(file);
			}
		}

		return flashcardFiles;
	}

	/**
	 * View statistics for flashcards associated with a source note
	 * Opens the statistics modal filtered to show relevant deck statistics
	 * Implements Requirement 4.1 (statistics in submenu)
	 * @param sourceNote - The source note to view statistics for
	 */
	private async viewNoteStatistics(sourceNote: TFile): Promise<void> {
		const lookupService = new DeckLookupService(this.app, this.settings);
		const result = await lookupService.findDecksForNote(sourceNote.path);

		if (!result.found || result.decks.length === 0) {
			return;
		}

		const metadataStorage = new MetadataStorage(this.app);
		const modal = new StatisticsModal(
			this.app,
			this.settings,
			metadataStorage,
			async (deckId: string) => {
				const reviewer = new FlashcardReviewer(this.app, this.settings);
				await reviewer.openFlashcardReview(deckId);
			}
		);
		await modal.open();
	}

	/**
	 * Check if a sources value contains a reference to the source note
	 * Handles both string and array formats from frontmatter
	 * @param sources - The flashcard-sources frontmatter value
	 * @param sourceNote - The source note to look for
	 * @returns True if sources references the source note
	 */
	private containsSourceNote(sources: unknown, sourceNote: TFile): boolean {
		const noteBasename = sourceNote.basename;
		const notePath = sourceNote.path;

		// Check a single source string
		const checkSource = (source: string): boolean => {
			// Check for wiki-link format: [[Note Name]] or [[path/to/Note]]
			if (source.includes(`[[${noteBasename}]]`) || source.includes(`[[${notePath}]]`)) {
				return true;
			}
			// Check for markdown link format: [Note Name](path/to/Note.md)
			if (source.includes(`(${notePath})`) || source.includes(`(${notePath.replace('.md', '')})`)) {
				return true;
			}
			// Check for plain path reference
			if (source === notePath || source === noteBasename) {
				return true;
			}
			return false;
		};

		if (Array.isArray(sources)) {
			return sources.some(source =>
				typeof source === 'string' && checkSource(source)
			);
		} else if (typeof sources === 'string') {
			return checkSource(sources);
		}

		return false;
	}

	/**
	 * Initialize streak tracking and status bar display
	 * Requirement 8.1: Calculate streak on app load and display in status bar
	 */
	private async initializeStreakTracking(): Promise<void> {
		try {
			const metadataStorage = new MetadataStorage(this.app);
			const statisticsService = new StatisticsService(metadataStorage);

			// Initialize streak notification service
			this.streakNotificationService = new StreakNotificationService(
				statisticsService,
				{
					enabled: this.settings.flashcardSettings?.enableStreakNotifications ?? true,
				}
			);
			await this.streakNotificationService.initialize();

			// Add status bar item showing current streak (Requirement 6.4, 8.1)
			this.createStreakStatusBar();
			await this.updateStreakStatusBar();

			// Set up streak status bar update after session completes
			// This ensures the streak display updates in real-time
			this.registerReviewSessionCallbacks();
		} catch (error) {
			console.error("Error initializing streak tracking:", error);
		}
	}

	/**
	 * Register callbacks that should run after flashcard review sessions
	 * These callbacks handle streak updates and daily goal notifications
	 */
	private registerReviewSessionCallbacks(): void {
		// Note: This method sets up callbacks that can be called by FlashcardReviewer
		// when sessions complete. The actual session completion logic is handled
		// in the FlashcardModal component via the onSessionComplete callback.
	}

	/**
	 * Handle post-session tasks after a flashcard review session completes
	 * This method should be called by review components after saving session data
	 * Requirement 8.1: Check streak milestones after sessions
	 * Requirement 8.2: Check daily goal progress after sessions
	 */
	public async handleSessionComplete(): Promise<void> {
		try {
			// Check for streak milestones
			if (this.streakNotificationService) {
				await this.streakNotificationService.checkAndNotifyMilestone();
				await this.updateStreakStatusBar();
			}

			// Check for daily goal progress and celebrate if goals are met
			if (this.dailyGoalNotificationService) {
				await this.dailyGoalNotificationService.triggerCheck();
			}
		} catch (error) {
			console.error("Error handling session completion:", error);
		}
	}

	/**
	 * Create the status bar item for displaying streak
	 * Requirement 6.4: Show flashcard-related information in status bar
	 */
	private createStreakStatusBar(): void {
		this.streakStatusBarItem = this.addStatusBarItem();
		this.streakStatusBarItem.addClass("flashcard-streak-status-bar");

		// Make it clickable to open statistics
		this.streakStatusBarItem.addEventListener("click", async () => {
			const metadataStorage = new MetadataStorage(this.app);
			const modal = new StatisticsModal(
				this.app,
				this.settings,
				metadataStorage,
				async (deckId: string) => {
					const reviewer = new FlashcardReviewer(this.app, this.settings);
					await reviewer.openFlashcardReview(deckId);
				}
			);
			await modal.open();
		});
	}

	/**
	 * Update the status bar to show current streak
	 * Requirement 8.1: Display streak in status bar
	 */
	private async updateStreakStatusBar(): Promise<void> {
		if (!this.streakStatusBarItem || !this.streakNotificationService) {
			return;
		}

		try {
			const currentStreak = this.streakNotificationService.getCurrentStreak();

			if (currentStreak > 0) {
				this.streakStatusBarItem.setText(`🔥 ${currentStreak} day${currentStreak !== 1 ? 's' : ''}`);
				this.streakStatusBarItem.setAttribute(
					"aria-label",
					`Current learning streak: ${currentStreak} day${currentStreak !== 1 ? 's' : ''}. Click to view statistics.`
				);
			} else {
				this.streakStatusBarItem.setText("");
			}
		} catch (error) {
			console.error("Error updating streak status bar:", error);
		}
	}

	/**
	 * Get the streak notification service instance
	 * Used by FlashcardReviewer to check for milestones after sessions
	 * @returns The streak notification service or null if not initialized
	 */
	public getStreakNotificationService(): StreakNotificationService | null {
		return this.streakNotificationService;
	}

	/**
	 * Get the daily goal notification service instance
	 * Used by FlashcardReviewer to trigger checks after sessions
	 * @returns The daily goal notification service or null if not initialized
	 */
	public getDailyGoalNotificationService(): DailyGoalNotificationService | null {
		return this.dailyGoalNotificationService;
	}

	/**
	 * Initialize daily goal notification tracking and periodic checking
	 * Requirement 8.2: Check goal progress periodically and notify
	 */
	private async initializeDailyGoalNotifications(): Promise<void> {
		try {
			const metadataStorage = new MetadataStorage(this.app);
			const statisticsService = new StatisticsService(metadataStorage);

			// Initialize daily goal notification service
			this.dailyGoalNotificationService = new DailyGoalNotificationService(
				statisticsService,
				{
					enabled: this.settings.flashcardSettings?.enableDailyGoalNotifications ?? true,
					notificationTime: this.settings.flashcardSettings?.dailyGoalNotificationTime ?? "18:00",
					showCelebration: true,
				}
			);
			await this.dailyGoalNotificationService.initialize();
		} catch (error) {
			console.error("Error initializing daily goal notifications:", error);
		}
	}

	/**
	 * Initialize flashcard count status bar indicator
	 * Requirements 6.4, 6.5: Show flashcard count for active note in status bar
	 * Public so it can be called from settings when the toggle changes
	 */
	public async initializeFlashcardCountStatusBar(): Promise<void> {
		try {
			// Only create if enabled in settings
			const enabled = this.settings.flashcardSettings?.showFlashcardCountInStatusBar ?? true;
			if (!enabled) {
				// Clean up existing status bar item if disabling
				if (this.flashcardCountStatusBarItem) {
					this.flashcardCountStatusBarItem.remove();
					this.flashcardCountStatusBarItem = null;
				}
				return;
			}

			// Don't recreate if already exists and enabled
			if (this.flashcardCountStatusBarItem) {
				await this.updateFlashcardCountStatusBar();
				return;
			}

			// Create status bar item
			this.flashcardCountStatusBarItem = this.addStatusBarItem();
			this.flashcardCountStatusBarItem.addClass("flashcard-count-status-bar");

			// Make it clickable to open flashcards from active note
			this.flashcardCountStatusBarItem.addEventListener("click", async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					await this.openFlashcardsFromNote(activeFile);
				}
			});

			// Update on initial load
			await this.updateFlashcardCountStatusBar();

			// Register event handler for active file changes (Requirement 6.4)
			this.registerEvent(
				this.app.workspace.on("active-leaf-change", async () => {
					await this.updateFlashcardCountStatusBar();
				})
			);

			// Also update when files are modified, created, or deleted
			this.registerEvent(
				this.app.vault.on("modify", async (file) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile && file.path === activeFile.path) {
						await this.updateFlashcardCountStatusBar();
					}
				})
			);

			this.registerEvent(
				this.app.vault.on("delete", async () => {
					await this.updateFlashcardCountStatusBar();
				})
			);

			this.registerEvent(
				this.app.vault.on("create", async () => {
					await this.updateFlashcardCountStatusBar();
				})
			);
		} catch (error) {
			console.error("Error initializing flashcard count status bar:", error);
		}
	}

	/**
	 * Update the status bar to show flashcard count for active note
	 * Requirements 6.4, 6.5: Display count and allow clicking to open flashcards
	 */
	private async updateFlashcardCountStatusBar(): Promise<void> {
		if (!this.flashcardCountStatusBarItem) {
			return;
		}

		try {
			// Check if feature is enabled
			const enabled = this.settings.flashcardSettings?.showFlashcardCountInStatusBar ?? true;
			if (!enabled) {
				this.flashcardCountStatusBarItem.setText("");
				return;
			}

			const activeFile = this.app.workspace.getActiveFile();

			// Only show for markdown files
			if (!activeFile || activeFile.extension !== "md") {
				this.flashcardCountStatusBarItem.setText("");
				return;
			}

			// Find flashcard decks for this note
			const flashcardFiles = this.findFlashcardsForNote(activeFile);
			const count = flashcardFiles.length;

			if (count > 0) {
				this.flashcardCountStatusBarItem.setText(`📇 ${count} deck${count !== 1 ? 's' : ''}`);
				this.flashcardCountStatusBarItem.setAttribute(
					"aria-label",
					`${count} flashcard deck${count !== 1 ? 's' : ''} for this note. Click to review.`
				);
				// Make visible
				this.flashcardCountStatusBarItem.style.display = "";
			} else {
				// Hide when no flashcards exist
				this.flashcardCountStatusBarItem.setText("");
				this.flashcardCountStatusBarItem.style.display = "none";
			}
		} catch (error) {
			console.error("Error updating flashcard count status bar:", error);
		}
	}

	/**
	 * Public method to refresh status bar indicators
	 * Can be called after flashcard generation or deletion
	 */
	public async refreshStatusBars(): Promise<void> {
		await this.updateStreakStatusBar();
		await this.updateFlashcardCountStatusBar();
	}
}
