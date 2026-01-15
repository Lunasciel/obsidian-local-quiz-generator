import { App, Notice } from "obsidian";
import { Deck } from "../../utils/types";
import { QuizSettings } from "../../settings/config";
import ContentSourceTracker from "./contentSourceTracker";
import DeckManager from "./deckManager";
import FlashcardReviewer from "./flashcardReviewer";

/**
 * Result of a deck lookup operation
 */
export interface DeckLookupResult {
	/** Whether any decks were found */
	found: boolean;
	/** Array of decks associated with the source note */
	decks: Deck[];
	/** Path to the source note that was searched */
	sourceNote: string;
}

/**
 * DeckLookupService finds and opens flashcard decks associated with source notes.
 * Implements Requirements 3.1, 3.2, 3.3, 3.4 from the spec.
 */
export default class DeckLookupService {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly contentTracker: ContentSourceTracker;
	private readonly deckManager: DeckManager;

	constructor(app: App, settings: QuizSettings) {
		this.app = app;
		this.settings = settings;
		this.contentTracker = new ContentSourceTracker(app, settings);
		this.deckManager = new DeckManager(app, settings);
	}

	/**
	 * Find all decks associated with a source note
	 * @param notePath - Path to the source note
	 * @returns DeckLookupResult with found decks
	 */
	async findDecksForNote(notePath: string): Promise<DeckLookupResult> {
		try {
			// Load content source data
			const source = await this.contentTracker.getContentSource(notePath);

			if (!source || source.deckIds.length === 0) {
				return {
					found: false,
					decks: [],
					sourceNote: notePath
				};
			}

			// Get all decks and filter to those associated with this note
			const allDecks = await this.deckManager.getAllDecks();
			const associatedDecks = allDecks.filter(deck =>
				source.deckIds.includes(deck.id)
			);

			return {
				found: associatedDecks.length > 0,
				decks: associatedDecks,
				sourceNote: notePath
			};
		} catch (error) {
			console.error("Error finding decks for note:", error);
			return {
				found: false,
				decks: [],
				sourceNote: notePath
			};
		}
	}

	/**
	 * Open appropriate UI based on deck count for a note
	 * - No decks: Show notice suggesting generation
	 * - Single deck: Open reviewer directly
	 * - Multiple decks: Show selection modal
	 *
	 * @param notePath - Path to the source note
	 * @param onSelectDeck - Optional callback for when a deck is selected (for multiple decks)
	 */
	async openDecksForNote(
		notePath: string,
		onSelectDeck?: (deck: Deck) => void
	): Promise<void> {
		const result = await this.findDecksForNote(notePath);

		if (!result.found || result.decks.length === 0) {
			// No deck found - suggest generating one
			new Notice(
				`No flashcard deck found for this note. Use "Generate flashcards from this note" to create one.`
			);
			return;
		}

		if (result.decks.length === 1) {
			// Single deck - open directly
			const deck = result.decks[0];
			await this.openDeckReview(deck);
		} else {
			// Multiple decks - show selection modal
			if (onSelectDeck) {
				// Use provided callback (for modal selection)
				onSelectDeck(result.decks[0]); // Default to first, but caller should show modal
			} else {
				// Import and show selection modal
				const { default: DeckSelectionModal } = await import(
					"../../ui/flashcards/DeckSelectionModal"
				);

				new DeckSelectionModal(
					this.app,
					result.decks,
					async (selectedDeck: Deck) => {
						await this.openDeckReview(selectedDeck);
					}
				).open();
			}
		}
	}

	/**
	 * Open the flashcard review for a specific deck
	 * @param deck - The deck to review
	 */
	private async openDeckReview(deck: Deck): Promise<void> {
		try {
			const reviewer = new FlashcardReviewer(this.app, this.settings);
			await reviewer.openFlashcardReview(deck.id);
		} catch (error) {
			const errorMessage = (error as Error).message;
			new Notice(`Failed to open deck review: ${errorMessage}`, 0);
			console.error("Error opening deck review:", error);
		}
	}

	/**
	 * Get all decks (utility method for testing)
	 */
	async getAllDecks(): Promise<Deck[]> {
		return this.deckManager.getAllDecks();
	}
}
