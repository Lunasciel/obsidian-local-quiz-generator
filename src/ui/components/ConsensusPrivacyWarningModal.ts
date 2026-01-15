import { App, Modal, Setting } from "obsidian";
import { Provider } from "../../generators/providers";

/**
 * Privacy warning modal for multi-provider consensus mode
 * Requirement 5.1: Inform users about data privacy implications
 *
 * Displays:
 * - Warning that content will be sent to multiple AI services
 * - List of providers that will receive data
 * - Option to restrict to local-only models (Ollama)
 * - Clear consent mechanism
 */
export default class ConsensusPrivacyWarningModal extends Modal {
	private readonly providers: Provider[];
	private readonly onAccept: (localOnlyMode: boolean) => Promise<void>;
	private readonly onCancel: () => void;
	private localOnlyMode: boolean = false;

	constructor(
		app: App,
		providers: Provider[],
		onAccept: (localOnlyMode: boolean) => Promise<void>,
		onCancel: () => void
	) {
		super(app);
		this.providers = providers;
		this.onAccept = onAccept;
		this.onCancel = onCancel;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("consensus-privacy-warning-modal");

		// Modal title
		contentEl.createEl("h2", { text: "Data Privacy Notice" });

		// Warning icon and primary message
		const warningContainer = contentEl.createDiv({ cls: "privacy-warning-container" });
		warningContainer.createEl("div", {
			text: "⚠️",
			cls: "privacy-warning-icon",
		});

		const messageContainer = warningContainer.createDiv({ cls: "privacy-warning-message" });
		messageContainer.createEl("p", {
			text: "You are about to enable multi-model consensus mode. This feature will send your note content to multiple AI services for improved accuracy.",
			cls: "privacy-warning-text-primary",
		});

		// Details section
		const detailsContainer = contentEl.createDiv({ cls: "privacy-details-container" });

		detailsContainer.createEl("h3", { text: "What data will be shared?" });
		detailsContainer.createEl("p", {
			text: "When consensus mode is enabled, the following information will be sent to the configured AI providers:",
		});

		const dataList = detailsContainer.createEl("ul", { cls: "privacy-data-list" });
		dataList.createEl("li", { text: "The full text content of your selected notes" });
		dataList.createEl("li", { text: "Quiz generation parameters (question types, count, etc.)" });
		dataList.createEl("li", {
			text: "During consensus rounds, anonymized answers from other models",
		});

		// Providers list
		detailsContainer.createEl("h3", { text: "Configured providers" });
		detailsContainer.createEl("p", {
			text: "Your content will be sent to the following AI service providers:",
		});

		const providersList = detailsContainer.createEl("ul", { cls: "privacy-providers-list" });
		const uniqueProviders = Array.from(new Set(this.providers));

		for (const provider of uniqueProviders) {
			const li = providersList.createEl("li");
			li.createEl("strong", { text: provider });

			// Add context about the provider
			let description = "";
			if (provider === Provider.OLLAMA) {
				description = " - Local model (runs on your machine)";
			} else if (provider === Provider.OPENAI) {
				description = " - Cloud service (OpenAI API)";
			} else {
				description = " - Cloud service";
			}
			li.appendChild(document.createTextNode(description));
		}

		// Check if there are any non-local providers
		const hasNonLocalProviders = uniqueProviders.some(p => p !== Provider.OLLAMA);

		if (hasNonLocalProviders) {
			const privacyNote = detailsContainer.createDiv({ cls: "privacy-note-warning" });
			privacyNote.createEl("p", {
				text: "⚠️ Note: Cloud providers will process your content on their servers. Review their privacy policies to understand how your data is handled.",
			});
		}

		// Local-only mode option
		if (hasNonLocalProviders && uniqueProviders.includes(Provider.OLLAMA)) {
			const localOnlyContainer = contentEl.createDiv({ cls: "privacy-local-only-container" });

			new Setting(localOnlyContainer)
				.setName("Restrict to local models only")
				.setDesc(
					"Only use Ollama (local) models for consensus. This keeps your data on your machine but may reduce consensus effectiveness if few local models are configured."
				)
				.addToggle(toggle =>
					toggle.setValue(this.localOnlyMode).onChange(value => {
						this.localOnlyMode = value;
					})
				);
		}

		// Important considerations
		const considerationsContainer = contentEl.createDiv({ cls: "privacy-considerations" });
		considerationsContainer.createEl("h3", { text: "Important considerations" });

		const considerationsList = considerationsContainer.createEl("ul");
		considerationsList.createEl("li", {
			text: "Each provider has its own privacy policy and data retention practices",
		});
		considerationsList.createEl("li", {
			text: "Consensus mode will increase the number of API calls and associated costs",
		});
		considerationsList.createEl("li", {
			text: "You can disable consensus mode at any time in the settings",
		});

		if (hasNonLocalProviders) {
			considerationsList.createEl("li", {
				text: "For sensitive or confidential content, consider using local-only mode or single-model generation",
			});
		}

		// Consent statement
		const consentContainer = contentEl.createDiv({ cls: "privacy-consent-container" });
		consentContainer.createEl("p", {
			text: "By clicking 'I Understand', you acknowledge that you have read and understood the data sharing implications of multi-model consensus mode.",
			cls: "privacy-consent-text",
		});

		// Button container
		const buttonContainer = contentEl.createDiv({ cls: "privacy-modal-buttons" });

		// Cancel button
		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "privacy-modal-cancel",
		});
		cancelButton.addEventListener("click", () => {
			this.close();
			this.onCancel();
		});

		// Accept button
		const acceptButton = buttonContainer.createEl("button", {
			text: "I Understand",
			cls: "privacy-modal-accept mod-cta",
		});
		acceptButton.addEventListener("click", async () => {
			this.close();
			await this.onAccept(this.localOnlyMode);
		});

		// Focus accept button by default
		acceptButton.focus();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
