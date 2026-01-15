import { App, Modal } from "obsidian";

/**
 * Options for configuring the ConfirmModal appearance and behavior.
 */
export interface ConfirmModalOptions {
	/** Custom text for the confirm button (default: "Confirm") */
	confirmText?: string;
	/** Custom text for the cancel button (default: "Cancel") */
	cancelText?: string;
	/** Whether this is a destructive/warning action (adds warning styling) */
	isDestructive?: boolean;
	/** Custom CSS class to add to the modal */
	cssClass?: string;
}

/**
 * Generic confirmation modal with confirm/cancel buttons.
 * Implements Requirement 1.2, Task 39 from the spec.
 *
 * Features:
 * - Keyboard navigation: Escape to cancel
 * - Focus management for accessibility
 * - Optional destructive action styling
 * - Support for async confirm handlers
 */
export default class ConfirmModal extends Modal {
	private readonly title: string;
	private readonly message: string;
	private readonly onConfirm: () => void | Promise<void>;
	private readonly onCancel?: () => void;
	private readonly confirmText: string;
	private readonly cancelText: string;
	private readonly isDestructive: boolean;
	private readonly cssClass?: string;
	private keydownHandler?: (e: KeyboardEvent) => void;
	private confirmButton?: HTMLButtonElement;
	private cancelButton?: HTMLButtonElement;

	/**
	 * Create a new confirmation modal.
	 *
	 * @param app - The Obsidian app instance
	 * @param title - Modal title
	 * @param message - Message to display (supports newlines)
	 * @param onConfirm - Callback when user confirms
	 * @param confirmTextOrOptions - Either confirm button text or full options object
	 * @param cancelText - Cancel button text (only used if 4th param is string)
	 */
	constructor(
		app: App,
		title: string,
		message: string,
		onConfirm: () => void | Promise<void>,
		confirmTextOrOptions: string | ConfirmModalOptions = "Confirm",
		cancelText: string = "Cancel"
	) {
		super(app);
		this.title = title;
		this.message = message;
		this.onConfirm = onConfirm;

		// Support both legacy signature and new options object
		if (typeof confirmTextOrOptions === "string") {
			this.confirmText = confirmTextOrOptions;
			this.cancelText = cancelText;
			this.isDestructive = false;
		} else {
			this.confirmText = confirmTextOrOptions.confirmText ?? "Confirm";
			this.cancelText = confirmTextOrOptions.cancelText ?? "Cancel";
			this.isDestructive = confirmTextOrOptions.isDestructive ?? false;
			this.cssClass = confirmTextOrOptions.cssClass;
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("confirm-modal");

		// Add optional custom class
		if (this.cssClass) {
			contentEl.addClass(this.cssClass);
		}

		// Add destructive styling if applicable
		if (this.isDestructive) {
			contentEl.addClass("confirm-modal-destructive");
		}

		// Modal title
		contentEl.createEl("h2", { text: this.title });

		// Message - support newlines by creating paragraph for each line
		const messageLines = this.message.split("\n");
		for (const line of messageLines) {
			if (line.trim()) {
				contentEl.createEl("p", {
					text: line,
					cls: "confirm-modal-message"
				});
			}
		}

		// Button container
		const buttonContainer = contentEl.createDiv({ cls: "confirm-modal-buttons" });

		// Cancel button
		const cancelButton = buttonContainer.createEl("button", {
			text: this.cancelText,
			cls: "confirm-modal-cancel"
		}) as HTMLButtonElement;
		cancelButton.addEventListener("click", () => {
			this.close();
		});
		this.cancelButton = cancelButton;

		// Confirm button - use warning style for destructive actions
		const confirmClasses = this.isDestructive
			? "confirm-modal-confirm mod-warning"
			: "confirm-modal-confirm mod-cta";
		const confirmButton = buttonContainer.createEl("button", {
			text: this.confirmText,
			cls: confirmClasses
		}) as HTMLButtonElement;
		confirmButton.addEventListener("click", async () => {
			this.close();
			await this.onConfirm();
		});
		this.confirmButton = confirmButton;

		// Set up keyboard navigation
		this.setupKeyboardNavigation();

		// Focus confirm button by default for non-destructive actions
		// For destructive actions, focus cancel for safety
		if (this.isDestructive) {
			cancelButton.focus();
		} else {
			confirmButton.focus();
		}
	}

	/**
	 * Set up keyboard event handlers for accessibility.
	 * - Escape: Close modal (cancel)
	 * - Tab: Cycle between buttons
	 * - Enter/Space: Activate focused button (handled by browser)
	 */
	private setupKeyboardNavigation(): void {
		this.keydownHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				this.close();
			} else if (e.key === "Tab") {
				// Trap focus within the modal buttons
				const buttons = [this.cancelButton, this.confirmButton].filter(Boolean) as HTMLButtonElement[];
				const focusedIndex = buttons.findIndex((btn) => btn === document.activeElement);

				if (e.shiftKey) {
					// Shift+Tab: go backwards
					e.preventDefault();
					const prevIndex = focusedIndex <= 0 ? buttons.length - 1 : focusedIndex - 1;
					buttons[prevIndex]?.focus();
				} else {
					// Tab: go forwards
					e.preventDefault();
					const nextIndex = focusedIndex >= buttons.length - 1 ? 0 : focusedIndex + 1;
					buttons[nextIndex]?.focus();
				}
			}
		};

		document.addEventListener("keydown", this.keydownHandler);
	}

	onClose(): void {
		const { contentEl } = this;

		// Remove keyboard handler
		if (this.keydownHandler) {
			document.removeEventListener("keydown", this.keydownHandler);
			this.keydownHandler = undefined;
		}

		// Clear references
		this.confirmButton = undefined;
		this.cancelButton = undefined;

		contentEl.empty();
	}
}
