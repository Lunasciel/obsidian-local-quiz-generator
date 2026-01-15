import { ConsensusSettings, ConsensusModelConfig } from "../../consensus/types";
import { ConsensusModelReference, ModelRegistry, ProviderConfig, OpenAIProviderConfig, OllamaProviderConfig } from "../modelRegistry/types";
import { Provider } from "../../generators/providers";
import { QuizSettings } from "../config";

/**
 * Default consensus configuration values
 * Based on requirements 5.1-5.6 from the multi-model consensus spec
 *
 * Requirements: 2.1, 2.3
 */
export const DEFAULT_CONSENSUS_SETTINGS: ConsensusSettings = {
	// Consensus mode is disabled by default (Requirement 5.1)
	enabled: false,

	// Model references for registry-based architecture (Requirements 2.1, 2.3)
	// Initially empty - user must configure models via the Model Registry
	models: [],

	// Minimum 2 models required for consensus (Requirement 5.2)
	minModelsRequired: 2,

	// 66% agreement threshold (Requirement 5.3)
	consensusThreshold: 0.66,

	// Maximum 3 consensus iterations (Requirement 5.4)
	maxIterations: 3,

	// Source validation enabled by default for better accuracy (Requirement 3.1)
	enableSourceValidation: true,

	// Caching enabled to improve performance (Requirement 7.4)
	enableCaching: true,

	// Show audit trail by default for transparency (Requirement 6.1)
	showAuditTrail: true,

	// Fallback to single model if consensus fails (Requirement 8.5)
	fallbackToSingleModel: true,

	// Privacy preferences - require acknowledgment on first use (Requirement 5.1)
	privacyPreferences: {
		privacyWarningAcknowledged: false,
		localOnlyMode: false,
		approvedProviders: [],
	},
};

/**
 * Create a default consensus model configuration.
 *
 * Now uses ProviderConfig for provider-specific settings and
 * QuizSettings for generation configuration (question types, language).
 *
 * Requirements: 6.2 (simplified settings mapping)
 *
 * @param id Unique identifier for the model
 * @param provider Provider type (OpenAI, Ollama)
 * @param quizSettings Base quiz settings for generation configuration
 * @returns ConsensusModelConfig with default values
 */
export function createDefaultConsensusModelConfig(
	id: string,
	provider: Provider,
	quizSettings: QuizSettings
): ConsensusModelConfig {
	// Create provider config based on provider type
	let providerConfig: ProviderConfig;

	if (provider === Provider.OPENAI) {
		providerConfig = {
			provider: Provider.OPENAI,
			apiKey: quizSettings.openAIApiKey || "",
			baseUrl: quizSettings.openAIBaseURL || "https://api.openai.com/v1",
			textGenerationModel: quizSettings.openAITextGenModel || "gpt-4",
			embeddingModel: quizSettings.openAIEmbeddingModel || "",
		} as OpenAIProviderConfig;
	} else {
		providerConfig = {
			provider: Provider.OLLAMA,
			baseUrl: quizSettings.ollamaBaseURL || "http://localhost:11434",
			textGenerationModel: quizSettings.ollamaTextGenModel || "",
			embeddingModel: quizSettings.ollamaEmbeddingModel || "",
		} as OllamaProviderConfig;
	}

	return {
		id,
		provider,
		providerConfig,
		quizSettings,
		weight: 1.0, // Equal weight by default
		enabled: true,
	};
}

/**
 * Create a default consensus model reference for the new registry-based architecture.
 *
 * This creates a reference to a model in the central ModelRegistry,
 * rather than storing the full model configuration inline.
 *
 * Requirements: 1.2, 2.1
 *
 * @param modelId Reference to a model ID in the ModelRegistry
 * @param weight Weight for this model in consensus voting (default: 1.0)
 * @param enabled Whether this model is enabled for consensus (default: true)
 * @returns ConsensusModelReference with the specified or default values
 */
export function createDefaultConsensusModelReference(
	modelId: string,
	weight: number = 1.0,
	enabled: boolean = true
): ConsensusModelReference {
	return {
		modelId,
		weight,
		enabled,
	};
}

/**
 * Validate consensus settings
 * Ensures all required constraints are met
 *
 * Uses the models field which contains references to the central ModelRegistry.
 * When a ModelRegistry is provided, this function also validates that all
 * model references (modelId) actually exist in the registry. This is critical
 * for catching broken references that may occur when models are deleted
 * from the registry but still referenced in consensus settings.
 *
 * Requirements: 2.1, 2.3, 9.3, 11.1, 11.2, 11.3, 11.4
 *
 * @param settings The consensus settings to validate
 * @param registry Optional model registry to validate model references against
 * @returns Object with isValid boolean and optional error message
 */
export function validateConsensusSettings(
	settings: ConsensusSettings,
	registry?: ModelRegistry
): {
	isValid: boolean;
	error?: string;
} {
	// Use the models field for validation
	const modelsToValidate = settings.models;

	// Check minimum models requirement (Requirement 5.5)
	const enabledModels = modelsToValidate.filter(m => m.enabled);
	if (settings.enabled && enabledModels.length < settings.minModelsRequired) {
		const difference = settings.minModelsRequired - enabledModels.length;
		return {
			isValid: false,
			error: `Consensus mode requires at least ${settings.minModelsRequired} enabled models, but only ${enabledModels.length} ${enabledModels.length === 1 ? "is" : "are"} enabled. ` +
				`Please enable ${difference} more model${difference === 1 ? "" : "s"} or add new models in Settings → Model Management.`,
		};
	}

	// Validate threshold is between 0 and 1
	if (settings.consensusThreshold < 0 || settings.consensusThreshold > 1) {
		return {
			isValid: false,
			error: `Consensus Threshold value (${(settings.consensusThreshold * 100).toFixed(0)}%) is out of range. Please enter a value between 0% and 100% (0.0 to 1.0).`,
		};
	}

	// Validate threshold is achievable with available models
	// Allow threshold of 0 (no consensus requirement) but warn if it's lower than what's achievable
	if (enabledModels.length > 0) {
		const minPossibleAgreement = 1.0 / enabledModels.length;
		if (settings.enabled && settings.consensusThreshold > 0 && settings.consensusThreshold < minPossibleAgreement) {
			return {
				isValid: false,
				error: `Consensus Threshold (${(settings.consensusThreshold * 100).toFixed(0)}%) is below the minimum achievable with ${enabledModels.length} models. ` +
					`With ${enabledModels.length} models, the minimum threshold is ${(minPossibleAgreement * 100).toFixed(1)}% (at least one model must agree). ` +
					`Increase the threshold or add more models.`,
			};
		}
	}

	// Validate max iterations is positive
	if (settings.maxIterations < 1) {
		return {
			isValid: false,
			error: `Maximum Iterations must be at least 1. Current value: ${settings.maxIterations}. This setting controls how many rounds of consensus-building are attempted.`,
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
			error: `Duplicate model found in Consensus configuration: "${duplicates[0]}". Each model can only be added once. Remove the duplicate entry.`,
		};
	}

	// Validate model weights are positive
	for (const model of modelsToValidate) {
		if (model.weight <= 0) {
			return {
				isValid: false,
				error: `Model "${model.modelId}" has an invalid weight of ${model.weight}. Weight must be a positive number (e.g., 1.0). Higher weights give more influence in consensus voting.`,
			};
		}
	}

	// Validate model references exist in registry (Requirements 9.3, 11.1, 11.2)
	if (registry && settings.models.length > 0) {
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
				error: `Consensus model${plural ? "s" : ""} ${missingList} ${plural ? "were" : "was"} not found in the Model Registry. ` +
					`${plural ? "These models have" : "This model has"} been deleted or renamed. ` +
					`Please update your Consensus configuration in Settings or re-add the model${plural ? "s" : ""} in Model Management.`,
			};
		}
	}

	return { isValid: true };
}

/**
 * Calculate estimated cost impact of consensus mode
 *
 * @param numModels Number of enabled consensus models
 * @param maxIterations Maximum consensus iterations
 * @returns Estimated cost multiplier (e.g., 3.5 means 3.5x normal cost)
 */
export function estimateCostImpact(numModels: number, maxIterations: number): number {
	// Initial generation: 1 call per model
	const initialCalls = numModels;

	// Consensus rounds: assume average of 50% of max iterations
	// and 50% of questions need re-evaluation
	const avgConsensusRounds = maxIterations * 0.5;
	const avgQuestionsNeedingConsensus = 0.5;
	const consensusCalls = numModels * avgConsensusRounds * avgQuestionsNeedingConsensus;

	return initialCalls + consensusCalls;
}

/**
 * Calculate estimated time impact of consensus mode
 * Accounts for parallel execution
 *
 * @param numModels Number of enabled consensus models
 * @param maxIterations Maximum consensus iterations
 * @returns Estimated time multiplier (e.g., 1.5 means 1.5x normal time)
 */
export function estimateTimeImpact(numModels: number, maxIterations: number): number {
	// Initial generation: parallel, so ~1x time (not numModels x)
	const initialTime = 1.2; // Slight overhead for coordination

	// Consensus rounds: sequential, assume average of 50% of max iterations
	const avgConsensusRounds = maxIterations * 0.5;
	const avgQuestionsNeedingConsensus = 0.5;
	const consensusTime = 1.0 * avgConsensusRounds * avgQuestionsNeedingConsensus;

	return initialTime + consensusTime;
}

/**
 * Constants for consensus settings UI
 */
export const CONSENSUS_CONSTANTS = {
	/** Minimum allowed consensus threshold percentage */
	MIN_THRESHOLD_PERCENT: 50,
	/** Maximum allowed consensus threshold percentage */
	MAX_THRESHOLD_PERCENT: 100,
	/** Minimum allowed max iterations */
	MIN_ITERATIONS: 1,
	/** Maximum allowed max iterations */
	MAX_ITERATIONS: 10,
	/** Minimum required models */
	MIN_MODELS: 2,
	/** Maximum recommended models (for performance) */
	MAX_RECOMMENDED_MODELS: 5,
} as const;

/**
 * Warning messages for consensus configuration
 */
export const CONSENSUS_WARNINGS = {
	HIGH_COST: "Consensus mode will significantly increase API costs. Estimated: {multiplier}x normal cost.",
	HIGH_TIME: "Consensus mode will increase generation time. Estimated: {multiplier}x normal time.",
	MANY_MODELS: "Using more than 5 models may significantly impact performance without proportional accuracy gains.",
	HIGH_THRESHOLD: "A consensus threshold above 80% may be difficult to achieve and could frequently fail to reach consensus.",
	MANY_ITERATIONS: "More than 5 iterations may indicate configuration issues. Consider adjusting the consensus threshold.",
	DATA_PRIVACY: "Enabling consensus with multiple providers will send your content to multiple AI services. Consider privacy implications.",
	LOCAL_ONLY_RECOMMENDED: "For sensitive content, consider using only local models (Ollama) in consensus mode.",
} as const;
