import { App, Modal } from "obsidian";
import {
	ConsensusAuditTrail,
	QuestionConsensusTrail,
	ConsensusRound,
	ModelConsensusResponse,
	SourceValidationResult,
} from "../../consensus/types";
import { Question } from "../../utils/types";

/**
 * Modal for viewing consensus audit trail details
 *
 * Displays question-by-question consensus information including:
 * - All consensus rounds with model responses (anonymized)
 * - Source validation results and citations
 * - Agreement percentages and model votes
 * - Navigation between questions
 *
 * Requirements:
 * - 6.1: Display consensus summary (agreement percentage, models)
 * - 6.2: Show detailed model answers and reasoning
 * - 6.3: Display consensus iterations
 * - 6.4: Show source validation and citations
 */
export class AuditTrailModal extends Modal {
	/** The complete audit trail */
	private readonly auditTrail: ConsensusAuditTrail;

	/** Current question index being viewed */
	private currentQuestionIndex: number = 0;

	/** Main content container */
	private contentContainer?: HTMLDivElement;

	/**
	 * Create a new audit trail modal
	 *
	 * @param app - The Obsidian app instance
	 * @param auditTrail - The consensus audit trail to display
	 * @param startingQuestionIndex - Optional question index to start viewing (default: 0)
	 */
	constructor(
		app: App,
		auditTrail: ConsensusAuditTrail,
		startingQuestionIndex: number = 0
	) {
		super(app);
		this.auditTrail = auditTrail;
		this.currentQuestionIndex = Math.max(
			0,
			Math.min(startingQuestionIndex, auditTrail.questionTrails.length - 1)
		);
	}

	/**
	 * Initialize the modal UI
	 *
	 * Requirement 6.1: Display audit trail UI with navigation
	 */
	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("audit-trail-modal");

		// Modal header
		const header = contentEl.createDiv({ cls: "audit-trail-header" });
		header.createEl("h2", { text: "Consensus Audit Trail" });

		// Summary section
		this.createSummarySection(contentEl);

		// Main content container (question details)
		this.contentContainer = contentEl.createDiv({
			cls: "audit-trail-content",
		});

		// Navigation controls
		this.createNavigationControls(contentEl);

		// Render initial question
		this.renderCurrentQuestion();
	}

	/**
	 * Create the overall summary section
	 *
	 * Requirement 6.1: Display overall consensus summary
	 */
	private createSummarySection(container: HTMLElement): void {
		const summarySection = container.createDiv({
			cls: "audit-trail-summary",
		});

		summarySection.createEl("h3", { text: "Overall Summary" });

		const summaryGrid = summarySection.createDiv({
			cls: "audit-trail-summary-grid",
		});

		// Total duration
		const duration = this.formatDuration(this.auditTrail.totalDuration);
		this.createSummaryItem(
			summaryGrid,
			"Total Duration",
			duration,
			"audit-trail-summary-item"
		);

		// Total questions
		this.createSummaryItem(
			summaryGrid,
			"Questions",
			`${this.auditTrail.questionTrails.length}`,
			"audit-trail-summary-item"
		);

		// Participating models
		this.createSummaryItem(
			summaryGrid,
			"Models",
			`${this.auditTrail.participatingModels.length}`,
			"audit-trail-summary-item"
		);

		// Failed models (if any)
		if (this.auditTrail.failedModels.length > 0) {
			this.createSummaryItem(
				summaryGrid,
				"Failed Models",
				`${this.auditTrail.failedModels.length}`,
				"audit-trail-summary-item audit-trail-warning"
			);
		}

		// Success rate
		const consensusReached = this.auditTrail.questionTrails.filter(
			(qt) => qt.consensusReached
		).length;
		const successRate = Math.round(
			(consensusReached / this.auditTrail.questionTrails.length) * 100
		);
		this.createSummaryItem(
			summaryGrid,
			"Consensus Rate",
			`${successRate}%`,
			"audit-trail-summary-item"
		);
	}

	/**
	 * Create a summary item element
	 */
	private createSummaryItem(
		container: HTMLElement,
		label: string,
		value: string,
		className: string
	): void {
		const item = container.createDiv({ cls: className });
		item.createEl("span", { text: label, cls: "audit-trail-summary-label" });
		item.createEl("span", { text: value, cls: "audit-trail-summary-value" });
	}

	/**
	 * Render the current question's consensus details
	 *
	 * Requirements: 6.1, 6.2, 6.3, 6.4
	 */
	private renderCurrentQuestion(): void {
		if (!this.contentContainer) return;

		// Clear existing content
		this.contentContainer.empty();

		const trail = this.auditTrail.questionTrails[this.currentQuestionIndex];
		if (!trail) return;

		// Question header
		const questionHeader = this.contentContainer.createDiv({
			cls: "audit-trail-question-header",
		});
		questionHeader.createEl("h3", {
			text: `Question ${this.currentQuestionIndex + 1} of ${
				this.auditTrail.questionTrails.length
			}`,
		});

		// Question text
		const questionText = this.contentContainer.createDiv({
			cls: "audit-trail-question-text",
		});
		questionText.createEl("strong", { text: "Question: " });
		questionText.createSpan({ text: this.getQuestionText(trail.question) });

		// Consensus status
		this.renderConsensusStatus(this.contentContainer, trail);

		// Source validation (if available)
		if (this.auditTrail.sourceValidation) {
			this.renderSourceValidation(
				this.contentContainer,
				this.auditTrail.sourceValidation
			);
		}

		// Consensus rounds
		this.renderConsensusRounds(this.contentContainer, trail);
	}

	/**
	 * Render consensus status for a question
	 *
	 * Requirement 6.1: Display consensus summary with agreement percentage
	 */
	private renderConsensusStatus(
		container: HTMLElement,
		trail: QuestionConsensusTrail
	): void {
		const statusSection = container.createDiv({
			cls: "audit-trail-consensus-status",
		});

		statusSection.createEl("h4", { text: "Consensus Status" });

		const statusGrid = statusSection.createDiv({
			cls: "audit-trail-status-grid",
		});

		// Consensus reached
		const consensusIcon = trail.consensusReached ? "✓" : "⚠";
		const consensusText = trail.consensusReached
			? "Reached"
			: "Not Reached";
		this.createSummaryItem(
			statusGrid,
			"Status",
			`${consensusIcon} ${consensusText}`,
			trail.consensusReached
				? "audit-trail-status-item audit-trail-success"
				: "audit-trail-status-item audit-trail-warning"
		);

		// Agreement percentage
		const agreementPercent = Math.round(trail.agreementPercentage * 100);
		this.createSummaryItem(
			statusGrid,
			"Agreement",
			`${agreementPercent}%`,
			"audit-trail-status-item"
		);

		// Rounds required
		this.createSummaryItem(
			statusGrid,
			"Rounds",
			`${trail.roundsRequired}`,
			"audit-trail-status-item"
		);

		// Agreeing models
		this.createSummaryItem(
			statusGrid,
			"Agreeing Models",
			`${trail.agreeingModels.length}/${
				trail.agreeingModels.length + trail.disagreeingModels.length
			}`,
			"audit-trail-status-item"
		);

		// Model breakdown (if there were disagreeing models)
		if (trail.disagreeingModels.length > 0) {
			const modelBreakdown = statusSection.createDiv({
				cls: "audit-trail-model-breakdown",
			});
			modelBreakdown.createEl("p", {
				text: `Agreeing: ${trail.agreeingModels.join(", ")}`,
			});
			modelBreakdown.createEl("p", {
				text: `Disagreeing: ${trail.disagreeingModels.join(", ")}`,
				cls: "audit-trail-disagreeing",
			});
		}
	}

	/**
	 * Render source validation results
	 *
	 * Requirement 6.4: Show source validation and citations
	 */
	private renderSourceValidation(
		container: HTMLElement,
		validation: SourceValidationResult
	): void {
		const validationSection = container.createDiv({
			cls: "audit-trail-source-validation",
		});

		validationSection.createEl("h4", { text: "Source Validation" });

		// Validation confidence
		const confidence = Math.round(validation.validationConfidence * 100);
		const confidenceEl = validationSection.createDiv({
			cls: "audit-trail-validation-confidence",
		});
		confidenceEl.createEl("strong", { text: "Validation Confidence: " });
		confidenceEl.createSpan({ text: `${confidence}%` });

		// Model extractions
		validationSection.createEl("p", {
			text: `${validation.extractions.length} models validated the source`,
		});

		// Agreed facts
		if (validation.factConsensus.agreedFacts.length > 0) {
			const agreedSection = validationSection.createDiv({
				cls: "audit-trail-agreed-facts",
			});
			agreedSection.createEl("strong", { text: "✓ Agreed Facts:" });
			const factsList = agreedSection.createEl("ul");
			validation.factConsensus.agreedFacts.forEach((fact) => {
				factsList.createEl("li", { text: fact });
			});
		}

		// Discrepancies
		if (validation.discrepancies.length > 0) {
			const discrepancySection = validationSection.createDiv({
				cls: "audit-trail-discrepancies",
			});
			discrepancySection.createEl("strong", {
				text: "⚠ Discrepancies Found:",
			});
			const discrepancyList = discrepancySection.createEl("ul");
			validation.discrepancies.forEach((discrepancy) => {
				const item = discrepancyList.createEl("li");
				item.createEl("strong", { text: discrepancy.description });
				item.createEl("br");
				item.createSpan({
					text: `Models involved: ${discrepancy.modelsInvolved.join(", ")}`,
				});
			});
		}
	}

	/**
	 * Render all consensus rounds for a question
	 *
	 * Requirements: 6.2, 6.3
	 */
	private renderConsensusRounds(
		container: HTMLElement,
		trail: QuestionConsensusTrail
	): void {
		const roundsSection = container.createDiv({
			cls: "audit-trail-rounds-section",
		});

		roundsSection.createEl("h4", {
			text: `Consensus Rounds (${trail.rounds.length})`,
		});

		trail.rounds.forEach((round) => {
			this.renderSingleRound(roundsSection, round);
		});
	}

	/**
	 * Render a single consensus round
	 *
	 * Requirement 6.2: Show model answers and reasoning
	 * Requirement 6.3: Display consensus iterations
	 */
	private renderSingleRound(
		container: HTMLElement,
		round: ConsensusRound
	): void {
		const roundContainer = container.createDiv({
			cls: "audit-trail-round",
		});

		// Round header
		const roundHeader = roundContainer.createDiv({
			cls: "audit-trail-round-header",
		});
		const consensusIcon = round.consensusReached ? "✓" : "⟳";
		roundHeader.createEl("strong", {
			text: `${consensusIcon} Round ${round.roundNumber}`,
		});
		roundHeader.createSpan({
			text: ` (${this.formatDuration(round.duration)})`,
			cls: "audit-trail-round-duration",
		});

		// Round status
		const roundStatus = roundContainer.createDiv({
			cls: "audit-trail-round-status",
		});
		roundStatus.textContent = round.consensusReached
			? "Consensus reached in this round"
			: "Consensus not yet reached";

		// Model responses
		const responsesContainer = roundContainer.createDiv({
			cls: "audit-trail-responses",
		});

		round.modelResponses.forEach((response) => {
			this.renderModelResponse(responsesContainer, response);
		});
	}

	/**
	 * Render a single model's response
	 *
	 * Requirement 6.2: Display model answers, reasoning, and confidence
	 */
	private renderModelResponse(
		container: HTMLElement,
		response: ModelConsensusResponse
	): void {
		const responseContainer = container.createDiv({
			cls: "audit-trail-model-response",
		});

		// Model header
		const header = responseContainer.createDiv({
			cls: "audit-trail-model-header",
		});
		header.createEl("strong", { text: response.modelId });

		// Change indicator
		if (response.changed) {
			const changeIndicator = header.createSpan({
				text: " (Changed)",
				cls: "audit-trail-changed-indicator",
			});
			changeIndicator.title = response.previousAnswer
				? `Previous: ${JSON.stringify(response.previousAnswer)}`
				: "Answer changed from previous round";
		}

		// Confidence
		const confidence = Math.round(response.confidence * 100);
		header.createSpan({
			text: ` ${confidence}% confident`,
			cls: "audit-trail-confidence",
		});

		// Answer
		const answerDiv = responseContainer.createDiv({
			cls: "audit-trail-answer",
		});
		answerDiv.createEl("strong", { text: "Answer: " });
		answerDiv.createSpan({ text: this.formatAnswer(response.answer) });

		// Reasoning
		if (response.reasoning && response.reasoning.trim().length > 0) {
			const reasoningDiv = responseContainer.createDiv({
				cls: "audit-trail-reasoning",
			});
			reasoningDiv.createEl("strong", { text: "Reasoning: " });
			reasoningDiv.createSpan({ text: response.reasoning });
		}
	}

	/**
	 * Create navigation controls
	 *
	 * Requirement 6.1: Allow navigation between questions
	 */
	private createNavigationControls(container: HTMLElement): void {
		const navContainer = container.createDiv({
			cls: "audit-trail-navigation",
		});

		// Previous button
		const prevButton = navContainer.createEl("button", {
			text: "← Previous Question",
			cls: "audit-trail-nav-button",
		});
		prevButton.addEventListener("click", () => {
			if (this.currentQuestionIndex > 0) {
				this.currentQuestionIndex--;
				this.renderCurrentQuestion();
				this.updateNavigationButtons();
			}
		});

		// Question indicator
		const questionIndicator = navContainer.createDiv({
			cls: "audit-trail-question-indicator",
		});
		questionIndicator.id = "audit-trail-question-indicator";
		questionIndicator.textContent = this.getQuestionIndicatorText();

		// Next button
		const nextButton = navContainer.createEl("button", {
			text: "Next Question →",
			cls: "audit-trail-nav-button",
		});
		nextButton.addEventListener("click", () => {
			if (
				this.currentQuestionIndex <
				this.auditTrail.questionTrails.length - 1
			) {
				this.currentQuestionIndex++;
				this.renderCurrentQuestion();
				this.updateNavigationButtons();
			}
		});

		// Close button
		const closeButton = navContainer.createEl("button", {
			text: "Close",
			cls: "audit-trail-nav-button audit-trail-close-button",
		});
		closeButton.addEventListener("click", () => {
			this.close();
		});

		// Update button states
		this.updateNavigationButtons();
	}

	/**
	 * Update navigation button states
	 */
	private updateNavigationButtons(): void {
		const navContainer = this.contentEl.querySelector(
			".audit-trail-navigation"
		);
		if (!navContainer) return;

		const prevButton = navContainer.querySelector(
			"button:first-child"
		) as HTMLButtonElement;
		const nextButton = navContainer.querySelectorAll("button")[1] as HTMLButtonElement;
		const indicator = navContainer.querySelector(
			"#audit-trail-question-indicator"
		) as HTMLDivElement;

		if (prevButton) {
			prevButton.disabled = this.currentQuestionIndex === 0;
		}

		if (nextButton) {
			nextButton.disabled =
				this.currentQuestionIndex ===
				this.auditTrail.questionTrails.length - 1;
		}

		if (indicator) {
			indicator.textContent = this.getQuestionIndicatorText();
		}
	}

	/**
	 * Get question indicator text
	 */
	private getQuestionIndicatorText(): string {
		return `Question ${this.currentQuestionIndex + 1} of ${
			this.auditTrail.questionTrails.length
		}`;
	}

	/**
	 * Extract question text from a Question object
	 */
	private getQuestionText(question: Question): string {
		return question.question || "";
	}

	/**
	 * Format an answer for display
	 */
	private formatAnswer(answer: any): string {
		if (answer === null || answer === undefined) {
			return "No answer";
		}

		if (typeof answer === "boolean") {
			return answer ? "True" : "False";
		}

		if (typeof answer === "number") {
			return answer.toString();
		}

		if (Array.isArray(answer)) {
			return answer.join(", ");
		}

		if (typeof answer === "object") {
			return JSON.stringify(answer, null, 2);
		}

		return String(answer);
	}

	/**
	 * Format duration in milliseconds to human-readable string
	 */
	private formatDuration(ms: number): string {
		if (ms < 1000) {
			return `${ms}ms`;
		}

		const seconds = Math.floor(ms / 1000);
		if (seconds < 60) {
			return `${seconds}s`;
		}

		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s`;
	}

	/**
	 * Clean up modal when closed
	 */
	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
