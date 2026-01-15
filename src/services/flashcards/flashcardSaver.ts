import { App, normalizePath, Notice, TFile, TFolder } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { Flashcard } from "../../utils/types";
import {
	FlashcardSaveFormat,
	FLASHCARD_STORAGE,
	DEFAULT_FLASHCARD_SETTINGS,
} from "../../settings/flashcards/flashcardConfig";
import FolderOrganizer from "./folderOrganizer";

/**
 * FlashcardSaver handles saving flashcards to markdown files
 * Implements requirements: 3.1, 3.2, 7.1, 7.2, 7.4, 7.5
 *
 * Supports two save formats:
 * 1. Callout format - Obsidian-style callouts for front/back/hint
 * 2. Spaced Repetition format - Inline format with :: separator
 */
export default class FlashcardSaver {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly sourceFiles: TFile[];
	private readonly saveFilePath: string;
	private readonly validSavePath: boolean;
	private readonly folderOrganizer: FolderOrganizer;
	private readonly useDedicatedFolder: boolean;

	/**
	 * Creates a new FlashcardSaver instance
	 * @param app - Obsidian App instance
	 * @param settings - Plugin settings
	 * @param sourceFiles - Source files that flashcards were generated from
	 * @param deckName - Optional deck name for deck-based organization
	 */
	constructor(app: App, settings: QuizSettings, sourceFiles: TFile[], deckName?: string) {
		this.app = app;
		this.settings = settings;
		this.sourceFiles = sourceFiles;
		this.folderOrganizer = new FolderOrganizer(app, settings);

		// Determine if we should use the dedicated folder system
		const flashcardSettings = settings.flashcardSettings || DEFAULT_FLASHCARD_SETTINGS;
		const dedicatedFolder = (flashcardSettings as any).dedicatedFolder;
		this.useDedicatedFolder = dedicatedFolder && dedicatedFolder.trim() !== "";

		if (this.useDedicatedFolder) {
			// Use FolderOrganizer for path determination
			const sourcePath = sourceFiles[0]?.path || "";
			this.saveFilePath = this.getSaveFilePathWithOrganizer(sourcePath, deckName);
		} else {
			// Fall back to legacy path determination
			this.saveFilePath = this.getSaveFilePath();
		}

		this.validSavePath = this.isValidSavePath();
	}

	/**
	 * Check if the configured save path is valid
	 * @returns True if path exists as a folder or is root
	 */
	private isValidSavePath(): boolean {
		const savePath = this.settings.flashcardSettings?.savePath ||
			DEFAULT_FLASHCARD_SETTINGS.savePath;
		if (!savePath || savePath === "/") {
			return true;
		}
		return this.app.vault.getAbstractFileByPath(savePath) instanceof TFolder;
	}

	/**
	 * Ensure the save folder exists, creating it if necessary
	 * Handles nested folder paths by creating parent directories
	 * @param folderPath - The folder path to ensure exists
	 */
	private async ensureFolderExists(folderPath: string): Promise<void> {
		if (!folderPath || folderPath === "/") {
			return;
		}

		const normalizedPath = normalizePath(folderPath);
		const existingFolder = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (existingFolder instanceof TFolder) {
			return;
		}

		// Create the folder (Obsidian's createFolder handles nested paths)
		try {
			await this.app.vault.createFolder(normalizedPath);
		} catch (error) {
			// Folder might already exist if created by another process
			const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (!(folder instanceof TFolder)) {
				throw error;
			}
		}
	}

	/**
	 * Save a single flashcard to the save file
	 * Appends the flashcard to the file in the configured format
	 * @param flashcard - The flashcard to save
	 */
	public async saveFlashcard(flashcard: Flashcard): Promise<void> {
		// Ensure save folder exists before saving
		if (this.useDedicatedFolder) {
			// Use FolderOrganizer for folder creation
			const folderPath = this.getParentPath(this.saveFilePath);
			await this.folderOrganizer.ensureFolderExists(folderPath);
		} else {
			// Legacy folder creation
			const savePath = this.settings.flashcardSettings?.savePath ||
				DEFAULT_FLASHCARD_SETTINGS.savePath;
			await this.ensureFolderExists(savePath);
		}

		const saveFile = await this.getSaveFile();

		const flashcardFormat =
			this.settings.flashcardSettings?.saveFormat ||
			DEFAULT_FLASHCARD_SETTINGS.saveFormat;

		if (flashcardFormat === FlashcardSaveFormat.SPACED_REPETITION) {
			await this.app.vault.append(
				saveFile,
				this.formatAsSpacedRepetition(flashcard)
			);
		} else {
			await this.app.vault.append(saveFile, this.formatAsCallout(flashcard));
		}

		if (this.validSavePath) {
			new Notice("Flashcard saved");
		} else {
			new Notice("Invalid save path: Flashcard saved in vault root folder");
		}
	}

	/**
	 * Save multiple flashcards to the save file
	 * Appends all flashcards to the file in the configured format
	 * @param flashcards - Array of flashcards to save
	 */
	public async saveFlashcards(flashcards: Flashcard[]): Promise<void> {
		if (flashcards.length === 0) return;

		// Ensure save folder exists before saving
		if (this.useDedicatedFolder) {
			// Use FolderOrganizer for folder creation
			const folderPath = this.getParentPath(this.saveFilePath);
			await this.folderOrganizer.ensureFolderExists(folderPath);
		} else {
			// Legacy folder creation
			const savePath = this.settings.flashcardSettings?.savePath ||
				DEFAULT_FLASHCARD_SETTINGS.savePath;
			await this.ensureFolderExists(savePath);
		}

		const flashcardContents: string[] = [];
		const flashcardFormat =
			this.settings.flashcardSettings?.saveFormat ||
			DEFAULT_FLASHCARD_SETTINGS.saveFormat;

		for (const flashcard of flashcards) {
			if (flashcardFormat === FlashcardSaveFormat.SPACED_REPETITION) {
				flashcardContents.push(this.formatAsSpacedRepetition(flashcard));
			} else {
				flashcardContents.push(this.formatAsCallout(flashcard));
			}
		}

		const saveFile = await this.getSaveFile();
		await this.app.vault.append(saveFile, flashcardContents.join(""));

		if (this.validSavePath) {
			new Notice(`${flashcards.length} flashcards saved`);
		} else {
			new Notice(
				`Invalid save path: ${flashcards.length} flashcards saved in vault root folder`
			);
		}
	}

	/**
	 * Format flashcard as Obsidian callout
	 * Preserves tables, images, code blocks, and other markdown elements
	 *
	 * Format:
	 * > [!flashcard] Front content
	 * >> [!answer]-
	 * >> Back content
	 * >>
	 * >> [!hint]- (if hint exists)
	 * >> Hint content
	 * <!--fc-id: card-id--><!--fc-flagged: true/false-->
	 *
	 * @param flashcard - The flashcard to format
	 * @returns Formatted markdown string
	 */
	private formatAsCallout(flashcard: Flashcard): string {
		let output = "";

		// Format front (question/prompt)
		const frontLines = flashcard.front.trim().split("\n");
		output += `> [!flashcard] ${frontLines[0]}\n`;

		// Add additional front lines if multiline question
		for (let i = 1; i < frontLines.length; i++) {
			output += `> ${frontLines[i]}\n`;
		}

		// Format back (answer/explanation) in collapsible callout
		output += `>> [!answer]-\n`;
		const backLines = flashcard.back.trim().split("\n");
		for (const line of backLines) {
			output += `>> ${line}\n`;
		}

		// Add hint if present
		if (flashcard.hint && flashcard.hint.trim().length > 0) {
			output += `>>\n`;
			output += `>> [!hint]-\n`;
			const hintLines = flashcard.hint.trim().split("\n");
			for (const line of hintLines) {
				output += `>> ${line}\n`;
			}
		}

		// Add metadata as HTML comments for parsing later
		output += `<!--fc-id:${flashcard.id}-->`;
		if (flashcard.flagged) {
			output += `<!--fc-flagged:true-->`;
		}

		output += "\n";
		return output;
	}

	/**
	 * Format flashcard for spaced repetition inline format
	 * Uses :: separator between front and back
	 *
	 * Format for single line:
	 * **Flashcard:** Front content :: Back content <!--fc-id:id--><!--fc-flagged:true-->
	 *
	 * Format for multiline:
	 * **Flashcard:** Front content
	 * ??
	 * Back content
	 * <!--fc-id:id--><!--fc-flagged:true-->
	 *
	 * @param flashcard - The flashcard to format
	 * @returns Formatted markdown string
	 */
	private formatAsSpacedRepetition(flashcard: Flashcard): string {
		const separator =
			this.settings.flashcardSettings?.inlineSeparator ||
			DEFAULT_FLASHCARD_SETTINGS.inlineSeparator;

		const front = flashcard.front.trim();
		const back = flashcard.back.trim();

		// Determine if content should be inline or multiline
		// Use multiline format if either front or back contains newlines or tables
		const isMultiline =
			front.includes("\n") ||
			back.includes("\n") ||
			this.containsTable(front) ||
			this.containsTable(back);

		// Build metadata comments
		let metadata = `<!--fc-id:${flashcard.id}-->`;
		if (flashcard.flagged) {
			metadata += `<!--fc-flagged:true-->`;
		}

		if (isMultiline) {
			let output = `**Flashcard:** ${front}\n`;
			output += `??\n`;
			output += `${back}\n`;

			// Add hint if present
			if (flashcard.hint && flashcard.hint.trim().length > 0) {
				output += `<!--Hint: ${flashcard.hint.trim()}-->\n`;
			}

			// Add metadata
			output += metadata;
			output += "\n\n";
			return output;
		} else {
			// Inline format for simple flashcards
			let output = `**Flashcard:** ${front} ${separator} ${back}`;

			// Add hint as comment if present
			if (flashcard.hint && flashcard.hint.trim().length > 0) {
				output += ` <!--Hint: ${flashcard.hint.trim()}-->`;
			}

			// Add metadata
			output += metadata;
			output += "\n\n";
			return output;
		}
	}

	/**
	 * Check if content contains a markdown table
	 * @param content - The content to check
	 * @returns True if content contains a table
	 */
	private containsTable(content: string): boolean {
		// Check for markdown table pattern: lines with pipes
		const lines = content.split("\n");
		let pipeLineCount = 0;

		for (const line of lines) {
			const trimmedLine = line.trim();
			// A table line contains at least one pipe that's not at the start/end only
			if (
				trimmedLine.includes("|") &&
				trimmedLine.indexOf("|") !== trimmedLine.lastIndexOf("|")
			) {
				pipeLineCount++;
			}
		}

		// A valid table has at least 2 lines with pipes (header + separator or header + data)
		return pipeLineCount >= 2;
	}

	/**
	 * Generate the save file path using FolderOrganizer
	 * Uses the organization scheme to determine the folder structure
	 * @param sourcePath - Path to the source note
	 * @param deckName - Optional deck name for deck-based organization
	 * @returns Normalized file path
	 */
	private getSaveFilePathWithOrganizer(sourcePath: string, deckName?: string): string {
		// Get the folder path from FolderOrganizer
		const folderPath = this.folderOrganizer.getFlashcardPath(sourcePath, deckName);

		// Get existing files in the target folder
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		const fileNames = folder instanceof TFolder
			? this.getFileNames(folder)
			: [];

		// Generate unique filename
		let count = 1;
		while (fileNames.includes(`${FLASHCARD_STORAGE.FILE_PREFIX}${count}.md`)) {
			count++;
		}

		const filename = `${FLASHCARD_STORAGE.FILE_PREFIX}${count}.md`;
		return normalizePath(`${folderPath}/${filename}`);
	}

	/**
	 * Generate the save file path (legacy method)
	 * Creates a unique filename by incrementing a counter
	 * @returns Normalized file path
	 */
	private getSaveFilePath(): string {
		let count = 1;
		const saveFolder = this.app.vault.getAbstractFileByPath(
			this.settings.savePath
		);
		const validSavePath = saveFolder instanceof TFolder;
		const fileNames = validSavePath
			? this.getFileNames(saveFolder)
			: this.getFileNames(this.app.vault.getRoot());

		while (fileNames.includes(`${FLASHCARD_STORAGE.FILE_PREFIX}${count}.md`)) {
			count++;
		}

		const filename = `${FLASHCARD_STORAGE.FILE_PREFIX}${count}.md`;
		return validSavePath
			? normalizePath(`${this.settings.savePath}/${filename}`)
			: filename;
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
	 * Get all flashcard file names in a folder
	 * @param folder - The folder to search
	 * @returns Array of lowercase filenames
	 */
	private getFileNames(folder: TFolder): string[] {
		return folder.children
			.filter((file) => file instanceof TFile)
			.map((file) => file.name.toLowerCase())
			.filter((name) => name.startsWith(FLASHCARD_STORAGE.FILE_PREFIX));
	}

	/**
	 * Get or create the save file with frontmatter
	 * Creates the file with appropriate tags and source references
	 * @returns The save file
	 */
	private async getSaveFile(): Promise<TFile> {
		const flashcardMaterialProperty =
			this.settings.flashcardSettings?.flashcardMaterialProperty ||
			DEFAULT_FLASHCARD_SETTINGS.flashcardMaterialProperty;

		// Build frontmatter with source references
		const sourcesProperty = flashcardMaterialProperty
			? `${flashcardMaterialProperty}:\n${this.sourceFiles
					.map(
						(source) =>
							`  - "${this.app.fileManager.generateMarkdownLink(source, this.saveFilePath)}"`
					)
					.join("\n")}\n`
			: "";

		const flashcardFormat =
			this.settings.flashcardSettings?.saveFormat ||
			DEFAULT_FLASHCARD_SETTINGS.saveFormat;

		// Create initial content with frontmatter
		const initialContent =
			flashcardFormat === FlashcardSaveFormat.SPACED_REPETITION
				? `---\ntags:\n  - flashcards\n${sourcesProperty}---\n`
				: sourcesProperty
					? `---\n${sourcesProperty}---\n`
					: "";

		// Get or create the file
		const saveFile = this.app.vault.getAbstractFileByPath(this.saveFilePath);
		return saveFile instanceof TFile
			? saveFile
			: await this.app.vault.create(this.saveFilePath, initialContent);
	}
}
