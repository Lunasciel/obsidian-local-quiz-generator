/**
 * Mode type for section styling - Task 38: Visual Polish
 * Used to apply mode-specific visual distinction
 */
export type SectionMode = "main" | "consensus" | "council" | "models" | "default";

/**
 * Callback type for when section is toggled.
 * Task 5.4: Section collapse state persistence
 */
export type OnToggleCallback = (expanded: boolean) => void;

/**
 * CollapsibleSection component for settings organization
 * Implements Requirement 9.1 from the flashcard-ux-overhaul spec
 * Enhanced with Task 38 visual polish features
 * Enhanced with Task 5.4 section collapse state persistence
 *
 * Provides an expandable/collapsible section with:
 * - Smooth expand/collapse animation (enhanced cubic-bezier easing)
 * - Chevron icon indicator
 * - Click-to-toggle header
 * - Configurable initial state (expanded/collapsed)
 * - Mode-specific visual styling (main, consensus, council, models)
 * - Optional status badge and count indicator
 * - Optional onToggle callback for state persistence (Task 5.4)
 */
export class CollapsibleSection {
	public contentEl: HTMLElement;
	private sectionEl: HTMLElement;
	private headerEl: HTMLElement;
	private toggleEl: HTMLElement;
	private titleEl: HTMLElement;
	private isExpanded: boolean;
	private statusBadgeEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;
	private onToggleCallback: OnToggleCallback | null = null;

	/**
	 * Creates a new collapsible section
	 *
	 * @param parent - Parent HTML element to attach the section to
	 * @param title - Section title displayed in the header
	 * @param expanded - Initial state (true = expanded, false = collapsed). Default: false
	 * @param mode - Visual styling mode for section distinction. Default: "default"
	 * @param onToggle - Optional callback invoked when section is toggled. Task 5.4
	 */
	constructor(
		parent: HTMLElement,
		title: string,
		expanded: boolean = false,
		mode: SectionMode = "default",
		onToggle?: OnToggleCallback
	) {
		this.isExpanded = expanded;
		this.onToggleCallback = onToggle ?? null;

		// Create section container with mode-specific class
		this.sectionEl = parent.createDiv("settings-section-qg");
		if (mode !== "default") {
			this.sectionEl.addClass(`settings-section-${mode}-qg`);
		}

		// Create header with toggle indicator
		this.headerEl = this.sectionEl.createDiv("section-header-qg");
		this.headerEl.setAttribute("role", "button");
		this.headerEl.setAttribute("aria-expanded", String(expanded));
		this.headerEl.setAttribute("tabindex", "0");

		// Create chevron toggle indicator
		this.toggleEl = this.headerEl.createSpan("section-toggle-qg");
		this.updateToggleIcon();

		// Create title
		this.titleEl = this.headerEl.createSpan({ text: title, cls: "section-title-qg" });

		// Create content container
		this.contentEl = this.sectionEl.createDiv("section-content-qg");
		if (!expanded) {
			this.contentEl.addClass("collapsed-qg");
		}

		// Bind event listeners
		this.setupEventListeners();
	}

	/**
	 * Set up click and keyboard event listeners for the header
	 */
	private setupEventListeners(): void {
		// Click handler
		this.headerEl.addEventListener("click", () => {
			this.toggle();
		});

		// Keyboard handler for accessibility (Enter and Space)
		this.headerEl.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				this.toggle();
			}
		});
	}

	/**
	 * Toggle the section between expanded and collapsed states.
	 * Invokes the onToggle callback if provided (Task 5.4).
	 */
	public toggle(): void {
		this.isExpanded = !this.isExpanded;
		this.contentEl.toggleClass("collapsed-qg", !this.isExpanded);
		this.updateToggleIcon();
		this.headerEl.setAttribute("aria-expanded", String(this.isExpanded));

		// Trigger reflow to ensure smooth animation
		void this.contentEl.offsetHeight;

		// Invoke callback for state persistence (Task 5.4)
		if (this.onToggleCallback) {
			this.onToggleCallback(this.isExpanded);
		}
	}

	/**
	 * Expand the section
	 */
	public expand(): void {
		if (!this.isExpanded) {
			this.toggle();
		}
	}

	/**
	 * Collapse the section
	 */
	public collapse(): void {
		if (this.isExpanded) {
			this.toggle();
		}
	}

	/**
	 * Update the chevron icon based on expanded state
	 */
	private updateToggleIcon(): void {
		this.toggleEl.textContent = this.isExpanded ? "▼" : "▶";
	}

	/**
	 * Get the current expanded state
	 */
	public getExpanded(): boolean {
		return this.isExpanded;
	}

	/**
	 * Set the expanded state programmatically
	 *
	 * @param expanded - Whether the section should be expanded
	 */
	public setExpanded(expanded: boolean): void {
		if (this.isExpanded !== expanded) {
			this.toggle();
		}
	}

	/**
	 * Set or update the status badge (e.g., "Active", "Inactive")
	 * Task 38: Visual distinction between mode sections
	 *
	 * @param text - Badge text to display
	 * @param isActive - Whether the status is active (affects styling)
	 */
	public setStatusBadge(text: string, isActive: boolean): void {
		// Remove existing badge if present
		if (this.statusBadgeEl) {
			this.statusBadgeEl.remove();
			this.statusBadgeEl = null;
		}

		if (text) {
			this.statusBadgeEl = this.headerEl.createSpan({
				text,
				cls: `section-status-badge-qg ${
					isActive ? "section-status-badge-active-qg" : "section-status-badge-inactive-qg"
				}`,
			});
		}
	}

	/**
	 * Set or update the count indicator (e.g., number of models)
	 * Task 38: Visual distinction between mode sections
	 *
	 * @param count - Number to display in the count badge
	 */
	public setCount(count: number): void {
		// Remove existing count if present
		if (this.countEl) {
			this.countEl.remove();
			this.countEl = null;
		}

		if (count >= 0) {
			this.countEl = this.titleEl.createSpan({
				text: String(count),
				cls: "section-count-qg",
			});
		}
	}

	/**
	 * Update the section title
	 *
	 * @param title - New title text
	 */
	public setTitle(title: string): void {
		// Keep the count element if it exists
		const existingCount = this.countEl;
		this.titleEl.textContent = title;

		// Re-add count if it existed
		if (existingCount) {
			this.titleEl.appendChild(existingCount as unknown as Node);
		}
	}

	/**
	 * Get the section container element
	 */
	public getSectionEl(): HTMLElement {
		return this.sectionEl;
	}

	/**
	 * Set the onToggle callback for state persistence.
	 * Task 5.4: Section collapse state persistence
	 *
	 * @param callback - Function to call when section is toggled
	 */
	public setOnToggle(callback: OnToggleCallback | null): void {
		this.onToggleCallback = callback;
	}

	/**
	 * Remove the section from the DOM
	 */
	public remove(): void {
		this.sectionEl.remove();
	}
}
