import { App, Modal } from "obsidian";
import { CouncilProgress, CouncilPhase } from "../../council/types";

/**
 * Progress modal for LLM Council quiz generation
 *
 * Displays five phases with progress bars and detailed status:
 * 1. Parallel Query - Multiple models generating initial responses
 * 2. Critique - Models anonymously critiquing each other's outputs
 * 3. Ranking - Models ranking responses from best to worst
 * 4. Synthesis - Chair model synthesizing final quiz
 * 5. Finalization - Completing the council process
 *
 * Requirements:
 * - 5.1: Display progress indicator showing current phase
 * - 5.2: Show real-time progress updates for parallel query
 * - 5.3: Show real-time progress updates for critique phase
 * - 5.4: Show real-time progress updates for ranking phase
 * - 5.5: Show real-time progress updates for synthesis phase
 * - 5.6: Show real-time progress updates for finalization
 */
export class CouncilProgressModal extends Modal {
	/** Callback to abort the council process */
	private readonly onCancel?: () => void;

	/** Current progress state */
	private currentProgress?: CouncilProgress;

	/** DOM elements for progress bars */
	private parallelQueryBar?: HTMLDivElement;
	private critiqueBar?: HTMLDivElement;
	private rankingBar?: HTMLDivElement;
	private synthesisBar?: HTMLDivElement;
	private finalizationBar?: HTMLDivElement;

	/** DOM elements for status indicators */
	private parallelQueryStatus?: HTMLSpanElement;
	private critiqueStatus?: HTMLSpanElement;
	private rankingStatus?: HTMLSpanElement;
	private synthesisStatus?: HTMLSpanElement;
	private finalizationStatus?: HTMLSpanElement;

	/** DOM element for detailed status message */
	private detailsElement?: HTMLDivElement;

	/** DOM element for models responded info */
	private modelsRespondedElement?: HTMLDivElement;

	/** DOM element for critiques completed info */
	private critiquesCompletedElement?: HTMLDivElement;

	/** DOM element for rankings completed info */
	private rankingsCompletedElement?: HTMLDivElement;

	/** Cancel button element */
	private cancelButton?: HTMLButtonElement;

	/** Whether cancellation was requested */
	private cancelled: boolean = false;

	/** DOM element for error messages */
	private errorContainer?: HTMLDivElement;

	/** DOM element for warning messages */
	private warningContainer?: HTMLDivElement;

	/**
	 * Create a new council progress modal
	 *
	 * @param app - The Obsidian app instance
	 * @param onCancel - Optional callback to abort council generation
	 */
	constructor(app: App, onCancel?: () => void) {
		super(app);
		this.onCancel = onCancel;
	}

	/**
	 * Initialize the modal UI
	 *
	 * Requirement 5.1: Display progress indicator with five phases
	 */
	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("council-progress-modal");

		// Modal title
		contentEl.createEl("h2", { text: "Generating Quiz with LLM Council" });

		// Create progress sections for each phase
		this.createPhaseSection(
			contentEl,
			"Phase 1: Parallel Query",
			"parallel-query"
		);
		this.createPhaseSection(
			contentEl,
			"Phase 2: Critique",
			"critique"
		);
		this.createPhaseSection(
			contentEl,
			"Phase 3: Ranking",
			"ranking"
		);
		this.createPhaseSection(
			contentEl,
			"Phase 4: Chair Synthesis",
			"synthesis"
		);
		this.createPhaseSection(
			contentEl,
			"Phase 5: Finalization",
			"finalization"
		);

		// Detailed status message
		this.detailsElement = contentEl.createDiv({
			cls: "council-progress-details"
		});
		this.detailsElement.textContent = "Initializing council generation...";

		// Models responded info (only shown during parallel query phase)
		this.modelsRespondedElement = contentEl.createDiv({
			cls: "council-models-responded-info"
		});
		this.modelsRespondedElement.style.display = "none";

		// Critiques completed info (only shown during critique phase)
		this.critiquesCompletedElement = contentEl.createDiv({
			cls: "council-critiques-completed-info"
		});
		this.critiquesCompletedElement.style.display = "none";

		// Rankings completed info (only shown during ranking phase)
		this.rankingsCompletedElement = contentEl.createDiv({
			cls: "council-rankings-completed-info"
		});
		this.rankingsCompletedElement.style.display = "none";

		// Error container for displaying error messages
		// Requirement 8.2, 8.5: Display helpful error messages
		this.errorContainer = contentEl.createDiv({
			cls: "council-error-container"
		});
		this.errorContainer.style.display = "none";

		// Warning container for displaying warnings
		this.warningContainer = contentEl.createDiv({
			cls: "council-warning-container"
		});
		this.warningContainer.style.display = "none";

		// Cancel button
		// Requirement 5.6: Allow user to cancel generation
		const buttonContainer = contentEl.createDiv({
			cls: "council-progress-buttons"
		});
		this.cancelButton = buttonContainer.createEl("button", {
			cls: "council-progress-cancel"
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
			cls: `council-phase-section council-phase-${phaseKey}`
		});

		// Phase header with title and status
		const header = section.createDiv({ cls: "council-phase-header" });
		header.createEl("span", {
			text: title,
			cls: "council-phase-title"
		});

		const status = header.createEl("span", {
			text: "Pending",
			cls: "council-phase-status"
		});

		// Progress bar container
		const barContainer = section.createDiv({
			cls: "council-progress-bar-container"
		});
		const bar = barContainer.createDiv({
			cls: "council-progress-bar"
		});
		bar.style.width = "0%";

		// Store references based on phase
		if (phaseKey === "parallel-query") {
			this.parallelQueryBar = bar;
			this.parallelQueryStatus = status;
		} else if (phaseKey === "critique") {
			this.critiqueBar = bar;
			this.critiqueStatus = status;
		} else if (phaseKey === "ranking") {
			this.rankingBar = bar;
			this.rankingStatus = status;
		} else if (phaseKey === "synthesis") {
			this.synthesisBar = bar;
			this.synthesisStatus = status;
		} else if (phaseKey === "finalization") {
			this.finalizationBar = bar;
			this.finalizationStatus = status;
		}
	}

	/**
	 * Update the progress display
	 *
	 * Requirement 5.2-5.6: Show real-time progress updates for all phases
	 *
	 * @param progress - Updated progress information
	 */
	updateProgress(progress: CouncilProgress): void {
		this.currentProgress = progress;

		// Update detailed status message
		if (this.detailsElement) {
			this.detailsElement.textContent = progress.statusMessage;
		}

		// Update phase-specific UI elements
		switch (progress.phase) {
			case CouncilPhase.PARALLEL_QUERY:
				this.updatePhaseProgress(
					this.parallelQueryBar,
					this.parallelQueryStatus,
					progress.phaseProgress,
					"In Progress",
					"in-progress"
				);

				// Show models responded info
				if (
					this.modelsRespondedElement &&
					progress.modelsResponded !== undefined &&
					progress.totalModels !== undefined
				) {
					this.modelsRespondedElement.style.display = "block";
					this.modelsRespondedElement.textContent = `Models responded: ${progress.modelsResponded}/${progress.totalModels}`;
				}
				break;

			case CouncilPhase.CRITIQUE:
				// Mark parallel query as complete
				this.updatePhaseProgress(
					this.parallelQueryBar,
					this.parallelQueryStatus,
					1.0,
					"Complete",
					"completed"
				);
				// Hide models responded info
				if (this.modelsRespondedElement) {
					this.modelsRespondedElement.style.display = "none";
				}

				// Update critique phase
				this.updatePhaseProgress(
					this.critiqueBar,
					this.critiqueStatus,
					progress.phaseProgress,
					"In Progress",
					"in-progress"
				);

				// Show critiques completed info
				if (
					this.critiquesCompletedElement &&
					progress.critiquesCompleted !== undefined &&
					progress.totalModels !== undefined
				) {
					this.critiquesCompletedElement.style.display = "block";
					this.critiquesCompletedElement.textContent = `Critiques completed: ${progress.critiquesCompleted}/${progress.totalModels}`;
				}
				break;

			case CouncilPhase.RANKING:
				// Mark previous phases as complete
				this.updatePhaseProgress(
					this.parallelQueryBar,
					this.parallelQueryStatus,
					1.0,
					"Complete",
					"completed"
				);
				this.updatePhaseProgress(
					this.critiqueBar,
					this.critiqueStatus,
					1.0,
					"Complete",
					"completed"
				);
				// Hide critique info
				if (this.critiquesCompletedElement) {
					this.critiquesCompletedElement.style.display = "none";
				}

				// Update ranking phase
				this.updatePhaseProgress(
					this.rankingBar,
					this.rankingStatus,
					progress.phaseProgress,
					"In Progress",
					"in-progress"
				);

				// Show rankings completed info
				if (
					this.rankingsCompletedElement &&
					progress.rankingsCompleted !== undefined &&
					progress.totalModels !== undefined
				) {
					this.rankingsCompletedElement.style.display = "block";
					this.rankingsCompletedElement.textContent = `Rankings completed: ${progress.rankingsCompleted}/${progress.totalModels}`;
				}
				break;

			case CouncilPhase.SYNTHESIS:
				// Mark previous phases as complete
				this.updatePhaseProgress(
					this.parallelQueryBar,
					this.parallelQueryStatus,
					1.0,
					"Complete",
					"completed"
				);
				this.updatePhaseProgress(
					this.critiqueBar,
					this.critiqueStatus,
					1.0,
					"Complete",
					"completed"
				);
				this.updatePhaseProgress(
					this.rankingBar,
					this.rankingStatus,
					1.0,
					"Complete",
					"completed"
				);
				// Hide ranking info
				if (this.rankingsCompletedElement) {
					this.rankingsCompletedElement.style.display = "none";
				}

				// Update synthesis phase
				this.updatePhaseProgress(
					this.synthesisBar,
					this.synthesisStatus,
					progress.phaseProgress,
					"In Progress",
					"in-progress"
				);
				break;

			case CouncilPhase.FINALIZATION:
				// Mark all phases as complete
				this.updatePhaseProgress(
					this.parallelQueryBar,
					this.parallelQueryStatus,
					1.0,
					"Complete",
					"completed"
				);
				this.updatePhaseProgress(
					this.critiqueBar,
					this.critiqueStatus,
					1.0,
					"Complete",
					"completed"
				);
				this.updatePhaseProgress(
					this.rankingBar,
					this.rankingStatus,
					1.0,
					"Complete",
					"completed"
				);
				this.updatePhaseProgress(
					this.synthesisBar,
					this.synthesisStatus,
					1.0,
					"Complete",
					"completed"
				);
				this.updatePhaseProgress(
					this.finalizationBar,
					this.finalizationStatus,
					progress.phaseProgress,
					"In Progress",
					"in-progress"
				);

				// Hide all phase-specific info
				if (this.modelsRespondedElement) {
					this.modelsRespondedElement.style.display = "none";
				}
				if (this.critiquesCompletedElement) {
					this.critiquesCompletedElement.style.display = "none";
				}
				if (this.rankingsCompletedElement) {
					this.rankingsCompletedElement.style.display = "none";
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
			status.className = `council-phase-status council-phase-${statusClass}`;
		}
	}

	/**
	 * Handle cancel button click
	 *
	 * Requirement 5.6: Allow user to cancel and abort generation
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
			this.detailsElement.textContent = "Cancelling council generation...";
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
			cls: "council-error-header"
		});

		// Error message
		const messageEl = this.errorContainer.createEl("p", {
			text: message,
			cls: "council-error-message"
		});

		// Suggestions list
		if (suggestions && suggestions.length > 0) {
			const suggestionsHeader = this.errorContainer.createEl("p", {
				text: "Suggestions:",
				cls: "council-error-suggestions-header"
			});

			const suggestionsList = this.errorContainer.createEl("ul", {
				cls: "council-error-suggestions-list"
			});

			suggestions.forEach((suggestion) => {
				suggestionsList.createEl("li", {
					text: suggestion,
					cls: "council-error-suggestion-item"
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
			cls: "council-warning-item"
		});

		const warningIcon = warningItem.createEl("span", {
			text: "⚠ ",
			cls: "council-warning-icon"
		});

		const warningText = warningItem.createEl("span", {
			text: `${title}: ${message}`,
			cls: "council-warning-text"
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
	}
}
