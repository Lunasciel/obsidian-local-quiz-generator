import { App, Modal } from "obsidian";
import { CouncilDebateTrail, ModelResponse, CritiqueResult, ResponseCritique, RankingResult } from "../../council/types";
import { Question } from "../../utils/types";

/**
 * Modal for viewing LLM Council debate trail details
 *
 * Displays comprehensive debate information including:
 * - Overview section (duration, models, chair, question count)
 * - Phase 1: Initial responses from all models
 * - Phase 2: Critiques (expandable per model)
 * - Phase 3: Rankings (individual and consensus)
 * - Phase 4: Synthesis metadata (chair, strategy, elements used)
 * - Token usage breakdown with cost estimate
 *
 * Requirements:
 * - 8.1: Display debate overview
 * - 8.2: Display initial responses
 * - 8.3: Display critiques
 * - 8.4: Display rankings
 * - 8.5: Display synthesis metadata
 * - 8.6: Display token usage
 * - 8.7: Expandable sections for each phase
 */
export class DebateTrailModal extends Modal {
	/** The complete debate trail */
	private readonly debateTrail: CouncilDebateTrail;

	/** Main content container */
	private contentContainer?: HTMLDivElement;

	/** Track expanded sections */
	private expandedSections: Set<string> = new Set();

	/**
	 * Create a new debate trail modal
	 *
	 * @param app - The Obsidian app instance
	 * @param debateTrail - The council debate trail to display
	 */
	constructor(app: App, debateTrail: CouncilDebateTrail) {
		super(app);
		this.debateTrail = debateTrail;
	}

	/**
	 * Initialize the modal UI
	 *
	 * Requirement 8.1: Display debate trail UI
	 */
	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("debate-trail-modal");

		// Modal header
		const header = contentEl.createDiv({ cls: "debate-trail-header" });
		header.createEl("h2", { text: "LLM Council Debate Trail" });

		// Main content container
		this.contentContainer = contentEl.createDiv({
			cls: "debate-trail-content",
		});

		// Render all sections
		this.renderOverview();
		this.renderPhase1InitialResponses();
		this.renderPhase2Critiques();
		this.renderPhase3Rankings();
		this.renderPhase4Synthesis();
		this.renderTokenUsage();

		// Close button
		const buttonContainer = contentEl.createDiv({
			cls: "debate-trail-buttons",
		});
		const closeButton = buttonContainer.createEl("button", {
			text: "Close",
			cls: "debate-trail-close-button",
		});
		closeButton.addEventListener("click", () => this.close());
	}

	/**
	 * Render the overview section
	 *
	 * Requirement 8.1: Display overview with duration, models, chair, question count
	 */
	private renderOverview(): void {
		if (!this.contentContainer) return;

		const overviewSection = this.contentContainer.createDiv({
			cls: "debate-trail-overview",
		});

		overviewSection.createEl("h3", { text: "📊 Overview" });

		const summaryGrid = overviewSection.createDiv({
			cls: "debate-trail-summary-grid",
		});

		// Total duration
		const duration = this.formatDuration(this.debateTrail.totalDuration);
		this.createSummaryItem(summaryGrid, "Total Duration", duration);

		// Participating models
		const modelsText = this.debateTrail.participatingModels.join(", ");
		this.createSummaryItem(summaryGrid, "Participating Models", modelsText);

		// Chair model
		this.createSummaryItem(summaryGrid, "Chair Model", this.debateTrail.synthesis.chairModelId);

		// Questions generated
		const questionCount = this.getQuestionCount();
		this.createSummaryItem(summaryGrid, "Questions Generated", `${questionCount}`);

		// Failed models (if any)
		if (this.debateTrail.failedModels.length > 0) {
			const failedText = this.debateTrail.failedModels.join(", ");
			const failedItem = summaryGrid.createDiv({ cls: "debate-trail-summary-item debate-trail-warning" });
			failedItem.createEl("span", { text: "Failed Models", cls: "debate-trail-summary-label" });
			failedItem.createEl("span", { text: failedText, cls: "debate-trail-summary-value" });
		}
	}

	/**
	 * Render Phase 1: Initial Responses
	 *
	 * Requirement 8.2: Display initial responses with view buttons
	 */
	private renderPhase1InitialResponses(): void {
		if (!this.contentContainer) return;

		const phaseSection = this.contentContainer.createDiv({
			cls: "debate-trail-phase-section",
		});

		// Phase header (collapsible)
		const header = phaseSection.createDiv({
			cls: "debate-trail-phase-header",
		});
		header.textContent = "▼ Phase 1: Initial Responses";
		header.addEventListener("click", () => this.toggleSection("phase1", header, contentDiv));

		// Phase content
		const contentDiv = phaseSection.createDiv({
			cls: "debate-trail-phase-content",
		});

		this.debateTrail.initialResponses.forEach((response) => {
			const responseItem = contentDiv.createDiv({
				cls: "debate-trail-response-item",
			});

			// Model name
			responseItem.createEl("strong", { text: `${response.modelId}: ` });

			// Success/failure indicator
			if (response.success && response.quiz) {
				const questionCount = response.quiz.questions.length;
				responseItem.createSpan({
					text: `${questionCount} questions generated`,
					cls: "debate-trail-success",
				});

				// View button
				const viewButton = responseItem.createEl("button", {
					text: "View Response",
					cls: "debate-trail-view-button",
				});
				viewButton.addEventListener("click", () => {
					this.showResponseDetail(response);
				});
			} else {
				responseItem.createSpan({
					text: `Failed: ${response.error || "Unknown error"}`,
					cls: "debate-trail-error",
				});
			}
		});
	}

	/**
	 * Render Phase 2: Critiques
	 *
	 * Requirement 8.3: Display critiques (expandable per model)
	 */
	private renderPhase2Critiques(): void {
		if (!this.contentContainer) return;

		const phaseSection = this.contentContainer.createDiv({
			cls: "debate-trail-phase-section",
		});

		// Phase header (collapsible)
		const header = phaseSection.createDiv({
			cls: "debate-trail-phase-header",
		});
		header.textContent = "▼ Phase 2: Critiques";
		header.addEventListener("click", () => this.toggleSection("phase2", header, contentDiv));

		// Phase content
		const contentDiv = phaseSection.createDiv({
			cls: "debate-trail-phase-content",
		});

		this.debateTrail.critiques.forEach((critiqueResult) => {
			const critiqueItem = contentDiv.createDiv({
				cls: "debate-trail-critique-item",
			});

			// Model name header (collapsible)
			const modelHeader = critiqueItem.createDiv({
				cls: "debate-trail-critique-model-header",
			});
			modelHeader.textContent = `▶ ${critiqueResult.criticModelId}'s Critique`;

			const critiqueDetails = critiqueItem.createDiv({
				cls: "debate-trail-critique-details",
			});
			critiqueDetails.style.display = "none";

			modelHeader.addEventListener("click", () => {
				const sectionKey = `critique-${critiqueResult.criticModelId}`;
				this.toggleSection(sectionKey, modelHeader, critiqueDetails);
			});

			// Display critiques for each response
			if (critiqueResult.success && critiqueResult.critiques.length > 0) {
				critiqueResult.critiques.forEach((critique) => {
					this.renderCritique(critiqueDetails, critique);
				});
			} else {
				critiqueDetails.createEl("p", {
					text: `Failed: ${critiqueResult.error || "Unknown error"}`,
					cls: "debate-trail-error",
				});
			}
		});
	}

	/**
	 * Render a single critique
	 */
	private renderCritique(container: HTMLDivElement, critique: ResponseCritique): void {
		const critiqueCard = container.createDiv({
			cls: "debate-trail-critique-card",
		});

		critiqueCard.createEl("h4", { text: `Critique of ${critique.responseId}` });

		// Strengths
		if (critique.strengths.length > 0) {
			critiqueCard.createEl("strong", { text: "Strengths:" });
			const strengthsList = critiqueCard.createEl("ul");
			critique.strengths.forEach((strength) => {
				strengthsList.createEl("li", { text: strength });
			});
		}

		// Weaknesses
		if (critique.weaknesses.length > 0) {
			critiqueCard.createEl("strong", { text: "Weaknesses:" });
			const weaknessesList = critiqueCard.createEl("ul");
			critique.weaknesses.forEach((weakness) => {
				weaknessesList.createEl("li", { text: weakness });
			});
		}

		// Errors
		if (critique.errors.length > 0) {
			critiqueCard.createEl("strong", { text: "Errors:" });
			const errorsList = critiqueCard.createEl("ul", { cls: "debate-trail-error" });
			critique.errors.forEach((error) => {
				errorsList.createEl("li", { text: error });
			});
		}

		// Overall assessment
		critiqueCard.createEl("strong", { text: "Overall Assessment:" });
		critiqueCard.createEl("p", { text: critique.overallAssessment });
	}

	/**
	 * Render Phase 3: Rankings
	 *
	 * Requirement 8.4: Display individual and consensus rankings
	 */
	private renderPhase3Rankings(): void {
		if (!this.contentContainer) return;

		const phaseSection = this.contentContainer.createDiv({
			cls: "debate-trail-phase-section",
		});

		// Phase header (collapsible)
		const header = phaseSection.createDiv({
			cls: "debate-trail-phase-header",
		});
		header.textContent = "▼ Phase 3: Rankings";
		header.addEventListener("click", () => this.toggleSection("phase3", header, contentDiv));

		// Phase content
		const contentDiv = phaseSection.createDiv({
			cls: "debate-trail-phase-content",
		});

		const rankings = this.debateTrail.rankings;

		// Individual rankings
		const individualSection = contentDiv.createDiv({
			cls: "debate-trail-rankings-section",
		});
		individualSection.createEl("h4", { text: "Individual Rankings:" });

		rankings.individualRankings.forEach((modelRanking) => {
			const rankingItem = individualSection.createDiv({
				cls: "debate-trail-ranking-item",
			});

			if (modelRanking.success) {
				const rankingText = modelRanking.ranking.join(" > ");
				rankingItem.createEl("strong", { text: `${modelRanking.modelId}: ` });
				rankingItem.createSpan({ text: rankingText });

				// Show reasoning (collapsible)
				const reasoningButton = rankingItem.createEl("button", {
					text: "Show Reasoning",
					cls: "debate-trail-reasoning-button",
				});
				const reasoningDiv = rankingItem.createDiv({
					cls: "debate-trail-reasoning",
				});
				reasoningDiv.style.display = "none";
				reasoningDiv.textContent = modelRanking.reasoning;

				reasoningButton.addEventListener("click", () => {
					if (reasoningDiv.style.display === "none") {
						reasoningDiv.style.display = "block";
						reasoningButton.textContent = "Hide Reasoning";
					} else {
						reasoningDiv.style.display = "none";
						reasoningButton.textContent = "Show Reasoning";
					}
				});
			} else {
				rankingItem.createEl("strong", { text: `${modelRanking.modelId}: ` });
				rankingItem.createSpan({
					text: `Failed: ${modelRanking.error || "Unknown error"}`,
					cls: "debate-trail-error",
				});
			}
		});

		// Consensus ranking
		const consensusSection = contentDiv.createDiv({
			cls: "debate-trail-consensus-ranking-section",
		});
		consensusSection.createEl("h4", { text: "Consensus Ranking:" });

		const consensusRanking = rankings.consensusRanking.join(" > ");
		consensusSection.createEl("p", {
			text: consensusRanking,
			cls: "debate-trail-consensus-ranking",
		});

		// Borda count scores
		const scoresSection = consensusSection.createDiv({
			cls: "debate-trail-scores-section",
		});
		scoresSection.createEl("strong", { text: "Borda Count Scores:" });
		const scoresList = scoresSection.createEl("ul");

		// Convert Map to array and sort by score descending
		const sortedScores = Array.from(rankings.scores.entries()).sort(
			(a, b) => b[1] - a[1]
		);

		sortedScores.forEach(([responseId, score]) => {
			scoresList.createEl("li", { text: `${responseId}: ${score}` });
		});
	}

	/**
	 * Render Phase 4: Chair Synthesis
	 *
	 * Requirement 8.5: Display synthesis metadata
	 */
	private renderPhase4Synthesis(): void {
		if (!this.contentContainer) return;

		const phaseSection = this.contentContainer.createDiv({
			cls: "debate-trail-phase-section",
		});

		// Phase header (collapsible)
		const header = phaseSection.createDiv({
			cls: "debate-trail-phase-header",
		});
		header.textContent = "▼ Phase 4: Chair Synthesis";
		header.addEventListener("click", () => this.toggleSection("phase4", header, contentDiv));

		// Phase content
		const contentDiv = phaseSection.createDiv({
			cls: "debate-trail-phase-content",
		});

		const synthesis = this.debateTrail.synthesis;

		// Chair model
		contentDiv.createEl("strong", { text: "Chair Model: " });
		contentDiv.createEl("span", { text: synthesis.chairModelId });
		contentDiv.createEl("br");

		// Strategy
		contentDiv.createEl("strong", { text: "Selection Strategy: " });
		contentDiv.createEl("span", { text: synthesis.synthesisStrategy });
		contentDiv.createEl("br");

		// Elements incorporated
		contentDiv.createEl("strong", { text: "Elements Incorporated:" });
		const elementsList = contentDiv.createEl("ul");
		synthesis.elementsIncorporated.forEach((element) => {
			elementsList.createEl("li", { text: element });
		});
	}

	/**
	 * Render token usage breakdown
	 *
	 * Requirement 8.6: Display token usage with cost estimate
	 */
	private renderTokenUsage(): void {
		if (!this.contentContainer) return;

		const tokenSection = this.contentContainer.createDiv({
			cls: "debate-trail-token-section",
		});

		tokenSection.createEl("h3", { text: "💰 Token Usage" });

		const tokenGrid = tokenSection.createDiv({
			cls: "debate-trail-token-grid",
		});

		const usage = this.debateTrail.tokenUsage;

		// Phase breakdowns
		this.createTokenItem(tokenGrid, "Parallel Query", usage.parallelQuery.total);
		this.createTokenItem(tokenGrid, "Critique", usage.critique.total);
		this.createTokenItem(tokenGrid, "Ranking", usage.ranking.total);
		this.createTokenItem(tokenGrid, "Synthesis", usage.synthesis.total);

		// Grand total
		const totalItem = tokenGrid.createDiv({
			cls: "debate-trail-token-item debate-trail-token-total",
		});
		totalItem.createEl("strong", { text: "Total Tokens", cls: "debate-trail-token-label" });
		totalItem.createEl("strong", {
			text: usage.grandTotal.toLocaleString(),
			cls: "debate-trail-token-value",
		});

		// Cost estimate
		const costEstimate = this.debateTrail.costEstimate;
		if (costEstimate) {
			const costItem = tokenGrid.createDiv({
				cls: "debate-trail-token-item debate-trail-cost-item",
			});
			costItem.createEl("strong", { text: "Estimated Cost", cls: "debate-trail-token-label" });
			costItem.createEl("strong", {
				text: `$${costEstimate.totalCost.toFixed(4)}`,
				cls: "debate-trail-token-value",
			});
		}
	}

	/**
	 * Create a token usage item
	 */
	private createTokenItem(container: HTMLElement, label: string, value: number): void {
		const item = container.createDiv({ cls: "debate-trail-token-item" });
		item.createEl("span", { text: label, cls: "debate-trail-token-label" });
		item.createEl("span", {
			text: value.toLocaleString(),
			cls: "debate-trail-token-value",
		});
	}

	/**
	 * Create a summary item
	 */
	private createSummaryItem(container: HTMLElement, label: string, value: string): void {
		const item = container.createDiv({ cls: "debate-trail-summary-item" });
		item.createEl("span", { text: label, cls: "debate-trail-summary-label" });
		item.createEl("span", { text: value, cls: "debate-trail-summary-value" });
	}

	/**
	 * Toggle section expansion
	 */
	private toggleSection(
		sectionKey: string,
		header: HTMLDivElement,
		content: HTMLDivElement
	): void {
		if (this.expandedSections.has(sectionKey)) {
			// Collapse
			this.expandedSections.delete(sectionKey);
			content.style.display = "none";
			header.textContent = header.textContent!.replace("▼", "▶");
		} else {
			// Expand
			this.expandedSections.add(sectionKey);
			content.style.display = "block";
			header.textContent = header.textContent!.replace("▶", "▼");
		}
	}

	/**
	 * Show detailed response in a separate view
	 */
	private showResponseDetail(response: ModelResponse): void {
		if (!response.quiz) return;

		// Create a detail modal or expand inline
		const detailContainer = this.contentContainer!.createDiv({
			cls: "debate-trail-response-detail",
		});

		detailContainer.createEl("h4", { text: `Response from ${response.modelId}` });

		// Show quiz questions
		const questionsList = detailContainer.createEl("ol");
		response.quiz.questions.forEach((question) => {
			const questionText = this.getQuestionText(question);
			questionsList.createEl("li", { text: questionText });
		});

		// Close button
		const closeButton = detailContainer.createEl("button", {
			text: "Close",
			cls: "debate-trail-close-detail-button",
		});
		closeButton.addEventListener("click", () => {
			detailContainer.remove();
		});
	}

	/**
	 * Get question text from a question object
	 */
	private getQuestionText(question: Question): string {
		return question.question || "Unknown question";
	}

	/**
	 * Get total question count from initial responses
	 */
	private getQuestionCount(): number {
		// Use the first successful response's question count
		const successfulResponse = this.debateTrail.initialResponses.find(
			(r) => r.success && r.quiz
		);
		return successfulResponse?.quiz?.questions.length || 0;
	}

	/**
	 * Format duration in milliseconds to human-readable format
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
		this.expandedSections.clear();
	}
}
