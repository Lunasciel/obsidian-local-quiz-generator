import { App, Modal } from "obsidian";

/**
 * Modal to prompt user whether to resume a paused session or start fresh
 *
 * This modal is shown when opening a deck that has a paused session.
 * The user can choose to:
 * - Resume from where they left off
 * - Start a new session (discarding the paused one)
 * - Cancel and return
 */
export class ResumeSessionModal extends Modal {
	private deckName: string;
	private cardIndex: number;
	private totalCards: number;
	private pausedAt: number;
	private onResume: () => void;
	private onStartFresh: () => void;

	/**
	 * Creates a new ResumeSessionModal
	 *
	 * @param app - The Obsidian app instance
	 * @param deckName - Name of the deck with the paused session
	 * @param cardIndex - Index of the card where the session was paused
	 * @param totalCards - Total number of cards in the deck
	 * @param pausedAt - Timestamp when the session was paused
	 * @param onResume - Callback to execute if user chooses to resume
	 * @param onStartFresh - Callback to execute if user chooses to start fresh
	 */
	constructor(
		app: App,
		deckName: string,
		cardIndex: number,
		totalCards: number,
		pausedAt: number,
		onResume: () => void,
		onStartFresh: () => void
	) {
		super(app);
		this.deckName = deckName;
		this.cardIndex = cardIndex;
		this.totalCards = totalCards;
		this.pausedAt = pausedAt;
		this.onResume = onResume;
		this.onStartFresh = onStartFresh;
	}

	/**
	 * Formats a timestamp into a human-readable relative time string
	 */
	private formatTimeSince(timestamp: number): string {
		const now = Date.now();
		const diffMs = now - timestamp;
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) {
			return "just now";
		} else if (diffMins < 60) {
			return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
		} else if (diffHours < 24) {
			return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
		} else if (diffDays < 7) {
			return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
		} else {
			const date = new Date(timestamp);
			return date.toLocaleDateString();
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("resume-session-modal-qg");

		// Title
		contentEl.createEl("h2", { text: "Resume Session?" });

		// Info message
		const infoDiv = contentEl.createDiv("resume-session-info-qg");
		infoDiv.createEl("p", {
			text: `You have a paused session for "${this.deckName}".`
		});

		const detailsDiv = infoDiv.createDiv("resume-session-details-qg");
		detailsDiv.createEl("p", {
			text: `Progress: Card ${this.cardIndex + 1} of ${this.totalCards}`
		});
		detailsDiv.createEl("p", {
			text: `Paused: ${this.formatTimeSince(this.pausedAt)}`
		});

		// Buttons
		const buttonContainer = contentEl.createDiv("resume-session-buttons-qg");

		const resumeButton = buttonContainer.createEl("button", {
			text: "Resume",
			cls: "mod-cta"
		});
		resumeButton.addEventListener("click", () => {
			this.close();
			this.onResume();
		});

		const startFreshButton = buttonContainer.createEl("button", {
			text: "Start Fresh"
		});
		startFreshButton.addEventListener("click", () => {
			this.close();
			this.onStartFresh();
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel"
		});
		cancelButton.addEventListener("click", () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
