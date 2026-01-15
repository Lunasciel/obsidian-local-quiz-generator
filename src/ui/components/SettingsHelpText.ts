/**
 * SettingsHelpText Component
 *
 * Utility functions and components for adding consistent help text,
 * tooltips, and info icons throughout the settings UI.
 *
 * Task 37: Add help text and tooltips throughout settings UI
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import { setIcon, Setting } from "obsidian";

/**
 * Configuration for an info icon with tooltip
 */
export interface InfoIconConfig {
	/** Tooltip text to display on hover */
	tooltip: string;
	/** Optional icon name (defaults to "info") */
	iconName?: string;
	/** Optional aria-label for accessibility */
	ariaLabel?: string;
}

/**
 * Configuration for a help section
 */
export interface HelpSectionConfig {
	/** Main heading text */
	heading?: string;
	/** Description paragraphs */
	paragraphs: string[];
	/** Optional note (displayed with warning styling) */
	note?: string;
	/** Optional bullet points */
	bullets?: string[];
}

/**
 * Add an info icon with tooltip to a Setting's name element.
 *
 * The icon appears next to the setting name and shows a tooltip on hover.
 *
 * @param setting - The Obsidian Setting to add the icon to
 * @param config - Configuration for the info icon
 * @returns The created icon element
 *
 * @example
 * ```typescript
 * const setting = new Setting(containerEl)
 *   .setName("API Key")
 *   .setDesc("Your OpenAI API key");
 * addInfoIconToSetting(setting, {
 *   tooltip: "Keep this secret. Never share your API key.",
 * });
 * ```
 */
export function addInfoIconToSetting(
	setting: Setting,
	config: InfoIconConfig
): HTMLElement | null {
	const nameEl = setting.settingEl.querySelector(".setting-item-name");
	if (!nameEl) return null;

	return addInfoIcon(nameEl as HTMLElement, config);
}

/**
 * Add an info icon with tooltip to any HTML element.
 *
 * @param container - The element to append the icon to
 * @param config - Configuration for the info icon
 * @returns The created icon element
 */
export function addInfoIcon(
	container: HTMLElement,
	config: InfoIconConfig
): HTMLElement {
	const iconEl = document.createElement("span");
	iconEl.className = "settings-info-icon-qg";
	iconEl.setAttribute("aria-label", config.ariaLabel ?? config.tooltip);
	iconEl.setAttribute("title", config.tooltip);

	// Use Obsidian's setIcon for consistent styling
	setIcon(iconEl, config.iconName ?? "info");

	container.appendChild(iconEl as Node);
	return iconEl;
}

/**
 * Add a help icon (question mark) with tooltip to an element.
 *
 * Uses the "help-circle" icon for a more prominent help indicator.
 *
 * @param container - The element to append the icon to
 * @param tooltip - Tooltip text
 * @returns The created icon element
 */
export function addHelpIcon(
	container: HTMLElement,
	tooltip: string
): HTMLElement {
	return addInfoIcon(container, {
		tooltip,
		iconName: "help-circle",
		ariaLabel: `Help: ${tooltip}`,
	});
}

/**
 * Add a native browser tooltip to an element.
 *
 * Simple and lightweight - uses the title attribute.
 *
 * @param element - The element to add tooltip to
 * @param tooltip - Tooltip text
 */
export function addTooltip(element: HTMLElement, tooltip: string): void {
	element.setAttribute("title", tooltip);
}

/**
 * Create a custom positioned tooltip that appears on hover.
 *
 * More flexible than native tooltips - can be styled and positioned.
 *
 * @param trigger - Element that triggers the tooltip on hover
 * @param content - HTML content or text for the tooltip
 * @param options - Optional positioning and styling options
 * @returns Cleanup function to remove event listeners
 */
export function createHoverTooltip(
	trigger: HTMLElement,
	content: string | HTMLElement,
	options: {
		position?: "top" | "right" | "bottom" | "left";
		className?: string;
	} = {}
): () => void {
	let tooltipEl: HTMLElement | null = null;

	const showTooltip = (event: MouseEvent) => {
		if (tooltipEl) return;

		tooltipEl = document.createElement("div");
		tooltipEl.className = `settings-hover-tooltip-qg ${options.className ?? ""}`;

		if (typeof content === "string") {
			tooltipEl.textContent = content;
		} else {
			tooltipEl.appendChild(content.cloneNode(true) as Node);
		}

		document.body.appendChild(tooltipEl as Node);

		// Position the tooltip
		const rect = trigger.getBoundingClientRect();
		const tooltipRect = tooltipEl.getBoundingClientRect();
		const position = options.position ?? "right";

		let top: number;
		let left: number;

		switch (position) {
			case "top":
				top = rect.top - tooltipRect.height - 8;
				left = rect.left + (rect.width - tooltipRect.width) / 2;
				break;
			case "bottom":
				top = rect.bottom + 8;
				left = rect.left + (rect.width - tooltipRect.width) / 2;
				break;
			case "left":
				top = rect.top + (rect.height - tooltipRect.height) / 2;
				left = rect.left - tooltipRect.width - 8;
				break;
			case "right":
			default:
				top = rect.top + (rect.height - tooltipRect.height) / 2;
				left = rect.right + 8;
				break;
		}

		// Keep tooltip on screen
		if (left < 8) left = 8;
		if (left + tooltipRect.width > window.innerWidth - 8) {
			left = window.innerWidth - tooltipRect.width - 8;
		}
		if (top < 8) top = 8;
		if (top + tooltipRect.height > window.innerHeight - 8) {
			top = window.innerHeight - tooltipRect.height - 8;
		}

		tooltipEl.style.position = "fixed";
		tooltipEl.style.top = `${top}px`;
		tooltipEl.style.left = `${left}px`;
	};

	const hideTooltip = () => {
		if (tooltipEl) {
			tooltipEl.remove();
			tooltipEl = null;
		}
	};

	trigger.addEventListener("mouseenter", showTooltip);
	trigger.addEventListener("mouseleave", hideTooltip);
	trigger.addEventListener("click", hideTooltip);

	// Return cleanup function
	return () => {
		trigger.removeEventListener("mouseenter", showTooltip);
		trigger.removeEventListener("mouseleave", hideTooltip);
		trigger.removeEventListener("click", hideTooltip);
		hideTooltip();
	};
}

/**
 * Create a help text box with consistent styling.
 *
 * Used for detailed explanations that appear inline in settings.
 *
 * @param container - Parent element to append the help box to
 * @param config - Content configuration
 * @returns The created help box element
 */
export function createHelpBox(
	container: HTMLElement,
	config: HelpSectionConfig
): HTMLElement {
	const helpBox = document.createElement("div");
	helpBox.className = "setting-help-box-qg";

	// Optional heading
	if (config.heading) {
		const headingEl = document.createElement("div");
		headingEl.className = "help-box-heading-qg";
		headingEl.textContent = config.heading;
		helpBox.appendChild(headingEl as Node);
	}

	// Paragraphs
	for (const paragraph of config.paragraphs) {
		const pEl = document.createElement("p");
		pEl.className = "help-box-paragraph-qg";
		pEl.textContent = paragraph;
		helpBox.appendChild(pEl as Node);
	}

	// Optional bullets
	if (config.bullets && config.bullets.length > 0) {
		const listEl = document.createElement("ul");
		listEl.className = "help-box-list-qg";
		for (const bullet of config.bullets) {
			const li = document.createElement("li");
			li.textContent = bullet;
			listEl.appendChild(li as Node);
		}
		helpBox.appendChild(listEl as Node);
	}

	// Optional note (with warning styling)
	if (config.note) {
		const noteEl = document.createElement("div");
		noteEl.className = "help-box-note-qg";
		noteEl.innerHTML = `<strong>Note:</strong> ${config.note}`;
		helpBox.appendChild(noteEl as Node);
	}

	container.appendChild(helpBox as Node);
	return helpBox;
}

/**
 * Create an inline help tip (small, subtle help text).
 *
 * @param container - Parent element
 * @param text - Help text
 * @param icon - Optional icon name (prepended to text)
 * @returns The created tip element
 */
export function createHelpTip(
	container: HTMLElement,
	text: string,
	icon?: string
): HTMLElement {
	const tipEl = document.createElement("div");
	tipEl.className = "setting-help-tip-qg";

	if (icon) {
		const iconSpan = document.createElement("span");
		iconSpan.className = "help-tip-icon-qg";
		setIcon(iconSpan, icon);
		tipEl.appendChild(iconSpan as Node);
	}

	const textSpan = document.createElement("span");
	textSpan.textContent = text;
	tipEl.appendChild(textSpan as Node);

	container.appendChild(tipEl as Node);
	return tipEl;
}

/**
 * Create a glossary term with hover definition.
 *
 * The term is styled distinctly and shows its definition on hover.
 *
 * @param term - The term to display
 * @param definition - Definition shown on hover
 * @returns The created term element
 */
export function createGlossaryTerm(
	term: string,
	definition: string
): HTMLElement {
	const termEl = document.createElement("span");
	termEl.className = "settings-glossary-term-qg";
	termEl.textContent = term;
	termEl.setAttribute("title", definition);
	termEl.setAttribute("tabindex", "0");
	termEl.setAttribute("role", "term");

	return termEl;
}

/**
 * Create an enhanced setting description with help icon.
 *
 * Combines the description text with an info icon for additional context.
 *
 * @param setting - The Setting to enhance
 * @param description - Main description text
 * @param tooltip - Additional tooltip for the info icon
 */
export function setDescWithHelp(
	setting: Setting,
	description: string,
	tooltip: string
): void {
	setting.setDesc(description);
	addInfoIconToSetting(setting, { tooltip });
}

/**
 * Create a description with inline warning.
 *
 * @param setting - The Setting to enhance
 * @param description - Main description text
 * @param warning - Warning text to display
 */
export function setDescWithWarning(
	setting: Setting,
	description: string,
	warning: string
): void {
	const descEl = setting.descEl;
	descEl.empty();

	const mainText = document.createElement("span");
	mainText.textContent = description;
	descEl.appendChild(mainText as Node);

	const warningEl = document.createElement("div");
	warningEl.className = "setting-desc-warning-qg";
	warningEl.innerHTML = `<span class="warning-icon-qg">⚠</span> ${warning}`;
	descEl.appendChild(warningEl as Node);
}

/**
 * Create a mode explanation box with analogy and characteristics.
 *
 * Used in Consensus and Council settings to explain the mode.
 *
 * @param container - Parent element
 * @param options - Mode explanation content
 * @returns The created element
 */
export function createModeExplanation(
	container: HTMLElement,
	options: {
		description: string;
		analogy: string;
		characteristics: string;
		note?: string;
	}
): HTMLElement {
	const boxEl = document.createElement("div");
	boxEl.className = "mode-explanation-box-qg";

	// Description
	const descEl = document.createElement("p");
	descEl.className = "mode-explanation-text-qg";
	descEl.textContent = options.description;
	boxEl.appendChild(descEl as Node);

	// Characteristics
	const charsEl = document.createElement("p");
	charsEl.className = "mode-characteristics-inline-qg";
	charsEl.innerHTML = `<strong>Characteristics:</strong> ${options.characteristics}`;
	boxEl.appendChild(charsEl as Node);

	// Analogy
	const analogyEl = document.createElement("p");
	analogyEl.className = "mode-analogy-text-qg";
	analogyEl.innerHTML = `<em>💡 ${options.analogy}</em>`;
	boxEl.appendChild(analogyEl as Node);

	// Optional note
	if (options.note) {
		const noteEl = document.createElement("p");
		noteEl.className = "mode-usage-note-qg";
		noteEl.innerHTML = `<strong>Note:</strong> ${options.note}`;
		boxEl.appendChild(noteEl as Node);
	}

	container.appendChild(boxEl as Node);
	return boxEl;
}

/**
 * Create a cost/time impact indicator.
 *
 * Shows users how a setting affects cost and/or time.
 *
 * @param container - Parent element
 * @param impacts - Array of impact descriptions
 * @returns The created element
 */
export function createImpactIndicator(
	container: HTMLElement,
	impacts: Array<{
		label: string;
		level: "low" | "medium" | "high";
		description?: string;
	}>
): HTMLElement {
	const indicatorEl = document.createElement("div");
	indicatorEl.className = "setting-impact-indicator-qg";

	for (const impact of impacts) {
		const itemEl = document.createElement("div");
		itemEl.className = `impact-item-qg impact-${impact.level}-qg`;

		const labelEl = document.createElement("span");
		labelEl.className = "impact-label-qg";
		labelEl.textContent = impact.label;
		itemEl.appendChild(labelEl as Node);

		// Level dots (1-3)
		const dotsEl = document.createElement("span");
		dotsEl.className = "impact-dots-qg";
		const dotCount = impact.level === "low" ? 1 : impact.level === "medium" ? 2 : 3;
		for (let i = 0; i < 3; i++) {
			const dot = document.createElement("span");
			dot.className = i < dotCount ? "impact-dot-filled-qg" : "impact-dot-empty-qg";
			dotsEl.appendChild(dot as Node);
		}
		itemEl.appendChild(dotsEl as Node);

		if (impact.description) {
			itemEl.setAttribute("title", impact.description);
		}

		indicatorEl.appendChild(itemEl as Node);
	}

	container.appendChild(indicatorEl as Node);
	return indicatorEl;
}
