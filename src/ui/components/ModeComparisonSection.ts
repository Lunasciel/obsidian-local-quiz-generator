/**
 * ModeComparisonSection component for settings UI
 *
 * Displays a visual comparison of the three generation modes (Main, Consensus, Council)
 * with characteristics, analogies, help icons/tooltips, and active mode indication.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 10.1, 10.2
 */

import { setIcon } from "obsidian";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * Mode identifiers
 */
export type GenerationMode = "main" | "consensus" | "council";

/**
 * Mode configuration data structure
 */
export interface ModeInfo {
	id: GenerationMode;
	name: string;
	shortName: string;
	description: string;
	analogy: string;
	characteristics: ModeCharacteristics;
	detailedHelp: string[];
}

/**
 * Mode characteristics for comparison display
 */
export interface ModeCharacteristics {
	speed: CharacteristicLevel;
	cost: CharacteristicLevel;
	quality: CharacteristicLevel;
	labels: string[];
}

/**
 * Characteristic level for visual display
 */
export type CharacteristicLevel = "low" | "medium" | "high";

/**
 * Complete mode information for all three generation modes.
 * Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */
export const MODE_DATA: Record<GenerationMode, ModeInfo> = {
	main: {
		id: "main",
		name: "Main Generation",
		shortName: "Main",
		description:
			"Single model generates quizzes independently. Fast and cost-effective.",
		analogy:
			"Like asking one expert to answer a question - quick and straightforward.",
		characteristics: {
			speed: "high",
			cost: "low",
			quality: "medium",
			labels: ["Fast", "Low cost", "Single perspective"],
		},
		detailedHelp: [
			"Uses a single AI model to generate quiz questions from your notes.",
			"Best for quick quiz generation when you need results fast.",
			"Most cost-effective option - only uses one API call per question.",
			"Quality depends on the capability of the selected model.",
			"Recommended for general use and initial testing.",
		],
	},
	consensus: {
		id: "consensus",
		name: "Multi-Model Consensus",
		shortName: "Consensus",
		description:
			"Multiple models work independently and in parallel. Only questions where models agree are accepted. " +
			"Quality through agreement. Multiple rounds allow models to reconsider after seeing alternative answers.",
		analogy:
			"Like multiple doctors independently diagnosing - only accepting diagnoses where all doctors agree.",
		characteristics: {
			speed: "medium",
			cost: "medium",
			quality: "high",
			labels: ["Higher quality", "Independent validation", "Requires agreement", "Higher cost"],
		},
		detailedHelp: [
			"Multiple AI models independently analyze and generate quiz questions.",
			"Questions are only included if models reach consensus (configurable threshold).",
			"Parallel processing reduces latency compared to sequential approaches.",
			"Multiple iterations allow models to reconsider their answers.",
			"Best for higher-quality quizzes where accuracy is important.",
			"Cost scales with the number of models and iterations configured.",
		],
	},
	council: {
		id: "council",
		name: "LLM Council",
		shortName: "Council",
		description:
			"Models engage in structured debate with a chairperson moderating. " +
			"Phases include: proposals, critique, ranking, and final synthesis by the chair. " +
			"Quality through argumentation and discussion.",
		analogy:
			"Like an expert panel discussing together, with the chair synthesizing the best solution from the debate.",
		characteristics: {
			speed: "low",
			cost: "high",
			quality: "high",
			labels: ["Highest quality", "Structured debate", "Chair synthesizes", "Highest cost"],
		},
		detailedHelp: [
			"Models participate in a structured debate process with distinct phases.",
			"Phase 1: Each model proposes quiz questions independently.",
			"Phase 2: Models critique and discuss each other's proposals.",
			"Phase 3: Models rank the proposals based on quality.",
			"Phase 4: The chair model synthesizes the final quiz from the best ideas.",
			"Best for highest-quality output where accuracy is critical.",
			"Most expensive option due to multiple rounds of interaction.",
		],
	},
};

/**
 * Characteristic level display configuration
 */
const LEVEL_CONFIG: Record<CharacteristicLevel, { dots: number; color: string; label: string }> = {
	low: { dots: 1, color: "var(--text-success)", label: "Low" },
	medium: { dots: 2, color: "var(--text-warning)", label: "Medium" },
	high: { dots: 3, color: "var(--text-error)", label: "High" },
};

/**
 * A component that displays a visual comparison of generation modes.
 *
 * Features:
 * - Side-by-side comparison of Main, Consensus, and Council modes
 * - Visual indicators for Speed, Cost, and Quality characteristics
 * - Active mode highlighting
 * - Help icons with tooltips
 * - Collapsible detailed help sections
 * - Analogies for each mode
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 10.1, 10.2
 */
export class ModeComparisonSection {
	private containerEl: HTMLElement;
	private activeMode: GenerationMode;
	private modeCards: Map<GenerationMode, HTMLElement> = new Map();

	/**
	 * Creates a new ModeComparisonSection
	 *
	 * @param parent - Parent HTML element to attach the section to
	 * @param activeMode - Currently active generation mode
	 */
	constructor(parent: HTMLElement, activeMode: GenerationMode) {
		this.activeMode = activeMode;
		this.containerEl = parent.createDiv("mode-comparison-section-qg");
		this.render();
	}

	/**
	 * Render the mode comparison section
	 */
	private render(): void {
		// Section header with help icon
		this.renderHeader();

		// Mode comparison cards
		this.renderModeCards();

		// Collapsible detailed help section
		this.renderDetailedHelp();
	}

	/**
	 * Render the section header with title and help icon
	 */
	private renderHeader(): void {
		const headerEl = this.containerEl.createDiv("mode-comparison-header-qg");

		// Title
		const titleEl = headerEl.createEl("h3", {
			cls: "mode-comparison-title-qg",
		});
		titleEl.textContent = "Generation Mode Comparison";

		// Help icon with tooltip
		const helpIconEl = headerEl.createSpan("mode-comparison-help-icon-qg");
		setIcon(helpIconEl, "help-circle");
		helpIconEl.setAttribute("aria-label", "Click to learn more about generation modes");
		helpIconEl.setAttribute(
			"title",
			"Compare the three quiz generation modes: Main (single model), " +
			"Consensus (multiple models vote), and Council (structured debate). " +
			"Click the cards below for more details."
		);
	}

	/**
	 * Render the mode comparison cards
	 */
	private renderModeCards(): void {
		const cardsContainer = this.containerEl.createDiv("mode-cards-container-qg");

		// Render each mode card
		const modes: GenerationMode[] = ["main", "consensus", "council"];
		for (const mode of modes) {
			const card = this.renderModeCard(cardsContainer, MODE_DATA[mode]);
			this.modeCards.set(mode, card);
		}
	}

	/**
	 * Render a single mode card
	 */
	private renderModeCard(container: HTMLElement, modeInfo: ModeInfo): HTMLElement {
		const isActive = this.activeMode === modeInfo.id;

		const cardEl = container.createDiv({
			cls: `mode-card-qg ${isActive ? "mode-card-active-qg" : ""}`,
		});
		cardEl.setAttribute("data-mode", modeInfo.id);

		// Active indicator badge
		if (isActive) {
			const activeBadge = cardEl.createDiv("mode-card-active-badge-qg");
			activeBadge.textContent = "Active";
		}

		// Card header
		const headerEl = cardEl.createDiv("mode-card-header-qg");
		const titleEl = headerEl.createEl("h4", { cls: "mode-card-title-qg" });
		titleEl.textContent = modeInfo.name;

		// Help icon for this mode
		const helpIcon = headerEl.createSpan("mode-card-help-icon-qg");
		setIcon(helpIcon, "info");
		helpIcon.setAttribute("aria-label", `Learn more about ${modeInfo.name}`);
		helpIcon.setAttribute("title", modeInfo.analogy);

		// Description
		const descEl = cardEl.createDiv("mode-card-description-qg");
		descEl.textContent = modeInfo.description;

		// Analogy (italicized)
		const analogyEl = cardEl.createDiv("mode-card-analogy-qg");
		analogyEl.innerHTML = `<em>💡 ${modeInfo.analogy}</em>`;

		// Characteristics visualization
		this.renderCharacteristics(cardEl, modeInfo.characteristics);

		// Labels
		this.renderLabels(cardEl, modeInfo.characteristics.labels);

		return cardEl;
	}

	/**
	 * Render the characteristics visualization (Speed, Cost, Quality)
	 */
	private renderCharacteristics(cardEl: HTMLElement, chars: ModeCharacteristics): void {
		const charsEl = cardEl.createDiv("mode-card-characteristics-qg");

		// Speed characteristic (inverted: high = fast = good)
		this.renderCharacteristic(charsEl, "Speed", chars.speed, "zap", true);

		// Cost characteristic (inverted: low = cheap = good)
		this.renderCharacteristic(charsEl, "Cost", chars.cost, "coins", false);

		// Quality characteristic (normal: high = good)
		this.renderCharacteristic(charsEl, "Quality", chars.quality, "star", true);
	}

	/**
	 * Render a single characteristic with dot indicator
	 */
	private renderCharacteristic(
		container: HTMLElement,
		label: string,
		level: CharacteristicLevel,
		iconName: string,
		highIsGood: boolean
	): void {
		const config = LEVEL_CONFIG[level];
		const charEl = container.createDiv("mode-characteristic-qg");

		// Label with icon
		const labelEl = charEl.createDiv("mode-characteristic-label-qg");
		const iconSpan = labelEl.createSpan("mode-characteristic-icon-qg");
		setIcon(iconSpan, iconName);
		labelEl.createSpan({ text: label });

		// Dot indicator
		const dotsEl = charEl.createDiv("mode-characteristic-dots-qg");
		for (let i = 0; i < 3; i++) {
			const dotEl = dotsEl.createSpan("mode-characteristic-dot-qg");
			if (i < config.dots) {
				dotEl.addClass("filled-qg");
				// Color based on whether high is good (green) or bad (red)
				if (label === "Cost") {
					// For cost: low is good (green), high is bad (red)
					dotEl.style.setProperty(
						"--dot-color",
						level === "low" ? "var(--text-success)" :
						level === "medium" ? "var(--text-warning)" :
						"var(--text-error)"
					);
				} else {
					// For speed/quality: high is good (green), low is bad (red)
					dotEl.style.setProperty(
						"--dot-color",
						level === "high" ? "var(--text-success)" :
						level === "medium" ? "var(--text-warning)" :
						"var(--text-error)"
					);
				}
			}
		}

		// Level label
		charEl.createSpan({
			cls: "mode-characteristic-level-qg",
			text: config.label,
		});
	}

	/**
	 * Render the labels/tags for a mode
	 */
	private renderLabels(cardEl: HTMLElement, labels: string[]): void {
		const labelsEl = cardEl.createDiv("mode-card-labels-qg");
		for (const label of labels) {
			labelsEl.createSpan({
				cls: "mode-card-label-qg",
				text: label,
			});
		}
	}

	/**
	 * Render the collapsible detailed help section
	 * Requirements: 10.1, 10.2
	 */
	private renderDetailedHelp(): void {
		const helpSection = new CollapsibleSection(
			this.containerEl,
			"Learn More About Generation Modes",
			false
		);

		const contentEl = helpSection.contentEl;
		contentEl.addClass("mode-detailed-help-qg");

		// Render detailed help for each mode
		const modes: GenerationMode[] = ["main", "consensus", "council"];
		for (const mode of modes) {
			const modeInfo = MODE_DATA[mode];
			this.renderModeDetailedHelp(contentEl, modeInfo);
		}

		// Add note about when modes are used
		const noteEl = contentEl.createDiv("mode-help-note-qg");
		noteEl.innerHTML =
			"<strong>Note:</strong> When Consensus or Council mode is enabled, the Main generation model " +
			"is <em>not</em> used for quiz creation. Only the models configured in those modes are used.";
	}

	/**
	 * Render detailed help for a single mode
	 */
	private renderModeDetailedHelp(container: HTMLElement, modeInfo: ModeInfo): void {
		const helpEl = container.createDiv("mode-help-item-qg");

		// Mode name
		const titleEl = helpEl.createEl("h4", { cls: "mode-help-title-qg" });
		titleEl.textContent = modeInfo.name;

		// Help points as bullet list
		const listEl = helpEl.createEl("ul", { cls: "mode-help-list-qg" });
		for (const point of modeInfo.detailedHelp) {
			const itemEl = listEl.createEl("li");
			itemEl.textContent = point;
		}
	}

	/**
	 * Update the active mode and refresh the display
	 *
	 * @param mode - The new active mode
	 */
	public setActiveMode(mode: GenerationMode): void {
		if (this.activeMode === mode) {
			return;
		}

		// Remove active class from previous
		const prevCard = this.modeCards.get(this.activeMode);
		if (prevCard) {
			prevCard.removeClass("mode-card-active-qg");
			const badge = prevCard.querySelector(".mode-card-active-badge-qg");
			badge?.remove();
		}

		// Add active class to new
		this.activeMode = mode;
		const newCard = this.modeCards.get(mode);
		if (newCard) {
			newCard.addClass("mode-card-active-qg");
			const badge = newCard.createDiv("mode-card-active-badge-qg");
			badge.textContent = "Active";
			// Move badge to be first child
			newCard.insertBefore(badge as unknown as Node, newCard.firstChild);
		}
	}

	/**
	 * Get the currently active mode
	 */
	public getActiveMode(): GenerationMode {
		return this.activeMode;
	}

	/**
	 * Remove the section from the DOM
	 */
	public remove(): void {
		this.containerEl.remove();
	}
}

/**
 * Determine the active generation mode based on settings
 *
 * @param consensusEnabled - Whether consensus mode is enabled
 * @param councilEnabled - Whether council mode is enabled
 * @returns The active generation mode
 *
 * Requirements: 8.8
 */
export function getActiveGenerationMode(
	consensusEnabled: boolean,
	councilEnabled: boolean
): GenerationMode {
	// Council takes precedence over Consensus
	if (councilEnabled) {
		return "council";
	}
	if (consensusEnabled) {
		return "consensus";
	}
	return "main";
}
