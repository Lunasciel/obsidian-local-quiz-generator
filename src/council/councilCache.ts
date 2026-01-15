import { CouncilResult, CouncilSettings, isCouncilResult } from "./types";
import { CouncilModelReference } from "../settings/modelRegistry/types";
import { Plugin } from "obsidian";

/**
 * Cache entry stored in plugin data for council results
 */
export interface CouncilCacheEntry {
	/** Cache key (hash of content + settings) */
	key: string;

	/** Cached council result */
	result: CouncilResult;

	/** Timestamp when cached (milliseconds) */
	cachedAt: number;

	/** Content hash used for this cache entry */
	contentHash: string;

	/** Settings hash used for this cache entry */
	settingsHash: string;

	/** Time to live in milliseconds (optional) */
	ttl?: number;
}

/**
 * Cache storage structure in plugin data for council results
 */
export interface CouncilCacheStorage {
	/** Map of cache key to cache entry */
	entries: Record<string, CouncilCacheEntry>;

	/** Version for cache schema migrations */
	version: number;
}

/**
 * Options for cache operations
 */
export interface CacheOptions {
	/** Time to live for cache entries in milliseconds (default: 7 days) */
	ttl?: number;

	/** Whether to ignore TTL and always return cached results */
	ignoreExpiration?: boolean;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
	/** Total number of cached entries */
	totalEntries: number;

	/** Number of cache hits */
	hits: number;

	/** Number of cache misses */
	misses: number;

	/** Total size of cached data in bytes (approximate) */
	totalSize: number;

	/** Number of expired entries */
	expiredEntries: number;
}

/**
 * Default cache options
 */
const DEFAULT_CACHE_OPTIONS: Required<CacheOptions> = {
	ttl: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
	ignoreExpiration: false,
};

/**
 * Current cache schema version
 */
const CACHE_VERSION = 1;

/**
 * Storage key for council cache in plugin data (separate from consensus cache)
 */
const CACHE_STORAGE_KEY = "councilCache";

/**
 * CouncilCache manages caching of council results to avoid
 * redundant API calls when generating quizzes from identical content.
 *
 * The cache uses content hashing to identify identical source material
 * and settings hashing to detect configuration changes that should
 * invalidate cached results.
 *
 * This is separate from ConsensusCache to ensure council and consensus
 * results are cached independently with different settings hashes.
 *
 * Cache entries are stored in the Obsidian plugin's data storage and
 * persist across sessions. Entries automatically expire after a
 * configurable TTL (default: 7 days).
 *
 * Performance benefits:
 * - Avoids redundant API calls for identical content
 * - Reduces latency for repeated quiz generation
 * - Saves API costs for users with rate-limited models
 *
 * Cache invalidation triggers:
 * - Content changes (different source material)
 * - Settings changes (model configs, chair selection, etc.)
 * - TTL expiration
 * - Manual cache clearing
 *
 * Requirements: 4.7, 7.6
 */
export class CouncilCache {
	/** Reference to the Obsidian plugin for data persistence */
	private readonly plugin: Plugin;

	/** In-memory cache storage */
	private storage: CouncilCacheStorage;

	/** Cache statistics */
	private stats: CacheStats;

	/** Cache options */
	private options: Required<CacheOptions>;

	/**
	 * Create a new council cache
	 *
	 * @param plugin - Obsidian plugin instance for data persistence
	 * @param options - Cache configuration options
	 */
	constructor(plugin: Plugin, options?: CacheOptions) {
		this.plugin = plugin;
		this.options = { ...DEFAULT_CACHE_OPTIONS, ...options };
		this.storage = {
			entries: {},
			version: CACHE_VERSION,
		};
		this.stats = {
			totalEntries: 0,
			hits: 0,
			misses: 0,
			totalSize: 0,
			expiredEntries: 0,
		};
	}

	/**
	 * Initialize the cache by loading from plugin data
	 *
	 * This should be called during plugin initialization.
	 *
	 * @throws Error if cache data is corrupted
	 */
	public async initialize(): Promise<void> {
		try {
			const data = await this.plugin.loadData();

			if (data && data[CACHE_STORAGE_KEY]) {
				const loadedStorage = data[CACHE_STORAGE_KEY] as CouncilCacheStorage;

				// Validate cache version
				if (loadedStorage.version !== CACHE_VERSION) {
					console.warn(
						`Council cache version mismatch (expected ${CACHE_VERSION}, got ${loadedStorage.version}). ` +
						`Clearing cache.`
					);
					await this.clear();
					return;
				}

				// Validate cache structure
				if (!loadedStorage.entries || typeof loadedStorage.entries !== "object") {
					console.warn("Invalid council cache structure. Clearing cache.");
					await this.clear();
					return;
				}

				this.storage = loadedStorage;

				// Clean up expired entries on initialization
				await this.cleanupExpired();

				// Update stats
				this.updateStats();

				console.log(`Council cache initialized with ${this.stats.totalEntries} entries`);
			}
		} catch (error) {
			console.error("Failed to load council cache:", error);
			// Reset to empty cache on error
			this.storage = {
				entries: {},
				version: CACHE_VERSION,
			};
		}
	}

	/**
	 * Get a cached council result
	 *
	 * @param contentHash - Hash of the source content
	 * @param settingsHash - Hash of the council settings
	 * @returns Cached result if found and valid, undefined otherwise
	 */
	public async get(
		contentHash: string,
		settingsHash: string
	): Promise<CouncilResult | undefined> {
		const cacheKey = this.generateCacheKey(contentHash, settingsHash);
		const entry = this.storage.entries[cacheKey];

		if (!entry) {
			this.stats.misses++;
			return undefined;
		}

		// Check if entry is expired (unless ignoreExpiration is true)
		if (!this.options.ignoreExpiration && this.isExpired(entry)) {
			this.stats.misses++;
			this.stats.expiredEntries++;

			// Remove expired entry
			delete this.storage.entries[cacheKey];
			await this.persist();

			return undefined;
		}

		// Validate cached result structure
		if (!isCouncilResult(entry.result)) {
			console.warn(`Invalid cached council result for key ${cacheKey}. Removing from cache.`);
			delete this.storage.entries[cacheKey];
			await this.persist();
			this.updateStats(); // Update stats after removing invalid entry
			this.stats.misses++;
			return undefined;
		}

		this.stats.hits++;
		console.log(`Council cache HIT for key ${cacheKey}`);

		return entry.result;
	}

	/**
	 * Store a council result in the cache
	 *
	 * @param contentHash - Hash of the source content
	 * @param settingsHash - Hash of the council settings
	 * @param result - Council result to cache
	 * @param ttl - Optional custom TTL for this entry (overrides default)
	 */
	public async set(
		contentHash: string,
		settingsHash: string,
		result: CouncilResult,
		ttl?: number
	): Promise<void> {
		const cacheKey = this.generateCacheKey(contentHash, settingsHash);

		const entry: CouncilCacheEntry = {
			key: cacheKey,
			result,
			cachedAt: Date.now(),
			contentHash,
			settingsHash,
			ttl: ttl || this.options.ttl,
		};

		this.storage.entries[cacheKey] = entry;

		await this.persist();

		this.updateStats();

		console.log(`Council result cached with key ${cacheKey}`);
	}

	/**
	 * Check if a cached result exists for given content and settings
	 *
	 * @param contentHash - Hash of the source content
	 * @param settingsHash - Hash of the council settings
	 * @returns true if a valid (non-expired) cache entry exists
	 */
	public async has(contentHash: string, settingsHash: string): Promise<boolean> {
		const cacheKey = this.generateCacheKey(contentHash, settingsHash);
		const entry = this.storage.entries[cacheKey];

		if (!entry) {
			return false;
		}

		// Check expiration
		if (!this.options.ignoreExpiration && this.isExpired(entry)) {
			return false;
		}

		return true;
	}

	/**
	 * Invalidate all cache entries that use specific settings
	 *
	 * This should be called when council settings change.
	 *
	 * @param settingsHash - Hash of the settings to invalidate
	 * @returns Number of entries invalidated
	 */
	public async invalidateBySettings(settingsHash: string): Promise<number> {
		let invalidated = 0;

		for (const [key, entry] of Object.entries(this.storage.entries)) {
			if (entry.settingsHash === settingsHash) {
				delete this.storage.entries[key];
				invalidated++;
			}
		}

		if (invalidated > 0) {
			await this.persist();
			this.updateStats();
			console.log(`Invalidated ${invalidated} cache entries due to settings change`);
		}

		return invalidated;
	}

	/**
	 * Invalidate all cache entries that use specific content
	 *
	 * @param contentHash - Hash of the content to invalidate
	 * @returns Number of entries invalidated
	 */
	public async invalidateByContent(contentHash: string): Promise<number> {
		let invalidated = 0;

		for (const [key, entry] of Object.entries(this.storage.entries)) {
			if (entry.contentHash === contentHash) {
				delete this.storage.entries[key];
				invalidated++;
			}
		}

		if (invalidated > 0) {
			await this.persist();
			this.updateStats();
			console.log(`Invalidated ${invalidated} cache entries due to content change`);
		}

		return invalidated;
	}

	/**
	 * Clear all cache entries
	 *
	 * @returns Number of entries cleared
	 */
	public async clear(): Promise<number> {
		const count = Object.keys(this.storage.entries).length;

		this.storage.entries = {};
		await this.persist();

		this.updateStats();

		console.log(`Cleared ${count} cache entries`);

		return count;
	}

	/**
	 * Clean up expired cache entries
	 *
	 * This is called automatically during initialization and can be
	 * called manually to free up storage space.
	 *
	 * @returns Number of entries removed
	 */
	public async cleanupExpired(): Promise<number> {
		let removed = 0;

		for (const [key, entry] of Object.entries(this.storage.entries)) {
			if (this.isExpired(entry)) {
				delete this.storage.entries[key];
				removed++;
			}
		}

		if (removed > 0) {
			await this.persist();
			this.updateStats();
			console.log(`Cleaned up ${removed} expired cache entries`);
		}

		return removed;
	}

	/**
	 * Get cache statistics
	 *
	 * @returns Current cache statistics
	 */
	public getStats(): Readonly<CacheStats> {
		return { ...this.stats };
	}

	/**
	 * Reset cache statistics (counts only, not actual cache data)
	 */
	public resetStats(): void {
		this.stats.hits = 0;
		this.stats.misses = 0;
		this.stats.expiredEntries = 0;
	}

	/**
	 * Generate a cache key from content and settings hashes
	 *
	 * @param contentHash - Hash of the source content
	 * @param settingsHash - Hash of the council settings
	 * @returns Combined cache key
	 */
	private generateCacheKey(contentHash: string, settingsHash: string): string {
		return `council:${contentHash}:${settingsHash}`;
	}

	/**
	 * Check if a cache entry is expired
	 *
	 * @param entry - Cache entry to check
	 * @returns true if expired, false otherwise
	 */
	private isExpired(entry: CouncilCacheEntry): boolean {
		if (!entry.ttl) {
			return false; // No TTL means never expires
		}

		const age = Date.now() - entry.cachedAt;
		return age > entry.ttl;
	}

	/**
	 * Persist cache storage to plugin data
	 */
	private async persist(): Promise<void> {
		try {
			const data = await this.plugin.loadData() || {};
			data[CACHE_STORAGE_KEY] = this.storage;
			await this.plugin.saveData(data);
		} catch (error) {
			console.error("Failed to persist council cache:", error);
			throw new Error("Unable to save cache data");
		}
	}

	/**
	 * Update cache statistics based on current storage
	 */
	private updateStats(): void {
		const entries = Object.values(this.storage.entries);

		this.stats.totalEntries = entries.length;

		// Calculate approximate total size
		try {
			const serialized = JSON.stringify(this.storage);
			this.stats.totalSize = new Blob([serialized]).size;
		} catch {
			this.stats.totalSize = 0;
		}
	}
}

/**
 * Hash a string using a simple but fast hashing algorithm
 *
 * This uses the djb2 hash algorithm, which is fast and provides
 * good distribution for cache keys. It's not cryptographically
 * secure, but that's not required for cache invalidation.
 *
 * @param str - String to hash
 * @returns Hash as hexadecimal string
 */
export function hashString(str: string): string {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		// hash * 33 + charCode
		hash = ((hash << 5) + hash) + str.charCodeAt(i);
	}

	// Convert to unsigned 32-bit integer and then to hex
	return (hash >>> 0).toString(16);
}

/**
 * Generate a hash for council settings
 *
 * This creates a stable hash of the settings that affect council results.
 * Changes to these settings should invalidate cached results.
 *
 * Settings that affect the cache:
 * - Enabled models and their configurations
 * - Chair model selection strategy and configured chair
 * - Critique and ranking phase enablement
 * - Minimum models required
 *
 * Settings that do NOT affect the cache:
 * - Timeouts (don't change the output)
 * - showDebateTrail (UI-only setting)
 * - fallbackToSingleModel (error handling setting)
 *
 * @param settings - Council settings to hash
 * @returns Settings hash
 *
 * Requirements: 4.7, 7.6
 */
export function hashCouncilSettings(settings: CouncilSettings): string {
	// Extract only the fields that affect council results
	const relevantSettings = {
		enabled: settings.enabled,
		minModelsRequired: settings.minModelsRequired,
		enableCritique: settings.enableCritique,
		enableRanking: settings.enableRanking,
		// Chair model configuration
		chairModel: {
			selectionStrategy: settings.chairModel.selectionStrategy,
			configuredChairId: settings.chairModel.configuredChairId,
			synthesisWeight: settings.chairModel.synthesisWeight,
		},
		// Include model references (new format uses model IDs from registry)
		// The modelId uniquely identifies the model configuration in the registry
		models: settings.models
			.filter((m: CouncilModelReference) => m.enabled)
			.map((m: CouncilModelReference) => ({
				modelId: m.modelId,
				weight: m.weight,
			}))
			.sort((a: { modelId: string }, b: { modelId: string }) => a.modelId.localeCompare(b.modelId)), // Sort for stable hashing
	};

	const settingsString = JSON.stringify(relevantSettings);
	return hashString(settingsString);
}

/**
 * Generate a hash for content
 *
 * This creates a hash of the source content used for quiz generation.
 * Reuses the same implementation as consensus cache for consistency.
 *
 * @param contents - Array of content strings (note text)
 * @returns Content hash
 */
export function hashContent(contents: string[]): string {
	// Combine all content with a separator
	const combinedContent = contents.join("\n---\n");
	return hashString(combinedContent);
}
