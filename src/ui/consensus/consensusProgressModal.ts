import { App, Modal } from "obsidian";
import { ConsensusProgress, ConsensusPhase, PartialConsensusResult } from "../../consensus/types";
import { Question } from "../../utils/types";

/**
 * Progress modal for consensus quiz generation
 *
 * Displays three phases with progress bars and detailed status:
 * 1. Source Validation - Validating source material through multiple models
 * 2. Initial Generation - Generating questions from multiple models
 * 3. Consensus Building - Iteratively building consensus with round tracking
 *
 * Requirements:
 * - 7.1: Display progress indicator showing current phase and estimated completion
 * - 7.2: Show real-time progress updates
 * - 7.3: Allow user to cancel and abort generation
 */
export class ConsensusProgressModal extends Modal {
	/** Callback to abort the consensus process */
	private readonly onCancel?: () => void;

	/** Current progress state */
	private currentProgress?: ConsensusProgress;

	/** DOM elements for progress bars */
	private sourceValidationBar?: HTMLDivElement;
	private initialGenerationBar?: HTMLDivElement;
	private consensusBuildingBar?: HTMLDivElement;

	/** DOM elements for status indicators */
	private sourceValidationStatus?: HTMLSpanElement;
	private initialGenerationStatus?: HTMLSpanElement;
	private consensusBuildingStatus?: HTMLSpanElement;

	/** DOM element for detailed status message */
	private detailsElement?: HTMLDivElement;

	/** DOM element for consensus round info */
	private consensusRoundElement?: HTMLDivElement;

	/** DOM element for questions resolved info */
	private questionsResolvedElement?: HTMLDivElement;

	/** DOM element for displaying partial results */
	private partialResultsContainer?: HTMLDivElement;

	/** Cancel button element */
	private cancelButton?: HTMLButtonElement;

	/** Whether cancellation was requested */
	private cancelled: boolean = false;

	/** Array of partial results received */
	private partialResults: PartialConsensusResult[] = [];

	/** DOM element for error messages */
	private errorContainer?: HTMLDivElement;

	/** DOM element for warning messages */
	private warningContainer?: HTMLDivElement;

	/**
	 * Create a new consensus progress modal
	 *
	 * @param app - The Obsidian app instance
	 * @param onCancel - Optional callback to abort consensus generation
	 */
	constructor(app: App, onCancel?: () => void) {
		super(app);
		this.onCancel = onCancel;
	}

	/**
	 * Initialize the modal UI
	 *
	 * Requirement 7.1: Display progress indicator with three phases
	 */
	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("consensus-progress-modal");

		// Modal title
		contentEl.createEl("h2", { text: "Generating Quiz with Consensus" });

		// Create progress sections for each phase
		this.createPhaseSection(
			contentEl,
			"Phase 1: Source Validation",
			"source-validation"
		);
		this.createPhaseSection(
			contentEl,
			"Phase 2: Initial Generation",
			"initial-generation"
		);
		this.createPhaseSection(
			contentEl,
			"Phase 3: Consensus Building",
			"consensus-building"
		);

		// Detailed status message
		this.detailsElement = contentEl.createDiv({
			cls: "consensus-progress-details"
		});
		this.detailsElement.textContent = "Initializing consensus generation...";

		// Consensus round info (only shown during consensus phase)
		this.consensusRoundElement = contentEl.createDiv({
			cls: "consensus-round-info"
		});
		this.consensusRoundElement.style.display = "none";

		// Questions resolved info (only shown during consensus phase)
		this.questionsResolvedElement = contentEl.createDiv({
			cls: "consensus-questions-info"
		});
		this.questionsResolvedElement.style.display = "none";

		// Partial results container (for progressive streaming)
		// Requirement 7.2: Display questions as they reach consensus
		this.partialResultsContainer = contentEl.createDiv({
			cls: "consensus-partial-results"
		});
		this.partialResultsContainer.style.display = "none";

		const partialResultsHeader = this.partialResultsContainer.createEl("h3", {
			text: "Questions Ready",
			cls: "consensus-partial-results-header"
		});

		// Error container for displaying error messages
		// Requirement 8.2, 8.5: Display helpful error messages
		this.errorContainer = contentEl.createDiv({
			cls: "consensus-error-container"
		});
		this.errorContainer.style.display = "none";

		// Warning container for displaying warnings
		this.warningContainer = contentEl.createDiv({
			cls: "consensus-warning-container"
		});
		this.warningContainer.style.display = "none";

		// Cancel button
		// Requirement 7.3: Allow user to cancel generation
		const buttonContainer = contentEl.createDiv({
			cls: "consensus-progress-buttons"
		});
		this.cancelButton = buttonContainer.createEl("button", {
			cls: "consensus-progress-cancel"
		}) as HTMLButtonElement;
		this.cancelButton.textContent = "Cancel";
		this.cancelButton.addEventListener("click", () => {
			this.handleCancel();
		});
	}

	/**
	 * Create a progress section for a phase
	 *
	 * @param container - Parent container element
	 * @param title - Phase title
	 * @param phaseKey - Phase identifier for CSS classes
	 */
	private createPhaseSection(
		container: HTMLElement,
		title: string,
		phaseKey: string
	): void {
		const section = container.createDiv({
			cls: `consensus-phase-section consensus-phase-${phaseKey}`
		});

		// Phase header with title and status
		const header = section.createDiv({ cls: "consensus-phase-header" });
		header.createEl("span", {
			text: title,
			cls: "consensus-phase-title"
		});

		const status = header.createEl("span", {
			text: "Pending",
			cls: "consensus-phase-status"
		});

		// Progress bar container
		const barContainer = section.createDiv({
			cls: "consensus-progress-bar-container"
		});
		const bar = barContainer.createDiv({
			cls: "consensus-progress-bar"
		});
		bar.style.width = "0%";

		// Store references based on phase
		if (phaseKey === "source-validation") {
			this.sourceValidationBar = bar;
			this.sourceValidationStatus = status;
		} else if (phaseKey === "initial-generation") {
			this.initialGenerationBar = bar;
			this.initialGenerationStatus = status;
		} else if (phaseKey === "consensus-building") {
			this.consensusBuildingBar = bar;
			this.consensusBuildingStatus = status;
		}
	}

	/**
	 * Update the progress display
	 *
	 * Requirement 7.2: Show real-time progress updates
	 * Requirement 7.1: Display current consensus round and questions resolved
	 *
	 * @param progress - Updated progress information
	 */
	updateProgress(progress: ConsensusProgress): void {
		this.currentProgress = progress;

		// Update detailed status message
		if (this.detailsElement) {
			this.detailsElement.textContent = progress.statusMessage;
		}

		// Update phase-specific UI elements
		switch (progress.phase) {
			case ConsensusPhase.SOURCE_VALIDATION:
				this.updatePhaseProgress(
					this.sourceValidationBar,
					this.sourceValidationStatus,
					progress.phaseProgress,
					"In Progress",
					"completed"
				);
				break;

			case ConsensusPhase.INITIAL_GENERATION:
				// Mark source validation as complete
				this.updatePhaseProgress(
					this.sourceValidationBar,
					this.sourceValidationStatus,
					1.0,
					"Complete",
					"completed"
				);
				// Update initial generation
				this.updatePhaseProgress(
					this.initialGenerationBar,
					this.initialGenerationStatus,
					progress.phaseProgress,
					"In Progress",
					"in-progress"
				);
				break;

			case ConsensusPhase.CONSENSUS_BUILDING:
				// Mark previous phases as complete
				this.updatePhaseProgress(
					this.sourceValidationBar,
					this.sourceValidationStatus,
					1.0,
					"Complete",
					"completed"
				);
				this.updatePhaseProgress(
					this.initialGenerationBar,
					this.initialGenerationStatus,
					1.0,
					"Complete",
					"completed"
				);
				// Update consensus building
				this.updatePhaseProgress(
					this.consensusBuildingBar,
					this.consensusBuildingStatus,
					progress.phaseProgress,
					"In Progress",
					"in-progress"
				);

				// Show consensus round info
				if (
					this.consensusRoundElement &&
					progress.currentRound !== undefined &&
					progress.totalRounds !== undefined
				) {
					this.consensusRoundElement.style.display = "block";
					this.consensusRoundElement.textContent = `Round ${progress.currentRound}/${progress.totalRounds}`;
				}

				// Show questions resolved info
				if (
					this.questionsResolvedElement &&
					progress.questionsResolved !== undefined &&
					progress.totalQuestions !== undefined
				) {
					this.questionsResolvedElement.style.display = "block";
					const resolvedIcon =
						progress.questionsResolved === progress.totalQuestions
							? "✓"
							: "⟳";
					this.questionsResolvedElement.textContent = `${resolvedIcon} ${progress.questionsResolved}/${progress.totalQuestions} questions reached consensus`;
				}
				break;

			case ConsensusPhase.FINALIZATION:
				// Mark all phases as complete
				this.updatePhaseProgress(
					this.sourceValidationBar,
					this.sourceValidationStatus,
					1.0,
					"Complete",
					"completed"
				);
				this.updatePhaseProgress(
					this.initialGenerationBar,
					this.initialGenerationStatus,
					1.0,
					"Complete",
					"completed"
				);
				this.updatePhaseProgress(
					this.consensusBuildingBar,
					this.consensusBuildingStatus,
					1.0,
					"Complete",
					"completed"
				);

				// Hide consensus-specific info
				if (this.consensusRoundElement) {
					this.consensusRoundElement.style.display = "none";
				}
				if (this.questionsResolvedElement) {
					this.questionsResolvedElement.style.display = "none";
				}
				break;
		}
	}

	/**
	 * Update a specific phase's progress bar and status
	 *
	 * @param bar - Progress bar element
	 * @param status - Status text element
	 * @param progress - Progress value (0-1)
	 * @param statusText - Status text to display
	 * @param statusClass - CSS class for status styling
	 */
	private updatePhaseProgress(
		bar: HTMLDivElement | undefined,
		status: HTMLSpanElement | undefined,
		progress: number,
		statusText: string,
		statusClass: string
	): void {
		if (bar) {
			const percentage = Math.round(progress * 100);
			bar.style.width = `${percentage}%`;
		}

		if (status) {
			status.textContent = statusText;
			status.className = `consensus-phase-status consensus-phase-${statusClass}`;
		}
	}

	/**
	 * Handle cancel button click
	 *
	 * Requirement 7.3: Allow user to cancel and abort generation
	 */
	private handleCancel(): void {
		if (this.cancelled) {
			return;
		}

		this.cancelled = true;

		// Disable cancel button
		if (this.cancelButton) {
			this.cancelButton.disabled = true;
			this.cancelButton.textContent = "Cancelling...";
		}

		// Update status message
		if (this.detailsElement) {
			this.detailsElement.textContent = "Cancelling consensus generation...";
		}

		// Call cancel callback
		if (this.onCancel) {
			this.onCancel();
		}

		// Close modal after a brief delay to show cancellation message
		setTimeout(() => {
			this.close();
		}, 1000);
	}

	/**
	 * Add a partial result to the display
	 *
	 * Requirement 7.2: Display questions as they reach consensus
	 * Requirement 7.3: Update progress UI to show partial results
	 *
	 * @param result - Partial consensus result for a single question
	 */
	addPartialResult(result: PartialConsensusResult): void {
		// Show partial results container if not visible
		if (this.partialResultsContainer && this.partialResultsContainer.style.display === "none") {
			this.partialResultsContainer.style.display = "block";
		}

		// Store partial result
		this.partialResults.push(result);

		// Create question preview element
		const questionPreview = this.partialResultsContainer!.createDiv({
			cls: "consensus-partial-result-item"
		});

		// Question number badge
		const badge = questionPreview.createEl("span", {
			text: `Q${result.questionIndex + 1}`,
			cls: "consensus-partial-result-badge"
		});

		// Consensus indicator
		const consensusIndicator = questionPreview.createEl("span", {
			cls: "consensus-partial-result-indicator"
		});

		if (result.trail.consensusReached) {
			consensusIndicator.textContent = "✓";
			consensusIndicator.addClass("consensus-reached");
			consensusIndicator.setAttribute("aria-label", `Consensus reached (${Math.round(result.trail.agreementPercentage * 100)}% agreement)`);
		} else {
			consensusIndicator.textContent = "~";
			consensusIndicator.addClass("consensus-partial");
			consensusIndicator.setAttribute("aria-label", "Partial consensus");
		}

		// Question text preview (first 80 characters)
		const questionText = this.getQuestionText(result.question);
		const preview = questionPreview.createEl("span", {
			text: questionText.length > 80 ? questionText.substring(0, 77) + "..." : questionText,
			cls: "consensus-partial-result-text"
		});
		preview.setAttribute("title", questionText);

		// Consensus rounds indicator
		const roundsIndicator = questionPreview.createEl("span", {
			text: `${result.trail.roundsRequired} ${result.trail.roundsRequired === 1 ? "round" : "rounds"}`,
			cls: "consensus-partial-result-rounds"
		});

		// Scroll to bottom to show new result
		this.partialResultsContainer!.scrollTop = this.partialResultsContainer!.scrollHeight;
	}

	/**
	 * Extract question text from a question object
	 *
	 * @param question - The question object
	 * @returns The question text
	 */
	private getQuestionText(question: Question): string {
		return question.question || "Unknown question";
	}

	/**
	 * Get all partial results received so far
	 *
	 * @returns Array of partial consensus results
	 */
	getPartialResults(): PartialConsensusResult[] {
		return [...this.partialResults];
	}

	/**
	 * Clear all partial results
	 */
	clearPartialResults(): void {
		this.partialResults = [];
		if (this.partialResultsContainer) {
			// Keep the header, clear only the results
			const header = this.partialResultsContainer.querySelector(".consensus-partial-results-header");
			this.partialResultsContainer.empty();
			if (header) {
				this.partialResultsContainer.appendChild(header);
			}
			this.partialResultsContainer.style.display = "none";
		}
	}

	/**
	 * Check if cancellation was requested
	 *
	 * @returns True if user cancelled
	 */
	isCancelled(): boolean {
		return this.cancelled;
	}

	/**
	 * Display an error message in the progress modal
	 *
	 * Requirement 8.2, 8.5: Display user-friendly error messages with suggestions
	 *
	 * @param title - Error title
	 * @param message - Error message
	 * @param suggestions - Optional array of suggestions to resolve the error
	 */
	showError(title: string, message: string, suggestions?: string[]): void {
		if (!this.errorContainer) {
			return;
		}

		// Clear previous errors
		this.errorContainer.empty();
		this.errorContainer.style.display = "block";

		// Error header
		const header = this.errorContainer.createEl("h3", {
			text: `⚠️ ${title}`,
			cls: "consensus-error-header"
		});

		// Error message
		const messageEl = this.errorContainer.createEl("p", {
			text: message,
			cls: "consensus-error-message"
		});

		// Suggestions list
		if (suggestions && suggestions.length > 0) {
			const suggestionsHeader = this.errorContainer.createEl("p", {
				text: "Suggestions:",
				cls: "consensus-error-suggestions-header"
			});

			const suggestionsList = this.errorContainer.createEl("ul", {
				cls: "consensus-error-suggestions-list"
			});

			suggestions.forEach((suggestion) => {
				suggestionsList.createEl("li", {
					text: suggestion,
					cls: "consensus-error-suggestion-item"
				});
			});
		}
	}

	/**
	 * Display a warning message in the progress modal
	 *
	 * Requirement 8.2: Display warnings for non-critical issues
	 *
	 * @param title - Warning title
	 * @param message - Warning message
	 */
	showWarning(title: string, message: string): void {
		if (!this.warningContainer) {
			return;
		}

		// Show warning container if hidden
		if (this.warningContainer.style.display === "none") {
			this.warningContainer.style.display = "block";
		}

		// Create warning item
		const warningItem = this.warningContainer.createDiv({
			cls: "consensus-warning-item"
		});

		const warningIcon = warningItem.createEl("span", {
			text: "⚠ ",
			cls: "consensus-warning-icon"
		});

		const warningText = warningItem.createEl("span", {
			text: `${title}: ${message}`,
			cls: "consensus-warning-text"
		});
	}

	/**
	 * Clear all error messages
	 */
	clearError(): void {
		if (this.errorContainer) {
			this.errorContainer.empty();
			this.errorContainer.style.display = "none";
		}
	}

	/**
	 * Clear all warning messages
	 */
	clearWarnings(): void {
		if (this.warningContainer) {
			this.warningContainer.empty();
			this.warningContainer.style.display = "none";
		}
	}

	/**
	 * Clean up modal when closed
	 */
	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.partialResults = [];
	}
}
