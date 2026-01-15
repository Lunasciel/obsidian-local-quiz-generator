import { App, getFrontMatterInfo, Modal, Notice, Scope, TAbstractFile, TFile, TFolder, Vault } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { Deck, Flashcard, Question, Quiz } from "../../utils/types";
import {
	isFillInTheBlank,
	isMatching,
	isMultipleChoice,
	isSelectAllThatApply,
	isShortOrLongAnswer,
	isTrueFalse
} from "../../utils/typeGuards";
import NoteAndFolderSelector from "./noteAndFolderSelector";
import NoteViewerModal from "./noteViewerModal";
import FolderViewerModal from "./folderViewerModal";
import GeneratorFactory from "../../generators/generatorFactory";
import QuizModalLogic from "../quiz/quizModalLogic";
import { cleanUpNoteContents } from "../../utils/markdownCleaner";
import { countNoteTokens, setIconAndTooltip } from "../../utils/helpers";
import { Provider } from "../../generators/providers";
import FlashcardEngine from "../../services/flashcards/flashcardEngine";
import DeckManager from "../../services/flashcards/deckManager";
import FlashcardSaver from "../../services/flashcards/flashcardSaver";
import { JSONParser } from "../../utils/jsonParser";
import { generateWithRetry } from "../../utils/retryUtils";
import { ConsensusOrchestrator } from "../../consensus/consensusOrchestrator";
import { ConsensusProgress, ConsensusFailureReason } from "../../consensus/types";
import { ConsensusProgressModal } from "../consensus/consensusProgressModal";
import { ConsensusErrorHandler, ErrorCategory } from "../../consensus/consensusErrorHandler";
import { CouncilOrchestrator } from "../../council/councilOrchestrator";
import { CouncilProgress } from "../../council/types";
import { CouncilProgressModal } from "../council/councilProgressModal";
import { DebateTrailModal } from "../council/debateTrailModal";

enum SelectorModalButton {
	CLEAR,
	QUIZ,
	NOTE,
	FOLDER,
	GENERATE,
}

export enum GenerationMode {
	QUIZ = "quiz",
	FLASHCARD = "flashcard",
	COUNCIL = "council",
}

/**
 * Interface for mode-specific UI labels
 * Stores terminology that changes based on generation mode
 */
interface ModeLabels {
	itemType: string;           // e.g., "quiz questions", "flashcards"
	generatingMessage: string;  // e.g., "Generating quiz...", "Generating flashcards..."
	buttonTooltip: string;      // e.g., "Generate quiz from selected notes"
}

export default class SelectorModal extends Modal {
	private readonly settings: QuizSettings;
	private notePaths: string[];
	private folderPaths: string[];
	private readonly selectedNotes: Map<string, string> = new Map<string, string>();
	private readonly selectedNoteFiles: Map<string, TFile[]> = new Map<string, TFile[]>();
	private readonly itemContainer: HTMLDivElement;
	private readonly tokenContainer: HTMLSpanElement;
	private promptTokens: number = 0;
	private readonly buttonMap: Record<SelectorModalButton, HTMLButtonElement>;
	private quiz: QuizModalLogic | undefined;
	private currentMode: GenerationMode = GenerationMode.QUIZ;
	private readonly modeToggleContainer: HTMLDivElement;
	private currentModeLabels: ModeLabels;
	private readonly flashcardEngine: FlashcardEngine;
	private readonly deckManager: DeckManager;
	private readonly consensusErrorHandler: ConsensusErrorHandler;

	constructor(app: App, settings: QuizSettings) {
		super(app);
		this.settings = settings;
		this.notePaths = this.app.vault.getMarkdownFiles().map(file => file.path);
		this.folderPaths = this.app.vault.getAllFolders(true).map(folder => folder.path);
		this.scope = new Scope(this.app.scope);
		this.scope.register([], "Escape", () => this.close());

		// Initialize mode-specific labels with default quiz values
		this.currentModeLabels = {
			itemType: "quiz questions",
			generatingMessage: "Generating quiz...",
			buttonTooltip: "Generate quiz from selected notes"
		};

		// Initialize flashcard services
		this.flashcardEngine = new FlashcardEngine(this.app, this.settings);
		this.deckManager = new DeckManager(this.app, this.settings);

		// Initialize consensus error handler
		this.consensusErrorHandler = new ConsensusErrorHandler();

		this.modalEl.addClass("modal-qg");
		this.contentEl.addClass("modal-content-qg");
		this.titleEl.addClass("modal-title-qg");
		this.titleEl.setText("Selected Notes");

		// Create mode toggle container (before itemContainer)
		this.modeToggleContainer = this.contentEl.createDiv("mode-toggle-container-qg");
		this.createModeToggle();

		this.itemContainer = this.contentEl.createDiv("item-container-qg");
		this.tokenContainer = this.contentEl.createSpan("prompt-tokens-qg");
		this.tokenContainer.textContent = "Prompt tokens: " + this.promptTokens;
		this.buttonMap = this.activateButtons();
	}

	public onOpen(): void {
		// Call parent's onOpen
		super.onOpen();

		console.log("SelectorModal: onOpen() called, initializing button states");

		// Verify buttonMap is initialized before toggling buttons
		if (!this.buttonMap) {
			console.error("SelectorModal: buttonMap is not initialized in onOpen()");
			return;
		}

		// Initialize button states: Clear, Quiz, and Generate start disabled
		this.toggleButtons([SelectorModalButton.CLEAR, SelectorModalButton.QUIZ, SelectorModalButton.GENERATE], true);
		console.log("SelectorModal: Initial button states set (Clear, Quiz, Generate disabled)");
	}

	/**
	 * Create the mode toggle UI for switching between quiz, flashcard, and council generation
	 */
	private createModeToggle(): void {
		const toggleLabel = this.modeToggleContainer.createSpan("mode-toggle-label-qg");
		toggleLabel.textContent = "Generation Mode:";

		const quizButton = this.modeToggleContainer.createEl("button", "mode-toggle-button-qg");
		quizButton.textContent = "Quiz";
		quizButton.addClass("mode-toggle-active-qg");
		quizButton.setAttribute("aria-label", "Switch to Quiz mode");
		quizButton.setAttribute("aria-pressed", "true");

		const flashcardButton = this.modeToggleContainer.createEl("button", "mode-toggle-button-qg");
		flashcardButton.textContent = "Flashcard";
		flashcardButton.setAttribute("aria-label", "Switch to Flashcard mode");
		flashcardButton.setAttribute("aria-pressed", "false");

		const councilButton = this.modeToggleContainer.createEl("button", "mode-toggle-button-qg");
		councilButton.textContent = "Council";
		councilButton.setAttribute("aria-label", "Switch to Council mode");
		councilButton.setAttribute("aria-pressed", "false");

		quizButton.addEventListener("click", () => {
			if (this.currentMode !== GenerationMode.QUIZ) {
				this.currentMode = GenerationMode.QUIZ;
				quizButton.addClass("mode-toggle-active-qg");
				quizButton.setAttribute("aria-pressed", "true");
				flashcardButton.removeClass("mode-toggle-active-qg");
				flashcardButton.setAttribute("aria-pressed", "false");
				councilButton.removeClass("mode-toggle-active-qg");
				councilButton.setAttribute("aria-pressed", "false");
				this.updateModeDisplay();
			}
		});

		flashcardButton.addEventListener("click", () => {
			if (this.currentMode !== GenerationMode.FLASHCARD) {
				this.currentMode = GenerationMode.FLASHCARD;
				flashcardButton.addClass("mode-toggle-active-qg");
				flashcardButton.setAttribute("aria-pressed", "true");
				quizButton.removeClass("mode-toggle-active-qg");
				quizButton.setAttribute("aria-pressed", "false");
				councilButton.removeClass("mode-toggle-active-qg");
				councilButton.setAttribute("aria-pressed", "false");
				this.updateModeDisplay();
			}
		});

		councilButton.addEventListener("click", () => {
			if (this.currentMode !== GenerationMode.COUNCIL) {
				this.currentMode = GenerationMode.COUNCIL;
				councilButton.addClass("mode-toggle-active-qg");
				councilButton.setAttribute("aria-pressed", "true");
				quizButton.removeClass("mode-toggle-active-qg");
				quizButton.setAttribute("aria-pressed", "false");
				flashcardButton.removeClass("mode-toggle-active-qg");
				flashcardButton.setAttribute("aria-pressed", "false");
				this.updateModeDisplay();
			}
		});
	}

	/**
	 * Update the UI to reflect the current generation mode
	 * Updates title, button tooltips, and mode-specific labels
	 */
	private updateModeDisplay(): void {
		// Determine mode-specific text and update currentModeLabels
		let modeText: string;

		if (this.currentMode === GenerationMode.QUIZ) {
			modeText = "Quiz";
			this.currentModeLabels = {
				itemType: "quiz questions",
				generatingMessage: "Generating quiz...",
				buttonTooltip: "Generate quiz from selected notes"
			};
		} else if (this.currentMode === GenerationMode.FLASHCARD) {
			modeText = "Flashcard";
			this.currentModeLabels = {
				itemType: "flashcards",
				generatingMessage: "Generating flashcards...",
				buttonTooltip: "Generate flashcards from selected notes"
			};
		} else {
			modeText = "Council";
			this.currentModeLabels = {
				itemType: "quiz questions (council mode)",
				generatingMessage: "Generating with council...",
				buttonTooltip: "Generate quiz with LLM Council"
			};
		}

		// Update title to reflect current mode
		this.titleEl.setText(`Selected Notes - ${modeText} Mode`);

		// Update generate button tooltip
		const generateButton = this.buttonMap[SelectorModalButton.GENERATE];
		if (generateButton) {
			generateButton.setAttribute("aria-label", this.currentModeLabels.buttonTooltip);
		}
	}

	private activateButtons(): Record<SelectorModalButton, HTMLButtonElement> {
		// Verify contentEl exists
		if (!this.contentEl) {
			console.error("SelectorModal: contentEl is not initialized");
			throw new Error("Cannot create button container: contentEl is not initialized");
		}

		// Create button container - automatically appended after tokenContainer
		const buttonContainer = this.contentEl.createDiv("modal-button-container-qg");

		// Defensive check: Verify button container was created
		if (!buttonContainer) {
			console.error("SelectorModal: Failed to create button container");
			throw new Error("Failed to create button container");
		}

		console.log("SelectorModal: Button container created successfully");

		// Create all 5 buttons
		const clearButton = buttonContainer.createEl("button", "modal-button-qg") as HTMLButtonElement;
		const openQuizButton = buttonContainer.createEl("button", "modal-button-qg") as HTMLButtonElement;
		const addNoteButton = buttonContainer.createEl("button", "modal-button-qg") as HTMLButtonElement;
		const addFolderButton = buttonContainer.createEl("button", "modal-button-qg") as HTMLButtonElement;
		const generateQuizButton = buttonContainer.createEl("button", "modal-button-qg") as HTMLButtonElement;

		const buttonMap: Record<SelectorModalButton, HTMLButtonElement> = {
			[SelectorModalButton.CLEAR]: clearButton,
			[SelectorModalButton.QUIZ]: openQuizButton,
			[SelectorModalButton.NOTE]: addNoteButton,
			[SelectorModalButton.FOLDER]: addFolderButton,
			[SelectorModalButton.GENERATE]: generateQuizButton,
		};

		console.log("SelectorModal: All 5 buttons created");

		// Set icons and tooltips with error handling and text fallback
		this.setButtonIconWithFallback(clearButton, "book-x", "Remove all");
		this.setButtonIconWithFallback(openQuizButton, "scroll-text", "Open quiz");
		this.setButtonIconWithFallback(addNoteButton, "file-plus-2", "Add note");
		this.setButtonIconWithFallback(addFolderButton, "folder-plus", "Add folder");
		this.setButtonIconWithFallback(generateQuizButton, "webhook", "Generate");

		const clearHandler = (): void => {
			this.toggleButtons([SelectorModalButton.CLEAR, SelectorModalButton.GENERATE], true);
			this.selectedNotes.clear();
			this.selectedNoteFiles.clear();
			this.itemContainer.empty();
			this.updatePromptTokens(0);
			this.notePaths = this.app.vault.getMarkdownFiles().map(file => file.path);
			this.folderPaths = this.app.vault.getAllFolders(true).map(folder => folder.path);
		};
		const openQuizHandler = async (): Promise<void> => await this.quiz?.renderQuiz();
		const addNoteHandler = (): void => this.openNoteSelector();
		const addFolderHandler = (): void => this.openFolderSelector();
		const generateQuizHandler = async (): Promise<void> => {
			// Route to appropriate handler based on current mode
			if (this.currentMode === GenerationMode.FLASHCARD) {
				await this.handleFlashcardGeneration();
				return;
			}

			// Check if council mode is selected
			if (this.currentMode === GenerationMode.COUNCIL) {
				await this.handleCouncilQuizGeneration();
				return;
			}

			// Check if consensus mode is enabled
			if (this.settings.consensusSettings?.enabled) {
				await this.handleConsensusQuizGeneration();
				return;
			}

			// Original single-model quiz generation logic
			await this.handleSingleModelQuizGeneration();
		};

		clearButton.addEventListener("click", clearHandler);
		openQuizButton.addEventListener("click", openQuizHandler);
		addNoteButton.addEventListener("click", addNoteHandler);
		addFolderButton.addEventListener("click", addFolderHandler);
		generateQuizButton.addEventListener("click", generateQuizHandler);

		return buttonMap;
	}

	/**
	 * Helper method to set button icon and tooltip with error handling
	 * Falls back to text content if icon setting fails
	 */
	private setButtonIconWithFallback(button: HTMLButtonElement, icon: string, tooltip: string): void {
		try {
			setIconAndTooltip(button, icon, tooltip);
			console.log(`SelectorModal: Successfully set icon "${icon}" for button with tooltip "${tooltip}"`);
		} catch (error) {
			console.warn(`SelectorModal: Failed to set icon "${icon}" for button, using text fallback:`, error);
			// Fallback to text if icon fails
			button.textContent = tooltip;
			button.setAttribute("aria-label", tooltip);
		}
	}

	private openNoteSelector(): void {
		const selector = new NoteAndFolderSelector(this.app, this.notePaths, this.modalEl, this.addNote.bind(this));
		selector.open();
	}

	private openFolderSelector(): void {
		const selector = new NoteAndFolderSelector(this.app, this.folderPaths, this.modalEl, this.addFolder.bind(this));
		selector.open();
	}

	private async addNote(note: string): Promise<void> {
		const selectedNote = this.app.vault.getAbstractFileByPath(note);
		if (selectedNote instanceof TFile) {
			this.notePaths = this.notePaths.filter(notePath => notePath !== selectedNote.path);
			this.openNoteSelector();
			const noteContents = await this.app.vault.cachedRead(selectedNote);
			this.selectedNotes.set(selectedNote.path, cleanUpNoteContents(noteContents, getFrontMatterInfo(noteContents).exists));
			this.selectedNoteFiles.set(selectedNote.path, [selectedNote]);
			this.renderNote(selectedNote);
		}
	}

	private async addFolder(folder: string): Promise<void> {
		const selectedFolder = this.app.vault.getAbstractFileByPath(folder);
		if (selectedFolder instanceof TFolder) {
			this.folderPaths = this.folderPaths.filter(folderPath => folderPath !== selectedFolder.path);
			this.openFolderSelector();

			const folderContents: string[] = [];
			const notes: TFile[] = [];
			const promises: Promise<void>[] = [];
			Vault.recurseChildren(selectedFolder, (file: TAbstractFile): void => {
				if (file instanceof TFile && file.extension === "md" &&
					(this.settings.includeSubfolderNotes || file.parent?.path === selectedFolder.path)) {
					promises.push(
						(async (): Promise<void> => {
							const noteContents = await this.app.vault.cachedRead(file);
							folderContents.push(cleanUpNoteContents(noteContents, getFrontMatterInfo(noteContents).exists));
							notes.push(file);
						})()
					);
				}
			});

			await Promise.all(promises);
			this.selectedNotes.set(selectedFolder.path, folderContents.join(" "));
			this.selectedNoteFiles.set(selectedFolder.path, notes);
			this.renderFolder(selectedFolder);
		}
	}

	private renderNote(note: TFile): void {
		const tokens = this.renderNoteOrFolder(note, this.settings.showNotePath ? note.path : note.basename);
		this.toggleButtons([SelectorModalButton.CLEAR, SelectorModalButton.GENERATE], false);
		this.updatePromptTokens(this.promptTokens + tokens);
	}

	private renderFolder(folder: TFolder): void {
		let folderName = this.settings.showFolderPath ? folder.path : folder.name;
		if (folder.path === "/") {
			folderName = this.app.vault.getName() + " (Vault)";
		}

		const tokens = this.renderNoteOrFolder(folder, folderName);
		this.toggleButtons([SelectorModalButton.CLEAR, SelectorModalButton.GENERATE], false);
		this.updatePromptTokens(this.promptTokens + tokens);
	}

	private renderNoteOrFolder(item: TFile | TFolder, fileName: string): number {
		const itemContainer = this.itemContainer.createDiv("item-qg");
		itemContainer.textContent = fileName;

		const tokensElement = itemContainer.createDiv("item-tokens-qg");
		const tokens = countNoteTokens(this.selectedNotes.get(item.path)!);
		tokensElement.textContent = tokens + " tokens";

		const viewContentsButton = itemContainer.createEl("button", "item-button-qg");
		setIconAndTooltip(viewContentsButton, "eye", "View contents");
		viewContentsButton.addEventListener("click", async (): Promise<void> => {
			if (item instanceof TFile) {
				new NoteViewerModal(this.app, item, this.modalEl).open();
			} else {
				new FolderViewerModal(this.app, this.settings, this.modalEl, item).open();
			}
		});

		const removeButton = itemContainer.createEl("button", "item-button-qg");
		setIconAndTooltip(removeButton, "x", "Remove");
		removeButton.addEventListener("click", (): void => {
			this.removeNoteOrFolder(item, itemContainer);
			this.updatePromptTokens(this.promptTokens - tokens);

			if (this.selectedNotes.size === 0) {
				this.toggleButtons([SelectorModalButton.CLEAR, SelectorModalButton.GENERATE], true);
			}
		});

		return tokens;
	}

	private removeNoteOrFolder(item: TFile | TFolder, element: HTMLDivElement): void {
		this.selectedNotes.delete(item.path);
		this.selectedNoteFiles.delete(item.path);
		this.itemContainer.removeChild(element as Node);
		item instanceof TFile ? this.notePaths.push(item.path) : this.folderPaths.push(item.path);
	}

	private toggleButtons(buttons: SelectorModalButton[], disabled: boolean): void {
		// Defensive check: Verify buttonMap exists
		if (!this.buttonMap) {
			console.error("SelectorModal: Cannot toggle buttons - buttonMap is not initialized");
			return;
		}

		buttons.forEach(button => {
			const buttonElement = this.buttonMap[button];
			if (!buttonElement) {
				console.error(`SelectorModal: Button ${SelectorModalButton[button]} not found in buttonMap`);
				return;
			}
			buttonElement.disabled = disabled;
		});

		console.log(`SelectorModal: Toggled ${buttons.length} buttons to ${disabled ? 'disabled' : 'enabled'}`);
	}

	private updatePromptTokens(tokens: number): void {
		this.promptTokens = tokens;
		this.tokenContainer.textContent = "Prompt tokens: " + this.promptTokens;
	}

	private validGenerationSettings(): boolean {
		return (this.settings.generateTrueFalse || this.settings.generateMultipleChoice ||
			this.settings.generateSelectAllThatApply || this.settings.generateFillInTheBlank ||
			this.settings.generateMatching || this.settings.generateShortAnswer || this.settings.generateLongAnswer) &&
			this.promptTokens > 0;
	}

	/**
	 * Validate flashcard generation settings
	 * Requirements: 4.1, 4.6
	 * Checks that notes are selected and content is available
	 */
	private validFlashcardGenerationSettings(): boolean {
		return this.promptTokens > 0 && this.selectedNotes.size > 0;
	}

	/**
	 * Get mode-specific validation error message
	 * Requirements: 4.1, 4.6
	 * Returns appropriate error message based on current generation mode
	 */
	private getValidationErrorMessage(): string {
		if (this.currentMode === GenerationMode.FLASHCARD) {
			return "Please select notes before generating flashcards";
		} else if (this.currentMode === GenerationMode.COUNCIL) {
			return "Invalid generation settings or prompt contains 0 tokens";
		} else {
			return "Invalid generation settings or prompt contains 0 tokens";
		}
	}

	/**
	 * Handle flashcard generation from selected notes
	 * Creates a deck, generates flashcards, and saves them
	 */
	private async handleFlashcardGeneration(): Promise<void> {
		// Validate that we have content to generate from
		if (!this.validFlashcardGenerationSettings()) {
			new Notice(this.getValidationErrorMessage());
			return;
		}

		this.toggleButtons([SelectorModalButton.GENERATE], true);

		try {
			new Notice(this.currentModeLabels.generatingMessage);

			// Step 1: Create or get deck
			const deckName = this.generateDeckName();
			let deck: Deck;

			try {
				// Check if deck already exists
				const existingDecks = await this.deckManager.getAllDecks();
				const existingDeck = existingDecks.find(d => d.name === deckName);

				if (existingDeck) {
					deck = existingDeck;
					new Notice(`Using existing deck: ${deckName}`);
				} else {
					// Create new deck
					const sourceFolder = this.getSourceFolder();
					deck = await this.deckManager.createDeck(
						deckName,
						`Flashcards generated from selected notes`,
						sourceFolder
					);
					new Notice(`Created deck: ${deckName}`);
				}
			} catch (error) {
				throw new Error(`Failed to create/get deck: ${(error as Error).message}`);
			}

				// Step 2: Generate flashcards from all selected notes
			const allFlashcards: Flashcard[] = [];

			// Convert iterator to array for older TypeScript compatibility
			const notesIterator = this.selectedNotes.values();
			const notesArray: string[] = [];
			for (const note of notesIterator) {
				notesArray.push(note);
			}
			const combinedContent = notesArray.join("\n\n");

			// Calculate number of flashcards to generate based on content length
			// Roughly 1 flashcard per 200 tokens
			const flashcardCount = Math.max(5, Math.min(30, Math.floor(this.promptTokens / 200)));

			try {
				const flashcards = await this.flashcardEngine.generateFlashcards(
					combinedContent,
					flashcardCount,
					deck.id
				);

				if (flashcards.length === 0) {
					throw new Error("No flashcards were generated");
				}

				// Add source file info to flashcards
				const noteFilesIterator = this.selectedNoteFiles.values();
				const noteFiles: TFile[] = [];
				for (const files of noteFilesIterator) {
					noteFiles.push(...files);
				}

				flashcards.forEach((flashcard, index) => {
					// Assign source file to flashcard (round-robin if multiple files)
					if (noteFiles.length > 0) {
						flashcard.sourceFile = noteFiles[index % noteFiles.length].path;
					}
				});

				allFlashcards.push(...flashcards);
			} catch (error) {
				throw new Error(`Flashcard generation failed: ${(error as Error).message}`);
			}

			// Step 3: Add flashcards to deck
			const flashcardIds = allFlashcards.map(fc => fc.id);
			await this.deckManager.addCardsToDeck(deck.id, flashcardIds);

			// Step 4: Save flashcards to markdown file
			try {
				const flashcardSaver = new FlashcardSaver(this.app, this.settings, []);
				await flashcardSaver.saveFlashcards(allFlashcards);
			} catch (error) {
				new Notice(`Warning: Failed to save flashcards to file: ${(error as Error).message}`);
				console.error("Error saving flashcards:", error);
			}

			// Step 5: Show success message
			new Notice(
				`Successfully generated ${allFlashcards.length} flashcards in deck "${deck.name}"!`,
				5000
			);

			// Optionally: Open flashcard review modal
			// For now, just show success message
		} catch (error) {
			const errorMessage = (error as Error).message;
			new Notice(`Failed to generate flashcards: ${errorMessage}`, 0);
			console.error("Flashcard generation error:", error);
		} finally {
			this.toggleButtons([SelectorModalButton.GENERATE], false);
		}
	}

	/**
	 * Generate a deck name based on selected notes
	 * Uses the first note/folder name, or "Mixed Content" for multiple sources
	 */
	private generateDeckName(): string {
		if (this.selectedNoteFiles.size === 0) {
			return "Generated Flashcards";
		}

		const entriesIterator = this.selectedNoteFiles.entries();
		const firstEntry = entriesIterator.next().value;
		if (!firstEntry) {
			return "Generated Flashcards";
		}

		const [path, files] = firstEntry;

		// If it's a single note
		if (this.selectedNoteFiles.size === 1 && files.length === 1) {
			return files[0].basename;
		}

		// If it's a folder
		const folder = this.app.vault.getAbstractFileByPath(path);
		if (folder instanceof TFolder) {
			return folder.name === "/" ? this.app.vault.getName() : folder.name;
		}

		// Multiple sources
		return "Mixed Content";
	}

	/**
	 * Get the source folder for the deck
	 * Returns the folder path if all selected notes are from the same folder
	 */
	private getSourceFolder(): string | undefined {
		// Convert iterator to array
		const valuesIterator = this.selectedNoteFiles.values();
		const allFiles: TFile[] = [];
		for (const files of valuesIterator) {
			allFiles.push(...files);
		}

		if (allFiles.length === 0) {
			return undefined;
		}

		// Check if all files are from the same parent folder
		const firstParent = allFiles[0].parent?.path;
		const allSameFolder = allFiles.every(file => file.parent?.path === firstParent);

		return allSameFolder ? firstParent : undefined;
	}

	/**
	 * Handle single-model quiz generation
	 * This is the original quiz generation logic before consensus was added
	 */
	private async handleSingleModelQuizGeneration(): Promise<void> {
		if (!this.validGenerationSettings()) {
			new Notice(this.getValidationErrorMessage());
			return;
		}

		this.toggleButtons([SelectorModalButton.GENERATE], true);

		try {
			new Notice(this.currentModeLabels.generatingMessage);
			const generator = GeneratorFactory.createForActiveModel(this.settings);

			// Use the shared retry utility for consistent error handling
			const result = await generateWithRetry<Quiz>(
				async () => {
					const response = await generator.generateQuiz([...this.selectedNotes.values()]);
					if (!response) {
						throw new Error("Empty response from LLM");
					}
					// Sanitize the response for JSON parsing
					return response.replace(/\\+/g, "\\\\");
				},
				{
					maxRetries: 3,
					noticePrefix: "Quiz generation",
					onError: (error, attempt) => {
						console.error(`Quiz generation attempt ${attempt} failed:`, error.message);
					},
				}
			);

			if (!result.success) {
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				return; // Error already displayed by retry utility
			}

			const quiz = result.data!;

			// Debug: Log what we actually received
			console.log("Received quiz data:", quiz);
			console.log("Quiz type:", typeof quiz);
			console.log("Quiz keys:", quiz ? Object.keys(quiz) : "null/undefined");

			// Validate that the quiz has a questions array
			if (!quiz || !quiz.questions || !Array.isArray(quiz.questions)) {
				const errorMsg = !quiz
					? "Quiz data is null or undefined"
					: !quiz.questions
						? `Quiz data missing 'questions' property. Received keys: ${Object.keys(quiz).join(", ")}`
						: "Quiz 'questions' property is not an array";

				new Notice(`Invalid quiz format: ${errorMsg}`, 0);
				console.error("Invalid quiz format:", errorMsg, quiz);
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				return;
			}

			if (quiz.questions.length === 0) {
				new Notice("No questions were generated. Please try again.", 0);
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				return;
			}

			const questions: Question[] = [];
			quiz.questions.forEach(question => {
				if (isTrueFalse(question)) {
					questions.push(question);
				} else if (isMultipleChoice(question)) {
					questions.push(question);
				} else if (isSelectAllThatApply(question)) {
					questions.push(question);
				} else if (isFillInTheBlank(question)) {
					questions.push({ question: question.question, answer: question.answer });
				} else if (isMatching(question)) {
					questions.push(question);
				} else if (isShortOrLongAnswer(question)) {
					questions.push(question);
				} else {
					new Notice("A question was generated incorrectly");
				}
			});

			this.quiz = new QuizModalLogic(this.app, this.settings, questions, [...this.selectedNoteFiles.values()].flat());
			await this.quiz.renderQuiz();
			this.toggleButtons([SelectorModalButton.QUIZ], false);
		} catch (error) {
			const errorMessage = (error as Error).message;
			// Only show notice if not already shown by retry utility
			if (!errorMessage.includes("failed after")) {
				new Notice(errorMessage, 0);
			}
		} finally {
			this.toggleButtons([SelectorModalButton.GENERATE], false);
		}
	}

	/**
	 * Handle consensus-based quiz generation
	 * Uses multiple models to validate quiz questions through consensus
	 * Requirements: 1.1, 1.5, 7.1, 8.5
	 */
	private async handleConsensusQuizGeneration(): Promise<void> {
		// Validate consensus settings
		if (!this.settings.consensusSettings) {
			new Notice("Consensus settings not configured");
			return;
		}

		if (!this.validGenerationSettings()) {
			new Notice(this.getValidationErrorMessage());
			return;
		}

		// Validate minimum models requirement
		const enabledModels = this.settings.consensusSettings.models.filter((m: { enabled: boolean }) => m.enabled);
		if (enabledModels.length < this.settings.consensusSettings.minModelsRequired) {
			new Notice(
				`Insufficient models enabled: ${enabledModels.length} enabled, ` +
				`${this.settings.consensusSettings.minModelsRequired} required. ` +
				`Please configure more models in settings.`,
				8000
			);
			return;
		}

		this.toggleButtons([SelectorModalButton.GENERATE], true);

		// Track cancellation state
		let cancelled = false;

		// Create progress modal (Requirement 7.1, 7.2, 7.3)
		const progressModal = new ConsensusProgressModal(this.app, () => {
			cancelled = true;
		});
		progressModal.open();

		try {
			// Progress callback for UI updates (Requirement 7.1)
			const progressCallback = (progress: ConsensusProgress): void => {
				// Check if user cancelled
				if (progressModal.isCancelled()) {
					cancelled = true;
					return;
				}

				// Update progress modal
				progressModal.updateProgress(progress);

				// Also log to console for debugging
				console.log(`[Consensus ${Math.round(progress.overallProgress * 100)}%] ${progress.statusMessage}`);
			};

			// Partial result callback for progressive streaming (Requirement 7.2, 7.3)
			const partialResultCallback = (partialResult: import("../../consensus/types").PartialConsensusResult): void => {
				// Check if user cancelled
				if (progressModal.isCancelled()) {
					cancelled = true;
					return;
				}

				// Add partial result to progress modal for display
				progressModal.addPartialResult(partialResult);

				// Also log to console for debugging
				console.log(`[Consensus] Question ${partialResult.questionIndex + 1}/${partialResult.totalQuestions} reached consensus (${partialResult.trail.roundsRequired} rounds)`);
			};

			// Model error callback for real-time error feedback (Requirement 8.2, 8.5)
			const modelErrorCallback = (
				modelId: string,
				error: string,
				severity: "error" | "warning" | "info",
				retry?: boolean
			): void => {
				// Check if user cancelled
				if (progressModal.isCancelled()) {
					cancelled = true;
					return;
				}

				// Display error/warning in progress modal
				if (severity === "error") {
					progressModal.showWarning("Model Error", `${modelId}: ${error}`);
				} else if (severity === "warning") {
					progressModal.showWarning("Model Warning", `${modelId}: ${error}`);
				}

				// Log to console
				console.warn(`[Consensus ${severity.toUpperCase()}] ${modelId}: ${error}${retry ? ' (retrying)' : ''}`);
			};

			// Create consensus orchestrator (Requirement 1.5)
			const orchestrator = new ConsensusOrchestrator(
				this.settings.consensusSettings,
				this.settings,
				progressCallback,
				partialResultCallback,
				modelErrorCallback
			);

			// Generate quiz with consensus
			const consensusResult = await orchestrator.generateWithCache(
				[...this.selectedNotes.values()]
			);

			// Check if user cancelled during generation
			if (cancelled || progressModal.isCancelled()) {
				progressModal.close();
				new Notice("Consensus generation cancelled by user", 5000);
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				return;
			}

			// Close progress modal
			progressModal.close();

			// Check if consensus was successful (Requirement 8.5, 8.2)
			if (!consensusResult.success) {
				const failureReason = consensusResult.failureReason || "Unknown error";
				const availableModels = consensusResult.auditTrail.participatingModels.length;
				const requiredModels = this.settings.consensusSettings.minModelsRequired;

				// Get user-friendly failure message
				let failureMessage: string;
				let suggestions: string[] = [];

				// Map failure reason to specific messages and suggestions
				if (failureReason.includes("INSUFFICIENT_MODELS")) {
					failureMessage = this.consensusErrorHandler.getConsensusFailureMessage(
						ConsensusFailureReason.INSUFFICIENT_MODELS,
						availableModels,
						requiredModels
					);
					suggestions = [
						"Check that all model API keys are valid",
						"Verify your network connection",
						"Try reducing the minimum models required in settings",
						"Enable fallback to single-model generation"
					];
				} else if (failureReason.includes("MAX_ITERATIONS")) {
					failureMessage = this.consensusErrorHandler.getConsensusFailureMessage(
						ConsensusFailureReason.MAX_ITERATIONS_EXCEEDED,
						availableModels,
						requiredModels
					);
					suggestions = [
						"Try increasing the maximum iterations in settings",
						"Use simpler source material",
						"Reduce the consensus threshold percentage"
					];
				} else if (failureReason.includes("CIRCULAR_REASONING")) {
					failureMessage = this.consensusErrorHandler.getConsensusFailureMessage(
						ConsensusFailureReason.CIRCULAR_REASONING,
						availableModels,
						requiredModels
					);
					suggestions = [
						"Try again with different source content",
						"Reduce the number of questions requested",
						"Use different models for consensus"
					];
				} else if (failureReason.includes("ALL_MODELS_FAILED")) {
					failureMessage = this.consensusErrorHandler.getConsensusFailureMessage(
						ConsensusFailureReason.ALL_MODELS_FAILED,
						availableModels,
						requiredModels
					);
					suggestions = [
						"Check all model API keys and configurations",
						"Verify your internet connection",
						"Check model provider status pages",
						"Try with different models"
					];
				} else {
					failureMessage = failureReason;
					suggestions = [
						"Try again - consensus can be unpredictable",
						"Check your consensus settings",
						"Enable fallback to single-model generation"
					];
				}

				// Show error in progress modal with suggestions
				progressModal.showError("Consensus Failed", failureMessage, suggestions);

				// Wait 5 seconds to let user read the error
				await new Promise(resolve => setTimeout(resolve, 5000));

				// Check if we should fallback to single model
				if (this.settings.consensusSettings.fallbackToSingleModel) {
					new Notice(
						`Consensus failed. Falling back to single-model generation...`,
						5000
					);
					progressModal.close();
					await this.handleSingleModelQuizGeneration();
					return;
				} else {
					progressModal.close();

					// Show detailed error notice with suggestions
					const suggestionText = suggestions.length > 0
						? `\n\nSuggestions:\n${suggestions.map(s => `  • ${s}`).join('\n')}`
						: '';

					new Notice(
						`Consensus generation failed: ${failureMessage}${suggestionText}`,
						12000
					);
					this.toggleButtons([SelectorModalButton.GENERATE], false);
					return;
				}
			}

			const quiz = consensusResult.quiz;

			// Validate quiz structure
			if (!quiz || !quiz.questions || !Array.isArray(quiz.questions)) {
				new Notice("Invalid consensus quiz format", 5000);
				console.error("Invalid consensus quiz format:", quiz);
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				return;
			}

			if (quiz.questions.length === 0) {
				new Notice("No questions reached consensus. Please try again.", 5000);
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				return;
			}

			// Process and validate questions
			const questions: Question[] = [];
			quiz.questions.forEach(question => {
				if (isTrueFalse(question)) {
					questions.push(question);
				} else if (isMultipleChoice(question)) {
					questions.push(question);
				} else if (isSelectAllThatApply(question)) {
					questions.push(question);
				} else if (isFillInTheBlank(question)) {
					questions.push({ question: question.question, answer: question.answer });
				} else if (isMatching(question)) {
					questions.push(question);
				} else if (isShortOrLongAnswer(question)) {
					questions.push(question);
				} else {
					console.warn("Question type not recognized:", question);
				}
			});

			if (questions.length === 0) {
				new Notice("No valid questions generated. Please try again.", 5000);
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				return;
			}

			// Create quiz modal with consensus results
			// Requirement 6.1: Pass audit trail to quiz modal for display
			this.quiz = new QuizModalLogic(
				this.app,
				this.settings,
				questions,
				[...this.selectedNoteFiles.values()].flat(),
				consensusResult.auditTrail
			);

			// Show success message with consensus stats
			const duration = (consensusResult.auditTrail.totalDuration / 1000).toFixed(1);
			const modelCount = consensusResult.auditTrail.participatingModels.length;
			new Notice(
				`Consensus quiz generated! ${questions.length} questions validated by ${modelCount} models in ${duration}s`,
				5000
			);

			await this.quiz.renderQuiz();
			this.toggleButtons([SelectorModalButton.QUIZ], false);

		} catch (error) {
			const err = error as Error;
			console.error("Consensus generation error:", err);

			// Format error for user display
			const formatted = this.consensusErrorHandler.formatError(err, ErrorCategory.UNKNOWN);

			// Show error in progress modal with suggestions
			progressModal.showError(
				formatted.title,
				formatted.message,
				formatted.suggestions
			);

			// Wait 5 seconds to let user read the error
			await new Promise(resolve => setTimeout(resolve, 5000));

			// Close progress modal
			progressModal.close();

			// Show detailed notice
			const suggestionText = formatted.suggestions.length > 0
				? `\n\nSuggestions:\n${formatted.suggestions.map(s => `  • ${s}`).join('\n')}`
				: '';

			new Notice(
				`Consensus generation error: ${formatted.message}${suggestionText}`,
				12000
			);

			// Fallback to single model if enabled (Requirement 8.5)
			if (this.settings.consensusSettings.fallbackToSingleModel) {
				new Notice("Falling back to single-model generation...", 3000);
				await this.handleSingleModelQuizGeneration();
			}
		} finally {
			this.toggleButtons([SelectorModalButton.GENERATE], false);
		}
	}

	/**
	 * Handle LLM Council quiz generation
	 * Uses multiple models in a structured debate process with critique and ranking
	 * Requirements: 1.1, 5.1, 8.7
	 */
	private async handleCouncilQuizGeneration(): Promise<void> {
		// Validate council settings
		if (!this.settings.councilSettings) {
			new Notice("Council settings not configured. Please configure council mode in settings.");
			return;
		}

		if (!this.settings.councilSettings.enabled) {
			new Notice("Council mode is not enabled. Please enable it in settings.");
			return;
		}

		if (!this.validGenerationSettings()) {
			new Notice(this.getValidationErrorMessage());
			return;
		}

		// Validate minimum models requirement
		const enabledModels = this.settings.councilSettings.models.filter(m => m.enabled);
		if (enabledModels.length < this.settings.councilSettings.minModelsRequired) {
			new Notice(
				`Insufficient models enabled: ${enabledModels.length} enabled, ` +
				`${this.settings.councilSettings.minModelsRequired} required. ` +
				`Please configure more models in settings.`,
				8000
			);
			return;
		}

		this.toggleButtons([SelectorModalButton.GENERATE], true);

		// Track cancellation state
		let cancelled = false;

		// Create progress modal (Requirement 5.1)
		const progressModal = new CouncilProgressModal(this.app, () => {
			cancelled = true;
		});
		progressModal.open();

		try {
			// Progress callback for UI updates (Requirement 5.1-5.6)
			const progressCallback = (progress: CouncilProgress): void => {
				// Check if user cancelled
				if (progressModal.isCancelled()) {
					cancelled = true;
					return;
				}

				// Update progress modal
				progressModal.updateProgress(progress);

				// Also log to console for debugging
				console.log(`[Council ${Math.round(progress.overallProgress * 100)}%] ${progress.statusMessage}`);
			};

			// Model error callback for real-time error feedback (Requirement 8.2, 8.5)
			const modelErrorCallback = (
				modelId: string,
				error: string,
				severity: "error" | "warning" | "info",
				retry?: boolean
			): void => {
				// Check if user cancelled
				if (progressModal.isCancelled()) {
					cancelled = true;
					return;
				}

				// Display error/warning in progress modal
				if (severity === "error") {
					progressModal.showWarning("Model Error", `${modelId}: ${error}`);
				} else if (severity === "warning") {
					progressModal.showWarning("Model Warning", `${modelId}: ${error}`);
				}

				// Log to console
				console.warn(`[Council ${severity.toUpperCase()}] ${modelId}: ${error}${retry ? ' (retrying)' : ''}`);
			};

			// Create council orchestrator (Requirement 1.1)
			const orchestrator = new CouncilOrchestrator(
				this.settings.councilSettings,
				this.settings,
				progressCallback,
				modelErrorCallback
			);

			// Generate quiz with council (with caching support - Requirements 4.7, 7.6)
			const councilResult = await orchestrator.generateWithCache(
				[...this.selectedNotes.values()]
			);

			// Check if user cancelled during generation
			if (cancelled || progressModal.isCancelled()) {
				progressModal.close();
				new Notice("Council generation cancelled by user", 5000);
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				return;
			}

			// Close progress modal
			progressModal.close();

			// Check if council was successful (Requirement 8.5, 8.2)
			if (!councilResult.success) {
				const failureReason = councilResult.failureReason || "Unknown error";

				// Show error with suggestions
				const suggestions = [
					"Check that all model API keys are valid",
					"Verify your network connection",
					"Try reducing the minimum models required in settings",
					"Enable fallback to single-model generation"
				];

				new Notice(
					`Council generation failed: ${failureReason}\n\nSuggestions:\n${suggestions.map(s => `  • ${s}`).join('\n')}`,
					12000
				);

				// Check if we should fallback to single model
				if (this.settings.councilSettings.fallbackToSingleModel) {
					new Notice(
						`Council failed. Falling back to single-model generation...`,
						5000
					);
					await this.handleSingleModelQuizGeneration();
					return;
				} else {
					this.toggleButtons([SelectorModalButton.GENERATE], false);
					return;
				}
			}

			const quiz = councilResult.quiz;

			// Validate quiz structure
			if (!quiz || !quiz.questions || !Array.isArray(quiz.questions)) {
				new Notice("Invalid council quiz format", 5000);
				console.error("Invalid council quiz format:", quiz);
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				return;
			}

			if (quiz.questions.length === 0) {
				new Notice("No questions were generated by the council. Please try again.", 5000);
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				return;
			}

			// Process and validate questions
			const questions: Question[] = [];
			quiz.questions.forEach(question => {
				if (isTrueFalse(question)) {
					questions.push(question);
				} else if (isMultipleChoice(question)) {
					questions.push(question);
				} else if (isSelectAllThatApply(question)) {
					questions.push(question);
				} else if (isFillInTheBlank(question)) {
					questions.push({ question: question.question, answer: question.answer });
				} else if (isMatching(question)) {
					questions.push(question);
				} else if (isShortOrLongAnswer(question)) {
					questions.push(question);
				} else {
					console.warn("Question type not recognized:", question);
				}
			});

			if (questions.length === 0) {
				new Notice("No valid questions generated. Please try again.", 5000);
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				return;
			}

			// Create quiz modal with council results
			// Pass debate trail for transparency (Requirement 8.7)
			this.quiz = new QuizModalLogic(
				this.app,
				this.settings,
				questions,
				[...this.selectedNoteFiles.values()].flat()
			);

			// Show success message with council stats
			const duration = (councilResult.debateTrail.totalDuration / 1000).toFixed(1);
			const modelCount = councilResult.debateTrail.participatingModels.length;
			const chairModel = councilResult.debateTrail.synthesis.chairModelId;
			new Notice(
				`Council quiz generated! ${questions.length} questions synthesized by ${chairModel} after debate among ${modelCount} models in ${duration}s`,
				5000
			);

			// Optionally show debate trail if enabled (Requirement 8.7)
			if (this.settings.councilSettings.showDebateTrail) {
				new Notice(
					"View the full debate trail to see how the council reached consensus. Click 'View Debate Trail' in the quiz modal.",
					5000
				);

				// TODO(council-ui): Add "View Debate Trail" button to QuizModal header
				// Currently auto-opens after delay; button would give user control
				setTimeout(() => {
					new DebateTrailModal(this.app, councilResult.debateTrail).open();
				}, 2000);
			}

			await this.quiz.renderQuiz();
			this.toggleButtons([SelectorModalButton.QUIZ], false);

		} catch (error) {
			const err = error as Error;
			console.error("Council generation error:", err);

			// Close progress modal
			progressModal.close();

			// Show detailed error notice
			new Notice(
				`Council generation error: ${err.message}\n\nPlease try again or check your settings.`,
				12000
			);

			// Fallback to single model if enabled (Requirement 8.5)
			if (this.settings.councilSettings.fallbackToSingleModel) {
				new Notice("Falling back to single-model generation...", 3000);
				await this.handleSingleModelQuizGeneration();
			}
		} finally {
			this.toggleButtons([SelectorModalButton.GENERATE], false);
		}
	}
}
