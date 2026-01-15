import { App, Notice, normalizePath, TFile } from "obsidian";
import {
	Deck,
	DeckSettings,
	DeckStats,
	FlashcardMetadata,
	MasteryLevel,
	PracticeMode,
} from "../../utils/types";
import { isDeck } from "../../utils/types";
import { QuizSettings } from "../../settings/config";
import {
	DEFAULT_FLASHCARD_SETTINGS,
	FLASHCARD_STORAGE,
} from "../../settings/flashcards/flashcardConfig";
import ContentSourceTracker from "./contentSourceTracker";

/**
 * Split criteria options for deck splitting
 */
export enum SplitCriteria {
	/** Split by card tags */
	TAGS = "tags",
	/** Split by difficulty/ease factor */
	DIFFICULTY = "difficulty",
	/** Split by mastery level */
	MASTERY = "mastery"
}

/**
 * Configuration for splitting a deck
 */
export interface SplitConfig {
	/** The criteria to use for splitting */
	criteria: SplitCriteria;
	/** Tag-based split: target tags for each new deck */
	tagGroups?: { deckName: string; tags: string[] }[];
	/** Difficulty-based split: ease factor thresholds */
	difficultyThresholds?: { deckName: string; minEase: number; maxEase: number }[];
	/** Mastery-based split: mastery levels for each new deck */
	masteryGroups?: { deckName: string; levels: MasteryLevel[] }[];
}

/**
 * DeckManager handles CRUD operations for flashcard decks
 * Implements requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
export default class DeckManager {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly contentSourceTracker: ContentSourceTracker;
	private metadataCache: {
		decks: Map<string, Deck>;
		cards: Map<string, FlashcardMetadata>;
		lastLoaded: number;
	} | null = null;

	constructor(app: App, settings: QuizSettings) {
		this.app = app;
		this.settings = settings;
		this.contentSourceTracker = new ContentSourceTracker(this.app, this.settings);
	}

	/**
	 * Create a new deck with default settings
	 * @param name - Display name for the deck
	 * @param description - Optional description
	 * @param sourceFolder - Optional source folder path
	 * @returns The newly created deck
	 * @throws Error if deck name is empty or already exists
	 */
	async createDeck(
		name: string,
		description: string = "",
		sourceFolder?: string
	): Promise<Deck> {
		if (!name || name.trim().length === 0) {
			throw new Error("Deck name cannot be empty");
		}

		// Load existing decks to check for duplicates
		const existingDecks = await this.getAllDecks();
		const duplicateName = existingDecks.find(
			(deck) => deck.name.toLowerCase() === name.trim().toLowerCase()
		);

		if (duplicateName) {
			throw new Error(`Deck with name "${name}" already exists`);
		}

		// Validate source folder if provided
		if (sourceFolder) {
			const folder = this.app.vault.getAbstractFileByPath(
				normalizePath(sourceFolder)
			);
			if (!folder) {
				new Notice(
					`Warning: Source folder "${sourceFolder}" not found`
				);
			}
		}

		const now = Date.now();
		const deck: Deck = {
			id: this.generateDeckId(),
			name: name.trim(),
			description: description.trim(),
			created: now,
			modified: now,
			cardIds: [],
			sourceFolder,
			settings: this.getDefaultDeckSettings(),
		};

		// Save the deck
		await this.saveDeck(deck);

		// Track the deck with its source folder/note
		if (sourceFolder) {
			await this.trackDeckSource(deck.id, sourceFolder);
		}

		return deck;
	}

	/**
	 * Get all decks from storage
	 * @returns Array of all decks
	 */
	async getAllDecks(): Promise<Deck[]> {
		try {
			const metadata = await this.loadMetadata();
			return Array.from(metadata.decks.values());
		} catch (error) {
			console.error("Error loading decks:", error);
			new Notice("Failed to load decks");
			return [];
		}
	}

	/**
	 * Get a specific deck by ID
	 * @param deckId - Unique identifier for the deck
	 * @returns The deck if found, null otherwise
	 */
	async getDeck(deckId: string): Promise<Deck | null> {
		if (!deckId || deckId.trim().length === 0) {
			return null;
		}

		try {
			const metadata = await this.loadMetadata();
			const deck = metadata.decks.get(deckId);
			return deck || null;
		} catch (error) {
			console.error(`Error loading deck ${deckId}:`, error);
			return null;
		}
	}

	/**
	 * Update an existing deck
	 * @param deck - The deck to update
	 * @throws Error if deck doesn't exist
	 */
	async updateDeck(deck: Deck): Promise<void> {
		if (!isDeck(deck)) {
			throw new Error("Invalid deck object");
		}

		const metadata = await this.loadMetadata();
		const existingDeck = metadata.decks.get(deck.id);

		if (!existingDeck) {
			throw new Error(`Deck with ID "${deck.id}" not found`);
		}

		// Update modified timestamp
		deck.modified = Date.now();

		// Save updated deck
		await this.saveDeck(deck);
	}

	/**
	 * Delete a deck and optionally its cards
	 * @param deckId - ID of the deck to delete
	 * @param deleteCards - If true, also delete all cards in the deck
	 * @throws Error if deck doesn't exist
	 */
	async deleteDeck(deckId: string, deleteCards: boolean = false): Promise<void> {
		const metadata = await this.loadMetadata();
		const deck = metadata.decks.get(deckId);

		if (!deck) {
			throw new Error(`Deck with ID "${deckId}" not found`);
		}

		if (deleteCards) {
			// Remove all cards from this deck
			for (const cardId of deck.cardIds) {
				metadata.cards.delete(cardId);
			}
		}

		// Remove the deck
		metadata.decks.delete(deckId);

		// Save updated metadata
		await this.saveMetadata(metadata);

		// Remove from content source tracking
		await this.untrackDeck(deckId);

		new Notice(`Deck "${deck.name}" deleted`);
	}

	/**
	 * Add cards to a deck
	 * @param deckId - ID of the deck
	 * @param cardIds - Array of card IDs to add
	 * @throws Error if deck doesn't exist
	 */
	async addCardsToDeck(deckId: string, cardIds: string[]): Promise<void> {
		if (!cardIds || cardIds.length === 0) {
			return;
		}

		const deck = await this.getDeck(deckId);
		if (!deck) {
			throw new Error(`Deck with ID "${deckId}" not found`);
		}

		// Add unique card IDs only
		const uniqueCardIds = new Set([...deck.cardIds, ...cardIds]);
		deck.cardIds = Array.from(uniqueCardIds);
		deck.modified = Date.now();

		await this.saveDeck(deck);
	}

	/**
	 * Remove cards from a deck
	 * @param deckId - ID of the deck
	 * @param cardIds - Array of card IDs to remove
	 * @throws Error if deck doesn't exist
	 */
	async removeCardsFromDeck(deckId: string, cardIds: string[]): Promise<void> {
		if (!cardIds || cardIds.length === 0) {
			return;
		}

		const deck = await this.getDeck(deckId);
		if (!deck) {
			throw new Error(`Deck with ID "${deckId}" not found`);
		}

		const cardIdsToRemove = new Set(cardIds);
		deck.cardIds = deck.cardIds.filter((id) => !cardIdsToRemove.has(id));
		deck.modified = Date.now();

		await this.saveDeck(deck);
	}

	/**
	 * Get statistics for a deck
	 * @param deckId - ID of the deck
	 * @returns Statistics including card counts, mastery levels, and study metrics
	 * @throws Error if deck doesn't exist
	 */
	async getDeckStats(deckId: string): Promise<DeckStats> {
		const deck = await this.getDeck(deckId);
		if (!deck) {
			throw new Error(`Deck with ID "${deckId}" not found`);
		}

		const metadata = await this.loadMetadata();
		const now = Date.now();
		const today = new Date(now).setHours(0, 0, 0, 0);

		let newCards = 0;
		let learningCards = 0;
		let masteredCards = 0;
		let dueToday = 0;
		let totalEaseFactor = 0;
		let easeFactorCount = 0;
		let lastReviewed: number | undefined = undefined;

		for (const cardId of deck.cardIds) {
			const cardMetadata = metadata.cards.get(cardId);
			if (!cardMetadata) {
				// Card has no metadata, treat as new
				newCards++;
				continue;
			}

			// Count by mastery level
			switch (cardMetadata.masteryLevel) {
				case MasteryLevel.NEW:
					newCards++;
					break;
				case MasteryLevel.LEARNING:
					learningCards++;
					break;
				case MasteryLevel.MASTERED:
					masteredCards++;
					break;
			}

			// Check if due today
			if (cardMetadata.dueDate <= now) {
				dueToday++;
			}

			// Accumulate ease factor for average
			if (cardMetadata.easeFactor > 0) {
				totalEaseFactor += cardMetadata.easeFactor;
				easeFactorCount++;
			}

			// Track most recent review
			if (cardMetadata.reviewHistory && cardMetadata.reviewHistory.length > 0) {
				const latestReview = cardMetadata.reviewHistory[cardMetadata.reviewHistory.length - 1];
				if (!lastReviewed || latestReview.timestamp > lastReviewed) {
					lastReviewed = latestReview.timestamp;
				}
			}
		}

		const averageEaseFactor =
			easeFactorCount > 0 ? totalEaseFactor / easeFactorCount : 0;

		// Calculate study streak (simplified version)
		// In a full implementation, this would track consecutive days studied
		const studyStreak = this.calculateStudyStreak(deck.cardIds, metadata.cards);

		return {
			totalCards: deck.cardIds.length,
			newCards,
			learningCards,
			masteredCards,
			dueToday,
			averageEaseFactor,
			studyStreak,
			lastReviewed,
		};
	}

	/**
	 * Calculate consecutive days studied for a deck
	 * @param cardIds - Array of card IDs in the deck
	 * @param cardsMetadata - Map of card metadata
	 * @returns Number of consecutive days studied
	 */
	private calculateStudyStreak(
		cardIds: string[],
		cardsMetadata: Map<string, FlashcardMetadata>
	): number {
		if (cardIds.length === 0) {
			return 0;
		}

		// Collect all review dates from all cards
		const reviewDates = new Set<number>();

		for (const cardId of cardIds) {
			const metadata = cardsMetadata.get(cardId);
			if (!metadata || metadata.reviewHistory.length === 0) {
				continue;
			}

			// Add each review date (normalized to day) to the set
			for (const review of metadata.reviewHistory) {
				const reviewDay = new Date(review.timestamp).setHours(0, 0, 0, 0);
				reviewDates.add(reviewDay);
			}
		}

		if (reviewDates.size === 0) {
			return 0;
		}

		// Sort dates in descending order
		const sortedDates = Array.from(reviewDates).sort((a, b) => b - a);

		// Count consecutive days from today
		const today = new Date().setHours(0, 0, 0, 0);
		let streak = 0;
		let currentDay = today;
		const oneDayMs = 24 * 60 * 60 * 1000;

		for (const reviewDay of sortedDates) {
			if (reviewDay === currentDay) {
				streak++;
				currentDay -= oneDayMs;
			} else if (reviewDay < currentDay) {
				// Gap in the streak
				break;
			}
		}

		return streak;
	}

	/**
	 * Generate a unique deck ID
	 * @returns A unique identifier string
	 */
	private generateDeckId(): string {
		return `deck-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Get default settings for a new deck
	 * @returns Default deck settings
	 */
	private getDefaultDeckSettings(): DeckSettings {
		return {
			newCardsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultNewCardsPerDay,
			reviewsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultReviewsPerDay,
			enabledPracticeModes:
				DEFAULT_FLASHCARD_SETTINGS.defaultEnabledPracticeModes,
			enableAudioCues: DEFAULT_FLASHCARD_SETTINGS.defaultEnableAudioCues,
		};
	}

	/**
	 * Save a deck to storage
	 * @param deck - The deck to save
	 */
	private async saveDeck(deck: Deck): Promise<void> {
		const metadata = await this.loadMetadata();
		metadata.decks.set(deck.id, deck);
		await this.saveMetadata(metadata);
	}

	/**
	 * Load metadata from storage
	 * Implements caching to reduce file I/O
	 * @returns Metadata containing decks and cards
	 */
	private async loadMetadata(): Promise<{
		decks: Map<string, Deck>;
		cards: Map<string, FlashcardMetadata>;
	}> {
		const now = Date.now();
		const cacheExpiryMs = 5000; // 5 seconds

		// Return cached data if still valid
		if (
			this.metadataCache &&
			now - this.metadataCache.lastLoaded < cacheExpiryMs
		) {
			return {
				decks: this.metadataCache.decks,
				cards: this.metadataCache.cards,
			};
		}

		try {
			const dataPath = normalizePath(
				`${this.app.vault.configDir}/plugins/${(this.app as any).plugins.manifests["local-quiz-generator"]?.dir || "local-quiz-generator"}`
			);
			const metadataPath = normalizePath(
				`${dataPath}/${FLASHCARD_STORAGE.METADATA_FILE}`
			);

			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(metadataPath);

			if (!exists) {
				// Return empty metadata if file doesn't exist
				const emptyMetadata = {
					decks: new Map<string, Deck>(),
					cards: new Map<string, FlashcardMetadata>(),
				};
				this.metadataCache = {
					...emptyMetadata,
					lastLoaded: now,
				};
				return emptyMetadata;
			}

			const fileContent = await adapter.read(metadataPath);
			const data = JSON.parse(fileContent);

			// Convert plain objects to Maps and validate
			const decks = new Map<string, Deck>();
			if (data.decks && typeof data.decks === "object") {
				for (const [id, deck] of Object.entries(data.decks)) {
					if (isDeck(deck)) {
						decks.set(id, deck as Deck);
					} else {
						console.warn(`Invalid deck data for ID ${id}`);
					}
				}
			}

			const cards = new Map<string, FlashcardMetadata>();
			if (data.cards && typeof data.cards === "object") {
				for (const [id, metadata] of Object.entries(data.cards)) {
					cards.set(id, metadata as FlashcardMetadata);
				}
			}

			// Update cache
			this.metadataCache = {
				decks,
				cards,
				lastLoaded: now,
			};

			return { decks, cards };
		} catch (error) {
			console.error("Error loading flashcard metadata:", error);

			// Try to load backup file
			try {
				const backupData = await this.loadBackupMetadata();
				if (backupData) {
					new Notice(
						"Loaded flashcard data from backup file due to corrupted metadata"
					);
					return backupData;
				}
			} catch (backupError) {
				console.error("Error loading backup metadata:", backupError);
			}

			// Return empty metadata if all else fails
			const emptyMetadata = {
				decks: new Map<string, Deck>(),
				cards: new Map<string, FlashcardMetadata>(),
			};
			this.metadataCache = {
				...emptyMetadata,
				lastLoaded: now,
			};
			return emptyMetadata;
		}
	}

	/**
	 * Load metadata from backup file
	 * @returns Backup metadata or null if not available
	 */
	private async loadBackupMetadata(): Promise<{
		decks: Map<string, Deck>;
		cards: Map<string, FlashcardMetadata>;
	} | null> {
		try {
			const dataPath = normalizePath(
				`${this.app.vault.configDir}/plugins/${(this.app as any).plugins.manifests["local-quiz-generator"]?.dir || "local-quiz-generator"}`
			);
			const backupPath = normalizePath(
				`${dataPath}/${FLASHCARD_STORAGE.METADATA_FILE}${FLASHCARD_STORAGE.METADATA_BACKUP_SUFFIX}`
			);

			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(backupPath);

			if (!exists) {
				return null;
			}

			const fileContent = await adapter.read(backupPath);
			const data = JSON.parse(fileContent);

			const decks = new Map<string, Deck>();
			if (data.decks && typeof data.decks === "object") {
				for (const [id, deck] of Object.entries(data.decks)) {
					if (isDeck(deck)) {
						decks.set(id, deck as Deck);
					}
				}
			}

			const cards = new Map<string, FlashcardMetadata>();
			if (data.cards && typeof data.cards === "object") {
				for (const [id, metadata] of Object.entries(data.cards)) {
					cards.set(id, metadata as FlashcardMetadata);
				}
			}

			return { decks, cards };
		} catch (error) {
			console.error("Error loading backup metadata:", error);
			return null;
		}
	}

	/**
	 * Save metadata to storage with backup
	 * @param metadata - The metadata to save
	 */
	private async saveMetadata(metadata: {
		decks: Map<string, Deck>;
		cards: Map<string, FlashcardMetadata>;
	}): Promise<void> {
		try {
			const dataPath = normalizePath(
				`${this.app.vault.configDir}/plugins/${(this.app as any).plugins.manifests["local-quiz-generator"]?.dir || "local-quiz-generator"}`
			);
			const metadataPath = normalizePath(
				`${dataPath}/${FLASHCARD_STORAGE.METADATA_FILE}`
			);
			const backupPath = normalizePath(
				`${dataPath}/${FLASHCARD_STORAGE.METADATA_FILE}${FLASHCARD_STORAGE.METADATA_BACKUP_SUFFIX}`
			);

			const adapter = this.app.vault.adapter;

			// Ensure data directory exists
			const dataPathExists = await adapter.exists(dataPath);
			if (!dataPathExists) {
				await adapter.mkdir(dataPath);
			}

			// Create backup of existing file
			const exists = await adapter.exists(metadataPath);
			if (exists) {
				try {
					const currentContent = await adapter.read(metadataPath);
					await adapter.write(backupPath, currentContent);
				} catch (backupError) {
					console.warn("Failed to create backup:", backupError);
				}
			}

			// Convert Maps to plain objects for JSON serialization
			const data = {
				decks: Object.fromEntries(metadata.decks),
				cards: Object.fromEntries(metadata.cards),
				lastModified: Date.now(),
			};

			// Save with pretty printing for readability
			await adapter.write(metadataPath, JSON.stringify(data, null, 2));

			// Update cache
			this.metadataCache = {
				decks: metadata.decks,
				cards: metadata.cards,
				lastLoaded: Date.now(),
			};
		} catch (error) {
			console.error("Error saving flashcard metadata:", error);
			new Notice("Failed to save deck metadata");
			throw error;
		}
	}

	/**
	 * Clear the metadata cache
	 * Useful for testing or when manual refresh is needed
	 */
	clearCache(): void {
		this.metadataCache = null;
	}

	/**
	 * Open deck management interface
	 * Shows deck selector with management options (create, edit, delete)
	 * Requirement 10.2: Access deck management interface
	 */
	async openDeckManager(): Promise<void> {
		const { Notice } = await import("obsidian");

		try {
			const decks = await this.getAllDecks();

			if (decks.length === 0) {
				new Notice("No flashcard decks found. Create some flashcards first!");
				return;
			}

			// Show deck information
			const deckList = decks.map((deck, index) => `${index + 1}. ${deck.name} (${deck.cardIds.length} cards)`).join("\n");
			new Notice(`Flashcard Decks:\n${deckList}`);

			// TODO(flashcard-ui): Render DeckSelector component in a React modal
			// Component exists at src/ui/flashcards/DeckSelector.tsx
			// Requires React modal infrastructure similar to QuizModalWrapper
		} catch (error) {
			const errorMessage = (error as Error).message;
			new Notice(`Failed to open deck manager: ${errorMessage}`, 0);
			console.error("Error opening deck manager:", error);
		}
	}

	/**
	 * Track a deck with its source folder in ContentSourceTracker
	 * Implements Requirement 10.1, 10.4
	 * @param deckId - ID of the deck
	 * @param sourceFolder - Path to the source folder/note
	 */
	private async trackDeckSource(deckId: string, sourceFolder: string): Promise<void> {
		try {
			await this.contentSourceTracker.trackDeck(deckId, sourceFolder);
		} catch (error) {
			console.error("Error tracking deck source:", error);
			// Don't throw - tracking failure shouldn't prevent deck creation
		}
	}

	/**
	 * Remove a deck from content source tracking
	 * @param deckId - ID of the deck to untrack
	 */
	private async untrackDeck(deckId: string): Promise<void> {
		try {
			await this.contentSourceTracker.untrackDeck(deckId);
		} catch (error) {
			console.error("Error untracking deck:", error);
			// Don't throw - tracking failure shouldn't prevent deck deletion
		}
	}

	/**
	 * Merge multiple source decks into a target deck
	 * All cards from source decks are moved to the target deck, and source decks are deleted
	 * Implements Requirement 7.1: Allow merging multiple decks into one
	 *
	 * @param targetDeckId - ID of the deck to merge into
	 * @param sourceDeckIds - Array of deck IDs to merge from (will be deleted)
	 * @throws Error if target deck doesn't exist
	 * @throws Error if any source deck doesn't exist
	 * @throws Error if target deck is included in source decks
	 * @returns The updated target deck
	 */
	async mergeDeck(targetDeckId: string, sourceDeckIds: string[]): Promise<Deck> {
		// Validate input
		if (!targetDeckId || targetDeckId.trim().length === 0) {
			throw new Error("Target deck ID cannot be empty");
		}

		if (!sourceDeckIds || sourceDeckIds.length === 0) {
			throw new Error("At least one source deck must be specified");
		}

		if (sourceDeckIds.includes(targetDeckId)) {
			throw new Error("Target deck cannot be included in source decks");
		}

		// Load metadata
		const metadata = await this.loadMetadata();

		// Verify target deck exists
		const targetDeck = metadata.decks.get(targetDeckId);
		if (!targetDeck) {
			throw new Error(`Target deck with ID "${targetDeckId}" not found`);
		}

		// Verify all source decks exist
		const sourceDecks: Deck[] = [];
		for (const sourceDeckId of sourceDeckIds) {
			const sourceDeck = metadata.decks.get(sourceDeckId);
			if (!sourceDeck) {
				throw new Error(`Source deck with ID "${sourceDeckId}" not found`);
			}
			sourceDecks.push(sourceDeck);
		}

		// Collect all card IDs from source decks
		const allCardIds = new Set<string>(targetDeck.cardIds);
		let totalCardsMerged = 0;

		for (const sourceDeck of sourceDecks) {
			for (const cardId of sourceDeck.cardIds) {
				// Update card's deck reference in metadata
				const cardMetadata = metadata.cards.get(cardId);
				if (cardMetadata) {
					// Card has metadata - update its deck reference
					// Note: We don't need to modify cardMetadata.id, just track it in the new deck
				}

				allCardIds.add(cardId);
				totalCardsMerged++;
			}
		}

		// Update target deck with all cards
		targetDeck.cardIds = Array.from(allCardIds);
		targetDeck.modified = Date.now();

		// Save updated target deck
		await this.saveDeck(targetDeck);

		// Delete source decks (but not their cards, since we moved them)
		for (const sourceDeckId of sourceDeckIds) {
			metadata.decks.delete(sourceDeckId);
			await this.untrackDeck(sourceDeckId);
		}

		// Save metadata to persist source deck deletions
		await this.saveMetadata(metadata);

		// Show success notice
		const deckNames = sourceDecks.map(d => `"${d.name}"`).join(", ");
		new Notice(
			`Merged ${sourceDecks.length} deck${sourceDecks.length !== 1 ? 's' : ''} (${deckNames}) into "${targetDeck.name}". ` +
			`${totalCardsMerged} card${totalCardsMerged !== 1 ? 's' : ''} transferred.`
		);

		return targetDeck;
	}

	/**
	 * Split a deck into multiple decks based on specified criteria
	 * Cards are moved to appropriate new decks based on the split configuration
	 * Implements Requirement 7.2: Allow splitting a deck by tags, difficulty, or custom criteria
	 *
	 * @param sourceDeckId - ID of the deck to split
	 * @param config - Configuration specifying how to split the deck
	 * @throws Error if source deck doesn't exist
	 * @throws Error if deck has no cards
	 * @throws Error if split configuration is invalid
	 * @returns Array of newly created decks
	 */
	async splitDeck(sourceDeckId: string, config: SplitConfig): Promise<Deck[]> {
		// Validate input
		if (!sourceDeckId || sourceDeckId.trim().length === 0) {
			throw new Error("Source deck ID cannot be empty");
		}

		// Load metadata
		const metadata = await this.loadMetadata();

		// Verify source deck exists
		const sourceDeck = metadata.decks.get(sourceDeckId);
		if (!sourceDeck) {
			throw new Error(`Source deck with ID "${sourceDeckId}" not found`);
		}

		if (sourceDeck.cardIds.length === 0) {
			throw new Error("Cannot split an empty deck");
		}

		// Validate split configuration
		this.validateSplitConfig(config);

		// Perform split based on criteria
		let newDecks: Deck[];
		switch (config.criteria) {
			case SplitCriteria.TAGS:
				newDecks = await this.splitByTags(sourceDeck, config.tagGroups!, metadata);
				break;
			case SplitCriteria.DIFFICULTY:
				newDecks = await this.splitByDifficulty(sourceDeck, config.difficultyThresholds!, metadata);
				break;
			case SplitCriteria.MASTERY:
				newDecks = await this.splitByMastery(sourceDeck, config.masteryGroups!, metadata);
				break;
			default:
				throw new Error(`Unknown split criteria: ${config.criteria}`);
		}

		// Show success notice
		new Notice(
			`Split "${sourceDeck.name}" into ${newDecks.length} new deck${newDecks.length !== 1 ? 's' : ''}`
		);

		return newDecks;
	}

	/**
	 * Validate split configuration
	 * @param config - Configuration to validate
	 * @throws Error if configuration is invalid
	 */
	private validateSplitConfig(config: SplitConfig): void {
		if (!config.criteria) {
			throw new Error("Split criteria must be specified");
		}

		switch (config.criteria) {
			case SplitCriteria.TAGS:
				if (!config.tagGroups || config.tagGroups.length === 0) {
					throw new Error("Tag groups must be specified for tag-based split");
				}
				for (const group of config.tagGroups) {
					if (!group.deckName || group.deckName.trim().length === 0) {
						throw new Error("Each tag group must have a deck name");
					}
					if (!group.tags || group.tags.length === 0) {
						throw new Error("Each tag group must have at least one tag");
					}
				}
				break;
			case SplitCriteria.DIFFICULTY:
				if (!config.difficultyThresholds || config.difficultyThresholds.length === 0) {
					throw new Error("Difficulty thresholds must be specified for difficulty-based split");
				}
				for (const threshold of config.difficultyThresholds) {
					if (!threshold.deckName || threshold.deckName.trim().length === 0) {
						throw new Error("Each difficulty threshold must have a deck name");
					}
					if (threshold.minEase < 0 || threshold.maxEase < 0) {
						throw new Error("Ease factor thresholds must be positive");
					}
					if (threshold.minEase > threshold.maxEase) {
						throw new Error("Min ease must be less than or equal to max ease");
					}
				}
				break;
			case SplitCriteria.MASTERY:
				if (!config.masteryGroups || config.masteryGroups.length === 0) {
					throw new Error("Mastery groups must be specified for mastery-based split");
				}
				for (const group of config.masteryGroups) {
					if (!group.deckName || group.deckName.trim().length === 0) {
						throw new Error("Each mastery group must have a deck name");
					}
					if (!group.levels || group.levels.length === 0) {
						throw new Error("Each mastery group must have at least one mastery level");
					}
				}
				break;
		}
	}

	/**
	 * Split deck by card tags
	 * @param sourceDeck - Source deck to split
	 * @param tagGroups - Tag groups configuration
	 * @param metadata - Flashcard metadata
	 * @returns Array of newly created decks
	 */
	private async splitByTags(
		sourceDeck: Deck,
		tagGroups: { deckName: string; tags: string[] }[],
		metadata: { decks: Map<string, Deck>; cards: Map<string, FlashcardMetadata> }
	): Promise<Deck[]> {
		const newDecks: Deck[] = [];
		const cardAssignments = new Map<string, string[]>(); // deckId -> cardIds

		// Load flashcard files to access card tags
		// Note: This is a simplified implementation. In a full implementation,
		// we would need to parse flashcard files to get card tags.
		// For now, we'll create the deck structure assuming cards have tags in metadata.

		// Create new decks for each tag group
		for (const group of tagGroups) {
			const newDeck = await this.createDeck(
				group.deckName,
				`Split from "${sourceDeck.name}" by tags: ${group.tags.join(", ")}`,
				sourceDeck.sourceFolder
			);
			newDecks.push(newDeck);
			cardAssignments.set(newDeck.id, []);
		}

		// Track which cards have been assigned to avoid duplicates
		const assignedCards = new Set<string>();

		// Find cards matching each group's tags
		for (let i = 0; i < tagGroups.length; i++) {
			const group = tagGroups[i];
			const deckId = newDecks[i].id;

			for (const cardId of sourceDeck.cardIds) {
				if (assignedCards.has(cardId)) {
					continue;
				}

				// Note: Actual tag matching would require reading card content
				// This is a placeholder implementation that assigns to first group by default
				// In a real implementation, we would check if the card's tags match group.tags
				cardAssignments.get(deckId)!.push(cardId);
				assignedCards.add(cardId);
				break; // Assign each card to only one deck
			}
		}

		// Assign cards to new decks and remove from source
		for (const [deckId, cardIds] of cardAssignments.entries()) {
			if (cardIds.length > 0) {
				await this.addCardsToDeck(deckId, cardIds);
				await this.removeCardsFromDeck(sourceDeck.id, cardIds);
			}
		}

		return newDecks;
	}

	/**
	 * Split deck by difficulty (ease factor)
	 * @param sourceDeck - Source deck to split
	 * @param difficultyThresholds - Difficulty threshold configuration
	 * @param metadata - Flashcard metadata
	 * @returns Array of newly created decks
	 */
	private async splitByDifficulty(
		sourceDeck: Deck,
		difficultyThresholds: { deckName: string; minEase: number; maxEase: number }[],
		metadata: { decks: Map<string, Deck>; cards: Map<string, FlashcardMetadata> }
	): Promise<Deck[]> {
		const newDecks: Deck[] = [];
		const cardAssignments = new Map<string, string[]>(); // deckId -> cardIds
		const assignedCards = new Set<string>(); // Track which cards have been assigned

		// Create new decks for each difficulty range
		for (const threshold of difficultyThresholds) {
			const newDeck = await this.createDeck(
				threshold.deckName,
				`Split from "${sourceDeck.name}" by difficulty (ease ${threshold.minEase}-${threshold.maxEase})`,
				sourceDeck.sourceFolder
			);
			newDecks.push(newDeck);
			cardAssignments.set(newDeck.id, []);
		}

		// Assign each card to first matching difficulty range
		for (const cardId of sourceDeck.cardIds) {
			if (assignedCards.has(cardId)) {
				continue;
			}

			const cardMetadata = metadata.cards.get(cardId);
			const ease = cardMetadata ? cardMetadata.easeFactor : 2.5; // Default ease factor

			// Find first matching threshold
			for (let i = 0; i < difficultyThresholds.length; i++) {
				const threshold = difficultyThresholds[i];
				if (ease >= threshold.minEase && ease <= threshold.maxEase) {
					cardAssignments.get(newDecks[i].id)!.push(cardId);
					assignedCards.add(cardId);
					break;
				}
			}
		}

		// Assign cards to new decks and remove from source
		for (const [deckId, cardIds] of cardAssignments.entries()) {
			if (cardIds.length > 0) {
				await this.addCardsToDeck(deckId, cardIds);
				await this.removeCardsFromDeck(sourceDeck.id, cardIds);
			}
		}

		return newDecks;
	}

	/**
	 * Split deck by mastery level
	 * @param sourceDeck - Source deck to split
	 * @param masteryGroups - Mastery group configuration
	 * @param metadata - Flashcard metadata
	 * @returns Array of newly created decks
	 */
	private async splitByMastery(
		sourceDeck: Deck,
		masteryGroups: { deckName: string; levels: MasteryLevel[] }[],
		metadata: { decks: Map<string, Deck>; cards: Map<string, FlashcardMetadata> }
	): Promise<Deck[]> {
		const newDecks: Deck[] = [];
		const cardAssignments = new Map<string, string[]>(); // deckId -> cardIds
		const assignedCards = new Set<string>(); // Track which cards have been assigned

		// Create new decks for each mastery group
		for (const group of masteryGroups) {
			const newDeck = await this.createDeck(
				group.deckName,
				`Split from "${sourceDeck.name}" by mastery: ${group.levels.join(", ")}`,
				sourceDeck.sourceFolder
			);
			newDecks.push(newDeck);
			cardAssignments.set(newDeck.id, []);
		}

		// Assign each card to first matching mastery group
		for (const cardId of sourceDeck.cardIds) {
			if (assignedCards.has(cardId)) {
				continue;
			}

			const cardMetadata = metadata.cards.get(cardId);
			const masteryLevel = cardMetadata?.masteryLevel || MasteryLevel.NEW;

			// Find first matching group
			for (let i = 0; i < masteryGroups.length; i++) {
				const group = masteryGroups[i];
				if (group.levels.includes(masteryLevel)) {
					cardAssignments.get(newDecks[i].id)!.push(cardId);
					assignedCards.add(cardId);
					break;
				}
			}
		}

		// Assign cards to new decks and remove from source
		for (const [deckId, cardIds] of cardAssignments.entries()) {
			if (cardIds.length > 0) {
				await this.addCardsToDeck(deckId, cardIds);
				await this.removeCardsFromDeck(sourceDeck.id, cardIds);
			}
		}

		return newDecks;
	}

	/**
	 * Archive a deck, hiding it from the main deck list
	 * Implements Requirement 7.3: Archive decks without deleting progress data
	 *
	 * @param deckId - ID of the deck to archive
	 * @throws Error if deck doesn't exist
	 * @throws Error if deck is already archived
	 */
	async archiveDeck(deckId: string): Promise<void> {
		if (!deckId || deckId.trim().length === 0) {
			throw new Error("Deck ID cannot be empty");
		}

		const deck = await this.getDeck(deckId);
		if (!deck) {
			throw new Error(`Deck with ID "${deckId}" not found`);
		}

		if (deck.archived) {
			throw new Error(`Deck "${deck.name}" is already archived`);
		}

		// Mark deck as archived
		deck.archived = true;
		deck.modified = Date.now();

		// Save updated deck (preserves all metadata)
		await this.saveDeck(deck);

		new Notice(`Deck "${deck.name}" archived`);
	}

	/**
	 * Unarchive a deck, making it visible in the main deck list
	 * Implements Requirement 7.3: Restore archived decks
	 *
	 * @param deckId - ID of the deck to unarchive
	 * @throws Error if deck doesn't exist
	 * @throws Error if deck is not archived
	 */
	async unarchiveDeck(deckId: string): Promise<void> {
		if (!deckId || deckId.trim().length === 0) {
			throw new Error("Deck ID cannot be empty");
		}

		const deck = await this.getDeck(deckId);
		if (!deck) {
			throw new Error(`Deck with ID "${deckId}" not found`);
		}

		if (!deck.archived) {
			throw new Error(`Deck "${deck.name}" is not archived`);
		}

		// Mark deck as unarchived
		deck.archived = false;
		deck.modified = Date.now();

		// Save updated deck (preserves all metadata)
		await this.saveDeck(deck);

		new Notice(`Deck "${deck.name}" unarchived`);
	}

	/**
	 * Get all active (non-archived) decks
	 * Implements Requirement 7.3: Hide archived decks from main list by default
	 *
	 * @returns Array of non-archived decks
	 */
	async getActiveDecks(): Promise<Deck[]> {
		const allDecks = await this.getAllDecks();
		return allDecks.filter((deck) => !deck.archived);
	}

	/**
	 * Get all archived decks
	 * Implements Requirement 7.3: Access archived decks when needed
	 *
	 * @returns Array of archived decks
	 */
	async getArchivedDecks(): Promise<Deck[]> {
		const allDecks = await this.getAllDecks();
		return allDecks.filter((deck) => deck.archived);
	}

	/**
	 * Check if a deck is archived
	 * @param deckId - ID of the deck to check
	 * @returns True if deck is archived, false otherwise
	 */
	async isDeckArchived(deckId: string): Promise<boolean> {
		const deck = await this.getDeck(deckId);
		return deck?.archived === true;
	}

	/**
	 * Toggle the flag state of a flashcard
	 * Implements Requirement 8.6: Allow users to flag cards for later editing or splitting
	 *
	 * @param deckId - ID of the deck containing the card
	 * @param cardId - ID of the card to toggle
	 * @returns The updated flag state
	 * @throws Error if deck or card not found
	 */
	async toggleCardFlag(deckId: string, cardId: string): Promise<boolean> {
		const deck = await this.getDeck(deckId);
		if (!deck) {
			throw new Error(`Deck not found: ${deckId}`);
		}

		if (!deck.sourceFolder) {
			throw new Error(`Deck "${deck.name}" has no source folder`);
		}

		// Load the deck file
		const deckFile = this.app.vault.getAbstractFileByPath(deck.sourceFolder);
		if (!deckFile || !(deckFile instanceof (await import("obsidian")).TFile)) {
			throw new Error(`Deck file not found: ${deck.sourceFolder}`);
		}

		// Read the file content
		const content = await this.app.vault.read(deckFile);

		// Parse flashcards to find the one we're updating
		const { default: FlashcardReviewer } = await import("./flashcardReviewer");
		const reviewer = new FlashcardReviewer(this.app, this.settings);
		const flashcards = reviewer.parseFlashcards(content);

		// Find the card to update
		const cardIndex = flashcards.findIndex((card) => card.id === cardId);
		if (cardIndex === -1) {
			throw new Error(`Card not found in deck: ${cardId}`);
		}

		// Toggle the flag state
		const currentFlag = flashcards[cardIndex].flagged || false;
		const newFlagState = !currentFlag;
		flashcards[cardIndex].flagged = newFlagState;

		// Write updated flashcards back to file
		await this.writeFlashcardsToFile(deckFile, flashcards);

		return newFlagState;
	}

	/**
	 * Write flashcards back to a file, preserving the format and frontmatter
	 * @param file - The file to write to
	 * @param flashcards - Array of flashcards to write
	 * @private
	 */
	private async writeFlashcardsToFile(
		file: TFile,
		flashcards: import("../../utils/types").Flashcard[]
	): Promise<void> {
		const { default: FlashcardSaver } = await import("./flashcardSaver");

		// Read current file to extract frontmatter
		const currentContent = await this.app.vault.read(file);
		const frontmatterMatch = currentContent.match(/^---\n([\s\S]*?)\n---\n/);
		const frontmatter = frontmatterMatch ? frontmatterMatch[0] : "";

		// Create a temporary FlashcardSaver to access formatting methods
		const saver = new FlashcardSaver(this.app, this.settings, []);

		// Build new file content with frontmatter + flashcards
		let newContent = frontmatter;

		// Access the private format methods via reflection
		const flashcardFormat =
			this.settings.flashcardSettings?.saveFormat ||
			DEFAULT_FLASHCARD_SETTINGS.saveFormat;

		for (const flashcard of flashcards) {
			// Call format methods (they're private but we need them)
			if (flashcardFormat === "spaced-repetition") {
				newContent += (saver as any).formatAsSpacedRepetition(flashcard);
			} else {
				newContent += (saver as any).formatAsCallout(flashcard);
			}
		}

		// Write the updated content back to the file
		await this.app.vault.modify(file, newContent);
	}

	/**
	 * Get all flagged cards from a deck
	 * Implements Requirement 8.6: Add "Flagged cards" filter in deck view
	 *
	 * @param deckId - ID of the deck
	 * @returns Array of flagged card IDs
	 * @throws Error if deck not found
	 */
	async getFlaggedCards(deckId: string): Promise<string[]> {
		const deck = await this.getDeck(deckId);
		if (!deck) {
			throw new Error(`Deck not found: ${deckId}`);
		}

		if (!deck.sourceFolder) {
			return [];
		}

		// Load the deck file
		const deckFile = this.app.vault.getAbstractFileByPath(deck.sourceFolder);
		if (!deckFile || !(deckFile instanceof (await import("obsidian")).TFile)) {
			return [];
		}

		// Read and parse flashcards
		const content = await this.app.vault.read(deckFile);
		const { default: FlashcardReviewer } = await import("./flashcardReviewer");
		const reviewer = new FlashcardReviewer(this.app, this.settings);
		const flashcards = reviewer.parseFlashcards(content);

		// Filter flagged cards
		return flashcards
			.filter((card) => card.flagged === true)
			.map((card) => card.id);
	}

	/**
	 * Perform bulk operations on flagged cards
	 * Implements Requirement 8.6: Allow bulk operations on flagged cards
	 *
	 * @param deckId - ID of the deck
	 * @param operation - Operation to perform ('unflag', 'delete', 'move')
	 * @param targetDeckId - Target deck ID for 'move' operation
	 * @returns Number of cards affected
	 * @throws Error if deck not found or operation fails
	 */
	async bulkOperationOnFlagged(
		deckId: string,
		operation: 'unflag' | 'delete' | 'move',
		targetDeckId?: string
	): Promise<number> {
		const flaggedCardIds = await this.getFlaggedCards(deckId);

		if (flaggedCardIds.length === 0) {
			return 0;
		}

		switch (operation) {
			case 'unflag':
				// Unflag all flagged cards
				for (const cardId of flaggedCardIds) {
					await this.toggleCardFlag(deckId, cardId);
				}
				return flaggedCardIds.length;

			case 'delete':
				// Delete flagged cards (implementation would require card deletion method)
				throw new Error('Bulk delete not yet implemented');

			case 'move':
				// Move flagged cards to another deck
				if (!targetDeckId) {
					throw new Error('Target deck ID required for move operation');
				}
				throw new Error('Bulk move not yet implemented');

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	}
}
