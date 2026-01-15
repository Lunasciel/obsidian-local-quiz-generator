import { CouncilSettings, ChairModelConfig } from "../../council/types";
import { ConsensusModelConfig } from "../../consensus/types";
import { CouncilModelReference, ModelRegistry } from "../modelRegistry/types";
import { Provider } from "../../generators/providers";

/**
 * Default council configuration values
 * Based on requirements from the LLM Council spec
 *
 * Uses the new reference-based model configuration where model references
 * point to entries in the central ModelRegistry.
 *
 * Requirements: 2.2, 2.3
 */
export const DEFAULT_COUNCIL_SETTINGS: CouncilSettings = {
	// Council mode is disabled by default
	enabled: false,

	// Model references for registry-based architecture (Requirements 2.2, 2.3)
	// Initially empty - user must configure models
	models: [],

	// Minimum 2 models required for council debate
	minModelsRequired: 2,

	// Chair model configuration - default to highest-ranked strategy
	chairModel: {
		selectionStrategy: "highest-ranked",
		synthesisWeight: 1.0,
		rotationIndex: 0,
	},

	// Enable critique phase by default
	enableCritique: true,

	// Enable ranking phase by default
	enableRanking: true,

	// Show debate trail by default for transparency
	showDebateTrail: true,

	// Fallback to single model if council fails
	fallbackToSingleModel: true,

	// Caching enabled to improve performance
	enableCaching: true,

	// Default timeout values per phase (in milliseconds)
	phaseTimeouts: {
		parallelQuery: 30000,  // 30 seconds
		critique: 45000,        // 45 seconds
		ranking: 30000,         // 30 seconds
		synthesis: 60000,       // 60 seconds
	},
};

/**
 * @deprecated Use createDefaultCouncilModelReference. Kept for migration compatibility only.
 */
export function createDefaultCouncilModelConfig(
	id: string,
	provider: Provider,
	quizSettings: any,
	providerConfig?: any
): ConsensusModelConfig {
	// Create a default provider config if not provided
	const defaultProviderConfig = providerConfig || (provider === Provider.OPENAI
		? {
			provider: Provider.OPENAI,
			apiKey: "",
			baseUrl: "https://api.openai.com/v1",
			textGenerationModel: "gpt-3.5-turbo",
			embeddingModel: "text-embedding-3-small",
		}
		: {
			provider: Provider.OLLAMA,
			baseUrl: "http://localhost:11434",
			textGenerationModel: "",
			embeddingModel: "",
		});

	return {
		id,
		provider,
		providerConfig: defaultProviderConfig,
		quizSettings,
		weight: 1.0, // Equal weight by default
		enabled: true,
	};
}

/**
 * Create a default council model reference for the new registry-based architecture.
 *
 * This creates a reference to a model in the central ModelRegistry,
 * rather than storing the full model configuration inline.
 *
 * Requirements: 1.3, 2.1
 *
 * @param modelId Reference to a model ID in the ModelRegistry
 * @param weight Weight for this model in council ranking (default: 1.0)
 * @param enabled Whether this model is enabled for council (default: true)
 * @returns CouncilModelReference with the specified or default values
 */
export function createDefaultCouncilModelReference(
	modelId: string,
	weight: number = 1.0,
	enabled: boolean = true
): CouncilModelReference {
	return {
		modelId,
		weight,
		enabled,
	};
}

/**
 * Validate council settings
 * Ensures all required constraints are met
 *
 * Uses the models field with model references that point to entries
 * in the central ModelRegistry. Legacy councilModels have been removed.
 *
 * When a ModelRegistry is provided, this function also validates that all
 * model references (modelId) actually exist in the registry. This is critical
 * for catching broken references that may occur when models are deleted
 * from the registry but still referenced in council settings.
 *
 * Requirements: 2.2, 2.3, 9.4, 11.1, 11.2, 11.3, 11.4
 *
 * @param settings The council settings to validate
 * @param registry Optional model registry to validate model references against
 * @returns Object with isValid boolean and optional error message
 */
export function validateCouncilSettings(
	settings: CouncilSettings,
	registry?: ModelRegistry
): {
	isValid: boolean;
	error?: string;
} {
	// Use the models field for validation
	const modelsToValidate = settings.models;

	// Check minimum models requirement
	const enabledModels = modelsToValidate.filter(m => m.enabled);
	if (settings.enabled && enabledModels.length < settings.minModelsRequired) {
		const difference = settings.minModelsRequired - enabledModels.length;
		return {
			isValid: false,
			error: `Council mode requires at least ${settings.minModelsRequired} enabled models for structured debate, but only ${enabledModels.length} ${enabledModels.length === 1 ? "is" : "are"} enabled. ` +
				`Please enable ${difference} more model${difference === 1 ? "" : "s"} or add new models in Settings → Model Management.`,
		};
	}

	// Validate minimum models is at least 2
	if (settings.minModelsRequired < 2) {
		return {
			isValid: false,
			error: `Minimum Models Required must be at least 2 for council debate. Current value: ${settings.minModelsRequired}. Council mode needs multiple models to engage in structured debate.`,
		};
	}

	// Validate model IDs are unique
	const modelIds = settings.models.map(m => m.modelId);
	const uniqueIds = new Set(modelIds);
	if (modelIds.length !== uniqueIds.size) {
		// Find the duplicate
		const seen = new Set<string>();
		const duplicates: string[] = [];
		for (const id of modelIds) {
			if (seen.has(id)) {
				duplicates.push(id);
			}
			seen.add(id);
		}
		return {
			isValid: false,
			error: `Duplicate model found in Council configuration: "${duplicates[0]}". Each model can only participate once in the council debate. Remove the duplicate entry.`,
		};
	}

	// Validate model weights are positive
	for (const model of modelsToValidate) {
		if (model.weight <= 0) {
			return {
				isValid: false,
				error: `Model "${model.modelId}" has an invalid weight of ${model.weight}. Weight must be a positive number (e.g., 1.0). Higher weights give more influence in council ranking.`,
			};
		}
	}

	// Validate model references exist in registry (Requirements 9.4, 11.1, 11.2)
	if (registry && settings.models) {
		const missingModels: string[] = [];
		for (const ref of settings.models) {
			if (!registry.models[ref.modelId]) {
				missingModels.push(ref.modelId);
			}
		}

		if (missingModels.length > 0) {
			const missingList = missingModels.map(id => `"${id}"`).join(", ");
			const plural = missingModels.length > 1;
			return {
				isValid: false,
				error: `Council model${plural ? "s" : ""} ${missingList} ${plural ? "were" : "was"} not found in the Model Registry. ` +
					`${plural ? "These models have" : "This model has"} been deleted or renamed. ` +
					`Please update your Council configuration in Settings or re-add the model${plural ? "s" : ""} in Model Management.`,
			};
		}
	}

	// Validate chair model configuration using enhanced validation
	// Pass registry to also validate chair model reference
	const chairValidation = validateChairSelection(settings, registry);
	if (!chairValidation.isValid) {
		return chairValidation;
	}

	// Validate phase timeouts are positive
	const timeouts = settings.phaseTimeouts;
	const invalidTimeouts: string[] = [];
	if (timeouts.parallelQuery <= 0) invalidTimeouts.push("Parallel Query");
	if (timeouts.critique <= 0) invalidTimeouts.push("Critique");
	if (timeouts.ranking <= 0) invalidTimeouts.push("Ranking");
	if (timeouts.synthesis <= 0) invalidTimeouts.push("Synthesis");

	if (invalidTimeouts.length > 0) {
		return {
			isValid: false,
			error: `Invalid timeout value for ${invalidTimeouts.join(", ")} phase${invalidTimeouts.length > 1 ? "s" : ""}. All phase timeouts must be positive values (in milliseconds). Check your Advanced Settings.`,
		};
	}

	// Validate synthesis weight is positive
	if (settings.chairModel.synthesisWeight <= 0) {
		return {
			isValid: false,
			error: `Chair Synthesis Weight must be a positive number. Current value: ${settings.chairModel.synthesisWeight}. This weight determines how much influence the chair has in the final synthesis.`,
		};
	}

	return { isValid: true };
}

/**
 * Validate chair model configuration
 *
 * Uses CouncilModelReference for the enabled models parameter since
 * the legacy ConsensusModelConfig has been removed from CouncilSettings.
 *
 * @param chairConfig The chair model configuration to validate
 * @param enabledModels List of enabled council model references
 * @returns Object with isValid boolean and optional error message
 *
 * Requirements: 2.2, 2.3
 */
export function validateChairModelConfig(
	chairConfig: ChairModelConfig,
	enabledModels: CouncilModelReference[]
): {
	isValid: boolean;
	error?: string;
} {
	// Validate selection strategy
	const validStrategies: Array<ChairModelConfig["selectionStrategy"]> = [
		"configured",
		"highest-ranked",
		"rotating",
	];
	if (!validStrategies.includes(chairConfig.selectionStrategy)) {
		return {
			isValid: false,
			error: `Invalid Chair Selection Strategy: "${chairConfig.selectionStrategy}". ` +
				`Please choose one of: Configured (select a specific model), Highest-Ranked (automatically use top-ranked model), or Rotating (rotate through models).`,
		};
	}

	// If strategy is "configured", validate that configuredChairId is provided and exists
	if (chairConfig.selectionStrategy === "configured") {
		if (!chairConfig.configuredChairId) {
			return {
				isValid: false,
				error: "Chair Selection Strategy is set to 'Configured' but no chair model is selected. " +
					"Please select a model to act as chair, or switch to 'Highest-Ranked' or 'Rotating' strategy.",
			};
		}

		// Check if configured chair exists in enabled models
		const chairExists = enabledModels.some(m => m.modelId === chairConfig.configuredChairId);
		if (!chairExists && enabledModels.length > 0) {
			return {
				isValid: false,
				error: `The selected chair model "${chairConfig.configuredChairId}" is not in the enabled council models. ` +
					`Please enable this model in the council, select a different chair, or change the selection strategy.`,
			};
		}
	}

	return { isValid: true };
}

/**
 * Enhanced chair selection validation function
 *
 * Specifically designed for UI-level validation with comprehensive edge case handling.
 * This function validates that the chair model configuration is valid and provides
 * specific, actionable error messages for users.
 *
 * Uses the models field with model references that point to entries in the
 * central ModelRegistry. Legacy councilModels have been removed.
 *
 * When a ModelRegistry is provided, this function also validates that the
 * configuredChairId exists in the registry. This catches broken references
 * when a model is deleted from the registry but still referenced as the council chair.
 *
 * **Validation Rules:**
 * 1. If council mode is disabled, always passes validation (no chair needed)
 * 2. If strategy is "highest-ranked" or "rotating", always passes (automatic selection)
 * 3. If strategy is "configured":
 *    - Must have at least one model configured
 *    - Must have at least one enabled model
 *    - Must have configuredChairId set and non-empty
 *    - Chair model must exist in enabled models
 *    - Chair model must exist in the registry (when registry is provided)
 *
 * **Edge Cases Handled:**
 * - Empty configuredChairId string (treated as not configured)
 * - Chair model exists but is disabled (error: must enable or select different chair)
 * - Chair model deleted from council (error: chair no longer exists)
 * - Chair model deleted from registry (error: model not found in registry)
 * - No models configured at all (error: add models first)
 * - No enabled models (error: enable at least 2 models)
 *
 * **Requirements:**
 * - 2.2, 2.3: Support model references
 * - 3.2: Validate configured strategy requires non-empty configuredChairId
 * - 3.3: Validate configuredChairId exists in enabled models
 * - 3.4: Return validation result with specific error messages
 * - 3.5: Handle edge cases with clear feedback
 * - 9.4, 11.3, 11.4: Validate chair model reference exists in registry
 *
 * **Usage Example:**
 * ```typescript
 * const result = validateChairSelection(plugin.settings.councilSettings, plugin.settings.modelRegistry);
 * if (!result.isValid) {
 *   new Notice(result.error, 5000);
 *   return; // Prevent enabling council mode
 * }
 * // Validation passed, proceed with council mode
 * ```
 *
 * @param settings - The council settings to validate
 * @param registry - Optional model registry to validate chair model reference against
 * @returns Object with isValid boolean and optional error message.
 *          If isValid is false, error will contain a user-friendly message explaining the issue.
 */
export function validateChairSelection(
	settings: CouncilSettings,
	registry?: ModelRegistry
): {
	isValid: boolean;
	error?: string;
} {
	const { chairModel, models, enabled } = settings;

	// Use the models field for validation
	const allModels = models;
	const enabledModels = allModels.filter(m => m.enabled);

	// Skip validation if council mode is not enabled
	if (!enabled) {
		return { isValid: true };
	}

	// Edge case: No models configured at all
	if (allModels.length === 0) {
		return {
			isValid: false,
			error: "No council models have been added. Council mode requires at least 2 models to engage in structured debate. " +
				"Please add models in Settings → Model Management, then configure them for Council mode.",
		};
	}

	// Edge case: No enabled models
	if (enabledModels.length === 0) {
		return {
			isValid: false,
			error: `All ${allModels.length} council model${allModels.length === 1 ? " is" : "s are"} currently disabled. ` +
				"Council mode requires at least 2 enabled models for structured debate. Please enable models in your Council settings.",
		};
	}

	// For automatic strategies (highest-ranked, rotating), validation always passes
	if (chairModel.selectionStrategy !== "configured") {
		return { isValid: true };
	}

	// For "configured" strategy, validate chair selection

	// Validate configuredChairId is provided and not empty
	if (!chairModel.configuredChairId || chairModel.configuredChairId.trim() === "") {
		return {
			isValid: false,
			error: "Chair Selection Strategy is set to 'Configured' but no chair model has been selected. " +
				"The chair moderates the council debate and synthesizes the final result. Please select a model as chair, or switch to 'Highest-Ranked' (automatic) or 'Rotating' strategy.",
		};
	}

	// Validate chair model exists in registry (Requirements 9.4, 11.3, 11.4)
	if (registry) {
		if (!registry.models[chairModel.configuredChairId]) {
			return {
				isValid: false,
				error: `The configured chair model "${chairModel.configuredChairId}" was not found in the Model Registry. ` +
					"This model may have been deleted. Please select a different chair model or re-add the model in Settings → Model Management.",
			};
		}
	}

	// Edge case: Check if configured chair exists in enabled models
	const chairExists = enabledModels.some(m => m.modelId === chairModel.configuredChairId);

	if (!chairExists) {
		// Check if chair exists but is disabled
		const chairExistsButDisabled = allModels.some(
			m => m.modelId === chairModel.configuredChairId && !m.enabled
		);

		if (chairExistsButDisabled) {
			return {
				isValid: false,
				error: `The selected chair model "${chairModel.configuredChairId}" is currently disabled in the council. ` +
					"The chair must be an enabled council member. Please enable this model, select a different chair, or change the selection strategy to 'Highest-Ranked' or 'Rotating'.",
			};
		}

		// Chair was deleted or never existed
		return {
			isValid: false,
			error: `The selected chair model "${chairModel.configuredChairId}" is not part of the enabled council models. ` +
				"The chair must be one of the enabled council members. Please add this model to the council, select a different chair, or use an automatic selection strategy.",
		};
	}

	return { isValid: true };
}

/**
 * Calculate estimated cost impact of council mode
 *
 * @param numModels Number of enabled council models
 * @param enableCritique Whether critique phase is enabled
 * @param enableRanking Whether ranking phase is enabled
 * @returns Estimated cost multiplier (e.g., 5.0 means 5x normal cost)
 */
export function estimateCouncilCostImpact(
	numModels: number,
	enableCritique: boolean,
	enableRanking: boolean
): number {
	if (numModels === 0) return 0;

	// Phase 1: Initial generation - 1 call per model
	const initialCalls = numModels;

	// Phase 2: Critique - each model critiques all other responses (if enabled)
	// Each model makes 1 critique call that evaluates (numModels - 1) responses
	const critiqueCalls = enableCritique ? numModels : 0;

	// Phase 3: Ranking - each model ranks all responses (if enabled)
	// Similar to critique, each model makes 1 ranking call
	const rankingCalls = enableRanking ? numModels : 0;

	// Phase 4: Synthesis - 1 call from chair model
	const synthesisCalls = 1;

	return initialCalls + critiqueCalls + rankingCalls + synthesisCalls;
}

/**
 * Calculate estimated time impact of council mode
 * Accounts for parallel execution where applicable
 *
 * @param numModels Number of enabled council models
 * @param enableCritique Whether critique phase is enabled
 * @param enableRanking Whether ranking phase is enabled
 * @returns Estimated time multiplier (e.g., 3.0 means 3x normal time)
 */
export function estimateCouncilTimeImpact(
	numModels: number,
	enableCritique: boolean,
	enableRanking: boolean
): number {
	if (numModels === 0) return 0;

	// Phase 1: Initial generation - parallel, so ~1x time (not numModels x)
	const initialTime = 1.2; // Slight overhead for coordination

	// Phase 2: Critique - parallel, each model critiques simultaneously
	const critiqueTime = enableCritique ? 1.5 : 0;

	// Phase 3: Ranking - parallel, each model ranks simultaneously
	const rankingTime = enableRanking ? 1.0 : 0;

	// Phase 4: Synthesis - sequential, single chair model call
	const synthesisTime = 1.5;

	return initialTime + critiqueTime + rankingTime + synthesisTime;
}

/**
 * Constants for council settings UI
 */
export const COUNCIL_CONSTANTS = {
	/** Minimum required models */
	MIN_MODELS: 2,
	/** Maximum recommended models (for performance) */
	MAX_RECOMMENDED_MODELS: 5,
	/** Minimum phase timeout (ms) */
	MIN_TIMEOUT: 10000, // 10 seconds
	/** Maximum phase timeout (ms) */
	MAX_TIMEOUT: 300000, // 5 minutes
	/** Default timeout step (ms) */
	TIMEOUT_STEP: 5000, // 5 seconds
	/** Minimum synthesis weight */
	MIN_SYNTHESIS_WEIGHT: 0.1,
	/** Maximum synthesis weight */
	MAX_SYNTHESIS_WEIGHT: 3.0,
} as const;

/**
 * Warning messages for council configuration
 */
export const COUNCIL_WARNINGS = {
	HIGH_COST: "Council mode will significantly increase API costs. Estimated: {multiplier}x normal cost.",
	HIGH_TIME: "Council mode will increase generation time. Estimated: {multiplier}x normal time.",
	MANY_MODELS: "Using more than 5 models may significantly impact performance and cost without proportional quality gains.",
	VERY_HIGH_TIMEOUT: "Very high timeouts may result in long wait times. Consider using more reasonable timeout values.",
	NO_CRITIQUE_OR_RANKING: "Disabling both critique and ranking phases reduces the benefits of council mode significantly.",
	CONFIGURED_CHAIR_NOT_IN_MODELS: "The configured chair model is not in the list of enabled council models. Please add it or select a different chair selection strategy.",
	INSUFFICIENT_MODELS: "At least 2 models must be enabled to use council mode.",
	DATA_PRIVACY: "Enabling council mode with multiple providers will send your content to multiple AI services. Consider privacy implications.",
} as const;

/**
 * Help text for council settings
 */
export const COUNCIL_HELP_TEXT = {
	COUNCIL_MODE: "Council mode orchestrates multiple AI models in a structured debate process to improve quiz quality through collaborative reasoning.",
	CHAIR_SELECTION_STRATEGIES: {
		configured: "Use a specific model that you designate as the chair. This model will synthesize the final quiz.",
		"highest-ranked": "Automatically use the model that receives the highest ranking from peer evaluations as the chair.",
		rotating: "Rotate the chair role among all council models in round-robin fashion.",
	},
	CRITIQUE_PHASE: "Models anonymously evaluate each other's quiz outputs, identifying strengths, weaknesses, and errors.",
	RANKING_PHASE: "Models rank all quiz outputs from best to worst using Borda count aggregation for consensus.",
	SYNTHESIS_PHASE: "The chair model reviews all responses, critiques, and rankings to synthesize the best elements into a final quiz.",
	DEBATE_TRAIL: "Shows the complete debate process including all responses, critiques, rankings, and synthesis reasoning.",
	CACHING: "Caches council results to avoid redundant API calls for identical content, saving time and costs.",
} as const;
