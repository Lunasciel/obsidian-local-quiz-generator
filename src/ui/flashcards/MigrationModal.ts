import { App, Modal, TFile, Notice } from "obsidian";
import FolderOrganizer, { MigrationResult } from "../../services/flashcards/folderOrganizer";
import { QuizSettings } from "../../settings/config";

/**
 * Preview item for migration display
 */
export interface MigrationPreviewItem {
	file: TFile;
	oldPath: string;
	newPath: string;
}

/**
 * Modal for previewing and executing flashcard migration to a new folder location.
 * Implements Requirements 2.3, 2.6 from the spec:
 * - Show preview of files to be moved
 * - Implement actual migration using FolderOrganizer
 * - Add progress indicator during migration
 * - Handle errors gracefully with rollback option
 */
export default class MigrationModal extends Modal {
	private readonly settings: QuizSettings;
	private readonly newFolderPath: string;
	private readonly filesToMigrate: TFile[];
	private readonly onComplete: (result: MigrationResult) => void;

	private folderOrganizer: FolderOrganizer;
	private previewItems: MigrationPreviewItem[] = [];
	private isMigrating: boolean = false;
	private progressContainer: HTMLElement | null = null;
	private progressBar: HTMLElement | null = null;
	private progressText: HTMLElement | null = null;

	constructor(
		app: App,
		settings: QuizSettings,
		newFolderPath: string,
		filesToMigrate: TFile[],
		onComplete: (result: MigrationResult) => void
	) {
		super(app);
		this.settings = settings;
		this.newFolderPath = newFolderPath;
		this.filesToMigrate = filesToMigrate;
		this.onComplete = onComplete;
		this.folderOrganizer = new FolderOrganizer(app, settings);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("migration-modal");

		// Generate preview items
		this.generatePreview();

		// Render the modal content
		this.renderContent();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Generate preview of migration destinations
	 */
	private generatePreview(): void {
		this.previewItems = this.filesToMigrate.map(file => {
			const newPath = `${this.newFolderPath}/${file.name}`;
			return {
				file,
				oldPath: file.path,
				newPath
			};
		});
	}

	/**
	 * Render the modal content
	 */
	private renderContent(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Title
		contentEl.createEl("h2", { text: "Migrate Flashcards" });

		// Description
		contentEl.createEl("p", {
			text: `This will move ${this.filesToMigrate.length} flashcard file(s) to the new location.`,
			cls: "migration-modal-description"
		});

		// Migration summary
		const summary = contentEl.createDiv({ cls: "migration-summary" });
		summary.createEl("div", {
			text: `From: Various locations`,
			cls: "migration-summary-from"
		});
		summary.createEl("div", {
			text: `To: ${this.newFolderPath}`,
			cls: "migration-summary-to"
		});

		// File preview list
		if (this.previewItems.length > 0) {
			contentEl.createEl("h3", { text: "Files to migrate" });

			const previewList = contentEl.createDiv({ cls: "migration-preview-list" });

			for (const item of this.previewItems) {
				const previewItem = previewList.createDiv({ cls: "migration-preview-item" });

				// File name
				previewItem.createEl("div", {
					text: item.file.basename,
					cls: "migration-preview-name"
				});

				// Current path
				previewItem.createEl("div", {
					text: `Current: ${item.oldPath}`,
					cls: "migration-preview-old-path"
				});

				// New path
				previewItem.createEl("div", {
					text: `New: ${item.newPath}`,
					cls: "migration-preview-new-path"
				});
			}
		}

		// Progress container (hidden initially)
		this.progressContainer = contentEl.createDiv({ cls: "migration-progress-container hidden" });

		const progressBarContainer = this.progressContainer.createDiv({ cls: "migration-progress-bar-container" });
		this.progressBar = progressBarContainer.createDiv({ cls: "migration-progress-bar" });

		this.progressText = this.progressContainer.createDiv({ cls: "migration-progress-text" });
		this.progressText.textContent = "Preparing migration...";

		// Warning message
		const warning = contentEl.createDiv({ cls: "migration-warning" });
		warning.createEl("span", { text: "⚠️ " });
		warning.createEl("span", {
			text: "This action will move files. References in other notes will need to be updated manually."
		});

		// Button container
		const buttonContainer = contentEl.createDiv({ cls: "migration-modal-buttons" });

		// Cancel button
		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "migration-modal-cancel"
		}) as HTMLButtonElement;
		cancelButton.addEventListener("click", () => {
			if (!this.isMigrating) {
				this.close();
			}
		});

		// Migrate button
		const migrateButton = buttonContainer.createEl("button", {
			text: "Migrate Files",
			cls: "migration-modal-migrate mod-cta"
		}) as HTMLButtonElement;
		migrateButton.addEventListener("click", () => {
			this.executeMigration(migrateButton, cancelButton);
		});
	}

	/**
	 * Execute the migration with progress tracking
	 */
	private async executeMigration(
		migrateButton: HTMLButtonElement,
		cancelButton: HTMLButtonElement
	): Promise<void> {
		if (this.isMigrating) {
			return;
		}

		this.isMigrating = true;
		migrateButton.disabled = true;
		cancelButton.disabled = true;
		migrateButton.textContent = "Migrating...";

		// Show progress container
		if (this.progressContainer) {
			this.progressContainer.removeClass("hidden");
		}

		const result: MigrationResult = {
			success: 0,
			failed: 0,
			errors: [],
			migratedFiles: []
		};

		const totalFiles = this.filesToMigrate.length;
		let processedFiles = 0;

		try {
			// Ensure destination folder exists
			await this.folderOrganizer.ensureFolderExists(this.newFolderPath);

			// Migrate each file
			for (const item of this.previewItems) {
				try {
					this.updateProgress(processedFiles, totalFiles, `Migrating: ${item.file.basename}`);

					// Check if file already exists at destination
					const existingFile = this.app.vault.getAbstractFileByPath(item.newPath);

					let finalPath = item.newPath;
					if (existingFile) {
						// Generate unique filename
						finalPath = await this.generateUniquePath(item.newPath);
					}

					// Move the file
					await this.app.vault.rename(item.file, finalPath);

					result.success++;
					result.migratedFiles.push({
						oldPath: item.oldPath,
						newPath: finalPath
					});

				} catch (error) {
					result.failed++;
					result.errors.push(
						`Failed to migrate ${item.file.basename}: ${error instanceof Error ? error.message : String(error)}`
					);
				}

				processedFiles++;
				this.updateProgress(processedFiles, totalFiles);
			}

			// Show completion status
			this.showCompletionStatus(result);

		} catch (error) {
			// Handle critical errors
			const errorMessage = error instanceof Error ? error.message : String(error);
			result.errors.push(`Migration failed: ${errorMessage}`);

			new Notice(`Migration failed: ${errorMessage}`);
			this.showCompletionStatus(result);
		}

		// Call completion callback
		this.onComplete(result);
	}

	/**
	 * Update progress bar and text
	 */
	private updateProgress(current: number, total: number, message?: string): void {
		if (this.progressBar) {
			const percentage = (current / total) * 100;
			this.progressBar.style.width = `${percentage}%`;
		}

		if (this.progressText) {
			if (message) {
				this.progressText.textContent = message;
			} else {
				this.progressText.textContent = `Processed ${current} of ${total} files`;
			}
		}
	}

	/**
	 * Show completion status in the modal
	 */
	private showCompletionStatus(result: MigrationResult): void {
		const { contentEl } = this;
		contentEl.empty();

		// Title based on result
		const isSuccess = result.failed === 0;
		contentEl.createEl("h2", {
			text: isSuccess ? "Migration Complete" : "Migration Completed with Errors"
		});

		// Results summary
		const summary = contentEl.createDiv({ cls: "migration-results-summary" });

		summary.createEl("div", {
			text: `✓ Successfully migrated: ${result.success} file(s)`,
			cls: "migration-result-success"
		});

		if (result.failed > 0) {
			summary.createEl("div", {
				text: `✗ Failed: ${result.failed} file(s)`,
				cls: "migration-result-failed"
			});

			// Error details
			if (result.errors.length > 0) {
				contentEl.createEl("h3", { text: "Errors" });
				const errorList = contentEl.createDiv({ cls: "migration-error-list" });

				for (const error of result.errors) {
					errorList.createEl("div", {
						text: error,
						cls: "migration-error-item"
					});
				}
			}
		}

		// Migrated files details
		if (result.migratedFiles.length > 0) {
			contentEl.createEl("h3", { text: "Migrated Files" });
			const migratedList = contentEl.createDiv({ cls: "migration-migrated-list" });

			for (const file of result.migratedFiles) {
				const item = migratedList.createDiv({ cls: "migration-migrated-item" });
				item.createEl("div", {
					text: file.newPath,
					cls: "migration-migrated-path"
				});
			}
		}

		// Close button
		const buttonContainer = contentEl.createDiv({ cls: "migration-modal-buttons" });
		const closeButton = buttonContainer.createEl("button", {
			text: "Close",
			cls: "migration-modal-close mod-cta"
		});
		closeButton.addEventListener("click", () => {
			this.close();
		});
		closeButton.focus();
	}

	/**
	 * Generate a unique file path if the target already exists
	 */
	private async generateUniquePath(originalPath: string): Promise<string> {
		const basePath = originalPath.replace(/\.md$/i, "");
		let counter = 1;
		let newPath = originalPath;

		while (this.app.vault.getAbstractFileByPath(newPath)) {
			newPath = `${basePath}-${counter}.md`;
			counter++;
		}

		return newPath;
	}
}
