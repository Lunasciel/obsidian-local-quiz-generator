import { App, Modal, TFile } from "obsidian";

/**
 * Modal for selecting a flashcard file when multiple decks exist for a source note.
 * Implements Requirement 1.3, 1.4 from the spec.
 */
export default class FlashcardFileSelector extends Modal {
	private readonly files: TFile[];
	private readonly onSelect: (file: TFile) => void;

	constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
		super(app);
		this.files = files;
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("flashcard-file-selector");

		// Modal title
		contentEl.createEl("h2", { text: "Select Flashcard Deck" });

		// Description
		contentEl.createEl("p", {
			text: "Multiple flashcard decks were found for this note. Select which deck to review:",
			cls: "flashcard-file-selector-description"
		});

		// File list container
		const fileList = contentEl.createDiv({ cls: "flashcard-file-list" });

		// Create file items
		for (const file of this.files) {
			const fileItem = fileList.createDiv({ cls: "flashcard-file-item" });

			// File info container
			const fileInfo = fileItem.createDiv({ cls: "flashcard-file-info" });

			// File name
			fileInfo.createEl("div", {
				text: file.basename,
				cls: "flashcard-file-name"
			});

			// File metadata (path and date)
			const metadata = fileInfo.createDiv({ cls: "flashcard-file-metadata" });

			// File path (parent folder)
			const parentPath = file.parent?.path || "";
			if (parentPath) {
				metadata.createEl("span", {
					text: parentPath,
					cls: "flashcard-file-path"
				});
			}

			// Modified date
			const modifiedDate = this.formatModifiedDate(file);
			metadata.createEl("span", {
				text: modifiedDate,
				cls: "flashcard-file-date"
			});

			// Click handler
			fileItem.addEventListener("click", () => {
				this.close();
				this.onSelect(file);
			});

			// Keyboard accessibility
			fileItem.setAttribute("tabindex", "0");
			fileItem.setAttribute("role", "button");
			fileItem.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					this.close();
					this.onSelect(file);
				}
			});
		}

		// Cancel button
		const buttonContainer = contentEl.createDiv({ cls: "flashcard-file-selector-buttons" });
		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "flashcard-file-selector-cancel"
		});
		cancelButton.addEventListener("click", () => {
			this.close();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Format the modified date for display
	 */
	private formatModifiedDate(file: TFile): string {
		const date = new Date(file.stat.mtime);
		const now = new Date();
		const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return "Modified today";
		} else if (diffDays === 1) {
			return "Modified yesterday";
		} else if (diffDays < 7) {
			return `Modified ${diffDays} days ago`;
		} else {
			return `Modified ${date.toLocaleDateString()}`;
		}
	}
}
