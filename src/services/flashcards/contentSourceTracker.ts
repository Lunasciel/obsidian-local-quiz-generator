import { App, Notice, normalizePath, TFile } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { ContentSource, ContentRelationship, Deck, isContentSource } from "../../utils/types";

/**
 * ContentSourceTracker manages the relationships between source notes, quiz files, and flashcard decks.
 * Implements Requirements 10.1, 10.4
 *
 * This service:
 * - Tracks when flashcards and quizzes are created from the same note
 * - Identifies related quizzes and flashcards
 * - Provides data for displaying relationships in UI
 */
export default class ContentSourceTracker {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly STORAGE_FILE = "content-source-tracking.json";

	/** In-memory cache of content sources */
	private sources: Map<string, ContentSource> = new Map();

	/** Flag to track if data has been loaded */
	private isLoaded: boolean = false;

	constructor(app: App, settings: QuizSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Load content source tracking data from storage
	 * @returns Promise that resolves when data is loaded
	 */
	async load(): Promise<void> {
		try {
			const dataPath = normalizePath(`${this.app.vault.configDir}/plugins/local-quiz-generator/${this.STORAGE_FILE}`);
			const file = this.app.vault.getAbstractFileByPath(dataPath);

			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				const data = JSON.parse(content);

				// Validate and load data
				if (data && typeof data === 'object' && data.sources) {
					this.sources = new Map();
					for (const [path, source] of Object.entries(data.sources)) {
						if (isContentSource(source)) {
							this.sources.set(path, source as ContentSource);
						}
					}
				}
			}

			this.isLoaded = true;
		} catch (error) {
			console.error("Error loading content source tracking:", error);
			this.sources = new Map();
			this.isLoaded = true;
		}
	}

	/**
	 * Save content source tracking data to storage
	 * @returns Promise that resolves when data is saved
	 */
	async save(): Promise<void> {
		try {
			const dataPath = normalizePath(`${this.app.vault.configDir}/plugins/local-quiz-generator/${this.STORAGE_FILE}`);

			// Convert Map to object for JSON serialization
			const data = {
				sources: Object.fromEntries(this.sources.entries()),
				lastModified: Date.now()
			};

			const content = JSON.stringify(data, null, 2);

			// Check if file exists
			const file = this.app.vault.getAbstractFileByPath(dataPath);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, content);
			} else {
				await this.app.vault.create(dataPath, content);
			}
		} catch (error) {
			console.error("Error saving content source tracking:", error);
			new Notice("Failed to save content source tracking");
		}
	}

	/**
	 * Ensure data is loaded before performing operations
	 */
	private async ensureLoaded(): Promise<void> {
		if (!this.isLoaded) {
			await this.load();
		}
	}

	/**
	 * Track a quiz file generated from source notes
	 * @param quizFilePath - Path to the generated quiz file
	 * @param sourceNotePaths - Array of source note paths used to generate the quiz
	 */
	async trackQuiz(quizFilePath: string, sourceNotePaths: string[]): Promise<void> {
		await this.ensureLoaded();

		const now = Date.now();

		for (const sourceNotePath of sourceNotePaths) {
			const normalizedPath = normalizePath(sourceNotePath);
			let source = this.sources.get(normalizedPath);

			if (!source) {
				// Create new content source entry
				source = {
					sourceNotePath: normalizedPath,
					quizFiles: [],
					deckIds: [],
					created: now,
					modified: now
				};
				this.sources.set(normalizedPath, source);
			}

			// Add quiz file if not already tracked
			if (!source.quizFiles.includes(quizFilePath)) {
				source.quizFiles.push(quizFilePath);
				source.modified = now;
			}
		}

		await this.save();
	}

	/**
	 * Track a deck created from source notes
	 * @param deckId - ID of the created deck
	 * @param sourceNotePath - Path to the source note (or folder)
	 */
	async trackDeck(deckId: string, sourceNotePath: string): Promise<void> {
		await this.ensureLoaded();

		const normalizedPath = normalizePath(sourceNotePath);
		const now = Date.now();
		let source = this.sources.get(normalizedPath);

		if (!source) {
			// Create new content source entry
			source = {
				sourceNotePath: normalizedPath,
				quizFiles: [],
				deckIds: [],
				created: now,
				modified: now
			};
			this.sources.set(normalizedPath, source);
		}

		// Add deck if not already tracked
		if (!source.deckIds.includes(deckId)) {
			source.deckIds.push(deckId);
			source.modified = now;
		}

		await this.save();
	}

	/**
	 * Remove a quiz file from tracking (e.g., when deleted)
	 * @param quizFilePath - Path to the quiz file to remove
	 */
	async untrackQuiz(quizFilePath: string): Promise<void> {
		await this.ensureLoaded();

		let modified = false;
		const entries = Array.from(this.sources.entries());
		for (const [path, source] of entries) {
			const index = source.quizFiles.indexOf(quizFilePath);
			if (index !== -1) {
				source.quizFiles.splice(index, 1);
				source.modified = Date.now();
				modified = true;

				// Remove source if it has no more quizzes or decks
				if (source.quizFiles.length === 0 && source.deckIds.length === 0) {
					this.sources.delete(path);
				}
			}
		}

		if (modified) {
			await this.save();
		}
	}

	/**
	 * Remove a deck from tracking (e.g., when deleted)
	 * @param deckId - ID of the deck to remove
	 */
	async untrackDeck(deckId: string): Promise<void> {
		await this.ensureLoaded();

		let modified = false;
		const entries = Array.from(this.sources.entries());
		for (const [path, source] of entries) {
			const index = source.deckIds.indexOf(deckId);
			if (index !== -1) {
				source.deckIds.splice(index, 1);
				source.modified = Date.now();
				modified = true;

				// Remove source if it has no more quizzes or decks
				if (source.quizFiles.length === 0 && source.deckIds.length === 0) {
					this.sources.delete(path);
				}
			}
		}

		if (modified) {
			await this.save();
		}
	}

	/**
	 * Get all content related to a source note
	 * @param sourceNotePath - Path to the source note
	 * @returns ContentSource or null if not found
	 */
	async getContentSource(sourceNotePath: string): Promise<ContentSource | null> {
		await this.ensureLoaded();

		const normalizedPath = normalizePath(sourceNotePath);
		return this.sources.get(normalizedPath) || null;
	}

	/**
	 * Get relationships between quizzes and flashcards for a source
	 * @param sourceNotePath - Path to the source note
	 * @param allDecks - Array of all available decks
	 * @returns ContentRelationship object
	 */
	async getRelationships(
		sourceNotePath: string,
		allDecks: Deck[]
	): Promise<ContentRelationship> {
		await this.ensureLoaded();

		const normalizedPath = normalizePath(sourceNotePath);
		const source = this.sources.get(normalizedPath);

		if (!source) {
			return {
				sourceNotePath: normalizedPath,
				relatedQuizzes: [],
				relatedDecks: [],
				hasBoth: false
			};
		}

		// Find related decks from the deck IDs
		const relatedDecks = allDecks.filter(deck =>
			source.deckIds.includes(deck.id)
		);

		return {
			sourceNotePath: normalizedPath,
			relatedQuizzes: [...source.quizFiles],
			relatedDecks,
			hasBoth: source.quizFiles.length > 0 && source.deckIds.length > 0
		};
	}

	/**
	 * Find all sources that have both quizzes and flashcards
	 * Useful for suggesting integrated study workflows
	 * @param allDecks - Array of all available decks
	 * @returns Array of ContentRelationship objects
	 */
	async getSourcesWithBoth(allDecks: Deck[]): Promise<ContentRelationship[]> {
		await this.ensureLoaded();

		const relationships: ContentRelationship[] = [];
		const entries = Array.from(this.sources.entries());

		for (const [path, source] of entries) {
			if (source.quizFiles.length > 0 && source.deckIds.length > 0) {
				const relatedDecks = allDecks.filter(deck =>
					source.deckIds.includes(deck.id)
				);

				relationships.push({
					sourceNotePath: path,
					relatedQuizzes: [...source.quizFiles],
					relatedDecks,
					hasBoth: true
				});
			}
		}

		return relationships;
	}

	/**
	 * Get quiz files associated with a deck (via shared source)
	 * Used for Requirement 10.4 - identifying related quiz questions for flashcard practice
	 * @param deck - The deck to find related quizzes for
	 * @returns Array of quiz file paths
	 */
	async getRelatedQuizzesForDeck(deck: Deck): Promise<string[]> {
		await this.ensureLoaded();

		if (!deck.sourceFolder) {
			return [];
		}

		const source = await this.getContentSource(deck.sourceFolder);
		return source ? [...source.quizFiles] : [];
	}

	/**
	 * Get decks associated with a quiz file (via shared source)
	 * Used for Requirement 10.3 - suggesting flashcard review before quizzes
	 * @param quizFilePath - Path to the quiz file
	 * @param allDecks - Array of all available decks
	 * @returns Array of related decks
	 */
	async getRelatedDecksForQuiz(
		quizFilePath: string,
		allDecks: Deck[]
	): Promise<Deck[]> {
		await this.ensureLoaded();

		const relatedDecks: Deck[] = [];
		const sources = Array.from(this.sources.values());

		for (const source of sources) {
			if (source.quizFiles.includes(quizFilePath)) {
				// Find decks that are associated with this source
				const decks = allDecks.filter(deck =>
					source.deckIds.includes(deck.id)
				);
				relatedDecks.push(...decks);
			}
		}

		return relatedDecks;
	}

	/**
	 * Clean up tracking for files/decks that no longer exist
	 * Should be called periodically to maintain data integrity
	 * @param allDecks - Array of all existing decks
	 */
	async cleanup(allDecks: Deck[]): Promise<void> {
		await this.ensureLoaded();

		let modified = false;
		const existingDeckIds = new Set(allDecks.map(d => d.id));
		const sources = Array.from(this.sources.values());

		for (const source of sources) {
			// Remove quiz files that no longer exist
			const existingQuizFiles = [];
			for (const quizPath of source.quizFiles) {
				const file = this.app.vault.getAbstractFileByPath(quizPath);
				if (file instanceof TFile) {
					existingQuizFiles.push(quizPath);
				} else {
					modified = true;
				}
			}
			source.quizFiles = existingQuizFiles;

			// Remove deck IDs that no longer exist
			const existingDeckIdsInSource = source.deckIds.filter(id =>
				existingDeckIds.has(id)
			);
			if (existingDeckIdsInSource.length !== source.deckIds.length) {
				source.deckIds = existingDeckIdsInSource;
				modified = true;
			}
		}

		// Remove sources with no quizzes or decks
		const entries = Array.from(this.sources.entries());
		for (const [path, source] of entries) {
			if (source.quizFiles.length === 0 && source.deckIds.length === 0) {
				this.sources.delete(path);
				modified = true;
			}
		}

		if (modified) {
			await this.save();
		}
	}

	/**
	 * Get all tracked sources
	 * @returns Array of all ContentSource objects
	 */
	async getAllSources(): Promise<ContentSource[]> {
		await this.ensureLoaded();
		return Array.from(this.sources.values());
	}

	/**
	 * Clear all tracking data (for testing or reset purposes)
	 */
	async clear(): Promise<void> {
		this.sources = new Map();
		await this.save();
	}
}
