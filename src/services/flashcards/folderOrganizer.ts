import { App, normalizePath, TFile, TFolder, Notice } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { DEFAULT_FLASHCARD_SETTINGS } from "../../settings/flashcards/flashcardConfig";
import MetadataStorage from "./metadataStorage";

/**
 * Organization schemes for flashcard files
 */
export type OrganizationScheme = "flat" | "mirror" | "deck-based";

/**
 * Configuration for FolderOrganizer
 */
export interface FolderOrganizerConfig {
	/** Base path for flashcard storage (default: "Flashcards/") */
	basePath: string;
	/** How to organize flashcard files within the base path */
	organizationScheme: OrganizationScheme;
	/** Whether to create subfolders based on scheme */
	createSubfolders: boolean;
	/** Whether to auto-migrate when settings change */
	migrateExisting: boolean;
}

/**
 * Result of a migration operation
 */
export interface MigrationResult {
	/** Number of files successfully migrated */
	success: number;
	/** Number of files that failed to migrate */
	failed: number;
	/** Error messages for failed migrations */
	errors: string[];
	/** Files that were migrated */
	migratedFiles: Array<{ oldPath: string; newPath: string }>;
}

/**
 * FolderOrganizer manages flashcard file organization with dedicated folder support.
 * Implements requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 *
 * Features:
 * - Configurable base folder for all flashcards
 * - Multiple organization schemes (flat, mirror, deck-based)
 * - Automatic folder creation
 * - Migration of existing flashcards
 * - Reference updating when source notes move
 */
export default class FolderOrganizer {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly metadataStorage: MetadataStorage;

	constructor(app: App, settings: QuizSettings) {
		this.app = app;
		this.settings = settings;
		this.metadataStorage = new MetadataStorage(app);
	}

	/**
	 * Get the configuration for folder organization
	 * @returns Current folder organizer configuration
	 */
	getConfig(): FolderOrganizerConfig {
		const flashcardSettings = this.settings.flashcardSettings || DEFAULT_FLASHCARD_SETTINGS;

		return {
			basePath: (flashcardSettings as any).dedicatedFolder || "Flashcards",
			organizationScheme: (flashcardSettings as any).organizationScheme || "flat",
			createSubfolders: true,
			migrateExisting: (flashcardSettings as any).autoMigrateOnChange || false,
		};
	}

	/**
	 * Get destination path for a new flashcard file
	 *
	 * Organization schemes:
	 * - flat: All flashcards in base folder (e.g., Flashcards/flashcards-1.md)
	 * - mirror: Mirror source note's folder structure (e.g., Flashcards/Notes/Chapter1/flashcards-1.md)
	 * - deck-based: Organize by deck name (e.g., Flashcards/My Deck/flashcards-1.md)
	 *
	 * @param sourcePath - Path to the source note
	 * @param deckName - Optional deck name for deck-based organization
	 * @returns Normalized path for the flashcard file
	 */
	getFlashcardPath(sourcePath: string, deckName?: string): string {
		const config = this.getConfig();
		const basePath = normalizePath(config.basePath);

		let subPath = "";

		switch (config.organizationScheme) {
			case "flat":
				// All flashcards in base folder
				subPath = "";
				break;

			case "mirror":
				// Mirror the source note's folder structure
				if (sourcePath) {
					const sourceDir = this.getParentPath(sourcePath);
					if (sourceDir) {
						subPath = sourceDir;
					}
				}
				break;

			case "deck-based":
				// Organize by deck name
				if (deckName) {
					// Sanitize deck name for use as folder name
					subPath = this.sanitizeFolderName(deckName);
				}
				break;

			default:
				// Default to flat
				subPath = "";
		}

		// Combine base path with sub path
		const fullPath = subPath
			? normalizePath(`${basePath}/${subPath}`)
			: basePath;

		return fullPath;
	}

	/**
	 * Generate a unique filename for a new flashcard file
	 * @param folderPath - The folder where the file will be saved
	 * @param prefix - Filename prefix (default: "flashcards-")
	 * @returns Unique filename with .md extension
	 */
	async generateFilename(folderPath: string, prefix: string = "flashcards-"): Promise<string> {
		const normalizedPath = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

		const existingFiles: string[] = [];

		if (folder instanceof TFolder) {
			for (const child of folder.children) {
				if (child instanceof TFile && child.name.toLowerCase().startsWith(prefix)) {
					existingFiles.push(child.name.toLowerCase());
				}
			}
		}

		let count = 1;
		while (existingFiles.includes(`${prefix}${count}.md`)) {
			count++;
		}

		return `${prefix}${count}.md`;
	}

	/**
	 * Ensure a folder exists, creating it recursively if necessary
	 *
	 * @param folderPath - The folder path to ensure exists
	 * @throws Error if folder creation fails
	 */
	async ensureFolderExists(folderPath: string): Promise<void> {
		if (!folderPath || folderPath === "/" || folderPath === "") {
			return;
		}

		const normalizedPath = normalizePath(folderPath);
		const existingFolder = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (existingFolder instanceof TFolder) {
			return;
		}

		// Check if a file exists at this path
		if (existingFolder instanceof TFile) {
			throw new Error(`Cannot create folder at ${normalizedPath}: a file exists at this path`);
		}

		// Create the folder recursively
		try {
			await this.app.vault.createFolder(normalizedPath);
		} catch (error) {
			// Folder might have been created by another process
			const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (!(folder instanceof TFolder)) {
				throw new Error(`Failed to create folder ${normalizedPath}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	/**
	 * Migrate flashcard files from one location to another
	 *
	 * @param oldPath - Source path or folder
	 * @param newPath - Destination folder
	 * @returns Migration result with success/failure counts
	 */
	async migrateFlashcards(oldPath: string, newPath: string): Promise<MigrationResult> {
		const result: MigrationResult = {
			success: 0,
			failed: 0,
			errors: [],
			migratedFiles: [],
		};

		const normalizedOldPath = normalizePath(oldPath);
		const normalizedNewPath = normalizePath(newPath);

		// Ensure destination folder exists
		await this.ensureFolderExists(normalizedNewPath);

		// Get files to migrate
		const filesToMigrate = await this.getFlashcardFiles(normalizedOldPath);

		if (filesToMigrate.length === 0) {
			return result;
		}

		// Migrate each file
		for (const file of filesToMigrate) {
			try {
				const newFilePath = normalizePath(`${normalizedNewPath}/${file.name}`);

				// Check if file already exists at destination
				const existingFile = this.app.vault.getAbstractFileByPath(newFilePath);
				if (existingFile) {
					// Generate unique name
					const uniqueName = await this.generateUniqueFilename(normalizedNewPath, file.name);
					const uniquePath = normalizePath(`${normalizedNewPath}/${uniqueName}`);
					await this.app.vault.rename(file, uniquePath);
					result.migratedFiles.push({ oldPath: file.path, newPath: uniquePath });
				} else {
					await this.app.vault.rename(file, newFilePath);
					result.migratedFiles.push({ oldPath: file.path, newPath: newFilePath });
				}

				result.success++;
			} catch (error) {
				result.failed++;
				result.errors.push(`Failed to migrate ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		// Update metadata references
		if (result.migratedFiles.length > 0) {
			await this.updateMetadataReferences(result.migratedFiles);
		}

		return result;
	}

	/**
	 * Update flashcard file references when a source note is moved or renamed
	 *
	 * @param oldSourcePath - Original path of the source note
	 * @param newSourcePath - New path of the source note
	 */
	async updateReferences(oldSourcePath: string, newSourcePath: string): Promise<void> {
		const config = this.getConfig();

		// Only need to update if using mirror organization
		if (config.organizationScheme !== "mirror") {
			return;
		}

		const normalizedOldPath = normalizePath(oldSourcePath);
		const normalizedNewPath = normalizePath(newSourcePath);

		// Find flashcard files associated with the old source path
		const metadata = await this.metadataStorage.loadMetadata();
		const affectedDecks: string[] = [];

		for (const [deckId, deck] of metadata.decks) {
			// TODO(deck-interface): Add sourceNotePath to Deck interface in src/utils/types.ts
			// Currently uses type cast as workaround; interface only has sourceFolder
			if ((deck as any).sourceNotePath === normalizedOldPath) {
				affectedDecks.push(deckId);
				// Update the deck's source note path
				(deck as any).sourceNotePath = normalizedNewPath;
			}
		}

		if (affectedDecks.length === 0) {
			return;
		}

		// Save updated metadata
		await this.metadataStorage.saveMetadata(metadata);

		// Optionally migrate the flashcard files to match new organization
		if (config.migrateExisting) {
			const oldFlashcardPath = this.getFlashcardPath(normalizedOldPath);
			const newFlashcardPath = this.getFlashcardPath(normalizedNewPath);

			if (oldFlashcardPath !== newFlashcardPath) {
				const migrationResult = await this.migrateFlashcards(oldFlashcardPath, newFlashcardPath);

				if (migrationResult.failed > 0) {
					new Notice(`Warning: ${migrationResult.failed} flashcard files failed to migrate`);
				} else if (migrationResult.success > 0) {
					new Notice(`Migrated ${migrationResult.success} flashcard files to new location`);
				}
			}
		}
	}

	/**
	 * Get all flashcard files in a given path
	 * @param path - File or folder path to search
	 * @returns Array of flashcard files
	 */
	private async getFlashcardFiles(path: string): Promise<TFile[]> {
		const files: TFile[] = [];
		const abstractFile = this.app.vault.getAbstractFileByPath(path);

		if (abstractFile instanceof TFile) {
			// Single file
			if (this.isFlashcardFile(abstractFile)) {
				files.push(abstractFile);
			}
		} else if (abstractFile instanceof TFolder) {
			// Folder - get all flashcard files recursively
			this.collectFlashcardFiles(abstractFile, files);
		}

		return files;
	}

	/**
	 * Recursively collect flashcard files from a folder
	 * @param folder - Folder to search
	 * @param files - Array to collect files into
	 */
	private collectFlashcardFiles(folder: TFolder, files: TFile[]): void {
		for (const child of folder.children) {
			if (child instanceof TFile && this.isFlashcardFile(child)) {
				files.push(child);
			} else if (child instanceof TFolder) {
				this.collectFlashcardFiles(child, files);
			}
		}
	}

	/**
	 * Check if a file is a flashcard file
	 * @param file - File to check
	 * @returns True if the file is a flashcard file
	 */
	private isFlashcardFile(file: TFile): boolean {
		return file.extension === "md" && file.name.toLowerCase().startsWith("flashcards-");
	}

	/**
	 * Generate a unique filename if the original already exists
	 * @param folderPath - Destination folder
	 * @param originalName - Original filename
	 * @returns Unique filename
	 */
	private async generateUniqueFilename(folderPath: string, originalName: string): Promise<string> {
		const baseName = originalName.replace(/\.md$/i, "");
		let counter = 1;
		let newName = originalName;

		while (this.app.vault.getAbstractFileByPath(normalizePath(`${folderPath}/${newName}`))) {
			newName = `${baseName}-${counter}.md`;
			counter++;
		}

		return newName;
	}

	/**
	 * Update metadata references after file migration
	 * @param migratedFiles - Array of old/new path pairs
	 */
	private async updateMetadataReferences(migratedFiles: Array<{ oldPath: string; newPath: string }>): Promise<void> {
		const metadata = await this.metadataStorage.loadMetadata();
		const pathMap = new Map(migratedFiles.map(f => [f.oldPath, f.newPath]));

		let updated = false;

		for (const [, deck] of metadata.decks) {
			// TODO(deck-interface): Add filePath to Deck interface in src/utils/types.ts
			// Currently uses type cast as workaround; interface only has sourceFolder
			if ((deck as any).filePath && pathMap.has((deck as any).filePath)) {
				(deck as any).filePath = pathMap.get((deck as any).filePath)!;
				updated = true;
			}
		}

		if (updated) {
			await this.metadataStorage.saveMetadata(metadata);
		}
	}

	/**
	 * Get the parent folder path of a file path
	 * @param filePath - Full file path
	 * @returns Parent folder path or empty string
	 */
	private getParentPath(filePath: string): string {
		const lastSlash = filePath.lastIndexOf("/");
		return lastSlash > 0 ? filePath.substring(0, lastSlash) : "";
	}

	/**
	 * Sanitize a string for use as a folder name
	 * @param name - Original name
	 * @returns Sanitized folder name
	 */
	private sanitizeFolderName(name: string): string {
		// Remove or replace characters that are not allowed in folder names
		return name
			.replace(/[\\/:*?"<>|]/g, "-") // Replace invalid characters with dash
			.replace(/\s+/g, " ") // Normalize whitespace
			.replace(/^\.+/, "") // Remove leading dots
			.replace(/\.+$/, "") // Remove trailing dots
			.trim();
	}

	/**
	 * Check if the dedicated flashcard folder exists
	 * @returns True if the folder exists
	 */
	async dedicatedFolderExists(): Promise<boolean> {
		const config = this.getConfig();
		const basePath = normalizePath(config.basePath);
		const folder = this.app.vault.getAbstractFileByPath(basePath);
		return folder instanceof TFolder;
	}

	/**
	 * Get all flashcard files in the dedicated folder
	 * @returns Array of flashcard files
	 */
	async getAllFlashcardFiles(): Promise<TFile[]> {
		const config = this.getConfig();
		const basePath = normalizePath(config.basePath);
		return this.getFlashcardFiles(basePath);
	}

	/**
	 * Preview the destination path for a source note
	 * Useful for settings UI preview
	 *
	 * @param sourcePath - Path to source note
	 * @param deckName - Optional deck name
	 * @returns Preview path string
	 */
	previewPath(sourcePath: string, deckName?: string): string {
		const folderPath = this.getFlashcardPath(sourcePath, deckName);
		return `${folderPath}/flashcards-1.md`;
	}
}
