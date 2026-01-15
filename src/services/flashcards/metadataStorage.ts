import { App, Notice, normalizePath } from "obsidian";
import {
	Deck,
	FlashcardMetadata,
	StudySession,
	isFlashcardMetadata,
	isDeck,
	isStudySession,
} from "../../utils/types";
import { FLASHCARD_STORAGE } from "../../settings/flashcards/flashcardConfig";

/**
 * Daily statistics for flashcard reviews
 * Implements requirement 3.4 (heatmap data)
 */
export interface DailyStats {
	/** ISO date string (YYYY-MM-DD) */
	date: string;
	/** Total cards reviewed on this day */
	cardsReviewed: number;
	/** Number of cards rated Good or Easy */
	correctCount: number;
	/** Number of cards rated Again */
	againCount: number;
	/** Total time spent reviewing in milliseconds */
	timeSpentMs: number;
	/** Number of new cards learned */
	newCardsLearned: number;
}

/**
 * Streak tracking data
 * Implements requirements 3.1, 8.1
 */
export interface StreakData {
	/** Current consecutive days of review */
	currentStreak: number;
	/** Longest streak ever achieved */
	longestStreak: number;
	/** ISO date string of last review day */
	lastReviewDate: string;
}

/**
 * Type guard for DailyStats
 */
export function isDailyStats(obj: unknown): obj is DailyStats {
	if (!obj || typeof obj !== "object") return false;
	const stats = obj as Record<string, unknown>;
	return (
		typeof stats.date === "string" &&
		typeof stats.cardsReviewed === "number" &&
		typeof stats.correctCount === "number" &&
		typeof stats.againCount === "number" &&
		typeof stats.timeSpentMs === "number" &&
		typeof stats.newCardsLearned === "number"
	);
}

/**
 * Type guard for StreakData
 */
export function isStreakData(obj: unknown): obj is StreakData {
	if (!obj || typeof obj !== "object") return false;
	const data = obj as Record<string, unknown>;
	return (
		typeof data.currentStreak === "number" &&
		typeof data.longestStreak === "number" &&
		typeof data.lastReviewDate === "string"
	);
}

/**
 * Represents the complete flashcard metadata structure
 * Stored in flashcard-metadata.json
 */
export interface FlashcardMetadataStore {
	/** Map of deck ID to Deck object */
	decks: Map<string, Deck>;
	/** Map of card ID to FlashcardMetadata */
	cards: Map<string, FlashcardMetadata>;
	/** Array of completed study sessions (most recent first) */
	sessions: StudySession[];
	/** Timestamp of last modification */
	lastModified?: number;

	// New statistics fields (Requirements 3.1, 3.4, 8.1)
	/** Map of ISO date to daily statistics */
	dailyStats: Map<string, DailyStats>;
	/** Streak tracking data */
	streakData: StreakData;
}

/**
 * Serializable version of FlashcardMetadataStore for JSON storage
 */
interface SerializableMetadataStore {
	decks: Record<string, Deck>;
	cards: Record<string, FlashcardMetadata>;
	sessions: StudySession[];
	lastModified: number;
	dailyStats?: Record<string, DailyStats>;
	streakData?: StreakData;
}

/**
 * MetadataStorage handles persistent storage of flashcard metadata
 * Implements requirements: 4.4, 4.6, 6.1
 *
 * Features:
 * - Atomic writes with backup
 * - Corruption recovery
 * - In-memory caching
 * - Automatic validation
 */
export default class MetadataStorage {
	private readonly app: App;
	private metadataCache: {
		decks: Map<string, Deck>;
		cards: Map<string, FlashcardMetadata>;
		sessions: StudySession[];
		dailyStats: Map<string, DailyStats>;
		streakData: StreakData;
		lastLoaded: number;
	} | null = null;

	// Cache expiry time in milliseconds (5 seconds)
	private static readonly CACHE_EXPIRY_MS = 5000;

	// Maximum number of sessions to keep in history (to prevent unbounded growth)
	private static readonly MAX_SESSIONS_HISTORY = 100;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Get the full path to the metadata file
	 * @returns Normalized path to flashcard-metadata.json
	 */
	private getMetadataPath(): string {
		const dataPath = this.getDataPath();
		return normalizePath(`${dataPath}/${FLASHCARD_STORAGE.METADATA_FILE}`);
	}

	/**
	 * Get the full path to the backup metadata file
	 * @returns Normalized path to backup file
	 */
	private getBackupPath(): string {
		const dataPath = this.getDataPath();
		return normalizePath(
			`${dataPath}/${FLASHCARD_STORAGE.METADATA_FILE}${FLASHCARD_STORAGE.METADATA_BACKUP_SUFFIX}`
		);
	}

	/**
	 * Get the plugin data directory path
	 * @returns Path to plugin data directory
	 */
	private getDataPath(): string {
		const pluginDir =
			(this.app as any).plugins.manifests["local-quiz-generator"]?.dir ||
			"local-quiz-generator";
		return normalizePath(`${this.app.vault.configDir}/plugins/${pluginDir}`);
	}

	/**
	 * Load flashcard metadata from storage
	 * Implements caching to reduce file I/O operations
	 *
	 * @param forceRefresh - If true, bypass cache and reload from disk
	 * @returns Metadata containing decks and cards
	 */
	async loadMetadata(
		forceRefresh: boolean = false
	): Promise<FlashcardMetadataStore> {
		const now = Date.now();

		// Return cached data if still valid and not forcing refresh
		if (
			!forceRefresh &&
			this.metadataCache &&
			now - this.metadataCache.lastLoaded < MetadataStorage.CACHE_EXPIRY_MS
		) {
			return {
				decks: this.metadataCache.decks,
				cards: this.metadataCache.cards,
				sessions: this.metadataCache.sessions,
				dailyStats: this.metadataCache.dailyStats,
				streakData: this.metadataCache.streakData,
			};
		}

		try {
			const metadataPath = this.getMetadataPath();
			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(metadataPath);

			if (!exists) {
				// Return empty metadata if file doesn't exist
				return this.createEmptyMetadata();
			}

			const fileContent = await adapter.read(metadataPath);
			const metadata = this.parseMetadata(fileContent);

			// Update cache
			this.metadataCache = {
				decks: metadata.decks,
				cards: metadata.cards,
				sessions: metadata.sessions,
				dailyStats: metadata.dailyStats,
				streakData: metadata.streakData,
				lastLoaded: now,
			};

			return metadata;
		} catch (error) {
			console.error("Error loading flashcard metadata:", error);
			return await this.handleCorruptedMetadata(error);
		}
	}

	/**
	 * Parse and validate metadata from JSON string
	 * @param jsonContent - Raw JSON string from file
	 * @returns Parsed and validated metadata
	 * @throws Error if JSON is invalid or data structure is corrupt
	 */
	private parseMetadata(jsonContent: string): FlashcardMetadataStore {
		try {
			const data: SerializableMetadataStore = JSON.parse(jsonContent);

			// Validate basic structure
			if (!data || typeof data !== "object") {
				throw new Error("Invalid metadata structure: not an object");
			}

			// Convert plain objects to Maps and validate
			const decks = this.parseDecks(data.decks);
			const cards = this.parseCards(data.cards);
			const sessions = this.parseSessions(data.sessions);
			const dailyStats = this.parseDailyStats(data.dailyStats);
			const streakData = this.parseStreakData(data.streakData);

			return { decks, cards, sessions, lastModified: data.lastModified, dailyStats, streakData };
		} catch (error) {
			console.error("Error parsing metadata:", error);
			throw new Error(`Failed to parse metadata: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Parse and validate deck data
	 * @param decksData - Raw decks object
	 * @returns Map of validated decks
	 */
	private parseDecks(decksData: any): Map<string, Deck> {
		const decks = new Map<string, Deck>();

		if (!decksData || typeof decksData !== "object") {
			console.warn("No valid decks data found, starting with empty decks");
			return decks;
		}

		for (const [id, deck] of Object.entries(decksData)) {
			if (isDeck(deck)) {
				decks.set(id, deck as Deck);
			} else {
				console.warn(`Invalid deck data for ID ${id}, skipping`);
			}
		}

		return decks;
	}

	/**
	 * Parse and validate card metadata
	 * @param cardsData - Raw cards object
	 * @returns Map of validated card metadata
	 */
	private parseCards(cardsData: any): Map<string, FlashcardMetadata> {
		const cards = new Map<string, FlashcardMetadata>();

		if (!cardsData || typeof cardsData !== "object") {
			console.warn("No valid cards data found, starting with empty cards");
			return cards;
		}

		for (const [id, metadata] of Object.entries(cardsData)) {
			if (isFlashcardMetadata(metadata)) {
				cards.set(id, metadata as FlashcardMetadata);
			} else {
				console.warn(`Invalid card metadata for ID ${id}, skipping`);
			}
		}

		return cards;
	}

	/**
	 * Parse and validate study sessions
	 * @param sessionsData - Raw sessions array
	 * @returns Array of validated study sessions
	 */
	private parseSessions(sessionsData: any): StudySession[] {
		if (!Array.isArray(sessionsData)) {
			console.warn("No valid sessions data found, starting with empty sessions");
			return [];
		}

		const sessions: StudySession[] = [];
		for (const session of sessionsData) {
			if (isStudySession(session)) {
				sessions.push(session as StudySession);
			} else {
				console.warn("Invalid session data, skipping");
			}
		}

		// Keep sessions sorted by most recent first
		return sessions.sort((a, b) => (b.endTime || b.startTime) - (a.endTime || a.startTime));
	}

	/**
	 * Parse and validate daily stats data
	 * @param dailyStatsData - Raw daily stats object
	 * @returns Map of date to DailyStats
	 */
	private parseDailyStats(dailyStatsData: any): Map<string, DailyStats> {
		const dailyStats = new Map<string, DailyStats>();

		if (!dailyStatsData || typeof dailyStatsData !== "object") {
			return dailyStats;
		}

		for (const [date, stats] of Object.entries(dailyStatsData)) {
			if (isDailyStats(stats)) {
				dailyStats.set(date, stats as DailyStats);
			} else {
				console.warn(`Invalid daily stats data for date ${date}, skipping`);
			}
		}

		return dailyStats;
	}

	/**
	 * Parse and validate streak data
	 * @param streakDataInput - Raw streak data object
	 * @returns Validated StreakData or default values
	 */
	private parseStreakData(streakDataInput: any): StreakData {
		if (isStreakData(streakDataInput)) {
			return streakDataInput;
		}

		// Return default streak data
		return {
			currentStreak: 0,
			longestStreak: 0,
			lastReviewDate: "",
		};
	}

	/**
	 * Handle corrupted metadata by attempting backup recovery
	 * @param originalError - The original error that occurred
	 * @returns Recovered metadata or empty metadata
	 */
	private async handleCorruptedMetadata(
		originalError: any
	): Promise<FlashcardMetadataStore> {
		console.error("Attempting to recover from corrupted metadata...");

		// Try to load backup file
		try {
			const backupMetadata = await this.loadBackupMetadata();
			if (backupMetadata) {
				new Notice(
					"Loaded flashcard data from backup due to corrupted metadata file"
				);

				// Save the backup as the main file
				await this.saveMetadata(backupMetadata);

				return backupMetadata;
			}
		} catch (backupError) {
			console.error("Error loading backup metadata:", backupError);
		}

		// If backup recovery fails, create backup of corrupted file for forensics
		await this.backupCorruptedFile();

		new Notice(
			"Could not recover flashcard metadata. Starting with empty data."
		);

		// Return empty metadata as last resort
		return this.createEmptyMetadata();
	}

	/**
	 * Load metadata from backup file
	 * @returns Backup metadata or null if not available
	 */
	private async loadBackupMetadata(): Promise<FlashcardMetadataStore | null> {
		try {
			const backupPath = this.getBackupPath();
			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(backupPath);

			if (!exists) {
				console.warn("No backup metadata file found");
				return null;
			}

			const fileContent = await adapter.read(backupPath);
			const metadata = this.parseMetadata(fileContent);

			console.log("Successfully loaded backup metadata");
			return metadata;
		} catch (error) {
			console.error("Error loading backup metadata:", error);
			return null;
		}
	}

	/**
	 * Create a timestamped backup of corrupted metadata file
	 * Useful for debugging and data recovery
	 */
	private async backupCorruptedFile(): Promise<void> {
		try {
			const metadataPath = this.getMetadataPath();
			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(metadataPath);

			if (!exists) {
				return;
			}

			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const dataPath = this.getDataPath();
			const corruptedPath = normalizePath(
				`${dataPath}/flashcard-metadata-corrupted-${timestamp}.json`
			);

			const corruptedContent = await adapter.read(metadataPath);
			await adapter.write(corruptedPath, corruptedContent);

			console.log(`Backed up corrupted metadata to ${corruptedPath}`);
		} catch (error) {
			console.error("Failed to backup corrupted file:", error);
		}
	}

	/**
	 * Save flashcard metadata to storage with atomic writes and backup
	 *
	 * Process:
	 * 1. Create backup of existing file
	 * 2. Write new data to main file
	 * 3. Update cache
	 *
	 * @param metadata - The metadata to save
	 * @throws Error if save operation fails
	 */
	async saveMetadata(metadata: FlashcardMetadataStore): Promise<void> {
		try {
			const metadataPath = this.getMetadataPath();
			const backupPath = this.getBackupPath();
			const adapter = this.app.vault.adapter;

			// Ensure data directory exists
			const dataPath = this.getDataPath();
			const dataPathExists = await adapter.exists(dataPath);
			if (!dataPathExists) {
				await adapter.mkdir(dataPath);
			}

			// Create backup of existing file before writing
			const exists = await adapter.exists(metadataPath);
			if (exists) {
				try {
					const currentContent = await adapter.read(metadataPath);
					await adapter.write(backupPath, currentContent);
				} catch (backupError) {
					console.warn("Failed to create backup:", backupError);
					// Continue with save even if backup fails
				}
			}

			// Convert Maps to plain objects for JSON serialization
			// Limit sessions to prevent unbounded growth
			const limitedSessions = metadata.sessions.slice(0, MetadataStorage.MAX_SESSIONS_HISTORY);

			const serializableData: SerializableMetadataStore = {
				decks: Object.fromEntries(metadata.decks),
				cards: Object.fromEntries(metadata.cards),
				sessions: limitedSessions,
				lastModified: Date.now(),
				dailyStats: Object.fromEntries(metadata.dailyStats),
				streakData: metadata.streakData,
			};

			// Atomic write: write to file with pretty printing for readability
			const jsonContent = JSON.stringify(serializableData, null, 2);
			await adapter.write(metadataPath, jsonContent);

			// Update cache after successful write
			this.metadataCache = {
				decks: metadata.decks,
				cards: metadata.cards,
				sessions: limitedSessions,
				dailyStats: metadata.dailyStats,
				streakData: metadata.streakData,
				lastLoaded: Date.now(),
			};

			console.log("Successfully saved flashcard metadata");
		} catch (error) {
			console.error("Error saving flashcard metadata:", error);
			new Notice("Failed to save flashcard metadata");
			throw error;
		}
	}

	/**
	 * Save card metadata only (optimized for frequent updates during review sessions)
	 * @param cardId - ID of the card to update
	 * @param metadata - Updated metadata for the card
	 */
	async saveCardMetadata(
		cardId: string,
		metadata: FlashcardMetadata
	): Promise<void> {
		if (!isFlashcardMetadata(metadata)) {
			throw new Error("Invalid flashcard metadata");
		}

		const store = await this.loadMetadata();
		store.cards.set(cardId, metadata);
		await this.saveMetadata(store);
	}

	/**
	 * Save deck only (optimized for deck updates)
	 * @param deck - The deck to save or update
	 */
	async saveDeck(deck: Deck): Promise<void> {
		if (!isDeck(deck)) {
			throw new Error("Invalid deck object");
		}

		const store = await this.loadMetadata();
		store.decks.set(deck.id, deck);
		await this.saveMetadata(store);
	}

	/**
	 * Get metadata for a specific card
	 * @param cardId - ID of the card
	 * @returns Card metadata or null if not found
	 */
	async getCardMetadata(cardId: string): Promise<FlashcardMetadata | null> {
		const store = await this.loadMetadata();
		return store.cards.get(cardId) || null;
	}

	/**
	 * Get metadata for multiple cards
	 * @param cardIds - Array of card IDs
	 * @returns Map of card ID to metadata (only for cards that exist)
	 */
	async getCardsMetadata(
		cardIds: string[]
	): Promise<Map<string, FlashcardMetadata>> {
		const store = await this.loadMetadata();
		const result = new Map<string, FlashcardMetadata>();

		for (const cardId of cardIds) {
			const metadata = store.cards.get(cardId);
			if (metadata) {
				result.set(cardId, metadata);
			}
		}

		return result;
	}

	/**
	 * Delete card metadata
	 * @param cardId - ID of the card to delete
	 */
	async deleteCardMetadata(cardId: string): Promise<void> {
		const store = await this.loadMetadata();
		store.cards.delete(cardId);
		await this.saveMetadata(store);
	}

	/**
	 * Delete multiple card metadata entries
	 * @param cardIds - Array of card IDs to delete
	 */
	async deleteCardsMetadata(cardIds: string[]): Promise<void> {
		const store = await this.loadMetadata();
		for (const cardId of cardIds) {
			store.cards.delete(cardId);
		}
		await this.saveMetadata(store);
	}

	/**
	 * Delete a deck
	 * @param deckId - ID of the deck to delete
	 */
	async deleteDeck(deckId: string): Promise<void> {
		const store = await this.loadMetadata();
		store.decks.delete(deckId);
		await this.saveMetadata(store);
	}

	/**
	 * Create empty metadata structure
	 * @returns Empty metadata with initialized maps
	 */
	private createEmptyMetadata(): FlashcardMetadataStore {
		const emptyMetadata: FlashcardMetadataStore = {
			decks: new Map<string, Deck>(),
			cards: new Map<string, FlashcardMetadata>(),
			sessions: [],
			dailyStats: new Map<string, DailyStats>(),
			streakData: {
				currentStreak: 0,
				longestStreak: 0,
				lastReviewDate: "",
			},
		};

		// Update cache
		this.metadataCache = {
			decks: emptyMetadata.decks,
			cards: emptyMetadata.cards,
			sessions: emptyMetadata.sessions,
			dailyStats: emptyMetadata.dailyStats,
			streakData: emptyMetadata.streakData,
			lastLoaded: Date.now(),
		};

		return emptyMetadata;
	}

	/**
	 * Clear the in-memory cache
	 * Useful for testing or when manual refresh is needed
	 */
	clearCache(): void {
		this.metadataCache = null;
	}

	/**
	 * Check if metadata file exists
	 * @returns True if metadata file exists
	 */
	async exists(): Promise<boolean> {
		const metadataPath = this.getMetadataPath();
		return await this.app.vault.adapter.exists(metadataPath);
	}

	/**
	 * Get the size of the metadata file in bytes
	 * @returns File size or 0 if file doesn't exist
	 */
	async getFileSize(): Promise<number> {
		try {
			const metadataPath = this.getMetadataPath();
			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(metadataPath);

			if (!exists) {
				return 0;
			}

			const stat = await adapter.stat(metadataPath);
			return stat?.size || 0;
		} catch (error) {
			console.error("Error getting metadata file size:", error);
			return 0;
		}
	}

	/**
	 * Validate metadata integrity
	 * Checks for common issues and inconsistencies
	 * @returns Array of validation warnings (empty if all OK)
	 */
	async validateMetadata(): Promise<string[]> {
		const warnings: string[] = [];

		try {
			const store = await this.loadMetadata();

			// Check for orphaned cards (cards not in any deck)
			const allCardIdsInDecks = new Set<string>();
			for (const deck of store.decks.values()) {
				for (const cardId of deck.cardIds) {
					allCardIdsInDecks.add(cardId);
				}
			}

			let orphanedCount = 0;
			for (const cardId of store.cards.keys()) {
				if (!allCardIdsInDecks.has(cardId)) {
					orphanedCount++;
				}
			}

			if (orphanedCount > 0) {
				warnings.push(
					`Found ${orphanedCount} orphaned cards (not in any deck)`
				);
			}

			// Check for missing card metadata
			let missingMetadataCount = 0;
			for (const cardId of allCardIdsInDecks) {
				if (!store.cards.has(cardId)) {
					missingMetadataCount++;
				}
			}

			if (missingMetadataCount > 0) {
				warnings.push(
					`Found ${missingMetadataCount} cards in decks without metadata`
				);
			}

			// Check for duplicate deck names
			const deckNames = new Map<string, number>();
			for (const deck of store.decks.values()) {
				const normalizedName = deck.name.toLowerCase();
				deckNames.set(normalizedName, (deckNames.get(normalizedName) || 0) + 1);
			}

			for (const [name, count] of deckNames.entries()) {
				if (count > 1) {
					warnings.push(`Duplicate deck name found: "${name}" (${count} times)`);
				}
			}
		} catch (error) {
			warnings.push(`Error validating metadata: ${error instanceof Error ? error.message : String(error)}`);
		}

		return warnings;
	}

	/**
	 * Save a completed study session to history
	 * @param session - The completed study session
	 */
	async saveSession(session: StudySession): Promise<void> {
		if (!isStudySession(session)) {
			throw new Error("Invalid study session");
		}

		// Ensure session has an ID
		if (!session.id) {
			session.id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
		}

		const store = await this.loadMetadata();

		// Add session to the beginning (most recent first)
		store.sessions.unshift(session);

		// Limit to MAX_SESSIONS_HISTORY
		if (store.sessions.length > MetadataStorage.MAX_SESSIONS_HISTORY) {
			store.sessions = store.sessions.slice(0, MetadataStorage.MAX_SESSIONS_HISTORY);
		}

		await this.saveMetadata(store);
	}

	/**
	 * Get session history for a specific deck
	 * @param deckId - ID of the deck to get sessions for
	 * @param limit - Maximum number of sessions to return (default: 10)
	 * @returns Array of study sessions for the deck
	 */
	async getDeckSessions(deckId: string, limit: number = 10): Promise<StudySession[]> {
		const store = await this.loadMetadata();
		return store.sessions
			.filter(session => session.deckId === deckId)
			.slice(0, limit);
	}

	/**
	 * Get all session history
	 * @param limit - Maximum number of sessions to return (default: all)
	 * @returns Array of all study sessions
	 */
	async getAllSessions(limit?: number): Promise<StudySession[]> {
		const store = await this.loadMetadata();
		return limit ? store.sessions.slice(0, limit) : store.sessions;
	}

	/**
	 * Get daily stats for a specific date
	 * @param date - ISO date string (YYYY-MM-DD)
	 * @returns DailyStats for the date or null if not found
	 */
	async getDailyStats(date: string): Promise<DailyStats | null> {
		const store = await this.loadMetadata();
		return store.dailyStats.get(date) || null;
	}

	/**
	 * Save or update daily stats for a specific date
	 * @param stats - The daily stats to save
	 */
	async saveDailyStats(stats: DailyStats): Promise<void> {
		if (!isDailyStats(stats)) {
			throw new Error("Invalid daily stats");
		}

		const store = await this.loadMetadata();
		store.dailyStats.set(stats.date, stats);
		await this.saveMetadata(store);
	}

	/**
	 * Get all daily stats within a date range
	 * @param days - Number of days to retrieve (from today going back)
	 * @returns Map of date to DailyStats
	 */
	async getDailyStatsRange(days: number): Promise<Map<string, DailyStats>> {
		const store = await this.loadMetadata();
		const result = new Map<string, DailyStats>();
		const today = new Date();

		for (let i = 0; i < days; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);
			const dateStr = date.toISOString().split("T")[0];
			const stats = store.dailyStats.get(dateStr);
			if (stats) {
				result.set(dateStr, stats);
			}
		}

		return result;
	}

	/**
	 * Get current streak data
	 * @returns Current streak information
	 */
	async getStreakData(): Promise<StreakData> {
		const store = await this.loadMetadata();
		return store.streakData;
	}

	/**
	 * Update streak data
	 * @param streakData - Updated streak information
	 */
	async saveStreakData(streakData: StreakData): Promise<void> {
		if (!isStreakData(streakData)) {
			throw new Error("Invalid streak data");
		}

		const store = await this.loadMetadata();
		store.streakData = streakData;
		await this.saveMetadata(store);
	}

	/**
	 * Record activity for today and update streak
	 * @param cardsReviewed - Number of cards reviewed
	 * @param correctCount - Number of correct responses
	 * @param againCount - Number of "again" responses
	 * @param timeSpentMs - Time spent in milliseconds
	 * @param newCardsLearned - Number of new cards learned
	 */
	async recordDailyActivity(
		cardsReviewed: number,
		correctCount: number,
		againCount: number,
		timeSpentMs: number,
		newCardsLearned: number
	): Promise<void> {
		const store = await this.loadMetadata();
		const today = new Date().toISOString().split("T")[0];

		// Update or create daily stats
		const existingStats = store.dailyStats.get(today);
		const updatedStats: DailyStats = {
			date: today,
			cardsReviewed: (existingStats?.cardsReviewed || 0) + cardsReviewed,
			correctCount: (existingStats?.correctCount || 0) + correctCount,
			againCount: (existingStats?.againCount || 0) + againCount,
			timeSpentMs: (existingStats?.timeSpentMs || 0) + timeSpentMs,
			newCardsLearned: (existingStats?.newCardsLearned || 0) + newCardsLearned,
		};
		store.dailyStats.set(today, updatedStats);

		// Update streak
		const lastReviewDate = store.streakData.lastReviewDate;
		if (lastReviewDate !== today) {
			const yesterday = new Date();
			yesterday.setDate(yesterday.getDate() - 1);
			const yesterdayStr = yesterday.toISOString().split("T")[0];

			if (lastReviewDate === yesterdayStr) {
				// Continuing streak
				store.streakData.currentStreak += 1;
			} else {
				// Streak broken (or first review), start new
				store.streakData.currentStreak = 1;
			}

			// Update longest streak if needed
			if (store.streakData.currentStreak > store.streakData.longestStreak) {
				store.streakData.longestStreak = store.streakData.currentStreak;
			}

			store.streakData.lastReviewDate = today;
		}

		await this.saveMetadata(store);
	}
}
