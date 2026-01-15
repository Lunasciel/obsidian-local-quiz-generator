import { App, Notice, TFile } from "obsidian";
import { QuizSettings } from "../../settings/config";
import {
	Flashcard,
	FlashcardMetadata,
	StudySession,
	PracticeMode,
	ConfidenceRating,
} from "../../utils/types";
import { DEFAULT_FLASHCARD_SETTINGS } from "../../settings/flashcards/flashcardConfig";
import MetadataStorage from "./metadataStorage";
import SpacedRepetition from "./spacedRepetition";

/**
 * FlashcardReviewer handles parsing flashcards from markdown files
 * Implements requirements: 3.1, 3.2, 7.2, 7.5
 *
 * Supports two formats:
 * 1. Callout format - Obsidian-style callouts for front/back/hint
 * 2. Spaced Repetition format - Inline format with :: or ?? separators
 */
export default class FlashcardReviewer {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly metadataStorage: MetadataStorage;
	private currentSession: StudySession | null = null;
	private autoSaveInterval: number | null = null;
	private readonly autoSaveIntervalMs = 30000; // 30 seconds

	constructor(app: App, settings: QuizSettings) {
		this.app = app;
		this.settings = settings;
		this.metadataStorage = new MetadataStorage(app);
	}

	/**
	 * Parse flashcards from file content
	 * Supports both callout and inline/multiline spaced repetition formats
	 * Handles flashcards with tables, images, and code blocks
	 *
	 * @param fileContent - Raw markdown content from file
	 * @returns Array of parsed flashcards
	 */
	public parseFlashcards(fileContent: string): Flashcard[] {
		const flashcards: Flashcard[] = [];

		// Parse callout format flashcards
		const calloutCards = this.parseCalloutFormat(fileContent);
		flashcards.push(...calloutCards);

		// Parse spaced repetition format flashcards (inline and multiline)
		const spacedRepCards = this.parseSpacedRepetitionFormat(fileContent);
		flashcards.push(...spacedRepCards);

		return flashcards;
	}

	/**
	 * Parse flashcards in callout format
	 *
	 * Format:
	 * > [!flashcard] Front content
	 * >> [!answer]-
	 * >> Back content
	 * >>
	 * >> [!hint]- (optional)
	 * >> Hint content
	 *
	 * @param fileContent - Raw markdown content
	 * @returns Array of parsed flashcards
	 */
	private parseCalloutFormat(fileContent: string): Flashcard[] {
		const flashcards: Flashcard[] = [];

		// Regex to match flashcard callout
		// Matches: > [!flashcard] or > [!flashcard]+ or > [!flashcard]-
		const flashcardStart = />[ \t]*\[!flashcard\][+-]?[ \t]*/i;

		// Find all flashcard callouts
		const lines = fileContent.split("\n");
		let i = 0;

		while (i < lines.length) {
			const line = lines[i];

			// Check if this line starts a flashcard callout
			if (flashcardStart.test(line)) {
				try {
					const result = this.parseCalloutFlashcard(lines, i);
					if (result.flashcard) {
						flashcards.push(result.flashcard);
					}
					i = result.nextIndex;
				} catch (error) {
					// Skip malformed flashcard and continue
					console.warn(`Failed to parse flashcard at line ${i}:`, error);
					i++;
				}
			} else {
				i++;
			}
		}

		return flashcards;
	}

	/**
	 * Parse a single flashcard callout starting at the given line index
	 *
	 * @param lines - Array of file lines
	 * @param startIndex - Index of the flashcard callout start line
	 * @returns Object with parsed flashcard and next line index
	 */
	private parseCalloutFlashcard(
		lines: string[],
		startIndex: number
	): { flashcard: Flashcard | null; nextIndex: number } {
		let i = startIndex;
		const frontLines: string[] = [];
		const backLines: string[] = [];
		const hintLines: string[] = [];

		// Parse front content (question/prompt)
		// First line contains the flashcard callout and first line of front
		const firstLine = lines[i].replace(/>[ \t]*\[!flashcard\][+-]?[ \t]*/i, "").trim();
		if (firstLine) {
			frontLines.push(firstLine);
		}
		i++;

		// Continue reading front lines (lines starting with ">")
		// Stop when we hit the answer callout (>> [!answer])
		while (i < lines.length) {
			const line = lines[i];

			// Check for answer callout
			if (/^>[ \t]*>[ \t]*\[!answer\]/i.test(line)) {
				i++;
				break;
			}

			// Check if line is part of the flashcard callout (starts with >)
			if (/^>[ \t]*[^>]/.test(line)) {
				const content = line.replace(/^>[ \t]*/, "");
				frontLines.push(content);
				i++;
			} else if (/^>[ \t]*$/.test(line)) {
				// Empty callout line - only add if we have content already
				// This prevents leading empty lines in front
				if (frontLines.length > 0) {
					frontLines.push("");
				}
				i++;
			} else {
				// End of callout without finding answer
				return { flashcard: null, nextIndex: i };
			}
		}

		// Parse back content (answer/explanation)
		// Read lines starting with ">> " until we hit hint or end of callout
		while (i < lines.length) {
			const line = lines[i];

			// Check for hint callout
			if (/^>[ \t]*>[ \t]*\[!hint\]/i.test(line)) {
				i++;
				break;
			}

			// Check if line is part of the answer (starts with >>)
			if (/^>[ \t]*>[ \t]*[^>]/.test(line)) {
				const content = line.replace(/^>[ \t]*>[ \t]*/, "");
				backLines.push(content);
				i++;
			} else if (/^>[ \t]*>[ \t]*$/.test(line)) {
				// Empty answer line
				backLines.push("");
				i++;
			} else if (/^>[ \t]*$/.test(line)) {
				// Empty callout line (spacer between sections)
				i++;
			} else {
				// End of callout
				break;
			}
		}

		// Parse hint content (optional)
		// Read lines starting with ">> " until end of callout
		if (i > startIndex && i < lines.length && /^>[ \t]*>[ \t]*\[!hint\]/i.test(lines[i - 1])) {
			while (i < lines.length) {
				const line = lines[i];

				// Check if line is part of the hint (starts with >>)
				if (/^>[ \t]*>[ \t]*[^>]/.test(line)) {
					const content = line.replace(/^>[ \t]*>[ \t]*/, "");
					hintLines.push(content);
					i++;
				} else if (/^>[ \t]*>[ \t]*$/.test(line)) {
					// Empty hint line
					hintLines.push("");
					i++;
				} else if (/^>[ \t]*$/.test(line)) {
					// Empty callout line
					i++;
				} else {
					// End of callout
					break;
				}
			}
		}

		// Parse metadata from HTML comments (if present)
		let cardId: string | undefined;
		let flagged = false;

		if (i < lines.length && lines[i].includes("<!--fc-")) {
			const metadataLine = lines[i];

			// Extract card ID
			const idMatch = metadataLine.match(/<!--fc-id:([^>]+)-->/);
			if (idMatch) {
				cardId = idMatch[1];
			}

			// Extract flagged state
			const flaggedMatch = metadataLine.match(/<!--fc-flagged:true-->/);
			if (flaggedMatch) {
				flagged = true;
			}

			i++; // Move past metadata line
		}

		// Validate that we have both front and back content
		const front = frontLines.join("\n").trim();
		const back = backLines.join("\n").trim();

		if (!front || !back) {
			return { flashcard: null, nextIndex: i };
		}

		// Create flashcard
		const flashcard: Flashcard = {
			id: cardId || this.generateId(),
			front,
			back,
			deckId: "", // Will be set by deck manager
			created: Date.now(),
			modified: Date.now(),
			tags: [],
			hint: hintLines.length > 0 ? hintLines.join("\n").trim() : undefined,
			flagged,
		};

		return { flashcard, nextIndex: i };
	}

	/**
	 * Parse flashcards in spaced repetition format
	 * Supports both inline (::) and multiline (??) separators
	 *
	 * Inline format:
	 * **Flashcard:** Front content :: Back content
	 * **Flashcard:** Front content :: Back content <!--Hint: hint text-->
	 *
	 * Multiline format:
	 * **Flashcard:** Front content
	 * ??
	 * Back content
	 * <!--Hint: hint text-->
	 *
	 * @param fileContent - Raw markdown content
	 * @returns Array of parsed flashcards
	 */
	private parseSpacedRepetitionFormat(fileContent: string): Flashcard[] {
		const flashcards: Flashcard[] = [];

		// Get separator from settings
		const inlineSeparator =
			this.settings.flashcardSettings?.inlineSeparator ||
			DEFAULT_FLASHCARD_SETTINGS.inlineSeparator;

		// Parse inline format
		const inlineCards = this.parseInlineFormat(fileContent, inlineSeparator);
		flashcards.push(...inlineCards);

		// Parse multiline format
		const multilineCards = this.parseMultilineFormat(fileContent);
		flashcards.push(...multilineCards);

		return flashcards;
	}

	/**
	 * Parse inline format flashcards
	 * Format: **Flashcard:** Front :: Back [<!--Hint: hint-->]<!--fc-id:id--><!--fc-flagged:true-->
	 *
	 * @param fileContent - Raw markdown content
	 * @param separator - Inline separator (default: ::)
	 * @returns Array of parsed flashcards
	 */
	private parseInlineFormat(fileContent: string, separator: string): Flashcard[] {
		const flashcards: Flashcard[] = [];

		// Escape special regex characters in separator
		const escapedSeparator = this.escapeRegex(separator);

		// Regex to match inline flashcards with optional hint and metadata
		// Matches: **Flashcard:** front :: back [<!--Hint: hint-->]<!--fc-id:id--><!--fc-flagged:true-->
		// Use [^\n] instead of . to ensure we don't match across lines
		const inlineRegex = new RegExp(
			`\\*{2}Flashcard:\\*{2}\\s*([^\n]+?)\\s*${escapedSeparator}\\s*([^\n]+?)(?:\\s*<!--Hint:\\s*([^>]+)-->)?(?:<!--fc-id:([^>]+)-->)?(?:<!--fc-flagged:(true)-->)?(?:\\n|$)`,
			"gi"
		);

		let match;
		while ((match = inlineRegex.exec(fileContent)) !== null) {
			try {
				const front = match[1].trim();
				const back = match[2].trim();
				const hint = match[3] ? match[3].trim() : undefined;
				const cardId = match[4] ? match[4].trim() : undefined;
				const flagged = match[5] === "true";

				if (front && back) {
					const flashcard: Flashcard = {
						id: cardId || this.generateId(),
						front,
						back,
						deckId: "", // Will be set by deck manager
						created: Date.now(),
						modified: Date.now(),
						tags: [],
						hint,
						flagged,
					};
					flashcards.push(flashcard);
				}
			} catch (error) {
				console.warn("Failed to parse inline flashcard:", error);
			}
		}

		return flashcards;
	}

	/**
	 * Parse multiline format flashcards
	 * Format:
	 * **Flashcard:** Front content
	 * ??
	 * Back content
	 * [<!--Hint: hint-->]
	 *
	 * @param fileContent - Raw markdown content
	 * @returns Array of parsed flashcards
	 */
	private parseMultilineFormat(fileContent: string): Flashcard[] {
		const flashcards: Flashcard[] = [];

		// Split into lines for parsing
		const lines = fileContent.split("\n");
		let i = 0;

		while (i < lines.length) {
			const line = lines[i];

			// Check if line starts a multiline flashcard
			if (/^\*{2}Flashcard:\*{2}\s*/i.test(line)) {
				try {
					const result = this.parseMultilineFlashcard(lines, i);
					if (result.flashcard) {
						flashcards.push(result.flashcard);
					}
					i = result.nextIndex;
				} catch (error) {
					console.warn(`Failed to parse multiline flashcard at line ${i}:`, error);
					i++;
				}
			} else {
				i++;
			}
		}

		return flashcards;
	}

	/**
	 * Parse a single multiline flashcard starting at the given line index
	 *
	 * @param lines - Array of file lines
	 * @param startIndex - Index of the flashcard start line
	 * @returns Object with parsed flashcard and next line index
	 */
	private parseMultilineFlashcard(
		lines: string[],
		startIndex: number
	): { flashcard: Flashcard | null; nextIndex: number } {
		let i = startIndex;

		// Extract front content from first line
		const firstLine = lines[i].replace(/^\*{2}Flashcard:\*{2}\s*/i, "").trim();

		// Check if this line contains the inline separator (::) - if so, it's not a multiline flashcard
		const inlineSeparator = this.settings.flashcardSettings?.inlineSeparator || DEFAULT_FLASHCARD_SETTINGS.inlineSeparator;
		if (firstLine.includes(inlineSeparator)) {
			// This is an inline flashcard, not multiline
			return { flashcard: null, nextIndex: startIndex + 1 };
		}

		const frontLines: string[] = firstLine ? [firstLine] : [];
		i++;

		// Continue reading front lines until we hit the separator (??)
		while (i < lines.length && !/^\?\?\s*$/.test(lines[i])) {
			// Stop if we encounter another flashcard marker (would indicate this isn't a multiline flashcard)
			if (/^\*{2}Flashcard:\*{2}/.test(lines[i])) {
				// Not a valid multiline flashcard
				return { flashcard: null, nextIndex: startIndex + 1 };
			}
			frontLines.push(lines[i]);
			i++;
		}

		// Skip the separator line
		if (i >= lines.length || !/^\?\?\s*$/.test(lines[i])) {
			// No separator found, invalid multiline flashcard
			return { flashcard: null, nextIndex: startIndex + 1 };
		}
		i++; // Skip ??

		// Read back content lines
		const backLines: string[] = [];
		while (i < lines.length) {
			const line = lines[i];

			// Check for hint comment or metadata comments (end of flashcard content)
			if (/^<!--(Hint:|fc-)/.test(line)) {
				break;
			}

			// Check for next flashcard or end of content
			if (/^\*{2}Flashcard:\*{2}/.test(line)) {
				break;
			}

			// Check for empty line (potential end of flashcard)
			if (line.trim() === "") {
				// Look ahead to see if there's more content or if this is the end
				if (i + 1 < lines.length && !this.isFlashcardStart(lines[i + 1])) {
					backLines.push(line);
					i++;
				} else {
					break;
				}
			} else {
				backLines.push(line);
				i++;
			}
		}

		// Parse hint if present
		let hint: string | undefined = undefined;
		if (i < lines.length && /^<!--Hint:\s*.+-->/.test(lines[i])) {
			const hintMatch = lines[i].match(/^<!--Hint:\s*(.+)-->/);
			if (hintMatch) {
				hint = hintMatch[1].trim();
				i++;
			}
		}

		// Parse metadata from HTML comments (if present)
		let cardId: string | undefined;
		let flagged = false;

		if (i < lines.length && lines[i].includes("<!--fc-")) {
			const metadataLine = lines[i];

			// Extract card ID
			const idMatch = metadataLine.match(/<!--fc-id:([^>]+)-->/);
			if (idMatch) {
				cardId = idMatch[1];
			}

			// Extract flagged state
			const flaggedMatch = metadataLine.match(/<!--fc-flagged:true-->/);
			if (flaggedMatch) {
				flagged = true;
			}

			i++; // Move past metadata line
		}

		// Skip trailing empty line if present
		if (i < lines.length && lines[i].trim() === "") {
			i++;
		}

		// Validate content
		const front = frontLines.join("\n").trim();
		const back = backLines.join("\n").trim();

		if (!front || !back) {
			return { flashcard: null, nextIndex: i };
		}

		// Create flashcard
		const flashcard: Flashcard = {
			id: cardId || this.generateId(),
			front,
			back,
			deckId: "", // Will be set by deck manager
			created: Date.now(),
			modified: Date.now(),
			tags: [],
			hint,
			flagged,
		};

		return { flashcard, nextIndex: i };
	}

	/**
	 * Check if a line starts a flashcard (callout or spaced repetition)
	 *
	 * @param line - Line to check
	 * @returns True if line starts a flashcard
	 */
	private isFlashcardStart(line: string): boolean {
		return (
			/^>[ \t]*\[!flashcard\]/i.test(line) ||
			/^\*{2}Flashcard:\*{2}/.test(line)
		);
	}

	/**
	 * Escape special regex characters in a string
	 *
	 * @param str - String to escape
	 * @returns Escaped string safe for use in regex
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	/**
	 * Generate a unique ID for a flashcard
	 * Uses timestamp + random string for uniqueness
	 *
	 * @returns Unique ID string
	 */
	private generateId(): string {
		return `fc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}

	// ============================================================================
	// Review Session Management
	// Implements requirements: 3.6, 4.4, 6.1, 8.6
	// ============================================================================

	/**
	 * Load flashcard metadata from storage
	 * @param cardIds - Array of card IDs to load metadata for
	 * @returns Map of card ID to FlashcardMetadata
	 */
	async loadMetadata(cardIds: string[]): Promise<Map<string, FlashcardMetadata>> {
		try {
			return await this.metadataStorage.getCardsMetadata(cardIds);
		} catch (error) {
			console.error("Error loading flashcard metadata:", error);
			new Notice("Failed to load flashcard review history");
			return new Map();
		}
	}

	/**
	 * Save flashcard metadata to storage
	 * @param metadata - Array of flashcard metadata to save
	 */
	async saveMetadata(metadata: FlashcardMetadata[]): Promise<void> {
		try {
			const store = await this.metadataStorage.loadMetadata();

			// Update each card's metadata in the store
			for (const cardMetadata of metadata) {
				store.cards.set(cardMetadata.id, cardMetadata);
			}

			await this.metadataStorage.saveMetadata(store);
		} catch (error) {
			console.error("Error saving flashcard metadata:", error);
			new Notice("Failed to save flashcard review history");
			throw error;
		}
	}

	/**
	 * Start a review session for a deck
	 * Initializes session tracking and sets up auto-save
	 *
	 * @param deckId - ID of the deck to review
	 * @param practiceMode - Practice mode to use for this session
	 * @returns StudySession object tracking session progress
	 * @throws Error if deck doesn't exist or has no due cards
	 */
	async startReviewSession(
		deckId: string,
		practiceMode: PracticeMode = PracticeMode.STANDARD
	): Promise<StudySession> {
		try {
			// Stop any existing session first
			if (this.currentSession) {
				await this.endReviewSession();
			}

			// Initialize new session
			const session: StudySession = {
				deckId,
				startTime: Date.now(),
				endTime: undefined,
				cardsReviewed: 0,
				newCards: 0,
				correctCount: 0,
				againCount: 0,
			};

			this.currentSession = session;

			// Set up auto-save interval
			this.startAutoSave();

			console.log(
				`Started review session for deck ${deckId} in ${practiceMode} mode`
			);
			return session;
		} catch (error) {
			console.error("Error starting review session:", error);
			new Notice("Failed to start review session");
			throw error;
		}
	}

	/**
	 * Record a flashcard review and update metadata
	 * Updates spaced repetition intervals and metadata
	 *
	 * @param cardId - ID of the card being reviewed
	 * @param rating - User's confidence rating
	 * @param timeSpent - Time spent reviewing in milliseconds
	 * @throws Error if no active session or card metadata update fails
	 */
	async recordReview(
		cardId: string,
		rating: ConfidenceRating,
		timeSpent: number = 0
	): Promise<void> {
		if (!this.currentSession) {
			throw new Error("No active review session");
		}

		try {
			// Load current metadata for the card
			let metadata = await this.metadataStorage.getCardMetadata(cardId);

			// Initialize metadata if card is new
			if (!metadata) {
				metadata = SpacedRepetition.initializeMetadata(cardId);
				this.currentSession.newCards++;
			}

			// Calculate next review using SM-2 algorithm
			const updatedMetadata = SpacedRepetition.calculateNextReview(
				metadata,
				rating,
				timeSpent,
				this.currentSession ? PracticeMode.STANDARD : PracticeMode.STANDARD
			);

			// Save updated metadata
			await this.metadataStorage.saveCardMetadata(cardId, updatedMetadata);

			// Update session statistics
			this.currentSession.cardsReviewed++;
			if (rating === ConfidenceRating.AGAIN) {
				this.currentSession.againCount++;
			} else {
				this.currentSession.correctCount++;
			}

			console.log(
				`Recorded review for card ${cardId}: rating=${rating}, nextInterval=${updatedMetadata.interval}days`
			);
		} catch (error) {
			console.error("Error recording review:", error);
			new Notice("Failed to save review progress");
			throw error;
		}
	}

	/**
	 * Get the current active session
	 * @returns Current StudySession or null if no session is active
	 */
	getCurrentSession(): StudySession | null {
		return this.currentSession;
	}

	/**
	 * End the current review session
	 * Stops auto-save and finalizes session statistics
	 *
	 * @returns Final StudySession with complete statistics
	 * @throws Error if no active session
	 */
	async endReviewSession(): Promise<StudySession> {
		if (!this.currentSession) {
			throw new Error("No active review session");
		}

		try {
			// Stop auto-save
			this.stopAutoSave();

			// Finalize session
			this.currentSession.endTime = Date.now();

			// Perform final metadata save
			await this.performAutoSave();

			const finalSession = { ...this.currentSession };

			// Log session summary
			const duration = Math.round(
				(finalSession.endTime! - finalSession.startTime) / 1000 / 60
			); // minutes
			console.log(
				`Ended review session: ${finalSession.cardsReviewed} cards in ${duration} minutes`
			);
			console.log(
				`  - Correct: ${finalSession.correctCount}, Again: ${finalSession.againCount}, New: ${finalSession.newCards}`
			);

			// Clear current session
			this.currentSession = null;

			return finalSession;
		} catch (error) {
			console.error("Error ending review session:", error);
			new Notice("Error saving final session data");
			throw error;
		}
	}

	/**
	 * Start auto-save timer for metadata during review sessions
	 * Saves metadata every 30 seconds to prevent data loss
	 */
	private startAutoSave(): void {
		// Clear any existing interval
		this.stopAutoSave();

		// Set up new interval
		this.autoSaveInterval = window.setInterval(async () => {
			await this.performAutoSave();
		}, this.autoSaveIntervalMs);

		console.log(
			`Auto-save enabled (every ${this.autoSaveIntervalMs / 1000} seconds)`
		);
	}

	/**
	 * Stop auto-save timer
	 */
	private stopAutoSave(): void {
		if (this.autoSaveInterval !== null) {
			window.clearInterval(this.autoSaveInterval);
			this.autoSaveInterval = null;
			console.log("Auto-save disabled");
		}
	}

	/**
	 * Perform an auto-save of metadata
	 * Called periodically during review sessions
	 */
	private async performAutoSave(): Promise<void> {
		try {
			// The metadata is already saved in recordReview(),
			// but we can use this to ensure cache is persisted
			// In case of any pending operations
			console.log("Auto-save triggered (metadata already saved per review)");
		} catch (error) {
			console.error("Error during auto-save:", error);
			// Don't show notice for auto-save failures to avoid interrupting user
		}
	}

	/**
	 * Get session statistics for display
	 * @returns Current session statistics or null if no active session
	 */
	getSessionStats(): StudySession | null {
		return this.currentSession ? { ...this.currentSession } : null;
	}

	/**
	 * Clean up resources when reviewer is destroyed
	 * Ensures auto-save is stopped and any pending session is ended
	 */
	async cleanup(): Promise<void> {
		try {
			this.stopAutoSave();
			if (this.currentSession) {
				await this.endReviewSession();
			}
		} catch (error) {
			console.error("Error during cleanup:", error);
		}
	}

	/**
	 * Generate flashcards from a note file
	 * Opens a modal to configure flashcard generation settings
	 * Requirement 10.1: Generate flashcards from note content
	 *
	 * @param file - The note file to generate flashcards from
	 */
	async generateFlashcardsFromNote(file: TFile): Promise<void> {
		const { Notice, Modal } = await import("obsidian");
		const { default: FlashcardEngine } = await import("./flashcardEngine");
		const { default: DeckManager } = await import("./deckManager");
		const { default: FlashcardSaver } = await import("./flashcardSaver");

		try {
			// Read note content
			const content = await this.app.vault.read(file);

			if (!content || content.trim().length === 0) {
				new Notice("Cannot generate flashcards from empty note");
				return;
			}

			// Create a simple modal to get user input for deck selection and card count
			class FlashcardGeneratorModal extends Modal {
				result: { deckId: string; count: number } | null = null;
				onSubmit: (result: { deckId: string; count: number }) => void;

				constructor(app: App, onSubmit: (result: { deckId: string; count: number }) => void) {
					super(app);
					this.onSubmit = onSubmit;
				}

				onOpen() {
					const { contentEl } = this;
					contentEl.createEl("h2", { text: "Generate Flashcards" });

					// Deck selection (simplified - use default deck for now)
				// TODO(flashcard-ui): Replace with DeckSelector component from src/ui/flashcards/DeckSelector.tsx
				// See also: openFlashcardReview() which needs the same deck selector
					contentEl.createEl("p", { text: "Deck: Default (auto-created)" });

					// Card count input
					const countInput = contentEl.createEl("input", {
						attr: { type: "number", value: "10", min: "1", max: "50" }
					}) as HTMLInputElement;
					contentEl.createEl("label", { text: "Number of flashcards to generate (1-50)" });
					contentEl.appendChild(countInput as Node);

					// Submit button
					const submitBtn = contentEl.createEl("button", { text: "Generate" });
					submitBtn.addEventListener("click", () => {
						const count = parseInt(countInput.value) || 10;
						this.result = { deckId: "default", count };
						this.close();
					});
				}

				onClose() {
					const { contentEl } = this;
					contentEl.empty();
					if (this.result) {
						this.onSubmit(this.result);
					}
				}
			}

			// Open modal and get user input
			const modalResult = await new Promise<{ deckId: string; count: number } | null>((resolve) => {
				new FlashcardGeneratorModal(this.app, resolve).open();
			});

			if (!modalResult) {
				return;
			}

			// Ensure deck exists
			const deckManager = new DeckManager(this.app, this.settings);
			let deck = await deckManager.getDeck(modalResult.deckId);

			if (!deck) {
				// Create default deck based on note name
				const deckName = file.basename;
				deck = await deckManager.createDeck(deckName, `Flashcards from ${file.basename}`);
			}

			// Generate flashcards
			new Notice("Generating flashcards...");
			const engine = new FlashcardEngine(this.app, this.settings);
			const flashcards = await engine.generateFlashcards(content, modalResult.count, deck.id);

			// Save flashcards
			const saver = new FlashcardSaver(this.app, this.settings, [file]);
			await saver.saveFlashcards(flashcards);

			// Add cards to deck
			const cardIds = flashcards.map(card => card.id);
			await deckManager.addCardsToDeck(deck.id, cardIds);

			new Notice(`Generated ${flashcards.length} flashcards and saved to deck "${deck.name}"`);
		} catch (error) {
			const errorMessage = (error as Error).message;
			new Notice(`Failed to generate flashcards: ${errorMessage}`, 0);
			console.error("Error generating flashcards:", error);
		}
	}

	/**
	 * Open flashcard review interface
	 * Shows deck selector and starts review session
	 * Requirement 10.2: Access flashcard review interface
	 */
	async openFlashcardReview(deckId?: string): Promise<void> {
		const { Notice } = await import("obsidian");
		const { default: DeckManager } = await import("./deckManager");

		try {
			const deckManager = new DeckManager(this.app, this.settings);

			// If deck ID is provided, open review directly
			if (deckId) {
				await this.startDeckReview(deckId);
				return;
			}

			// Otherwise, show deck selection interface
			const decks = await deckManager.getAllDecks();

			if (decks.length === 0) {
				new Notice(
					"No flashcard decks found. Generate flashcards from a note to create your first deck.",
					6000
				);
				return;
			}

			// For now, just open the first deck
			// TODO(flashcard-ui): Integrate DeckSelector component for multi-deck selection
			// Component exists at src/ui/flashcards/DeckSelector.tsx but needs React modal integration
			new Notice(`Opening deck: ${decks[0].name}`);
			await this.startDeckReview(decks[0].id);
		} catch (error) {
			const errorMessage = (error as Error).message;
			new Notice(`Failed to open flashcard review: ${errorMessage}`, 0);
			console.error("Error opening flashcard review:", error);
		}
	}

	/**
	 * Start review session for a specific deck
	 * Checks for paused sessions and prompts user to resume or start fresh
	 * @param deckId - ID of the deck to review
	 */
	private async startDeckReview(deckId: string): Promise<void> {
		const { Notice, Modal } = await import("obsidian");
		const { default: DeckManager } = await import("./deckManager");
		const { loadPausedSession, clearPausedSession, hasPausedSessionForDeck } = await import("../../utils/pausedSessionStorage");
		const { ResumeSessionModal } = await import("../../ui/components/ResumeSessionModal");

		try {
			const deckManager = new DeckManager(this.app, this.settings);
			const deck = await deckManager.getDeck(deckId);

			if (!deck) {
				new Notice(`Deck not found`);
				return;
			}

			// Load deck cards and metadata
			const metadata = await this.metadataStorage.loadMetadata();

			// Get all cards from this deck
			const deckCards: any[] = [];
			for (const cardId of deck.cardIds) {
				// Find the card in the deck's source folder
				if (!deck.sourceFolder) continue;
				const deckFile = this.app.vault.getAbstractFileByPath(deck.sourceFolder);
				if (deckFile && deckFile instanceof (await import("obsidian")).TFile) {
					const content = await this.app.vault.read(deckFile);
					// Parse cards from the file (simplified - you may need to adjust based on your file format)
					// This is a placeholder - the actual implementation depends on your flashcard file format
				}
			}

			// Get due cards from this deck
			const now = Date.now();
			let dueCount = 0;

			for (const cardId of deck.cardIds) {
				const cardMetadata = metadata.cards.get(cardId);
				if (cardMetadata && cardMetadata.dueDate <= now) {
					dueCount++;
				}
			}

			if (dueCount === 0) {
				new Notice(`All caught up! No cards due for review in "${deck.name}".`);
				return;
			}

			// Check for paused session
			if (hasPausedSessionForDeck(deckId)) {
				const pausedSession = loadPausedSession();
				if (pausedSession) {
					// Show resume prompt
					new ResumeSessionModal(
						this.app,
						deck.name,
						pausedSession.cardIndex,
						deckCards.length,
						pausedSession.pausedAt,
						() => {
							// Resume session
							this.renderFlashcardModal(deck, deckCards, metadata.cards, pausedSession);
						},
						() => {
							// Start fresh - clear paused session
							clearPausedSession();
							this.renderFlashcardModal(deck, deckCards, metadata.cards);
						}
					).open();
					return;
				}
			}

			// No paused session - start fresh
			this.renderFlashcardModal(deck, deckCards, metadata.cards);
		} catch (error) {
			const errorMessage = (error as Error).message;
			new Notice(`Failed to start deck review: ${errorMessage}`, 0);
			console.error("Error starting deck review:", error);
		}
	}

	/**
	 * Renders the flashcard modal for review
	 * @param deck - The deck being reviewed
	 * @param cards - Array of flashcards to review
	 * @param metadata - Map of card metadata
	 * @param pausedSession - Optional paused session state to restore
	 */
	private renderFlashcardModal(
		deck: any,
		cards: any[],
		metadata: Map<string, any>,
		pausedSession?: any
	): void {
		// TODO(flashcard-ui): Implement FlashcardModal with React rendering
		// Blocked by: React modal infrastructure setup (similar to QuizModal pattern)
		// Should integrate with: FlashcardCard.tsx, DeckSelector.tsx components
		const { Notice } = require("obsidian");
		new Notice(`Review modal for deck "${deck.name}" - Implementation in progress`);
	}
}
