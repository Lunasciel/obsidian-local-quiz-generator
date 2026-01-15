/**
 * @file impactEstimateComponent.ts
 * @description Reusable component for displaying cost and time impact estimates
 *
 * Task 11: Create ImpactEstimateComponent
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 *
 * This component provides a visual representation of the cost and time impact
 * of advanced generation modes (Consensus and Council). It displays:
 * - Cost indicator with dots (1-5 dots based on cost multiplier)
 * - Time indicator with dots (1-5 dots based on time multiplier)
 * - Warning message for high-cost configurations
 * - Tooltips explaining what each indicator represents
 *
 * Design Goals:
 * - Relative indicators (dots/bars) rather than absolute values (Requirement 4.3)
 * - Immediate visual feedback when configuration changes (Requirement 4.2)
 * - Clear grouping with heading (Requirement 4.5)
 * - Tooltips for detailed explanation (Requirement 4.6)
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Configuration for the impact estimate display.
 * Used by both Consensus and Council modes.
 */
export interface ImpactEstimateConfig {
	/** Cost multiplier compared to single-model generation (e.g., 3.0 = 3x cost) */
	costMultiplier: number;
	/** Time multiplier compared to single-model generation (e.g., 2.0 = 2x time) */
	timeMultiplier: number;
	/** Whether to show a warning for high resource usage */
	showWarning: boolean;
	/** Threshold at which to show warning (default: 5) */
	warningThreshold?: number;
	/** Custom warning message (optional) */
	warningMessage?: string;
}

/**
 * Impact level classification for visual styling.
 */
export type ImpactLevel = "low" | "medium" | "high";

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum number of dots to display in the indicator.
 */
export const MAX_DOTS = 5;

/**
 * Thresholds for determining impact level from multiplier.
 * These values determine when to show green (low), yellow (medium), or red (high).
 */
export const IMPACT_THRESHOLDS = {
	/** Multipliers below this are considered low impact */
	LOW_MAX: 2.5,
	/** Multipliers below this are considered medium impact */
	MEDIUM_MAX: 5.0,
	/** Multipliers at or above this are considered high impact */
	HIGH_MIN: 5.0,
} as const;

/**
 * Default warning threshold (cost multiplier at which warning appears).
 */
export const DEFAULT_WARNING_THRESHOLD = 5;

/**
 * Default warning message template.
 * {multiplier} will be replaced with the actual cost multiplier.
 */
export const DEFAULT_WARNING_MESSAGE =
	"High resource usage: {multiplier}x normal cost. Consider reducing the number of models or iterations.";

/**
 * Tooltip text for cost indicator.
 */
export const COST_TOOLTIP =
	"Estimated API cost impact compared to single-model generation. " +
	"More dots = higher cost. Green (low), yellow (medium), red (high).";

/**
 * Tooltip text for time indicator.
 */
export const TIME_TOOLTIP =
	"Estimated generation time impact compared to single-model generation. " +
	"More dots = longer time. Parallel execution reduces time impact.";

/**
 * Accessibility labels for screen readers.
 */
export const ARIA_LABELS = {
	CONTAINER: "Impact estimate showing cost and time indicators",
	COST: (level: string, multiplier: number) =>
		`Cost impact: ${level}, approximately ${multiplier.toFixed(1)} times normal cost`,
	TIME: (level: string, multiplier: number) =>
		`Time impact: ${level}, approximately ${multiplier.toFixed(1)} times normal time`,
	WARNING: "High cost warning",
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine the impact level based on a multiplier value.
 *
 * @param multiplier - The cost or time multiplier
 * @returns The impact level classification
 */
export function getImpactLevel(multiplier: number): ImpactLevel {
	if (multiplier <= IMPACT_THRESHOLDS.LOW_MAX) {
		return "low";
	}
	if (multiplier <= IMPACT_THRESHOLDS.MEDIUM_MAX) {
		return "medium";
	}
	return "high";
}

/**
 * Calculate the number of filled dots to display based on multiplier.
 *
 * @param multiplier - The cost or time multiplier
 * @param maxDots - Maximum number of dots (default: MAX_DOTS)
 * @returns Number of filled dots (1 to maxDots)
 */
export function calculateFilledDots(multiplier: number, maxDots: number = MAX_DOTS): number {
	if (multiplier <= 0) {
		return 0;
	}
	if (multiplier <= 1) {
		return 1;
	}
	if (multiplier >= 10) {
		return maxDots;
	}

	// Scale: 1x = 1 dot, 10x = 5 dots
	// Linear interpolation: dots = 1 + (multiplier - 1) * (maxDots - 1) / 9
	const dots = 1 + ((multiplier - 1) * (maxDots - 1)) / 9;
	return Math.min(maxDots, Math.max(1, Math.round(dots)));
}

/**
 * Format the warning message by replacing placeholders.
 *
 * @param message - The message template with {multiplier} placeholder
 * @param multiplier - The actual multiplier value
 * @returns Formatted message string
 */
export function formatWarningMessage(message: string, multiplier: number): string {
	return message.replace(/\{multiplier\}/g, multiplier.toFixed(1));
}

/**
 * Get the human-readable impact level label.
 *
 * @param level - The impact level
 * @returns Human-readable label
 */
export function getImpactLevelLabel(level: ImpactLevel): string {
	switch (level) {
		case "low":
			return "Low";
		case "medium":
			return "Medium";
		case "high":
			return "High";
	}
}

// ============================================================================
// ImpactEstimateComponent Class
// ============================================================================

/**
 * Reusable component for displaying cost and time impact estimates.
 *
 * This component creates a visual representation of resource usage with:
 * - Dot indicators for cost and time (1-5 dots)
 * - Color coding based on impact level (green/yellow/red)
 * - Warning message for high-cost configurations
 * - Tooltips explaining what each indicator represents
 *
 * Requirements:
 * - 4.1: Display cost and time estimates in a consistent, clearly formatted manner
 * - 4.2: Immediately update when configuration changes
 * - 4.3: Display relative indicators (dots) rather than absolute values
 * - 4.4: Display relative time indicators with clear labels
 * - 4.5: Group indicators in a visually distinct container
 * - 4.6: Display tooltips explaining what indicators represent
 *
 * @example
 * ```typescript
 * const container = document.createElement('div');
 * const component = new ImpactEstimateComponent(container);
 *
 * // Update with new configuration
 * component.update({
 *   costMultiplier: 3.0,
 *   timeMultiplier: 2.5,
 *   showWarning: true,
 *   warningThreshold: 5
 * });
 *
 * // Clean up when done
 * component.destroy();
 * ```
 */
export class ImpactEstimateComponent {
	/** Container element for the component */
	private containerEl: HTMLElement;

	/** Whether the component has been destroyed */
	private isDestroyed: boolean = false;

	/** Current configuration */
	private currentConfig: ImpactEstimateConfig | null = null;

	/**
	 * Create a new ImpactEstimateComponent.
	 *
	 * @param parent - The parent element to render the component into
	 */
	constructor(parent: HTMLElement) {
		this.containerEl = parent.createDiv({
			cls: "impact-estimate-container-qg",
		});
		this.containerEl.setAttribute("role", "region");
		this.containerEl.setAttribute("aria-label", ARIA_LABELS.CONTAINER);
	}

	/**
	 * Update the component with new configuration.
	 * This method clears the container and re-renders all elements.
	 *
	 * @param config - The new impact estimate configuration
	 */
	public update(config: ImpactEstimateConfig): void {
		if (this.isDestroyed) {
			return;
		}

		this.currentConfig = config;
		this.containerEl.empty();

		// Render header
		this.renderHeader();

		// Render indicators row
		const indicatorsRow = this.containerEl.createDiv({
			cls: "impact-estimate-indicators-qg",
		});

		this.renderCostIndicator(indicatorsRow, config.costMultiplier);
		this.renderTimeIndicator(indicatorsRow, config.timeMultiplier);

		// Render warning if needed
		const warningThreshold = config.warningThreshold ?? DEFAULT_WARNING_THRESHOLD;
		if (config.showWarning && config.costMultiplier >= warningThreshold) {
			this.renderWarning(config.costMultiplier, config.warningMessage);
		}
	}

	/**
	 * Get the current configuration.
	 *
	 * @returns The current configuration, or null if not set
	 */
	public getConfig(): ImpactEstimateConfig | null {
		return this.currentConfig;
	}

	/**
	 * Get the container element.
	 *
	 * @returns The container element
	 */
	public getElement(): HTMLElement {
		return this.containerEl;
	}

	/**
	 * Check if the component has been destroyed.
	 *
	 * @returns True if destroyed
	 */
	public getIsDestroyed(): boolean {
		return this.isDestroyed;
	}

	/**
	 * Destroy the component and clean up resources.
	 */
	public destroy(): void {
		if (this.isDestroyed) {
			return;
		}

		this.isDestroyed = true;
		this.containerEl.remove();
		this.currentConfig = null;
	}

	/**
	 * Render the header section.
	 */
	private renderHeader(): void {
		const header = this.containerEl.createDiv({
			cls: "impact-estimate-header-qg",
		});

		const title = header.createSpan({
			cls: "impact-estimate-title-qg",
			text: "Impact Estimate",
		});

		// Add help icon with tooltip
		const helpIcon = header.createSpan({
			cls: "impact-estimate-help-qg",
			text: "?",
		});
		helpIcon.setAttribute("aria-label", "Help: What do these indicators mean?");
		helpIcon.setAttribute(
			"title",
			"Shows estimated resource usage compared to single-model generation. " +
				"Cost reflects API calls, Time reflects generation duration."
		);
	}

	/**
	 * Render the cost indicator with dots.
	 *
	 * @param parent - Parent element to render into
	 * @param multiplier - The cost multiplier
	 */
	private renderCostIndicator(parent: HTMLElement, multiplier: number): void {
		const level = getImpactLevel(multiplier);
		const filledDots = calculateFilledDots(multiplier);

		const item = parent.createDiv({
			cls: `impact-item-qg impact-${level}-qg`,
		});
		item.setAttribute("aria-label", ARIA_LABELS.COST(getImpactLevelLabel(level), multiplier));
		item.setAttribute("title", COST_TOOLTIP);

		// Label
		const label = item.createSpan({
			cls: "impact-label-qg",
			text: "Cost:",
		});

		// Dots container
		const dotsContainer = item.createDiv({
			cls: "impact-dots-qg",
		});

		this.renderDots(dotsContainer, filledDots);

		// Multiplier text
		const multiplierText = item.createSpan({
			cls: "impact-multiplier-qg",
			text: `${multiplier.toFixed(1)}x`,
		});
	}

	/**
	 * Render the time indicator with dots.
	 *
	 * @param parent - Parent element to render into
	 * @param multiplier - The time multiplier
	 */
	private renderTimeIndicator(parent: HTMLElement, multiplier: number): void {
		const level = getImpactLevel(multiplier);
		const filledDots = calculateFilledDots(multiplier);

		const item = parent.createDiv({
			cls: `impact-item-qg impact-${level}-qg`,
		});
		item.setAttribute("aria-label", ARIA_LABELS.TIME(getImpactLevelLabel(level), multiplier));
		item.setAttribute("title", TIME_TOOLTIP);

		// Label
		const label = item.createSpan({
			cls: "impact-label-qg",
			text: "Time:",
		});

		// Dots container
		const dotsContainer = item.createDiv({
			cls: "impact-dots-qg",
		});

		this.renderDots(dotsContainer, filledDots);

		// Multiplier text
		const multiplierText = item.createSpan({
			cls: "impact-multiplier-qg",
			text: `${multiplier.toFixed(1)}x`,
		});
	}

	/**
	 * Render a row of dots.
	 *
	 * @param container - Container element for dots
	 * @param filledCount - Number of filled dots
	 */
	private renderDots(container: HTMLElement, filledCount: number): void {
		for (let i = 0; i < MAX_DOTS; i++) {
			const dot = container.createSpan({
				cls: i < filledCount ? "impact-dot-filled-qg" : "impact-dot-empty-qg",
			});
		}
	}

	/**
	 * Render a warning message for high-cost configurations.
	 *
	 * @param multiplier - The cost multiplier
	 * @param customMessage - Optional custom warning message
	 */
	private renderWarning(multiplier: number, customMessage?: string): void {
		const warning = this.containerEl.createDiv({
			cls: "impact-warning-qg",
		});
		warning.setAttribute("role", "alert");
		warning.setAttribute("aria-label", ARIA_LABELS.WARNING);

		// Warning icon
		const icon = warning.createSpan({
			cls: "impact-warning-icon-qg",
			text: "⚠",
		});

		// Warning message
		const message = customMessage ?? DEFAULT_WARNING_MESSAGE;
		const text = warning.createSpan({
			cls: "impact-warning-text-qg",
			text: formatWarningMessage(message, multiplier),
		});
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ImpactEstimateComponent.
 *
 * This is a convenience factory function that creates and optionally
 * initializes the component with configuration.
 *
 * @param parent - The parent element to render the component into
 * @param initialConfig - Optional initial configuration
 * @returns A new ImpactEstimateComponent instance
 */
export function createImpactEstimateComponent(
	parent: HTMLElement,
	initialConfig?: ImpactEstimateConfig
): ImpactEstimateComponent {
	const component = new ImpactEstimateComponent(parent);

	if (initialConfig) {
		component.update(initialConfig);
	}

	return component;
}

export default ImpactEstimateComponent;
