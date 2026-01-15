/**
 * StatisticsModal Component
 *
 * Modal wrapper that loads statistics data from StatisticsService
 * and renders the StatisticsView with React.
 *
 * Requirements addressed:
 * - Requirement 3.1: Provide access to statistics dashboard
 *
 * @module ui/statistics/StatisticsModal
 */

import { App, Notice } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import StatisticsService, {
	GlobalStats,
	DeckStatsExtended,
} from "../../services/flashcards/statisticsService";
import MetadataStorage from "../../services/flashcards/metadataStorage";
import StatisticsView from "./StatisticsView";
import { QuizSettings } from "../../settings/config";

/**
 * StatisticsModal provides a modal interface for viewing flashcard statistics.
 * It manages the React lifecycle and data loading from the StatisticsService.
 */
export default class StatisticsModal {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly statisticsService: StatisticsService;
	private container: HTMLDivElement | undefined;
	private root: Root | undefined;
	private readonly handleEscapePressed: (event: KeyboardEvent) => void;
	private readonly onReviewDeck?: (deckId: string) => void;

	/**
	 * Create a new StatisticsModal
	 * @param app - The Obsidian App instance
	 * @param settings - Plugin settings
	 * @param metadataStorage - MetadataStorage instance for loading statistics
	 * @param onReviewDeck - Optional callback when user wants to review a deck
	 */
	constructor(
		app: App,
		settings: QuizSettings,
		metadataStorage: MetadataStorage,
		onReviewDeck?: (deckId: string) => void
	) {
		this.app = app;
		this.settings = settings;
		this.statisticsService = new StatisticsService(metadataStorage);
		this.onReviewDeck = onReviewDeck;
		this.handleEscapePressed = (event: KeyboardEvent): void => {
			if (event.key === "Escape" && !(event.target instanceof HTMLInputElement)) {
				this.close();
			}
		};
	}

	/**
	 * Open the statistics modal and load data
	 */
	public async open(): Promise<void> {
		try {
			// Load statistics data
			const [globalStats, deckStats, heatmapData] = await Promise.all([
				this.statisticsService.getGlobalStats(),
				this.statisticsService.getAllDeckStats(),
				this.statisticsService.getHeatmapData(90),
			]);

			// Render the modal
			this.renderModal(globalStats, deckStats, heatmapData);
		} catch (error) {
			console.error("Error opening statistics modal:", error);
			new Notice("Failed to load statistics. Please try again.");
		}
	}

	/**
	 * Render the React component into the DOM
	 */
	private renderModal(
		globalStats: GlobalStats,
		deckStats: DeckStatsExtended[],
		heatmapData: Map<string, number>
	): void {
		// Create container
		this.container = document.body.createDiv({
			cls: "statistics-modal-overlay-qg",
		});

		// Create modal content wrapper
		const modalContent = this.container.createDiv({
			cls: "statistics-modal-content-qg",
		});

		// Render React component
		this.root = createRoot(modalContent as unknown as Element);
		this.root.render(
			StatisticsView({
				globalStats,
				deckStats,
				heatmapData,
				onClose: () => this.close(),
				onReviewDeck: this.onReviewDeck,
			})
		);

		// Add event listeners
		document.body.addEventListener("keydown", this.handleEscapePressed);

		// Close on overlay click
		this.container.addEventListener("click", (event: MouseEvent) => {
			if (event.target === this.container) {
				this.close();
			}
		});

		// Focus the modal for keyboard navigation
		modalContent.focus();
	}

	/**
	 * Close the modal and cleanup
	 */
	public close(): void {
		this.root?.unmount();
		this.container?.remove();
		document.body.removeEventListener("keydown", this.handleEscapePressed);
	}
}
