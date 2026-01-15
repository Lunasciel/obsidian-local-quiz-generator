import { App, Modal } from "obsidian";
import { Deck } from "../../utils/types";

/**
 * Modal for selecting a deck when multiple decks are available for a source note.
 * Implements Requirement 3.4 from the spec.
 */
export default class DeckSelectionModal extends Modal {
	private readonly decks: Deck[];
	private readonly onSelect: (deck: Deck) => void;

	constructor(app: App, decks: Deck[], onSelect: (deck: Deck) => void) {
		super(app);
		this.decks = decks;
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;

		// Modal title
		contentEl.createEl("h2", { text: "Select Flashcard Deck" });

		// Description
		contentEl.createEl("p", {
			text: "Multiple decks were found for this note. Select which deck to open:",
			cls: "deck-selection-description"
		});

		// Deck list container
		const deckList = contentEl.createDiv({ cls: "deck-selection-list" });

		// Create deck items
		for (const deck of this.decks) {
			const deckItem = deckList.createDiv({ cls: "deck-selection-item" });

			// Deck info container
			const deckInfo = deckItem.createDiv({ cls: "deck-selection-info" });

			// Deck name
			deckInfo.createEl("div", {
				text: deck.name,
				cls: "deck-selection-name"
			});

			// Deck metadata (card count and date)
			const metadata = deckInfo.createDiv({ cls: "deck-selection-metadata" });

			// Card count
			metadata.createEl("span", {
				text: `${deck.cardIds.length} cards`,
				cls: "deck-selection-card-count"
			});

			// Creation date
			const createdDate = new Date(deck.created).toLocaleDateString();
			metadata.createEl("span", {
				text: `Created: ${createdDate}`,
				cls: "deck-selection-date"
			});

			// Click handler
			deckItem.addEventListener("click", () => {
				this.close();
				this.onSelect(deck);
			});

			// Keyboard accessibility
			deckItem.setAttribute("tabindex", "0");
			deckItem.setAttribute("role", "button");
			deckItem.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					this.close();
					this.onSelect(deck);
				}
			});
		}

		// Cancel button
		const buttonContainer = contentEl.createDiv({ cls: "deck-selection-buttons" });
		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "deck-selection-cancel"
		});
		cancelButton.addEventListener("click", () => {
			this.close();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
