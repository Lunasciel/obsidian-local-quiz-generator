/**
 * Settings Backup Module
 *
 * Provides functionality to create and restore settings backups before migration.
 * Backups are stored as JSON files in the plugin's data folder under `backups/`.
 *
 * This module is part of the migration system that transitions from legacy
 * direct-provider configuration to the centralized Model Registry.
 *
 * Requirements: 7.2, 7.4
 */

import { App, normalizePath } from "obsidian";
import { QuizSettings } from "../config";

/**
 * Directory name for storing backups within the plugin folder.
 */
export const BACKUP_DIRECTORY = "backups";

/**
 * Prefix for backup file names.
 */
export const BACKUP_FILE_PREFIX = "settings-backup-";

/**
 * File extension for backup files.
 */
export const BACKUP_FILE_EXTENSION = ".json";

/**
 * Maximum number of backups to keep (oldest are deleted first).
 */
export const MAX_BACKUP_COUNT = 10;

/**
 * Plugin ID for determining the plugin directory path.
 */
export const PLUGIN_ID = "local-quiz-generator";

/**
 * Backup metadata containing information about when and why
 * the backup was created.
 *
 * Requirements: 7.2
 */
export interface BackupMetadata {
	/** ISO timestamp when backup was created */
	createdAt: string;

	/** Unix timestamp in milliseconds */
	timestamp: number;

	/** Version of the plugin when backup was created */
	pluginVersion: string;

	/** Reason for creating the backup */
	reason: BackupReason;

	/** Optional description or notes about the backup */
	description?: string;
}

/**
 * Reasons why a backup might be created.
 */
export type BackupReason =
	| "migration"
	| "manual"
	| "pre-update"
	| "recovery";

/**
 * Complete backup structure containing both metadata and settings data.
 *
 * Requirements: 7.2
 */
export interface SettingsBackup {
	/** Backup metadata */
	metadata: BackupMetadata;

	/** The actual settings data at the time of backup */
	settings: QuizSettings;
}

/**
 * Result of a backup creation operation.
 */
export interface BackupResult {
	/** Whether the backup was created successfully */
	success: boolean;

	/** Path to the backup file (if successful) */
	backupPath?: string;

	/** The backup data that was saved (if successful) */
	backup?: SettingsBackup;

	/** Error message if backup failed */
	error?: string;
}

/**
 * Result of a backup restoration operation.
 *
 * Requirements: 7.4
 */
export interface RestoreResult {
	/** Whether restoration was successful */
	success: boolean;

	/** The restored settings (if successful) */
	settings?: QuizSettings;

	/** Error message if restoration failed */
	error?: string;
}

/**
 * Information about an available backup file.
 */
export interface BackupInfo {
	/** Full path to the backup file */
	path: string;

	/** File name only */
	filename: string;

	/** Timestamp extracted from filename */
	timestamp: number;

	/** Parsed backup metadata (if available) */
	metadata?: BackupMetadata;
}

/**
 * Type guard to check if an object is valid BackupMetadata.
 */
export function isBackupMetadata(obj: unknown): obj is BackupMetadata {
	if (obj === null || typeof obj !== "object") {
		return false;
	}
	const meta = obj as Record<string, unknown>;
	return (
		typeof meta.createdAt === "string" &&
		typeof meta.timestamp === "number" &&
		typeof meta.pluginVersion === "string" &&
		typeof meta.reason === "string" &&
		["migration", "manual", "pre-update", "recovery"].includes(meta.reason as string)
	);
}

/**
 * Type guard to check if an object is a valid SettingsBackup.
 */
export function isSettingsBackup(obj: unknown): obj is SettingsBackup {
	if (obj === null || typeof obj !== "object") {
		return false;
	}
	const backup = obj as Record<string, unknown>;
	return (
		isBackupMetadata(backup.metadata) &&
		backup.settings !== null &&
		typeof backup.settings === "object"
	);
}

/**
 * Generate a unique backup filename based on current timestamp.
 *
 * @returns Backup filename in format: settings-backup-{timestamp}.json
 */
export function generateBackupFilename(): string {
	const timestamp = Date.now();
	return `${BACKUP_FILE_PREFIX}${timestamp}${BACKUP_FILE_EXTENSION}`;
}

/**
 * Extract timestamp from a backup filename.
 *
 * @param filename - The backup filename to parse
 * @returns The timestamp, or null if filename is not a valid backup filename
 */
export function extractTimestampFromFilename(filename: string): number | null {
	// Match pattern: settings-backup-{timestamp}.json
	const match = filename.match(/^settings-backup-(\d+)\.json$/);
	if (!match) {
		return null;
	}
	const timestamp = parseInt(match[1], 10);
	return isNaN(timestamp) ? null : timestamp;
}

/**
 * Format a timestamp as a human-readable date string.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date string
 */
export function formatBackupTimestamp(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleString();
}

/**
 * Service for managing settings backups.
 *
 * Provides methods to create, restore, list, and clean up backup files.
 * Backups are stored in the plugin's data directory under the `backups/` folder.
 *
 * Requirements: 7.2, 7.4
 */
export class BackupService {
	private readonly app: App;
	private readonly pluginVersion: string;

	/**
	 * Create a new BackupService instance.
	 *
	 * @param app - The Obsidian App instance
	 * @param pluginVersion - Current plugin version string
	 */
	constructor(app: App, pluginVersion: string = "1.0.0") {
		this.app = app;
		this.pluginVersion = pluginVersion;
	}

	/**
	 * Get the plugin data directory path.
	 *
	 * @returns Path to the plugin's data directory
	 */
	private getPluginDataPath(): string {
		const pluginDir =
			(this.app as any).plugins?.manifests?.[PLUGIN_ID]?.dir || PLUGIN_ID;
		return normalizePath(`${this.app.vault.configDir}/plugins/${pluginDir}`);
	}

	/**
	 * Get the backup directory path.
	 *
	 * @returns Full path to the backups directory
	 */
	private getBackupDirectoryPath(): string {
		return normalizePath(`${this.getPluginDataPath()}/${BACKUP_DIRECTORY}`);
	}

	/**
	 * Ensure the backup directory exists, creating it if necessary.
	 *
	 * @throws Error if directory cannot be created
	 */
	private async ensureBackupDirectoryExists(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const backupDir = this.getBackupDirectoryPath();

		const exists = await adapter.exists(backupDir);
		if (!exists) {
			await adapter.mkdir(backupDir);
		}
	}

	/**
	 * Create a backup of the current settings.
	 *
	 * Creates a timestamped JSON file containing the settings data and metadata.
	 * The backup is stored in the `backups/` directory within the plugin folder.
	 *
	 * @param settings - The settings object to backup
	 * @param reason - The reason for creating this backup
	 * @param description - Optional description for the backup
	 * @returns Result containing success status and backup details
	 *
	 * Requirements: 7.2
	 */
	async createBackup(
		settings: QuizSettings,
		reason: BackupReason = "migration",
		description?: string
	): Promise<BackupResult> {
		try {
			// Ensure backup directory exists
			await this.ensureBackupDirectoryExists();

			// Create backup metadata
			const now = Date.now();
			const metadata: BackupMetadata = {
				createdAt: new Date(now).toISOString(),
				timestamp: now,
				pluginVersion: this.pluginVersion,
				reason,
				description,
			};

			// Create the backup object
			const backup: SettingsBackup = {
				metadata,
				settings: this.deepCloneSettings(settings),
			};

			// Generate filename and path
			const filename = generateBackupFilename();
			const backupPath = normalizePath(
				`${this.getBackupDirectoryPath()}/${filename}`
			);

			// Serialize and write to file
			const content = JSON.stringify(backup, null, 2);
			await this.app.vault.adapter.write(backupPath, content);

			// Clean up old backups if we exceed the maximum
			await this.cleanupOldBackups();

			return {
				success: true,
				backupPath,
				backup,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error("[BackupService] Failed to create backup:", error);
			return {
				success: false,
				error: `Failed to create backup: ${errorMessage}`,
			};
		}
	}

	/**
	 * Restore settings from a backup file.
	 *
	 * Reads and validates the backup file, returning the settings if valid.
	 * Does not automatically apply the settings - that's up to the caller.
	 *
	 * @param backupPath - Full path to the backup file
	 * @returns Result containing success status and restored settings
	 *
	 * Requirements: 7.4
	 */
	async restoreFromBackup(backupPath: string): Promise<RestoreResult> {
		try {
			const adapter = this.app.vault.adapter;

			// Check if backup file exists
			const exists = await adapter.exists(backupPath);
			if (!exists) {
				return {
					success: false,
					error: `Backup file not found: ${backupPath}`,
				};
			}

			// Read and parse the backup file
			const content = await adapter.read(backupPath);
			const backup = JSON.parse(content);

			// Validate backup structure
			if (!isSettingsBackup(backup)) {
				return {
					success: false,
					error: "Invalid backup file format: missing or invalid metadata or settings",
				};
			}

			return {
				success: true,
				settings: backup.settings,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error("[BackupService] Failed to restore from backup:", error);
			return {
				success: false,
				error: `Failed to restore from backup: ${errorMessage}`,
			};
		}
	}

	/**
	 * List all available backups, sorted by timestamp (newest first).
	 *
	 * @returns Array of backup information objects
	 */
	async listBackups(): Promise<BackupInfo[]> {
		try {
			const adapter = this.app.vault.adapter;
			const backupDir = this.getBackupDirectoryPath();

			// Check if backup directory exists
			const exists = await adapter.exists(backupDir);
			if (!exists) {
				return [];
			}

			// List all files in backup directory
			const files = await adapter.list(backupDir);
			const backups: BackupInfo[] = [];

			for (const filename of files.files) {
				// Extract just the filename from the path
				const basename = filename.split("/").pop() || filename;
				const timestamp = extractTimestampFromFilename(basename);

				if (timestamp !== null) {
					const fullPath = normalizePath(`${backupDir}/${basename}`);
					backups.push({
						path: fullPath,
						filename: basename,
						timestamp,
					});
				}
			}

			// Sort by timestamp (newest first)
			backups.sort((a, b) => b.timestamp - a.timestamp);

			return backups;
		} catch (error) {
			console.error("[BackupService] Failed to list backups:", error);
			return [];
		}
	}

	/**
	 * Get the most recent backup.
	 *
	 * @returns The most recent backup info, or null if no backups exist
	 */
	async getMostRecentBackup(): Promise<BackupInfo | null> {
		const backups = await this.listBackups();
		return backups.length > 0 ? backups[0] : null;
	}

	/**
	 * Delete a specific backup file.
	 *
	 * @param backupPath - Full path to the backup file to delete
	 * @returns True if deletion was successful, false otherwise
	 */
	async deleteBackup(backupPath: string): Promise<boolean> {
		try {
			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(backupPath);
			if (!exists) {
				return false;
			}

			await adapter.remove(backupPath);
			return true;
		} catch (error) {
			console.error("[BackupService] Failed to delete backup:", error);
			return false;
		}
	}

	/**
	 * Clean up old backups, keeping only the most recent ones.
	 *
	 * @param maxCount - Maximum number of backups to keep (defaults to MAX_BACKUP_COUNT)
	 * @returns Number of backups deleted
	 */
	async cleanupOldBackups(maxCount: number = MAX_BACKUP_COUNT): Promise<number> {
		try {
			const backups = await this.listBackups();

			if (backups.length <= maxCount) {
				return 0;
			}

			// Delete the oldest backups (list is already sorted newest first)
			const backupsToDelete = backups.slice(maxCount);
			let deletedCount = 0;

			for (const backup of backupsToDelete) {
				const deleted = await this.deleteBackup(backup.path);
				if (deleted) {
					deletedCount++;
				}
			}

			return deletedCount;
		} catch (error) {
			console.error("[BackupService] Failed to cleanup old backups:", error);
			return 0;
		}
	}

	/**
	 * Create a deep clone of settings to ensure backup is isolated.
	 *
	 * @param settings - Settings object to clone
	 * @returns Deep clone of the settings
	 */
	private deepCloneSettings(settings: QuizSettings): QuizSettings {
		return JSON.parse(JSON.stringify(settings));
	}
}

/**
 * Validation error details for backup restoration.
 */
export interface BackupValidationError {
	/** Error code for programmatic handling */
	code: BackupValidationErrorCode;

	/** Human-readable error message */
	message: string;

	/** Additional details about the error */
	details?: string;
}

/**
 * Error codes for backup validation failures.
 */
export type BackupValidationErrorCode =
	| "INVALID_BACKUP_OBJECT"
	| "MISSING_METADATA"
	| "INVALID_METADATA"
	| "MISSING_SETTINGS"
	| "INVALID_SETTINGS"
	| "SETTINGS_NULL"
	| "METADATA_TIMESTAMP_INVALID"
	| "METADATA_VERSION_MISSING";

/**
 * Result of validating a backup before restoration.
 */
export interface BackupValidationResult {
	/** Whether the backup is valid and can be restored */
	valid: boolean;

	/** Validation errors if any */
	errors: BackupValidationError[];

	/** Warnings that don't prevent restoration but should be noted */
	warnings: string[];
}

/**
 * Validates a backup object thoroughly before restoration.
 *
 * Performs deeper validation than the basic type guard, checking:
 * - Backup object structure
 * - Metadata completeness and validity
 * - Settings object integrity
 *
 * @param backup - The backup object to validate
 * @returns Validation result with errors and warnings
 *
 * Requirements: 7.4
 */
export function validateBackupForRestoration(backup: unknown): BackupValidationResult {
	const errors: BackupValidationError[] = [];
	const warnings: string[] = [];

	// Check if backup is a valid object
	if (backup === null || backup === undefined) {
		errors.push({
			code: "INVALID_BACKUP_OBJECT",
			message: "Backup is null or undefined",
		});
		return { valid: false, errors, warnings };
	}

	if (typeof backup !== "object" || Array.isArray(backup)) {
		errors.push({
			code: "INVALID_BACKUP_OBJECT",
			message: `Backup must be an object, received ${Array.isArray(backup) ? "array" : typeof backup}`,
		});
		return { valid: false, errors, warnings };
	}

	const backupObj = backup as Record<string, unknown>;

	// Validate metadata
	if (!("metadata" in backupObj) || backupObj.metadata === undefined) {
		errors.push({
			code: "MISSING_METADATA",
			message: "Backup is missing metadata field",
		});
	} else if (!isBackupMetadata(backupObj.metadata)) {
		errors.push({
			code: "INVALID_METADATA",
			message: "Backup metadata is invalid or incomplete",
			details: "Metadata must include createdAt, timestamp, pluginVersion, and a valid reason",
		});
	} else {
		// Additional metadata validations
		const metadata = backupObj.metadata as BackupMetadata;

		// Check timestamp is reasonable (not in the future, not too old)
		const now = Date.now();
		if (metadata.timestamp > now + 60000) {
			// Allow 1 minute clock skew
			warnings.push(
				`Backup timestamp (${new Date(metadata.timestamp).toISOString()}) is in the future`
			);
		}

		// Very old backups (more than 1 year) get a warning
		const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
		if (metadata.timestamp < oneYearAgo) {
			warnings.push(
				`Backup is very old (created ${new Date(metadata.timestamp).toISOString()})`
			);
		}

		// Check plugin version format (should be semver-like)
		if (!/^\d+\.\d+\.\d+/.test(metadata.pluginVersion)) {
			warnings.push(
				`Plugin version "${metadata.pluginVersion}" may not be in standard format`
			);
		}
	}

	// Validate settings
	if (!("settings" in backupObj) || backupObj.settings === undefined) {
		errors.push({
			code: "MISSING_SETTINGS",
			message: "Backup is missing settings field",
		});
	} else if (backupObj.settings === null) {
		errors.push({
			code: "SETTINGS_NULL",
			message: "Backup settings is null",
		});
	} else if (typeof backupObj.settings !== "object") {
		errors.push({
			code: "INVALID_SETTINGS",
			message: `Backup settings must be an object, received ${typeof backupObj.settings}`,
		});
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Result of restoring settings from an in-memory backup object.
 */
export interface InMemoryRestoreResult {
	/** Whether restoration was successful */
	success: boolean;

	/** The restored settings (if successful) */
	settings?: QuizSettings;

	/** Error message if restoration failed */
	error?: string;

	/** Detailed validation errors if any */
	validationErrors?: BackupValidationError[];

	/** Warnings about the backup that don't prevent restoration */
	warnings?: string[];
}

/**
 * Restore settings from an in-memory backup object.
 *
 * This function validates and restores settings directly from a SettingsBackup
 * object, without needing to read from disk. Useful for migration rollback
 * scenarios where the backup is already in memory.
 *
 * @param backup - The backup object containing metadata and settings
 * @returns Result containing success status, restored settings, and any errors/warnings
 *
 * Requirements: 7.4
 */
export function restoreFromBackup(backup: SettingsBackup): InMemoryRestoreResult {
	// Validate the backup
	const validationResult = validateBackupForRestoration(backup);

	if (!validationResult.valid) {
		return {
			success: false,
			error: "Backup validation failed: " + validationResult.errors.map((e) => e.message).join("; "),
			validationErrors: validationResult.errors,
			warnings: validationResult.warnings,
		};
	}

	// Deep clone the settings to prevent any reference issues
	const restoredSettings = JSON.parse(JSON.stringify(backup.settings)) as QuizSettings;

	return {
		success: true,
		settings: restoredSettings,
		warnings: validationResult.warnings.length > 0 ? validationResult.warnings : undefined,
	};
}

/**
 * Safely restore settings from an unknown object that might be a backup.
 *
 * This is a safer version of restoreFromBackup that handles unknown input
 * and provides detailed error information. Use this when the backup source
 * is not guaranteed to be a valid SettingsBackup object.
 *
 * @param maybeBackup - An object that might be a valid backup
 * @returns Result containing success status, restored settings, and any errors/warnings
 *
 * Requirements: 7.4
 */
export function safeRestoreFromBackup(maybeBackup: unknown): InMemoryRestoreResult {
	// Validate the backup
	const validationResult = validateBackupForRestoration(maybeBackup);

	if (!validationResult.valid) {
		return {
			success: false,
			error: "Backup validation failed: " + validationResult.errors.map((e) => e.message).join("; "),
			validationErrors: validationResult.errors,
			warnings: validationResult.warnings,
		};
	}

	// At this point, validation passed so we can safely cast
	const backup = maybeBackup as SettingsBackup;

	// Deep clone the settings to prevent any reference issues
	const restoredSettings = JSON.parse(JSON.stringify(backup.settings)) as QuizSettings;

	return {
		success: true,
		settings: restoredSettings,
		warnings: validationResult.warnings.length > 0 ? validationResult.warnings : undefined,
	};
}

/**
 * Create a backup of settings using a temporary BackupService instance.
 *
 * This is a convenience function for one-off backup creation.
 *
 * @param app - The Obsidian App instance
 * @param settings - The settings to backup
 * @param reason - Reason for the backup
 * @param pluginVersion - Current plugin version
 * @returns BackupResult
 *
 * Requirements: 7.2
 */
export async function createBackup(
	app: App,
	settings: QuizSettings,
	reason: BackupReason = "migration",
	pluginVersion: string = "1.0.0"
): Promise<BackupResult> {
	const service = new BackupService(app, pluginVersion);
	return service.createBackup(settings, reason);
}

/**
 * Restore settings from the most recent backup.
 *
 * This is a convenience function for quick restoration.
 *
 * @param app - The Obsidian App instance
 * @returns RestoreResult with settings from the most recent backup
 *
 * Requirements: 7.4
 */
export async function restoreFromLatestBackup(app: App): Promise<RestoreResult> {
	const service = new BackupService(app);
	const latestBackup = await service.getMostRecentBackup();

	if (!latestBackup) {
		return {
			success: false,
			error: "No backups found",
		};
	}

	return service.restoreFromBackup(latestBackup.path);
}
