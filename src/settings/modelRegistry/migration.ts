/**
 * Settings Migration Module
 *
 * Provides detection and migration utilities for upgrading from the old
 * duplicated settings structure to the new centralized model registry system.
 *
 * The old structure had:
 * - Main model settings stored directly on QuizSettings (provider, openAIApiKey, etc.)
 * - Consensus models stored as ConsensusModelConfig[] with embedded full settings
 * - Council models stored as ConsensusModelConfig[] with embedded full settings
 *
 * The new structure has:
 * - Central ModelRegistry with all models stored once
 * - References (modelId, weight, enabled) in consensus/council instead of full configs
 * - activeModelId for main model selection
 *
 * Requirements: 6.2, 6.3
 */

import { Provider } from "../../generators/providers";
import { ConsensusModelConfig } from "../../consensus/types";
import { QuizSettings } from "../config";
import {
	ModelRegistry,
	ModelConfiguration,
	ProviderConfig,
	OpenAIProviderConfig,
	OllamaProviderConfig,
	ConsensusModelReference,
	CouncilModelReference,
	isModelRegistry,
	isConsensusModelReference,
	isCouncilModelReference,
} from "./types";

/**
 * Legacy ConsensusModelConfig structure from before the registry migration.
 * This type is only used for migration purposes - new code should use
 * ConsensusModelConfig from consensus/types which uses providerConfig.
 */
interface LegacyConsensusModelConfig {
	id: string;
	provider: Provider;
	/** Legacy embedded settings - contains full QuizSettings-like object */
	settings: Record<string, unknown>;
	weight: number;
	enabled: boolean;
}

/**
 * Reasons why migration might be needed.
 * Used for detailed logging and debugging.
 */
export enum MigrationReason {
	/** No modelRegistry field present */
	MISSING_MODEL_REGISTRY = "missing_model_registry",

	/** modelRegistry exists but is invalid/malformed */
	INVALID_MODEL_REGISTRY = "invalid_model_registry",

	/** Old provider field exists indicating legacy main model config */
	HAS_LEGACY_MAIN_MODEL = "has_legacy_main_model",

	/** Consensus models have embedded settings (old format) */
	HAS_LEGACY_CONSENSUS_MODELS = "has_legacy_consensus_models",

	/** Council models have embedded settings (old format) */
	HAS_LEGACY_COUNCIL_MODELS = "has_legacy_council_models",

	/** Consensus settings exist but no model references */
	CONSENSUS_MISSING_MODEL_REFERENCES = "consensus_missing_model_references",

	/** Council settings exist but no model references */
	COUNCIL_MISSING_MODEL_REFERENCES = "council_missing_model_references",
}

/**
 * Result of migration detection check.
 */
export interface MigrationDetectionResult {
	/** Whether migration is needed */
	needsMigration: boolean;

	/** Reasons why migration is needed (empty if not needed) */
	reasons: MigrationReason[];

	/** Detailed messages for logging */
	details: string[];
}

/**
 * Detects if the settings need to be migrated to the new structure.
 *
 * Migration is needed when:
 * 1. No modelRegistry exists (or it's invalid)
 * 2. Old provider field exists with main model config
 * 3. Consensus models have embedded settings object (legacy format)
 * 4. Council models have embedded settings object (legacy format)
 *
 * @param settings - The settings object to check
 * @returns true if migration is needed, false otherwise
 *
 * Requirements: 6.2, 6.3
 */
export function needsMigration(settings: unknown): boolean {
	const result = detectMigrationNeeds(settings);
	return result.needsMigration;
}

/**
 * Performs detailed migration detection with reasons.
 *
 * This function provides comprehensive information about why migration
 * is needed, useful for logging, debugging, and UI feedback.
 *
 * @param settings - The settings object to check
 * @returns Detailed migration detection result
 *
 * Requirements: 6.2, 6.3
 */
export function detectMigrationNeeds(settings: unknown): MigrationDetectionResult {
	const reasons: MigrationReason[] = [];
	const details: string[] = [];

	// Guard against null/undefined/non-object
	if (settings === null || settings === undefined || typeof settings !== "object") {
		reasons.push(MigrationReason.MISSING_MODEL_REGISTRY);
		details.push("Settings is null, undefined, or not an object");
		return { needsMigration: true, reasons, details };
	}

	const settingsObj = settings as Record<string, unknown>;

	// Check 1: Model Registry exists and is valid
	const registryCheck = checkModelRegistry(settingsObj);
	if (registryCheck.needsMigration) {
		reasons.push(...registryCheck.reasons);
		details.push(...registryCheck.details);
	}

	// Check 2: Legacy main model configuration
	const mainModelCheck = checkLegacyMainModel(settingsObj);
	if (mainModelCheck.needsMigration) {
		reasons.push(...mainModelCheck.reasons);
		details.push(...mainModelCheck.details);
	}

	// Check 3: Legacy consensus models
	const consensusCheck = checkLegacyConsensusModels(settingsObj);
	if (consensusCheck.needsMigration) {
		reasons.push(...consensusCheck.reasons);
		details.push(...consensusCheck.details);
	}

	// Check 4: Legacy council models
	const councilCheck = checkLegacyCouncilModels(settingsObj);
	if (councilCheck.needsMigration) {
		reasons.push(...councilCheck.reasons);
		details.push(...councilCheck.details);
	}

	return {
		needsMigration: reasons.length > 0,
		reasons,
		details,
	};
}

/**
 * Check if modelRegistry exists and is valid.
 */
function checkModelRegistry(settings: Record<string, unknown>): MigrationDetectionResult {
	const reasons: MigrationReason[] = [];
	const details: string[] = [];

	// Check if modelRegistry field exists
	if (!("modelRegistry" in settings) || settings.modelRegistry === undefined) {
		reasons.push(MigrationReason.MISSING_MODEL_REGISTRY);
		details.push("No modelRegistry field found in settings");
		return { needsMigration: true, reasons, details };
	}

	// Check if modelRegistry is null
	if (settings.modelRegistry === null) {
		reasons.push(MigrationReason.INVALID_MODEL_REGISTRY);
		details.push("modelRegistry is null");
		return { needsMigration: true, reasons, details };
	}

	// Check if modelRegistry is valid using type guard
	if (!isModelRegistry(settings.modelRegistry)) {
		reasons.push(MigrationReason.INVALID_MODEL_REGISTRY);
		details.push("modelRegistry exists but is not a valid ModelRegistry structure");
		return { needsMigration: true, reasons, details };
	}

	return { needsMigration: false, reasons, details };
}

/**
 * Check if legacy main model configuration exists.
 *
 * Old format had provider, openAIApiKey, openAIBaseURL, etc. at the root level.
 * This is only a migration trigger if we also don't have a valid activeModelId
 * in the new registry system.
 */
function checkLegacyMainModel(settings: Record<string, unknown>): MigrationDetectionResult {
	const reasons: MigrationReason[] = [];
	const details: string[] = [];

	// Check for old provider field (indicates legacy config)
	const hasLegacyProvider =
		"provider" in settings &&
		settings.provider !== undefined &&
		settings.provider !== null &&
		typeof settings.provider === "string" &&
		(settings.provider === Provider.OPENAI || settings.provider === Provider.OLLAMA);

	// Check for legacy OpenAI config fields
	const hasLegacyOpenAIConfig =
		("openAIApiKey" in settings && typeof settings.openAIApiKey === "string" && settings.openAIApiKey !== "") ||
		("openAITextGenModel" in settings && typeof settings.openAITextGenModel === "string" && settings.openAITextGenModel !== "");

	// Check for legacy Ollama config fields
	const hasLegacyOllamaConfig =
		"ollamaTextGenModel" in settings &&
		typeof settings.ollamaTextGenModel === "string" &&
		settings.ollamaTextGenModel !== "";

	// Check if we have a valid modelRegistry with activeModelId
	const hasNewMainModelConfig =
		"modelRegistry" in settings &&
		isModelRegistry(settings.modelRegistry) &&
		"activeModelId" in settings &&
		(settings.activeModelId === null || typeof settings.activeModelId === "string");

	// If we have legacy config but no new config, migration is needed
	if (hasLegacyProvider && !hasNewMainModelConfig) {
		reasons.push(MigrationReason.HAS_LEGACY_MAIN_MODEL);
		details.push(`Legacy main model config found: provider=${settings.provider}`);
	}

	// Additional check: if we have credentials in old format but no registry
	if ((hasLegacyOpenAIConfig || hasLegacyOllamaConfig) && !hasNewMainModelConfig) {
		if (!reasons.includes(MigrationReason.HAS_LEGACY_MAIN_MODEL)) {
			reasons.push(MigrationReason.HAS_LEGACY_MAIN_MODEL);
		}
		details.push("Legacy model credentials found without new registry structure");
	}

	return { needsMigration: reasons.length > 0, reasons, details };
}

/**
 * Check if consensus settings contain legacy model format.
 *
 * Old format: consensusModels[].settings is a full QuizSettings object
 * New format: models[].modelId is a string reference
 */
function checkLegacyConsensusModels(settings: Record<string, unknown>): MigrationDetectionResult {
	const reasons: MigrationReason[] = [];
	const details: string[] = [];

	// Check if consensusSettings exists
	if (!("consensusSettings" in settings) || settings.consensusSettings === null || typeof settings.consensusSettings !== "object") {
		return { needsMigration: false, reasons, details };
	}

	const consensusSettings = settings.consensusSettings as Record<string, unknown>;

	// Check for legacy consensusModels with embedded settings
	if ("consensusModels" in consensusSettings && Array.isArray(consensusSettings.consensusModels)) {
		const legacyModels = consensusSettings.consensusModels as unknown[];

		// Check if any model has the old embedded settings format
		const hasLegacyFormat = legacyModels.some((model) => {
			if (model === null || typeof model !== "object") {
				return false;
			}
			const modelObj = model as Record<string, unknown>;

			// Old format has 'settings' property with full config
			return (
				"settings" in modelObj &&
				modelObj.settings !== null &&
				typeof modelObj.settings === "object"
			);
		});

		if (hasLegacyFormat && legacyModels.length > 0) {
			reasons.push(MigrationReason.HAS_LEGACY_CONSENSUS_MODELS);
			details.push(`Found ${legacyModels.length} consensus models with embedded settings (legacy format)`);
		}
	}

	// Check if new models field is missing when consensusModels exist
	const hasLegacyModels =
		"consensusModels" in consensusSettings &&
		Array.isArray(consensusSettings.consensusModels) &&
		consensusSettings.consensusModels.length > 0;

	const hasNewModels =
		"models" in consensusSettings &&
		Array.isArray(consensusSettings.models) &&
		consensusSettings.models.length > 0 &&
		consensusSettings.models.every((m: unknown) => isConsensusModelReference(m));

	if (hasLegacyModels && !hasNewModels) {
		if (!reasons.includes(MigrationReason.HAS_LEGACY_CONSENSUS_MODELS)) {
			reasons.push(MigrationReason.CONSENSUS_MISSING_MODEL_REFERENCES);
		}
		details.push("Consensus has legacy models but no new model references");
	}

	return { needsMigration: reasons.length > 0, reasons, details };
}

/**
 * Check if council settings contain legacy model format.
 *
 * Old format: councilModels[].settings is a full QuizSettings object
 * New format: models[].modelId is a string reference
 */
function checkLegacyCouncilModels(settings: Record<string, unknown>): MigrationDetectionResult {
	const reasons: MigrationReason[] = [];
	const details: string[] = [];

	// Check if councilSettings exists
	if (!("councilSettings" in settings) || settings.councilSettings === null || typeof settings.councilSettings !== "object") {
		return { needsMigration: false, reasons, details };
	}

	const councilSettings = settings.councilSettings as Record<string, unknown>;

	// Check for legacy councilModels with embedded settings
	if ("councilModels" in councilSettings && Array.isArray(councilSettings.councilModels)) {
		const legacyModels = councilSettings.councilModels as unknown[];

		// Check if any model has the old embedded settings format
		const hasLegacyFormat = legacyModels.some((model) => {
			if (model === null || typeof model !== "object") {
				return false;
			}
			const modelObj = model as Record<string, unknown>;

			// Old format has 'settings' property with full config
			return (
				"settings" in modelObj &&
				modelObj.settings !== null &&
				typeof modelObj.settings === "object"
			);
		});

		if (hasLegacyFormat && legacyModels.length > 0) {
			reasons.push(MigrationReason.HAS_LEGACY_COUNCIL_MODELS);
			details.push(`Found ${legacyModels.length} council models with embedded settings (legacy format)`);
		}
	}

	// Check if new models field is missing when councilModels exist
	const hasLegacyModels =
		"councilModels" in councilSettings &&
		Array.isArray(councilSettings.councilModels) &&
		councilSettings.councilModels.length > 0;

	const hasNewModels =
		"models" in councilSettings &&
		Array.isArray(councilSettings.models) &&
		councilSettings.models.length > 0 &&
		councilSettings.models.every((m: unknown) => isCouncilModelReference(m));

	if (hasLegacyModels && !hasNewModels) {
		if (!reasons.includes(MigrationReason.HAS_LEGACY_COUNCIL_MODELS)) {
			reasons.push(MigrationReason.COUNCIL_MISSING_MODEL_REFERENCES);
		}
		details.push("Council has legacy models but no new model references");
	}

	return { needsMigration: reasons.length > 0, reasons, details };
}

/**
 * Result of main model extraction.
 * Includes the extracted model configuration and any warnings/errors.
 */
export interface MainModelExtractionResult {
	/** The extracted model configuration, or null if extraction failed */
	model: ModelConfiguration | null;

	/** Whether extraction was successful */
	success: boolean;

	/** Warning messages (e.g., missing embedding model) */
	warnings: string[];

	/** Error messages if extraction failed */
	errors: string[];
}

/**
 * Extracts the main model configuration from legacy settings.
 *
 * This function reads the old provider-specific settings (openAIApiKey, openAIBaseURL,
 * openAITextGenModel, etc.) from the root of settings and creates a new
 * ModelConfiguration object that can be added to the central registry.
 *
 * The generated display name follows the format "Main {ProviderName}".
 *
 * @param settings - The legacy settings object containing old provider fields
 * @returns Extraction result with model configuration and any warnings/errors
 *
 * Requirements: 6.2, 6.3, 6.4
 */
export function extractMainModel(settings: unknown): MainModelExtractionResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Validate input
	if (settings === null || settings === undefined || typeof settings !== "object") {
		return {
			model: null,
			success: false,
			warnings: [],
			errors: ["Settings is null, undefined, or not an object"],
		};
	}

	const settingsObj = settings as Record<string, unknown>;

	// Check if provider field exists
	if (!("provider" in settingsObj) || settingsObj.provider === undefined || settingsObj.provider === null) {
		return {
			model: null,
			success: false,
			warnings: [],
			errors: ["No provider field found in settings - cannot extract main model"],
		};
	}

	const provider = settingsObj.provider as string;

	// Validate provider is known
	if (provider !== Provider.OPENAI && provider !== Provider.OLLAMA) {
		return {
			model: null,
			success: false,
			warnings: [],
			errors: [`Unknown provider: ${provider}`],
		};
	}

	// Extract provider-specific configuration
	const providerConfig = extractProviderConfig(settingsObj, provider as Provider);
	if (!providerConfig.success || !providerConfig.config) {
		return {
			model: null,
			success: false,
			warnings: providerConfig.warnings,
			errors: providerConfig.errors,
		};
	}

	// Check for missing embedding model (warning, not error)
	if (!providerConfig.config.embeddingModel) {
		warnings.push("Embedding model not configured - short/long answer evaluation may not work correctly");
	}

	// Generate meaningful display name with hostname for custom endpoints
	const displayName = generateMigrationDisplayName(
		provider as Provider,
		providerConfig.config.baseUrl,
		{ source: "main" }
	);

	// Generate unique model ID
	const modelId = generateMigrationModelId("main");

	// Create the model configuration
	// Migrated models use auto-generated display names based on provider and model
	const now = Date.now();
	const model: ModelConfiguration = {
		id: modelId,
		displayName,
		isAutoGeneratedName: true,
		providerConfig: providerConfig.config,
		createdAt: now,
		modifiedAt: now,
	};

	return {
		model,
		success: true,
		warnings: [...warnings, ...providerConfig.warnings],
		errors: [],
	};
}

/**
 * Result of provider config extraction.
 */
interface ProviderConfigExtractionResult {
	/** The extracted provider configuration, or null if extraction failed */
	config: ProviderConfig | null;

	/** Whether extraction was successful */
	success: boolean;

	/** Warning messages */
	warnings: string[];

	/** Error messages */
	errors: string[];
}

/**
 * Extracts provider-specific configuration from legacy settings.
 *
 * For OpenAI: extracts apiKey, baseUrl, textGenerationModel, embeddingModel
 * For Ollama: extracts baseUrl, textGenerationModel, embeddingModel
 *
 * @param settings - The legacy settings object
 * @param provider - The provider type to extract config for
 * @returns Extraction result with provider config
 */
function extractProviderConfig(
	settings: Record<string, unknown>,
	provider: Provider
): ProviderConfigExtractionResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	if (provider === Provider.OPENAI) {
		return extractOpenAIProviderConfig(settings);
	} else if (provider === Provider.OLLAMA) {
		return extractOllamaProviderConfig(settings);
	}

	return {
		config: null,
		success: false,
		warnings: [],
		errors: [`Unsupported provider: ${provider}`],
	};
}

/**
 * Extracts OpenAI provider configuration from legacy settings.
 *
 * Expected legacy fields:
 * - openAIApiKey: string (required)
 * - openAIBaseURL: string (optional, defaults to OpenAI API)
 * - openAITextGenModel: string (required)
 * - openAIEmbeddingModel: string (optional)
 */
function extractOpenAIProviderConfig(
	settings: Record<string, unknown>
): ProviderConfigExtractionResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Extract API key (required for OpenAI)
	const apiKey = extractStringField(settings, "openAIApiKey", "");
	if (!apiKey) {
		errors.push("OpenAI API key not found in settings");
	}

	// Extract base URL (optional, with default)
	const baseUrl = extractStringField(settings, "openAIBaseURL", DEFAULT_OPENAI_BASE_URL);

	// Extract text generation model (required)
	const textGenerationModel = extractStringField(settings, "openAITextGenModel", "");
	if (!textGenerationModel) {
		errors.push("OpenAI text generation model not found in settings");
	}

	// Extract embedding model (optional)
	const embeddingModel = extractStringField(settings, "openAIEmbeddingModel", "");
	if (!embeddingModel) {
		warnings.push("OpenAI embedding model not configured");
	}

	// If there are critical errors, return failure
	if (errors.length > 0) {
		return {
			config: null,
			success: false,
			warnings,
			errors,
		};
	}

	const config: OpenAIProviderConfig = {
		provider: Provider.OPENAI,
		apiKey,
		baseUrl,
		textGenerationModel,
		embeddingModel,
	};

	return {
		config,
		success: true,
		warnings,
		errors: [],
	};
}

/**
 * Extracts Ollama provider configuration from legacy settings.
 *
 * Expected legacy fields:
 * - ollamaBaseURL: string (optional, defaults to localhost)
 * - ollamaTextGenModel: string (required)
 * - ollamaEmbeddingModel: string (optional)
 */
function extractOllamaProviderConfig(
	settings: Record<string, unknown>
): ProviderConfigExtractionResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Extract base URL (optional, with default)
	const baseUrl = extractStringField(settings, "ollamaBaseURL", DEFAULT_OLLAMA_BASE_URL);

	// Extract text generation model (required)
	const textGenerationModel = extractStringField(settings, "ollamaTextGenModel", "");
	if (!textGenerationModel) {
		errors.push("Ollama text generation model not found in settings");
	}

	// Extract embedding model (optional)
	const embeddingModel = extractStringField(settings, "ollamaEmbeddingModel", "");
	if (!embeddingModel) {
		warnings.push("Ollama embedding model not configured");
	}

	// If there are critical errors, return failure
	if (errors.length > 0) {
		return {
			config: null,
			success: false,
			warnings,
			errors,
		};
	}

	const config: OllamaProviderConfig = {
		provider: Provider.OLLAMA,
		baseUrl,
		textGenerationModel,
		embeddingModel,
	};

	return {
		config,
		success: true,
		warnings,
		errors: [],
	};
}

/**
 * Safely extracts a string field from settings object.
 *
 * @param settings - The settings object
 * @param fieldName - The field name to extract
 * @param defaultValue - Default value if field is missing or not a string
 * @returns The string value or default
 */
function extractStringField(
	settings: Record<string, unknown>,
	fieldName: string,
	defaultValue: string
): string {
	if (fieldName in settings && typeof settings[fieldName] === "string") {
		return settings[fieldName] as string;
	}
	return defaultValue;
}

/**
 * Generates a unique model ID for migration purposes.
 *
 * Format: {source}_{timestamp}_{random4chars}
 * Examples: main_1700000000000_abc1, consensus_1700000000000_xyz2
 *
 * @param source - The source context (main, consensus, council)
 * @returns A unique model ID
 */
export function generateMigrationModelId(source: string): string {
	const timestamp = Date.now();
	const randomSuffix = Math.random().toString(36).substring(2, 6);
	return `${source}_${timestamp}_${randomSuffix}`;
}

// Default values for provider configuration
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

/**
 * Type guard to check if an object is a legacy ConsensusModelConfig
 * with embedded settings.
 */
export function isLegacyConsensusModelConfig(obj: unknown): obj is LegacyConsensusModelConfig {
	if (obj === null || typeof obj !== "object") {
		return false;
	}
	const model = obj as Record<string, unknown>;
	return (
		typeof model.id === "string" &&
		typeof model.provider === "string" &&
		"settings" in model &&
		model.settings !== null &&
		typeof model.settings === "object" &&
		typeof model.weight === "number" &&
		typeof model.enabled === "boolean"
	);
}

/**
 * Check if settings has any legacy fields that indicate old format.
 * Useful for quick checks without full analysis.
 */
export function hasAnyLegacyFields(settings: unknown): boolean {
	if (settings === null || typeof settings !== "object") {
		return false;
	}

	const settingsObj = settings as Record<string, unknown>;

	// Quick checks for legacy fields
	const hasLegacyProvider =
		"provider" in settingsObj &&
		typeof settingsObj.provider === "string" &&
		Object.values(Provider).includes(settingsObj.provider as Provider);

	const hasLegacyConsensus =
		"consensusSettings" in settingsObj &&
		settingsObj.consensusSettings !== null &&
		typeof settingsObj.consensusSettings === "object" &&
		"consensusModels" in (settingsObj.consensusSettings as Record<string, unknown>) &&
		Array.isArray((settingsObj.consensusSettings as Record<string, unknown>).consensusModels);

	const hasLegacyCouncil =
		"councilSettings" in settingsObj &&
		settingsObj.councilSettings !== null &&
		typeof settingsObj.councilSettings === "object" &&
		"councilModels" in (settingsObj.councilSettings as Record<string, unknown>) &&
		Array.isArray((settingsObj.councilSettings as Record<string, unknown>).councilModels);

	return hasLegacyProvider || hasLegacyConsensus || hasLegacyCouncil;
}

/**
 * Result of consensus model extraction.
 * Includes the extracted model configuration and any warnings/errors.
 */
export interface ConsensusModelExtractionResult {
	/** The extracted model configuration, or null if extraction failed */
	model: ModelConfiguration | null;

	/** Whether extraction was successful */
	success: boolean;

	/** Warning messages (e.g., missing embedding model) */
	warnings: string[];

	/** Error messages if extraction failed */
	errors: string[];

	/** The original consensus model's weight (preserved for reference creation) */
	originalWeight: number;

	/** The original consensus model's enabled state (preserved for reference creation) */
	originalEnabled: boolean;

	/** The original consensus model's ID (for tracking/deduplication) */
	originalId: string;
}

/**
 * Extracts a model configuration from a legacy ConsensusModelConfig.
 *
 * The old ConsensusModelConfig format contains a full embedded `settings` object
 * with provider-specific configuration (openAIApiKey, openAIBaseURL, etc.).
 * This function extracts that configuration and creates a new ModelConfiguration
 * that can be added to the central registry.
 *
 * The generated display name follows the format "Consensus {ProviderName} {index}"
 * where index is provided to distinguish multiple models of the same provider.
 *
 * @param consensusModel - The legacy ConsensusModelConfig with embedded settings
 * @param index - Optional index for display name generation (e.g., "Consensus OpenAI 1")
 * @returns Extraction result with model configuration and any warnings/errors
 *
 * Requirements: 6.3, 6.4
 */
export function extractConsensusModel(
	consensusModel: unknown,
	index?: number
): ConsensusModelExtractionResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Default values for original model properties
	let originalWeight = 1.0;
	let originalEnabled = true;
	let originalId = "";

	// Validate input is a legacy ConsensusModelConfig
	if (!isLegacyConsensusModelConfig(consensusModel)) {
		return {
			model: null,
			success: false,
			warnings: [],
			errors: ["Input is not a valid legacy ConsensusModelConfig"],
			originalWeight,
			originalEnabled,
			originalId,
		};
	}

	// Extract original properties for reference creation
	originalWeight = consensusModel.weight;
	originalEnabled = consensusModel.enabled;
	originalId = consensusModel.id;

	// Extract the embedded settings
	const embeddedSettings = consensusModel.settings as unknown as Record<string, unknown>;
	const provider = consensusModel.provider;

	// Validate provider is known
	if (provider !== Provider.OPENAI && provider !== Provider.OLLAMA) {
		return {
			model: null,
			success: false,
			warnings: [],
			errors: [`Unknown provider in consensus model: ${provider}`],
			originalWeight,
			originalEnabled,
			originalId,
		};
	}

	// Extract provider-specific configuration from embedded settings
	const providerConfigResult = extractProviderConfigFromEmbeddedSettings(
		embeddedSettings,
		provider
	);

	if (!providerConfigResult.success || !providerConfigResult.config) {
		return {
			model: null,
			success: false,
			warnings: providerConfigResult.warnings,
			errors: providerConfigResult.errors,
			originalWeight,
			originalEnabled,
			originalId,
		};
	}

	// Check for missing embedding model (warning, not error)
	if (!providerConfigResult.config.embeddingModel) {
		warnings.push(
			`Consensus model "${originalId}": Embedding model not configured - short/long answer evaluation may not work correctly`
		);
	}

	// Generate meaningful display name with hostname for custom endpoints
	const displayName = generateMigrationDisplayName(
		provider as Provider,
		providerConfigResult.config.baseUrl,
		{ source: "consensus", index }
	);

	// Generate unique model ID
	const modelId = generateMigrationModelId("consensus");

	// Create the model configuration
	// Migrated models use auto-generated display names based on provider and model
	const now = Date.now();
	const model: ModelConfiguration = {
		id: modelId,
		displayName,
		isAutoGeneratedName: true,
		providerConfig: providerConfigResult.config,
		createdAt: now,
		modifiedAt: now,
	};

	return {
		model,
		success: true,
		warnings: [...warnings, ...providerConfigResult.warnings],
		errors: [],
		originalWeight,
		originalEnabled,
		originalId,
	};
}

/**
 * Extracts provider configuration from embedded settings in a legacy ConsensusModelConfig.
 *
 * The embedded settings object has the same structure as the old QuizSettings,
 * with fields like openAIApiKey, openAIBaseURL, openAITextGenModel for OpenAI,
 * or ollamaBaseURL, ollamaTextGenModel for Ollama.
 *
 * @param embeddedSettings - The settings object embedded in the legacy model config
 * @param provider - The provider type to extract config for
 * @returns Extraction result with provider config
 */
function extractProviderConfigFromEmbeddedSettings(
	embeddedSettings: Record<string, unknown>,
	provider: Provider
): ProviderConfigExtractionResult {
	// The embedded settings have the same structure as the main settings,
	// so we can reuse the existing extraction logic
	if (provider === Provider.OPENAI) {
		return extractOpenAIProviderConfigFromSettings(embeddedSettings);
	} else if (provider === Provider.OLLAMA) {
		return extractOllamaProviderConfigFromSettings(embeddedSettings);
	}

	return {
		config: null,
		success: false,
		warnings: [],
		errors: [`Unsupported provider: ${provider}`],
	};
}

/**
 * Extracts OpenAI provider configuration from embedded settings.
 *
 * Expected fields in embedded settings:
 * - openAIApiKey: string (required)
 * - openAIBaseURL: string (optional, defaults to OpenAI API)
 * - openAITextGenModel: string (required)
 * - openAIEmbeddingModel: string (optional)
 */
function extractOpenAIProviderConfigFromSettings(
	settings: Record<string, unknown>
): ProviderConfigExtractionResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Extract API key (required for OpenAI)
	const apiKey = extractStringField(settings, "openAIApiKey", "");
	if (!apiKey) {
		errors.push("OpenAI API key not found in embedded settings");
	}

	// Extract base URL (optional, with default)
	const baseUrl = extractStringField(settings, "openAIBaseURL", DEFAULT_OPENAI_BASE_URL);

	// Extract text generation model (required)
	const textGenerationModel = extractStringField(settings, "openAITextGenModel", "");
	if (!textGenerationModel) {
		errors.push("OpenAI text generation model not found in embedded settings");
	}

	// Extract embedding model (optional)
	const embeddingModel = extractStringField(settings, "openAIEmbeddingModel", "");
	if (!embeddingModel) {
		warnings.push("OpenAI embedding model not configured in embedded settings");
	}

	// If there are critical errors, return failure
	if (errors.length > 0) {
		return {
			config: null,
			success: false,
			warnings,
			errors,
		};
	}

	const config: OpenAIProviderConfig = {
		provider: Provider.OPENAI,
		apiKey,
		baseUrl,
		textGenerationModel,
		embeddingModel,
	};

	return {
		config,
		success: true,
		warnings,
		errors: [],
	};
}

/**
 * Extracts Ollama provider configuration from embedded settings.
 *
 * Expected fields in embedded settings:
 * - ollamaBaseURL: string (optional, defaults to localhost)
 * - ollamaTextGenModel: string (required)
 * - ollamaEmbeddingModel: string (optional)
 */
function extractOllamaProviderConfigFromSettings(
	settings: Record<string, unknown>
): ProviderConfigExtractionResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Extract base URL (optional, with default)
	const baseUrl = extractStringField(settings, "ollamaBaseURL", DEFAULT_OLLAMA_BASE_URL);

	// Extract text generation model (required)
	const textGenerationModel = extractStringField(settings, "ollamaTextGenModel", "");
	if (!textGenerationModel) {
		errors.push("Ollama text generation model not found in embedded settings");
	}

	// Extract embedding model (optional)
	const embeddingModel = extractStringField(settings, "ollamaEmbeddingModel", "");
	if (!embeddingModel) {
		warnings.push("Ollama embedding model not configured in embedded settings");
	}

	// If there are critical errors, return failure
	if (errors.length > 0) {
		return {
			config: null,
			success: false,
			warnings,
			errors,
		};
	}

	const config: OllamaProviderConfig = {
		provider: Provider.OLLAMA,
		baseUrl,
		textGenerationModel,
		embeddingModel,
	};

	return {
		config,
		success: true,
		warnings,
		errors: [],
	};
}

/**
 * Batch extract all consensus models from legacy consensus settings.
 *
 * This function processes an array of legacy ConsensusModelConfig objects
 * and extracts ModelConfiguration objects for each one. It tracks successes
 * and failures, providing detailed results for each extraction.
 *
 * @param consensusModels - Array of legacy ConsensusModelConfig objects
 * @returns Object containing extracted models, references, and any errors
 *
 * Requirements: 6.3, 6.4
 */
export function extractAllConsensusModels(
	consensusModels: unknown[]
): BatchConsensusExtractionResult {
	const extractedModels: ModelConfiguration[] = [];
	const extractionResults: ConsensusModelExtractionResult[] = [];
	const allWarnings: string[] = [];
	const allErrors: string[] = [];

	let successCount = 0;
	let failureCount = 0;

	for (let i = 0; i < consensusModels.length; i++) {
		const model = consensusModels[i];
		const result = extractConsensusModel(model, i + 1);

		extractionResults.push(result);

		if (result.success && result.model) {
			extractedModels.push(result.model);
			successCount++;
		} else {
			failureCount++;
		}

		allWarnings.push(...result.warnings);
		allErrors.push(...result.errors);
	}

	return {
		extractedModels,
		extractionResults,
		successCount,
		failureCount,
		totalCount: consensusModels.length,
		allWarnings,
		allErrors,
	};
}

/**
 * Result of batch consensus model extraction.
 */
export interface BatchConsensusExtractionResult {
	/** Successfully extracted model configurations */
	extractedModels: ModelConfiguration[];

	/** Individual extraction results for each model */
	extractionResults: ConsensusModelExtractionResult[];

	/** Number of successful extractions */
	successCount: number;

	/** Number of failed extractions */
	failureCount: number;

	/** Total number of models processed */
	totalCount: number;

	/** All warnings from all extractions */
	allWarnings: string[];

	/** All errors from all extractions */
	allErrors: string[];
}

/**
 * Result of council model extraction.
 * Includes the extracted model configuration and any warnings/errors.
 */
export interface CouncilModelExtractionResult {
	/** The extracted model configuration, or null if extraction failed */
	model: ModelConfiguration | null;

	/** Whether extraction was successful */
	success: boolean;

	/** Warning messages (e.g., missing embedding model) */
	warnings: string[];

	/** Error messages if extraction failed */
	errors: string[];

	/** The original council model's weight (preserved for reference creation) */
	originalWeight: number;

	/** The original council model's enabled state (preserved for reference creation) */
	originalEnabled: boolean;

	/** The original council model's ID (for tracking/deduplication) */
	originalId: string;
}

/**
 * Extracts a model configuration from a legacy council model (ConsensusModelConfig).
 *
 * Council models use the same legacy format as consensus models - ConsensusModelConfig
 * with a full embedded `settings` object containing provider-specific configuration
 * (openAIApiKey, openAIBaseURL, etc.). This function extracts that configuration
 * and creates a new ModelConfiguration that can be added to the central registry.
 *
 * The generated display name follows the format "Council {ProviderName} {index}"
 * where index is provided to distinguish multiple models of the same provider.
 *
 * @param councilModel - The legacy council model config (ConsensusModelConfig) with embedded settings
 * @param index - Optional index for display name generation (e.g., "Council OpenAI 1")
 * @returns Extraction result with model configuration and any warnings/errors
 *
 * Requirements: 6.3, 6.4
 */
export function extractCouncilModel(
	councilModel: unknown,
	index?: number
): CouncilModelExtractionResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Default values for original model properties
	let originalWeight = 1.0;
	let originalEnabled = true;
	let originalId = "";

	// Validate input is a legacy ConsensusModelConfig (council uses same format)
	if (!isLegacyConsensusModelConfig(councilModel)) {
		return {
			model: null,
			success: false,
			warnings: [],
			errors: ["Input is not a valid legacy council model config"],
			originalWeight,
			originalEnabled,
			originalId,
		};
	}

	// Extract original properties for reference creation
	originalWeight = councilModel.weight;
	originalEnabled = councilModel.enabled;
	originalId = councilModel.id;

	// Extract the embedded settings
	const embeddedSettings = councilModel.settings as unknown as Record<string, unknown>;
	const provider = councilModel.provider;

	// Validate provider is known
	if (provider !== Provider.OPENAI && provider !== Provider.OLLAMA) {
		return {
			model: null,
			success: false,
			warnings: [],
			errors: [`Unknown provider in council model: ${provider}`],
			originalWeight,
			originalEnabled,
			originalId,
		};
	}

	// Extract provider-specific configuration from embedded settings
	const providerConfigResult = extractProviderConfigFromEmbeddedSettings(
		embeddedSettings,
		provider
	);

	if (!providerConfigResult.success || !providerConfigResult.config) {
		return {
			model: null,
			success: false,
			warnings: providerConfigResult.warnings,
			errors: providerConfigResult.errors,
			originalWeight,
			originalEnabled,
			originalId,
		};
	}

	// Check for missing embedding model (warning, not error)
	if (!providerConfigResult.config.embeddingModel) {
		warnings.push(
			`Council model "${originalId}": Embedding model not configured - short/long answer evaluation may not work correctly`
		);
	}

	// Generate meaningful display name with hostname for custom endpoints
	const displayName = generateMigrationDisplayName(
		provider as Provider,
		providerConfigResult.config.baseUrl,
		{ source: "council", index }
	);

	// Generate unique model ID
	const modelId = generateMigrationModelId("council");

	// Create the model configuration
	// Migrated models use auto-generated display names based on provider and model
	const now = Date.now();
	const model: ModelConfiguration = {
		id: modelId,
		displayName,
		isAutoGeneratedName: true,
		providerConfig: providerConfigResult.config,
		createdAt: now,
		modifiedAt: now,
	};

	return {
		model,
		success: true,
		warnings: [...warnings, ...providerConfigResult.warnings],
		errors: [],
		originalWeight,
		originalEnabled,
		originalId,
	};
}

/**
 * Batch extract all council models from legacy council settings.
 *
 * This function processes an array of legacy council model objects
 * (ConsensusModelConfig format) and extracts ModelConfiguration objects
 * for each one. It tracks successes and failures, providing detailed
 * results for each extraction.
 *
 * @param councilModels - Array of legacy council model objects (ConsensusModelConfig format)
 * @returns Object containing extracted models, references, and any errors
 *
 * Requirements: 6.3, 6.4
 */
export function extractAllCouncilModels(
	councilModels: unknown[]
): BatchCouncilExtractionResult {
	const extractedModels: ModelConfiguration[] = [];
	const extractionResults: CouncilModelExtractionResult[] = [];
	const allWarnings: string[] = [];
	const allErrors: string[] = [];

	let successCount = 0;
	let failureCount = 0;

	for (let i = 0; i < councilModels.length; i++) {
		const model = councilModels[i];
		const result = extractCouncilModel(model, i + 1);

		extractionResults.push(result);

		if (result.success && result.model) {
			extractedModels.push(result.model);
			successCount++;
		} else {
			failureCount++;
		}

		allWarnings.push(...result.warnings);
		allErrors.push(...result.errors);
	}

	return {
		extractedModels,
		extractionResults,
		successCount,
		failureCount,
		totalCount: councilModels.length,
		allWarnings,
		allErrors,
	};
}

/**
 * Result of batch council model extraction.
 */
export interface BatchCouncilExtractionResult {
	/** Successfully extracted model configurations */
	extractedModels: ModelConfiguration[];

	/** Individual extraction results for each model */
	extractionResults: CouncilModelExtractionResult[];

	/** Number of successful extractions */
	successCount: number;

	/** Number of failed extractions */
	failureCount: number;

	/** Total number of models processed */
	totalCount: number;

	/** All warnings from all extractions */
	allWarnings: string[];

	/** All errors from all extractions */
	allErrors: string[];
}

/**
 * Result of chair model extraction.
 * Includes the extracted model configuration and information about chair strategy.
 */
export interface ChairModelExtractionResult {
	/** The extracted model configuration, or null if extraction failed or not applicable */
	model: ModelConfiguration | null;

	/** Whether extraction was successful */
	success: boolean;

	/** Warning messages */
	warnings: string[];

	/** Error messages if extraction failed */
	errors: string[];

	/** The configured chair ID from the old settings */
	configuredChairId: string | null;

	/** The selection strategy from the old settings */
	selectionStrategy: "configured" | "highest-ranked" | "rotating";

	/** Whether a dedicated chair model was extracted (true) or should reference an existing model (false) */
	isDedicatedChairModel: boolean;
}

/**
 * Extracts chair model configuration during migration.
 *
 * This function handles the chair model extraction for council settings.
 * The chair model can be configured in three ways:
 * 1. "configured" - A specific model is designated as chair via configuredChairId
 * 2. "highest-ranked" - Chair is dynamically selected from ranking results
 * 3. "rotating" - Chair rotates among council models
 *
 * For the "configured" strategy, we need to find the corresponding model
 * from the council models array and ensure it gets extracted properly.
 * The chair model may already be part of the council models list, in which
 * case we just need to track its ID for creating the new configuredChairId reference.
 *
 * @param chairConfig - The chair model configuration from legacy settings
 * @param councilModels - The array of legacy council models to search for configured chair
 * @returns Extraction result with chair model information
 *
 * Requirements: 6.3, 6.4
 */
export function extractChairModel(
	chairConfig: unknown,
	councilModels: unknown[]
): ChairModelExtractionResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Default result for non-configured strategies
	const defaultResult: ChairModelExtractionResult = {
		model: null,
		success: true,
		warnings: [],
		errors: [],
		configuredChairId: null,
		selectionStrategy: "highest-ranked",
		isDedicatedChairModel: false,
	};

	// Validate chair config input
	if (chairConfig === null || chairConfig === undefined || typeof chairConfig !== "object") {
		return {
			...defaultResult,
			success: false,
			errors: ["Chair configuration is null, undefined, or not an object"],
		};
	}

	const chairObj = chairConfig as Record<string, unknown>;

	// Extract selection strategy
	const selectionStrategy = chairObj.selectionStrategy as string | undefined;

	if (!selectionStrategy || !["configured", "highest-ranked", "rotating"].includes(selectionStrategy)) {
		// Default to highest-ranked if invalid or missing
		return {
			...defaultResult,
			warnings: [`Invalid or missing chair selection strategy: "${selectionStrategy}", defaulting to "highest-ranked"`],
		};
	}

	// For non-configured strategies, no model extraction needed
	if (selectionStrategy !== "configured") {
		return {
			...defaultResult,
			selectionStrategy: selectionStrategy as "highest-ranked" | "rotating",
		};
	}

	// For "configured" strategy, we need to find the chair model
	const configuredChairId = chairObj.configuredChairId as string | undefined;

	if (!configuredChairId || configuredChairId.trim() === "") {
		return {
			model: null,
			success: false,
			warnings: [],
			errors: ['Chair selection strategy is "configured" but no configuredChairId is specified'],
			configuredChairId: null,
			selectionStrategy: "configured",
			isDedicatedChairModel: false,
		};
	}

	// Look for the configured chair model in the council models array
	const chairModelIndex = councilModels.findIndex((model) => {
		if (model === null || typeof model !== "object") {
			return false;
		}
		const modelObj = model as Record<string, unknown>;
		return modelObj.id === configuredChairId;
	});

	if (chairModelIndex === -1) {
		// Chair model not found in council models
		// This could happen if the chair model was deleted or settings are inconsistent
		warnings.push(
			`Configured chair model "${configuredChairId}" not found in council models. ` +
			`After migration, you may need to reconfigure the chair model.`
		);

		return {
			model: null,
			success: true, // Still successful - the chair will need to be reconfigured
			warnings,
			errors: [],
			configuredChairId,
			selectionStrategy: "configured",
			isDedicatedChairModel: false,
		};
	}

	// Chair model found - it will be extracted as part of council models
	// We just need to track its original ID for mapping to the new model ID
	return {
		model: null, // Model will be extracted via extractAllCouncilModels
		success: true,
		warnings: [],
		errors: [],
		configuredChairId,
		selectionStrategy: "configured",
		isDedicatedChairModel: false,
	};
}

/**
 * Maps the old configured chair ID to the new model ID after migration.
 *
 * After extracting council models, we need to update the configuredChairId
 * to point to the new model ID in the registry. This function finds the
 * corresponding new model ID based on the original ID.
 *
 * @param oldChairId - The original configuredChairId from legacy settings
 * @param extractionResults - The extraction results from extractAllCouncilModels
 * @returns The new model ID to use for configuredChairId, or null if not found
 *
 * Requirements: 6.3, 6.4
 */
export function mapChairIdToNewModelId(
	oldChairId: string,
	extractionResults: CouncilModelExtractionResult[]
): string | null {
	// Find the extraction result that has the matching original ID
	const matchingResult = extractionResults.find(
		(result) => result.originalId === oldChairId && result.success && result.model
	);

	if (matchingResult && matchingResult.model) {
		return matchingResult.model.id;
	}

	return null;
}

/**
 * Result of model deduplication.
 * Contains the deduplicated models and information about merges performed.
 */
export interface DeduplicationResult {
	/** Deduplicated model configurations (unique models only) */
	deduplicatedModels: ModelConfiguration[];

	/** Map from original model IDs to their deduplicated (canonical) model ID */
	idMapping: Map<string, string>;

	/** Information about each merge that was performed */
	merges: DeduplicationMergeInfo[];

	/** Statistics about the deduplication process */
	stats: DeduplicationStats;
}

/**
 * Information about a single merge during deduplication.
 */
export interface DeduplicationMergeInfo {
	/** The ID that was kept (canonical) */
	canonicalId: string;

	/** The display name of the canonical model */
	canonicalDisplayName: string;

	/** The IDs that were merged into the canonical one */
	mergedIds: string[];

	/** The display names of the merged models */
	mergedDisplayNames: string[];

	/** The key used to identify these as duplicates */
	deduplicationKey: string;
}

/**
 * Statistics about the deduplication process.
 */
export interface DeduplicationStats {
	/** Total models before deduplication */
	totalBefore: number;

	/** Total models after deduplication */
	totalAfter: number;

	/** Number of duplicates removed */
	duplicatesRemoved: number;

	/** Number of unique models */
	uniqueModels: number;
}

/**
 * Generates a unique key/fingerprint for a model configuration.
 *
 * The key is based on the actual configuration values that define the model:
 * - Provider type
 * - Provider-specific credentials (API key for OpenAI, base URL for both)
 * - Generation model name
 * - Embedding model name
 *
 * Two models with the same key are considered identical configurations
 * and can be deduplicated during migration.
 *
 * Note: Display name, ID, and timestamps are NOT included in the key
 * since they are metadata, not configuration.
 *
 * @param model - The model configuration to generate a key for
 * @returns A string key uniquely identifying this configuration
 *
 * Requirements: 1.1, 1.4, 6.3
 */
export function getModelKey(model: ModelConfiguration): string {
	const config = model.providerConfig;

	// Build key components based on provider type
	const keyComponents: Record<string, unknown> = {
		provider: config.provider,
		textGenerationModel: normalizeModelField(config.textGenerationModel),
		embeddingModel: normalizeModelField(config.embeddingModel),
	};

	// Add provider-specific fields
	if (config.provider === Provider.OPENAI) {
		const openAIConfig = config as OpenAIProviderConfig;
		keyComponents.apiKey = normalizeModelField(openAIConfig.apiKey);
		keyComponents.baseUrl = normalizeBaseUrl(openAIConfig.baseUrl);
	} else if (config.provider === Provider.OLLAMA) {
		const ollamaConfig = config as OllamaProviderConfig;
		keyComponents.baseUrl = normalizeBaseUrl(ollamaConfig.baseUrl);
	}

	// Use JSON.stringify with sorted keys for consistent ordering
	return JSON.stringify(keyComponents, Object.keys(keyComponents).sort());
}

/**
 * Normalizes a model field for comparison.
 * Trims whitespace and converts to lowercase for case-insensitive comparison.
 *
 * @param value - The field value to normalize
 * @returns Normalized string value
 */
function normalizeModelField(value: string | undefined | null): string {
	if (value === undefined || value === null) {
		return "";
	}
	return value.trim().toLowerCase();
}

/**
 * Normalizes a base URL for comparison.
 * Removes trailing slashes and converts to lowercase.
 *
 * @param url - The URL to normalize
 * @returns Normalized URL string
 */
function normalizeBaseUrl(url: string | undefined | null): string {
	if (url === undefined || url === null) {
		return "";
	}
	// Remove trailing slashes and convert to lowercase
	return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Deduplicates an array of model configurations.
 *
 * This function identifies model configurations that have identical provider
 * settings (same provider, credentials, generation model, and embedding model)
 * and keeps only the first occurrence of each unique configuration.
 *
 * The deduplication process:
 * 1. Generate a unique key for each model based on its configuration
 * 2. For duplicate keys, keep the first model encountered (canonical)
 * 3. Map all duplicate model IDs to their canonical model ID
 * 4. Track merge information for reporting
 *
 * This is primarily used during migration when the same model may have been
 * configured in multiple places (main, consensus, council) with identical
 * settings.
 *
 * @param models - Array of model configurations to deduplicate
 * @returns DeduplicationResult with unique models and mapping information
 *
 * Requirements: 1.1, 1.4, 6.3
 */
export function deduplicateModels(models: ModelConfiguration[]): DeduplicationResult {
	// Map from deduplication key to canonical model and its duplicates
	const keyToCanonical = new Map<string, ModelConfiguration>();
	const keyToDuplicates = new Map<string, ModelConfiguration[]>();

	// Map from original model ID to canonical model ID
	const idMapping = new Map<string, string>();

	// Process each model
	for (const model of models) {
		const key = getModelKey(model);

		if (keyToCanonical.has(key)) {
			// This is a duplicate - add to duplicates list
			const duplicates = keyToDuplicates.get(key) || [];
			duplicates.push(model);
			keyToDuplicates.set(key, duplicates);

			// Map this model's ID to the canonical model's ID
			const canonical = keyToCanonical.get(key)!;
			idMapping.set(model.id, canonical.id);
		} else {
			// This is the first occurrence - make it canonical
			keyToCanonical.set(key, model);
			// Map to itself
			idMapping.set(model.id, model.id);
		}
	}

	// Build the list of unique (deduplicated) models
	const deduplicatedModels = Array.from(keyToCanonical.values());

	// Build merge information for reporting
	const merges: DeduplicationMergeInfo[] = [];

	for (const [key, canonical] of keyToCanonical.entries()) {
		const duplicates = keyToDuplicates.get(key);

		if (duplicates && duplicates.length > 0) {
			merges.push({
				canonicalId: canonical.id,
				canonicalDisplayName: canonical.displayName,
				mergedIds: duplicates.map((d) => d.id),
				mergedDisplayNames: duplicates.map((d) => d.displayName),
				deduplicationKey: key,
			});
		}
	}

	// Calculate statistics
	const stats: DeduplicationStats = {
		totalBefore: models.length,
		totalAfter: deduplicatedModels.length,
		duplicatesRemoved: models.length - deduplicatedModels.length,
		uniqueModels: deduplicatedModels.length,
	};

	return {
		deduplicatedModels,
		idMapping,
		merges,
		stats,
	};
}

/**
 * Source of a model during migration (for tracking which models came from where).
 */
export type ModelSource = "main" | "consensus" | "council";

/**
 * Model with its source information for deduplication tracking.
 */
export interface ModelWithSource {
	/** The model configuration */
	model: ModelConfiguration;

	/** Where this model came from during migration */
	source: ModelSource;

	/** Original weight if from consensus/council */
	originalWeight?: number;

	/** Original enabled state if from consensus/council */
	originalEnabled?: boolean;

	/** Original ID before migration */
	originalId?: string;
}

/**
 * Result of deduplication with source tracking.
 */
export interface DeduplicationWithSourcesResult extends DeduplicationResult {
	/** Models with their source information preserved */
	modelsWithSources: Array<{
		/** The canonical model */
		model: ModelConfiguration;

		/** All sources where this model appeared */
		sources: ModelSource[];

		/** Original IDs from each source */
		originalIds: Map<ModelSource, string>;
	}>;
}

/**
 * Deduplicates models while tracking their original sources.
 *
 * This is an enhanced version of deduplicateModels that preserves information
 * about where each model came from (main, consensus, council). This is useful
 * for updating references after deduplication - we need to know which original
 * ID maps to which new ID for each source.
 *
 * @param modelsWithSources - Array of models with their source information
 * @returns Enhanced deduplication result with source tracking
 *
 * Requirements: 1.1, 1.4, 6.3
 */
export function deduplicateModelsWithSources(
	modelsWithSources: ModelWithSource[]
): DeduplicationWithSourcesResult {
	// Map from deduplication key to canonical model info
	const keyToCanonical = new Map<
		string,
		{
			model: ModelConfiguration;
			sources: ModelSource[];
			originalIds: Map<ModelSource, string>;
		}
	>();

	// Map from original model ID to canonical model ID
	const idMapping = new Map<string, string>();

	// Map for tracking duplicates (for merge info)
	const keyToDuplicates = new Map<string, ModelConfiguration[]>();

	// Process each model
	for (const { model, source, originalId } of modelsWithSources) {
		const key = getModelKey(model);

		if (keyToCanonical.has(key)) {
			// This is a duplicate - update the canonical entry
			const canonical = keyToCanonical.get(key)!;

			// Add this source if not already present
			if (!canonical.sources.includes(source)) {
				canonical.sources.push(source);
			}

			// Track the original ID for this source
			if (originalId) {
				canonical.originalIds.set(source, originalId);
			}

			// Map this model's ID to the canonical model's ID
			idMapping.set(model.id, canonical.model.id);
			if (originalId) {
				idMapping.set(originalId, canonical.model.id);
			}

			// Track as duplicate for merge info
			const duplicates = keyToDuplicates.get(key) || [];
			duplicates.push(model);
			keyToDuplicates.set(key, duplicates);
		} else {
			// First occurrence - make it canonical
			const originalIds = new Map<ModelSource, string>();
			if (originalId) {
				originalIds.set(source, originalId);
			}

			keyToCanonical.set(key, {
				model,
				sources: [source],
				originalIds,
			});

			// Map to itself
			idMapping.set(model.id, model.id);
			if (originalId) {
				idMapping.set(originalId, model.id);
			}
		}
	}

	// Build the results
	const deduplicatedModels: ModelConfiguration[] = [];
	const modelsWithSourcesResult: DeduplicationWithSourcesResult["modelsWithSources"] = [];

	for (const canonicalInfo of keyToCanonical.values()) {
		deduplicatedModels.push(canonicalInfo.model);
		modelsWithSourcesResult.push({
			model: canonicalInfo.model,
			sources: canonicalInfo.sources,
			originalIds: canonicalInfo.originalIds,
		});
	}

	// Build merge information
	const merges: DeduplicationMergeInfo[] = [];

	for (const [key, canonicalInfo] of keyToCanonical.entries()) {
		const duplicates = keyToDuplicates.get(key);

		if (duplicates && duplicates.length > 0) {
			merges.push({
				canonicalId: canonicalInfo.model.id,
				canonicalDisplayName: canonicalInfo.model.displayName,
				mergedIds: duplicates.map((d) => d.id),
				mergedDisplayNames: duplicates.map((d) => d.displayName),
				deduplicationKey: key,
			});
		}
	}

	// Calculate statistics
	const stats: DeduplicationStats = {
		totalBefore: modelsWithSources.length,
		totalAfter: deduplicatedModels.length,
		duplicatesRemoved: modelsWithSources.length - deduplicatedModels.length,
		uniqueModels: deduplicatedModels.length,
	};

	return {
		deduplicatedModels,
		idMapping,
		merges,
		stats,
		modelsWithSources: modelsWithSourcesResult,
	};
}

/**
 * Result of finding an equivalent model in the registry.
 */
export interface RegistryMatchResult {
	/** Whether an equivalent model was found */
	found: boolean;

	/** The ID of the matching model in the registry, or null if not found */
	matchingModelId: string | null;

	/** The matching model configuration, or null if not found */
	matchingModel: ModelConfiguration | null;

	/** The key used for comparison */
	comparisonKey: string;
}

/**
 * Finds an equivalent model in an existing registry based on configuration matching.
 *
 * This function checks if a model with equivalent configuration (same provider,
 * credentials, and model names) already exists in the provided registry. This is
 * useful during migration to avoid creating duplicate entries when the same model
 * configuration is already stored.
 *
 * Matching is done using the same key generation logic as deduplication:
 * - Provider type
 * - Provider-specific credentials (API key for OpenAI, base URL for both)
 * - Generation model name
 * - Embedding model name
 *
 * Display names, IDs, and timestamps are NOT used for matching - only the
 * functional configuration matters.
 *
 * @param model - The model configuration to find an equivalent for
 * @param registry - The existing model registry to search in
 * @returns RegistryMatchResult indicating whether a match was found
 *
 * Requirements: 1.4, 7.5
 */
export function findEquivalentModelInRegistry(
	model: ModelConfiguration,
	registry: ModelRegistry
): RegistryMatchResult {
	// Generate the comparison key for the input model
	const modelKey = getModelKey(model);

	// Search through all models in the registry
	for (const existingModel of Object.values(registry.models)) {
		const existingKey = getModelKey(existingModel);

		if (modelKey === existingKey) {
			return {
				found: true,
				matchingModelId: existingModel.id,
				matchingModel: existingModel,
				comparisonKey: modelKey,
			};
		}
	}

	// No match found
	return {
		found: false,
		matchingModelId: null,
		matchingModel: null,
		comparisonKey: modelKey,
	};
}

/**
 * Finds an equivalent model in a registry based on provider config matching.
 *
 * This is a lower-level function that matches against a ProviderConfig directly,
 * useful when you don't have a full ModelConfiguration object yet (e.g., during
 * extraction from legacy settings).
 *
 * @param providerConfig - The provider configuration to match
 * @param registry - The existing model registry to search in
 * @returns RegistryMatchResult indicating whether a match was found
 *
 * Requirements: 1.4, 7.5
 */
export function findEquivalentProviderConfigInRegistry(
	providerConfig: ProviderConfig,
	registry: ModelRegistry
): RegistryMatchResult {
	// Create a temporary model configuration for key generation
	const tempModel: ModelConfiguration = {
		id: "temp",
		displayName: "temp",
		isAutoGeneratedName: false,
		providerConfig,
		createdAt: 0,
		modifiedAt: 0,
	};

	return findEquivalentModelInRegistry(tempModel, registry);
}

/**
 * Result of finding or creating a model.
 */
export interface FindOrCreateResult {
	/** The model ID to use (either existing or newly created) */
	modelId: string;

	/** The model configuration */
	model: ModelConfiguration;

	/** Whether this model was newly created (false if reusing existing) */
	wasCreated: boolean;

	/** If reusing existing, the display name of the existing model */
	existingDisplayName?: string;
}

/**
 * Finds an equivalent model in the registry or prepares a new one to be added.
 *
 * This is the main function for duplicate detection during migration. It:
 * 1. Checks if an equivalent configuration already exists in the registry
 * 2. If found, returns the existing model's ID for reuse
 * 3. If not found, returns the new model to be added
 *
 * This prevents duplicate model entries when migrating settings that reference
 * the same actual model configuration (same API key, base URL, and model names).
 *
 * @param newModel - The new model configuration being migrated
 * @param registry - The existing model registry to check against
 * @returns FindOrCreateResult with the model ID to use and whether it was created
 *
 * Requirements: 1.4, 7.5
 */
export function findOrCreateModel(
	newModel: ModelConfiguration,
	registry: ModelRegistry
): FindOrCreateResult {
	// Check for an existing equivalent model
	const matchResult = findEquivalentModelInRegistry(newModel, registry);

	if (matchResult.found && matchResult.matchingModel) {
		// Reuse the existing model
		return {
			modelId: matchResult.matchingModelId!,
			model: matchResult.matchingModel,
			wasCreated: false,
			existingDisplayName: matchResult.matchingModel.displayName,
		};
	}

	// No equivalent found - use the new model
	return {
		modelId: newModel.id,
		model: newModel,
		wasCreated: true,
	};
}

/**
 * Result of batch processing models against a registry.
 */
export interface BatchRegistryMatchResult {
	/** Models that need to be added to the registry (no existing equivalent) */
	modelsToAdd: ModelConfiguration[];

	/** Map from new model IDs to existing registry model IDs (for reuse) */
	idRemapping: Map<string, string>;

	/** Statistics about the matching process */
	stats: {
		/** Total models processed */
		totalProcessed: number;

		/** Models that matched existing registry entries */
		matchedExisting: number;

		/** Models that need to be added as new */
		newModels: number;
	};

	/** Details about each match/non-match for debugging */
	matchDetails: Array<{
		/** The original model ID from migration */
		originalId: string;

		/** The display name of the original model */
		originalDisplayName: string;

		/** Whether a match was found in the registry */
		matched: boolean;

		/** The ID of the existing model if matched, or the new ID if not */
		resultingId: string;

		/** The display name of the matched model (if matched) */
		matchedDisplayName?: string;
	}>;
}

/**
 * Processes a batch of extracted models against an existing registry.
 *
 * This function is used during migration to determine which extracted models
 * need to be added to the registry and which can reuse existing entries.
 * It maintains a mapping from the extracted model IDs to the final model IDs
 * (which may be existing registry IDs for duplicates).
 *
 * @param extractedModels - Models extracted during migration
 * @param existingRegistry - The existing model registry
 * @returns BatchRegistryMatchResult with models to add and ID remapping
 *
 * Requirements: 1.4, 7.5
 */
export function processModelsAgainstRegistry(
	extractedModels: ModelConfiguration[],
	existingRegistry: ModelRegistry
): BatchRegistryMatchResult {
	const modelsToAdd: ModelConfiguration[] = [];
	const idRemapping = new Map<string, string>();
	const matchDetails: BatchRegistryMatchResult["matchDetails"] = [];

	let matchedExisting = 0;
	let newModels = 0;

	// Build a lookup map for the existing registry for faster comparison
	// Key -> existing model ID
	const existingKeyMap = new Map<string, string>();
	for (const existingModel of Object.values(existingRegistry.models)) {
		const key = getModelKey(existingModel);
		existingKeyMap.set(key, existingModel.id);
	}

	// Also track keys of models we're adding to handle duplicates within extractedModels
	const addedKeyMap = new Map<string, string>();

	for (const model of extractedModels) {
		const key = getModelKey(model);

		// First check if there's an existing match in the registry
		const existingId = existingKeyMap.get(key);
		if (existingId) {
			// Reuse existing registry entry
			idRemapping.set(model.id, existingId);
			matchedExisting++;

			const existingModel = existingRegistry.models[existingId];
			matchDetails.push({
				originalId: model.id,
				originalDisplayName: model.displayName,
				matched: true,
				resultingId: existingId,
				matchedDisplayName: existingModel?.displayName,
			});
			continue;
		}

		// Check if we've already added an equivalent model in this batch
		const alreadyAddedId = addedKeyMap.get(key);
		if (alreadyAddedId) {
			// Reuse the model we already added
			idRemapping.set(model.id, alreadyAddedId);
			matchedExisting++; // Count as matched since we're not adding it

			const addedModel = modelsToAdd.find((m) => m.id === alreadyAddedId);
			matchDetails.push({
				originalId: model.id,
				originalDisplayName: model.displayName,
				matched: true,
				resultingId: alreadyAddedId,
				matchedDisplayName: addedModel?.displayName,
			});
			continue;
		}

		// No match found - this is a new model to add
		modelsToAdd.push(model);
		addedKeyMap.set(key, model.id);
		idRemapping.set(model.id, model.id); // Maps to itself
		newModels++;

		matchDetails.push({
			originalId: model.id,
			originalDisplayName: model.displayName,
			matched: false,
			resultingId: model.id,
		});
	}

	return {
		modelsToAdd,
		idRemapping,
		stats: {
			totalProcessed: extractedModels.length,
			matchedExisting,
			newModels,
		},
		matchDetails,
	};
}

/**
 * Updates consensus model references to use deduplicated model IDs.
 *
 * After deduplication, the original model IDs in consensus settings need
 * to be updated to point to the canonical (deduplicated) model IDs.
 *
 * @param extractionResults - The extraction results from consensus model migration
 * @param idMapping - Map from original IDs to canonical IDs
 * @returns Array of updated ConsensusModelReference objects
 *
 * Requirements: 1.4, 6.3
 */
export function updateConsensusReferences(
	extractionResults: ConsensusModelExtractionResult[],
	idMapping: Map<string, string>
): ConsensusModelReference[] {
	const references: ConsensusModelReference[] = [];
	const seenModelIds = new Set<string>();

	for (const result of extractionResults) {
		if (!result.success || !result.model) {
			continue;
		}

		// Get the canonical model ID for this model
		const canonicalId = idMapping.get(result.model.id) || result.model.id;

		// Skip if we've already added a reference to this canonical model
		// (handles case where duplicates pointed to different original models)
		if (seenModelIds.has(canonicalId)) {
			continue;
		}
		seenModelIds.add(canonicalId);

		references.push({
			modelId: canonicalId,
			weight: result.originalWeight,
			enabled: result.originalEnabled,
		});
	}

	return references;
}

/**
 * Updates council model references to use deduplicated model IDs.
 *
 * After deduplication, the original model IDs in council settings need
 * to be updated to point to the canonical (deduplicated) model IDs.
 *
 * @param extractionResults - The extraction results from council model migration
 * @param idMapping - Map from original IDs to canonical IDs
 * @returns Array of updated CouncilModelReference objects
 *
 * Requirements: 1.4, 6.3
 */
export function updateCouncilReferences(
	extractionResults: CouncilModelExtractionResult[],
	idMapping: Map<string, string>
): CouncilModelReference[] {
	const references: CouncilModelReference[] = [];
	const seenModelIds = new Set<string>();

	for (const result of extractionResults) {
		if (!result.success || !result.model) {
			continue;
		}

		// Get the canonical model ID for this model
		const canonicalId = idMapping.get(result.model.id) || result.model.id;

		// Skip if we've already added a reference to this canonical model
		if (seenModelIds.has(canonicalId)) {
			continue;
		}
		seenModelIds.add(canonicalId);

		references.push({
			modelId: canonicalId,
			weight: result.originalWeight,
			enabled: result.originalEnabled,
		});
	}

	return references;
}

/**
 * Updates the chair model ID to use the deduplicated model ID.
 *
 * @param originalChairId - The original chair model ID
 * @param idMapping - Map from original IDs to canonical IDs
 * @returns The canonical chair model ID, or null if not found
 *
 * Requirements: 1.4, 6.3
 */
export function updateChairReference(
	originalChairId: string | null | undefined,
	idMapping: Map<string, string>
): string | null {
	if (!originalChairId) {
		return null;
	}

	// Look up the canonical ID
	return idMapping.get(originalChairId) || null;
}

/**
 * Result of consensus settings migration.
 */
export interface ConsensusSettingsMigrationResult {
	/** The migrated consensus settings with model references */
	settings: MigratedConsensusSettings;

	/** Whether migration was successful */
	success: boolean;

	/** Warning messages during migration */
	warnings: string[];

	/** Error messages if migration failed */
	errors: string[];

	/** Extracted model configurations to add to registry */
	extractedModels: ModelConfiguration[];

	/** Number of models successfully migrated */
	modelsMigrated: number;
}

/**
 * Migrated consensus settings structure.
 * Contains the new model references instead of embedded configurations.
 */
export interface MigratedConsensusSettings {
	/** Enable/disable consensus mode */
	enabled: boolean;

	/** Model references (NEW - registry-based) */
	models: ConsensusModelReference[];

	/** Minimum number of models required (preserved from original) */
	minModelsRequired: number;

	/** Consensus threshold percentage (preserved from original) */
	consensusThreshold: number;

	/** Maximum consensus iterations (preserved from original) */
	maxIterations: number;

	/** Enable source validation (preserved from original) */
	enableSourceValidation: boolean;

	/** Cache consensus results (preserved from original) */
	enableCaching: boolean;

	/** Show detailed audit trail (preserved from original) */
	showAuditTrail: boolean;

	/** Fallback to single model if consensus fails (preserved from original) */
	fallbackToSingleModel: boolean;

	/** Privacy preferences (preserved from original) */
	privacyPreferences?: ConsensusPrivacyPreferences;
}

/**
 * Privacy preferences for consensus mode (mirrored from consensus types).
 */
interface ConsensusPrivacyPreferences {
	/** Whether user has acknowledged the data privacy warning */
	privacyWarningAcknowledged: boolean;

	/** Date/time when privacy warning was last acknowledged */
	privacyWarningAcknowledgedAt?: number;

	/** Restrict consensus to local-only models */
	localOnlyMode: boolean;

	/** Providers that user has explicitly approved for data sharing */
	approvedProviders: Provider[];
}

/**
 * Migrates consensus settings from the legacy format to the new reference-based format.
 *
 * This function:
 * 1. Extracts all legacy ConsensusModelConfig objects to ModelConfiguration
 * 2. Creates ConsensusModelReference objects pointing to the extracted models
 * 3. Preserves all non-model settings (threshold, iterations, privacy, etc.)
 *
 * The extracted models should be deduplicated with models from other sources
 * (main, council) before adding to the registry.
 *
 * @param oldSettings - The legacy consensus settings with embedded model configurations
 * @returns Migration result with migrated settings and extracted models
 *
 * Requirements: 6.3, 6.4
 */
export function migrateConsensusSettings(
	oldSettings: unknown
): ConsensusSettingsMigrationResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Validate input
	if (oldSettings === null || oldSettings === undefined || typeof oldSettings !== "object") {
		return {
			settings: createDefaultMigratedConsensusSettings(),
			success: false,
			warnings: [],
			errors: ["Consensus settings is null, undefined, or not an object"],
			extractedModels: [],
			modelsMigrated: 0,
		};
	}

	const settingsObj = oldSettings as Record<string, unknown>;

	// Extract non-model settings (preserve all of these)
	const enabled = typeof settingsObj.enabled === "boolean" ? settingsObj.enabled : false;
	const minModelsRequired = typeof settingsObj.minModelsRequired === "number"
		? settingsObj.minModelsRequired
		: 2;
	const consensusThreshold = typeof settingsObj.consensusThreshold === "number"
		? settingsObj.consensusThreshold
		: 0.66;
	const maxIterations = typeof settingsObj.maxIterations === "number"
		? settingsObj.maxIterations
		: 3;
	const enableSourceValidation = typeof settingsObj.enableSourceValidation === "boolean"
		? settingsObj.enableSourceValidation
		: false;
	const enableCaching = typeof settingsObj.enableCaching === "boolean"
		? settingsObj.enableCaching
		: true;
	const showAuditTrail = typeof settingsObj.showAuditTrail === "boolean"
		? settingsObj.showAuditTrail
		: true;
	const fallbackToSingleModel = typeof settingsObj.fallbackToSingleModel === "boolean"
		? settingsObj.fallbackToSingleModel
		: true;

	// Preserve privacy preferences
	let privacyPreferences: ConsensusPrivacyPreferences | undefined;
	if (settingsObj.privacyPreferences !== null &&
		settingsObj.privacyPreferences !== undefined &&
		typeof settingsObj.privacyPreferences === "object") {
		privacyPreferences = extractPrivacyPreferences(settingsObj.privacyPreferences as Record<string, unknown>);
	}

	// Check for legacy consensusModels array
	const legacyModels = settingsObj.consensusModels;
	if (!Array.isArray(legacyModels) || legacyModels.length === 0) {
		// No legacy models to migrate - return settings with empty models array
		const migratedSettings: MigratedConsensusSettings = {
			enabled,
			models: [],
			minModelsRequired,
			consensusThreshold,
			maxIterations,
			enableSourceValidation,
			enableCaching,
			showAuditTrail,
			fallbackToSingleModel,
			privacyPreferences,
		};

		return {
			settings: migratedSettings,
			success: true,
			warnings: [],  // Empty array or missing consensusModels is a valid state
			errors: [],
			extractedModels: [],
			modelsMigrated: 0,
		};
	}

	// Extract all consensus models
	const extractionResult = extractAllConsensusModels(legacyModels);

	// Collect warnings and errors
	warnings.push(...extractionResult.allWarnings);

	if (extractionResult.allErrors.length > 0) {
		warnings.push(`${extractionResult.failureCount} models failed to extract`);
	}

	// Create model references from extraction results
	const modelReferences: ConsensusModelReference[] = [];
	for (const result of extractionResult.extractionResults) {
		if (result.success && result.model) {
			modelReferences.push({
				modelId: result.model.id,
				weight: result.originalWeight,
				enabled: result.originalEnabled,
			});
		}
	}

	// Build migrated settings
	const migratedSettings: MigratedConsensusSettings = {
		enabled,
		models: modelReferences,
		minModelsRequired,
		consensusThreshold,
		maxIterations,
		enableSourceValidation,
		enableCaching,
		showAuditTrail,
		fallbackToSingleModel,
		privacyPreferences,
	};

	return {
		settings: migratedSettings,
		success: extractionResult.successCount > 0 || legacyModels.length === 0,
		warnings,
		errors: extractionResult.successCount === 0 && legacyModels.length > 0
			? ["All consensus models failed to extract"]
			: [],
		extractedModels: extractionResult.extractedModels,
		modelsMigrated: extractionResult.successCount,
	};
}

/**
 * Creates default migrated consensus settings.
 */
function createDefaultMigratedConsensusSettings(): MigratedConsensusSettings {
	return {
		enabled: false,
		models: [],
		minModelsRequired: 2,
		consensusThreshold: 0.66,
		maxIterations: 3,
		enableSourceValidation: false,
		enableCaching: true,
		showAuditTrail: true,
		fallbackToSingleModel: true,
	};
}

/**
 * Extracts privacy preferences from legacy settings.
 */
function extractPrivacyPreferences(
	prefs: Record<string, unknown>
): ConsensusPrivacyPreferences {
	return {
		privacyWarningAcknowledged:
			typeof prefs.privacyWarningAcknowledged === "boolean"
				? prefs.privacyWarningAcknowledged
				: false,
		privacyWarningAcknowledgedAt:
			typeof prefs.privacyWarningAcknowledgedAt === "number"
				? prefs.privacyWarningAcknowledgedAt
				: undefined,
		localOnlyMode:
			typeof prefs.localOnlyMode === "boolean"
				? prefs.localOnlyMode
				: false,
		approvedProviders:
			Array.isArray(prefs.approvedProviders)
				? prefs.approvedProviders.filter((p): p is Provider => typeof p === "string")
				: [],
	};
}

/**
 * Result of council settings migration.
 */
export interface CouncilSettingsMigrationResult {
	/** The migrated council settings with model references */
	settings: MigratedCouncilSettings;

	/** Whether migration was successful */
	success: boolean;

	/** Warning messages during migration */
	warnings: string[];

	/** Error messages if migration failed */
	errors: string[];

	/** Extracted model configurations to add to registry */
	extractedModels: ModelConfiguration[];

	/** Number of models successfully migrated */
	modelsMigrated: number;
}

/**
 * Migrated chair model configuration.
 * Uses configuredChairId to reference a model in the registry.
 */
export interface MigratedChairModelConfig {
	/** How to select chair: "configured" | "highest-ranked" | "rotating" */
	selectionStrategy: "configured" | "highest-ranked" | "rotating";

	/** Model ID in registry if strategy is "configured" */
	configuredChairId?: string;

	/** Weight given to chair model in final output */
	synthesisWeight: number;

	/** Index for rotating strategy (internal state) */
	rotationIndex?: number;
}

/**
 * Migrated council settings structure.
 * Contains the new model references instead of embedded configurations.
 */
export interface MigratedCouncilSettings {
	/** Enable/disable council mode */
	enabled: boolean;

	/** Model references (NEW - registry-based) */
	models: CouncilModelReference[];

	/** Minimum models required for council (preserved from original) */
	minModelsRequired: number;

	/** Chair model configuration (updated to use model references) */
	chairModel: MigratedChairModelConfig;

	/** Enable critique phase (preserved from original) */
	enableCritique: boolean;

	/** Enable ranking phase (preserved from original) */
	enableRanking: boolean;

	/** Show debate transparency (preserved from original) */
	showDebateTrail: boolean;

	/** Fallback to single model (preserved from original) */
	fallbackToSingleModel: boolean;

	/** Cache council results (preserved from original) */
	enableCaching: boolean;

	/** Timeout per phase in milliseconds (preserved from original) */
	phaseTimeouts: {
		parallelQuery: number;
		critique: number;
		ranking: number;
		synthesis: number;
	};
}

/**
 * Migrates council settings from the legacy format to the new reference-based format.
 *
 * This function:
 * 1. Extracts all legacy council model configs to ModelConfiguration
 * 2. Creates CouncilModelReference objects pointing to the extracted models
 * 3. Updates chairModel.configuredChairId to reference a model in the registry
 * 4. Preserves all non-model settings (critique, ranking, timeouts, etc.)
 *
 * The extracted models should be deduplicated with models from other sources
 * (main, consensus) before adding to the registry.
 *
 * @param oldSettings - The legacy council settings with embedded model configurations
 * @returns Migration result with migrated settings and extracted models
 *
 * Requirements: 6.3, 6.4
 */
export function migrateCouncilSettings(
	oldSettings: unknown
): CouncilSettingsMigrationResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Validate input
	if (oldSettings === null || oldSettings === undefined || typeof oldSettings !== "object") {
		return {
			settings: createDefaultMigratedCouncilSettings(),
			success: false,
			warnings: [],
			errors: ["Council settings is null, undefined, or not an object"],
			extractedModels: [],
			modelsMigrated: 0,
		};
	}

	const settingsObj = oldSettings as Record<string, unknown>;

	// Extract non-model settings (preserve all of these)
	const enabled = typeof settingsObj.enabled === "boolean" ? settingsObj.enabled : false;
	const minModelsRequired = typeof settingsObj.minModelsRequired === "number"
		? settingsObj.minModelsRequired
		: 2;
	const enableCritique = typeof settingsObj.enableCritique === "boolean"
		? settingsObj.enableCritique
		: true;
	const enableRanking = typeof settingsObj.enableRanking === "boolean"
		? settingsObj.enableRanking
		: true;
	const showDebateTrail = typeof settingsObj.showDebateTrail === "boolean"
		? settingsObj.showDebateTrail
		: true;
	const fallbackToSingleModel = typeof settingsObj.fallbackToSingleModel === "boolean"
		? settingsObj.fallbackToSingleModel
		: true;
	const enableCaching = typeof settingsObj.enableCaching === "boolean"
		? settingsObj.enableCaching
		: true;

	// Extract phase timeouts (preserve from original)
	const phaseTimeouts = extractPhaseTimeouts(settingsObj.phaseTimeouts);

	// Extract legacy chair model configuration
	const oldChairModel = settingsObj.chairModel as Record<string, unknown> | null | undefined;

	// Check for legacy councilModels array
	const legacyModels = settingsObj.councilModels;
	if (!Array.isArray(legacyModels) || legacyModels.length === 0) {
		// No legacy models to migrate - return settings with empty models array
		const migratedSettings: MigratedCouncilSettings = {
			enabled,
			models: [],
			minModelsRequired,
			chairModel: extractChairModelConfig(oldChairModel, null),
			enableCritique,
			enableRanking,
			showDebateTrail,
			fallbackToSingleModel,
			enableCaching,
			phaseTimeouts,
		};

		return {
			settings: migratedSettings,
			success: true,
			warnings: [],  // Empty array or missing councilModels is a valid state
			errors: [],
			extractedModels: [],
			modelsMigrated: 0,
		};
	}

	// Extract all council models
	const extractionResult = extractAllCouncilModels(legacyModels);

	// Collect warnings and errors
	warnings.push(...extractionResult.allWarnings);

	if (extractionResult.allErrors.length > 0) {
		warnings.push(`${extractionResult.failureCount} models failed to extract`);
	}

	// Create model references from extraction results
	const modelReferences: CouncilModelReference[] = [];
	for (const result of extractionResult.extractionResults) {
		if (result.success && result.model) {
			modelReferences.push({
				modelId: result.model.id,
				weight: result.originalWeight,
				enabled: result.originalEnabled,
			});
		}
	}

	// Handle chair model migration
	let chairModel: MigratedChairModelConfig;

	if (oldChairModel && typeof oldChairModel === "object") {
		// Extract chair model configuration and update configuredChairId
		const chairExtractionResult = extractChairModel(oldChairModel, legacyModels);

		warnings.push(...chairExtractionResult.warnings);
		errors.push(...chairExtractionResult.errors);

		// If chair uses "configured" strategy, map the old ID to the new extracted model ID
		let newConfiguredChairId: string | undefined;

		if (chairExtractionResult.selectionStrategy === "configured" &&
			chairExtractionResult.configuredChairId) {
			// Find the extracted model that corresponds to the old chair ID
			newConfiguredChairId = mapChairIdToNewModelId(
				chairExtractionResult.configuredChairId,
				extractionResult.extractionResults
			) || undefined;

			if (!newConfiguredChairId) {
				warnings.push(
					`Could not map configured chair ID "${chairExtractionResult.configuredChairId}" to a migrated model. ` +
					`Chair model may need to be reconfigured.`
				);
			}
		}

		chairModel = extractChairModelConfig(oldChairModel, newConfiguredChairId || null);
	} else {
		chairModel = extractChairModelConfig(null, null);
	}

	// Build migrated settings
	const migratedSettings: MigratedCouncilSettings = {
		enabled,
		models: modelReferences,
		minModelsRequired,
		chairModel,
		enableCritique,
		enableRanking,
		showDebateTrail,
		fallbackToSingleModel,
		enableCaching,
		phaseTimeouts,
	};

	return {
		settings: migratedSettings,
		success: extractionResult.successCount > 0 || legacyModels.length === 0,
		warnings,
		errors: extractionResult.successCount === 0 && legacyModels.length > 0
			? ["All council models failed to extract"]
			: errors,
		extractedModels: extractionResult.extractedModels,
		modelsMigrated: extractionResult.successCount,
	};
}

/**
 * Creates default migrated council settings.
 */
function createDefaultMigratedCouncilSettings(): MigratedCouncilSettings {
	return {
		enabled: false,
		models: [],
		minModelsRequired: 2,
		chairModel: {
			selectionStrategy: "highest-ranked",
			synthesisWeight: 1.0,
		},
		enableCritique: true,
		enableRanking: true,
		showDebateTrail: true,
		fallbackToSingleModel: true,
		enableCaching: true,
		phaseTimeouts: {
			parallelQuery: 60000,
			critique: 60000,
			ranking: 60000,
			synthesis: 60000,
		},
	};
}

/**
 * Extracts phase timeouts from legacy settings.
 */
function extractPhaseTimeouts(
	timeouts: unknown
): MigratedCouncilSettings["phaseTimeouts"] {
	const defaults = {
		parallelQuery: 60000,
		critique: 60000,
		ranking: 60000,
		synthesis: 60000,
	};

	if (timeouts === null || timeouts === undefined || typeof timeouts !== "object") {
		return defaults;
	}

	const t = timeouts as Record<string, unknown>;

	return {
		parallelQuery: typeof t.parallelQuery === "number" ? t.parallelQuery : defaults.parallelQuery,
		critique: typeof t.critique === "number" ? t.critique : defaults.critique,
		ranking: typeof t.ranking === "number" ? t.ranking : defaults.ranking,
		synthesis: typeof t.synthesis === "number" ? t.synthesis : defaults.synthesis,
	};
}

/**
 * Extracts chair model configuration from legacy settings.
 *
 * @param oldChairModel - The legacy chair model configuration
 * @param newConfiguredChairId - The new model ID to use for configured strategy (if applicable)
 * @returns Migrated chair model configuration
 */
function extractChairModelConfig(
	oldChairModel: Record<string, unknown> | null | undefined,
	newConfiguredChairId: string | null
): MigratedChairModelConfig {
	const defaults: MigratedChairModelConfig = {
		selectionStrategy: "highest-ranked",
		synthesisWeight: 1.0,
	};

	if (oldChairModel === null || oldChairModel === undefined || typeof oldChairModel !== "object") {
		return defaults;
	}

	// Extract selection strategy
	const selectionStrategy = oldChairModel.selectionStrategy as string | undefined;
	const validStrategies = ["configured", "highest-ranked", "rotating"];
	const strategy = validStrategies.includes(selectionStrategy || "")
		? (selectionStrategy as "configured" | "highest-ranked" | "rotating")
		: "highest-ranked";

	// Extract synthesis weight
	const synthesisWeight = typeof oldChairModel.synthesisWeight === "number"
		? oldChairModel.synthesisWeight
		: 1.0;

	// Extract rotation index (internal state)
	const rotationIndex = typeof oldChairModel.rotationIndex === "number"
		? oldChairModel.rotationIndex
		: undefined;

	// Build result
	const result: MigratedChairModelConfig = {
		selectionStrategy: strategy,
		synthesisWeight,
	};

	// Only set configuredChairId if strategy is "configured"
	if (strategy === "configured" && newConfiguredChairId) {
		result.configuredChairId = newConfiguredChairId;
	}

	// Preserve rotation index if applicable
	if (strategy === "rotating" && rotationIndex !== undefined) {
		result.rotationIndex = rotationIndex;
	}

	return result;
}

/**
 * Applies ID mapping to update model references after deduplication.
 *
 * This function should be called after deduplicating models from all sources
 * (main, consensus, council) to update the references to point to the
 * canonical (deduplicated) model IDs.
 *
 * @param consensusMigration - The result from migrateConsensusSettings
 * @param idMapping - Map from original model IDs to canonical model IDs
 * @returns Updated consensus settings with canonical model references
 *
 * Requirements: 6.3, 6.4
 */
export function applyDeduplicationToConsensusSettings(
	consensusMigration: ConsensusSettingsMigrationResult,
	idMapping: Map<string, string>
): MigratedConsensusSettings {
	const settings = { ...consensusMigration.settings };

	// Update model references to use canonical IDs
	const seenModelIds = new Set<string>();
	const updatedModels: ConsensusModelReference[] = [];

	for (const ref of settings.models) {
		const canonicalId = idMapping.get(ref.modelId) || ref.modelId;

		// Skip duplicates (same canonical ID)
		if (seenModelIds.has(canonicalId)) {
			continue;
		}
		seenModelIds.add(canonicalId);

		updatedModels.push({
			modelId: canonicalId,
			weight: ref.weight,
			enabled: ref.enabled,
		});
	}

	settings.models = updatedModels;

	return settings;
}

/**
 * Applies ID mapping to update model references after deduplication.
 *
 * This function should be called after deduplicating models from all sources
 * (main, consensus, council) to update the references to point to the
 * canonical (deduplicated) model IDs.
 *
 * @param councilMigration - The result from migrateCouncilSettings
 * @param idMapping - Map from original model IDs to canonical model IDs
 * @returns Updated council settings with canonical model references
 *
 * Requirements: 6.3, 6.4
 */
export function applyDeduplicationToCouncilSettings(
	councilMigration: CouncilSettingsMigrationResult,
	idMapping: Map<string, string>
): MigratedCouncilSettings {
	const settings = { ...councilMigration.settings };

	// Update model references to use canonical IDs
	const seenModelIds = new Set<string>();
	const updatedModels: CouncilModelReference[] = [];

	for (const ref of settings.models) {
		const canonicalId = idMapping.get(ref.modelId) || ref.modelId;

		// Skip duplicates (same canonical ID)
		if (seenModelIds.has(canonicalId)) {
			continue;
		}
		seenModelIds.add(canonicalId);

		updatedModels.push({
			modelId: canonicalId,
			weight: ref.weight,
			enabled: ref.enabled,
		});
	}

	settings.models = updatedModels;

	// Update chair model configuredChairId if using "configured" strategy
	if (settings.chairModel.selectionStrategy === "configured" &&
		settings.chairModel.configuredChairId) {
		const canonicalChairId = idMapping.get(settings.chairModel.configuredChairId);
		if (canonicalChairId) {
			settings.chairModel = {
				...settings.chairModel,
				configuredChairId: canonicalChairId,
			};
		}
	}

	return settings;
}

/**
 * Result of the full settings migration process.
 */
export interface FullMigrationResult {
	/** Whether migration was performed */
	migrated: boolean;

	/** Whether migration was successful (or no migration was needed) */
	success: boolean;

	/** The migrated settings object (or original if no migration needed) */
	settings: Record<string, unknown>;

	/** Detailed reasons why migration was performed */
	migrationReasons: MigrationReason[];

	/** Warning messages from the migration process */
	warnings: string[];

	/** Error messages if migration failed */
	errors: string[];

	/** Statistics about the migration */
	stats: MigrationStats;
}

/**
 * Statistics about the migration process.
 */
export interface MigrationStats {
	/** Number of models extracted from main settings */
	mainModelsExtracted: number;

	/** Number of models extracted from consensus settings */
	consensusModelsExtracted: number;

	/** Number of models extracted from council settings */
	councilModelsExtracted: number;

	/** Total models before deduplication */
	totalModelsBeforeDedup: number;

	/** Total models after deduplication */
	totalModelsAfterDedup: number;

	/** Number of duplicate models removed */
	duplicatesRemoved: number;
}

/**
 * Creates empty migration statistics.
 */
function createEmptyMigrationStats(): MigrationStats {
	return {
		mainModelsExtracted: 0,
		consensusModelsExtracted: 0,
		councilModelsExtracted: 0,
		totalModelsBeforeDedup: 0,
		totalModelsAfterDedup: 0,
		duplicatesRemoved: 0,
	};
}

/**
 * Performs a full migration of settings from the legacy format to the new
 * centralized model registry format.
 *
 * This function orchestrates the entire migration process:
 * 1. Detects if migration is needed
 * 2. Extracts models from main, consensus, and council settings
 * 3. Deduplicates models across all sources
 * 4. Creates the model registry
 * 5. Updates consensus and council settings to use model references
 * 6. Returns the migrated settings
 *
 * If migration is not needed, returns the original settings unchanged.
 * If migration fails, returns an error result with details.
 *
 * @param settings - The settings object to migrate (typically from loadData())
 * @returns Full migration result with migrated settings or error details
 *
 * Requirements: 6.2, 6.4, 6.5
 */
export function migrateSettings(settings: unknown): FullMigrationResult {
	const warnings: string[] = [];
	const errors: string[] = [];
	const stats = createEmptyMigrationStats();

	// Handle null/undefined settings - no migration needed, use empty object
	if (settings === null || settings === undefined) {
		return {
			migrated: false,
			success: true,
			settings: {},
			migrationReasons: [],
			warnings: [],
			errors: [],
			stats,
		};
	}

	// Check if migration is needed
	const detection = detectMigrationNeeds(settings);

	if (!detection.needsMigration) {
		// No migration needed - return original settings
		return {
			migrated: false,
			success: true,
			settings: settings as Record<string, unknown>,
			migrationReasons: [],
			warnings: [],
			errors: [],
			stats,
		};
	}

	// Migration is needed
	const settingsObj = settings as Record<string, unknown>;

	try {
		// Collect all models with their sources for deduplication tracking
		const modelsWithSources: ModelWithSource[] = [];

		// Step 1: Extract main model
		const mainModelResult = extractMainModel(settingsObj);
		if (mainModelResult.success && mainModelResult.model) {
			modelsWithSources.push({
				model: mainModelResult.model,
				source: "main",
			});
			stats.mainModelsExtracted = 1;
		}
		warnings.push(...mainModelResult.warnings);
		if (!mainModelResult.success && mainModelResult.errors.length > 0) {
			// Main model extraction failed but this is not fatal
			// User might not have had a main model configured - errors are captured in warnings
		}

		// Step 2: Extract consensus models
		let consensusMigration: ConsensusSettingsMigrationResult | null = null;
		if (settingsObj.consensusSettings) {
			consensusMigration = migrateConsensusSettings(settingsObj.consensusSettings);
			for (const model of consensusMigration.extractedModels) {
				// Find the corresponding extraction result to get original properties
				const extractionResult = consensusMigration.settings.models.find(
					ref => ref.modelId === model.id
				);
				modelsWithSources.push({
					model,
					source: "consensus",
					originalWeight: extractionResult?.weight,
					originalEnabled: extractionResult?.enabled,
					originalId: model.id,
				});
			}
			stats.consensusModelsExtracted = consensusMigration.modelsMigrated;
			warnings.push(...consensusMigration.warnings);
		}

		// Step 3: Extract council models
		let councilMigration: CouncilSettingsMigrationResult | null = null;
		if (settingsObj.councilSettings) {
			councilMigration = migrateCouncilSettings(settingsObj.councilSettings);
			for (const model of councilMigration.extractedModels) {
				// Find the corresponding extraction result to get original properties
				const extractionResult = councilMigration.settings.models.find(
					ref => ref.modelId === model.id
				);
				modelsWithSources.push({
					model,
					source: "council",
					originalWeight: extractionResult?.weight,
					originalEnabled: extractionResult?.enabled,
					originalId: model.id,
				});
			}
			stats.councilModelsExtracted = councilMigration.modelsMigrated;
			warnings.push(...councilMigration.warnings);
		}

		// Update statistics before deduplication
		stats.totalModelsBeforeDedup = modelsWithSources.length;

		// Step 4: Deduplicate models
		const deduplicationResult = deduplicateModelsWithSources(modelsWithSources);
		stats.totalModelsAfterDedup = deduplicationResult.deduplicatedModels.length;
		stats.duplicatesRemoved = deduplicationResult.stats.duplicatesRemoved;

		// Deduplication merges are tracked in stats.duplicatesRemoved

		// Step 5: Build the model registry
		const modelRegistry: ModelRegistry = {
			models: {},
			version: 1,
		};

		for (const model of deduplicationResult.deduplicatedModels) {
			modelRegistry.models[model.id] = model;
		}

		// Step 6: Determine the active model ID (from main model)
		let activeModelId: string | null = null;
		if (mainModelResult.success && mainModelResult.model) {
			// Map to deduplicated ID
			activeModelId = deduplicationResult.idMapping.get(mainModelResult.model.id) ||
				mainModelResult.model.id;
		}

		// Step 7: Update consensus settings with deduplicated references
		let finalConsensusSettings = settingsObj.consensusSettings;
		if (consensusMigration) {
			finalConsensusSettings = applyDeduplicationToConsensusSettings(
				consensusMigration,
				deduplicationResult.idMapping
			);
		}

		// Step 8: Update council settings with deduplicated references
		let finalCouncilSettings = settingsObj.councilSettings;
		if (councilMigration) {
			finalCouncilSettings = applyDeduplicationToCouncilSettings(
				councilMigration,
				deduplicationResult.idMapping
			);
		}

		// Step 9: Build the final migrated settings
		const migratedSettings: Record<string, unknown> = {
			...settingsObj,
			modelRegistry,
			activeModelId,
		};

		// Update consensus settings if migrated
		if (finalConsensusSettings) {
			migratedSettings.consensusSettings = finalConsensusSettings;
		}

		// Update council settings if migrated
		if (finalCouncilSettings) {
			migratedSettings.councilSettings = finalCouncilSettings;
		}

		return {
			migrated: true,
			success: true,
			settings: migratedSettings,
			migrationReasons: detection.reasons,
			warnings,
			errors: [],
			stats,
		};

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		errors.push(`Migration failed: ${errorMessage}`);

		return {
			migrated: false,
			success: false,
			settings: settingsObj,
			migrationReasons: detection.reasons,
			warnings,
			errors,
			stats,
		};
	}
}

/**
 * Migrates settings and applies defaults for missing fields.
 *
 * This is a convenience function that combines migration with default value
 * application. If migration fails, it falls back to default settings while
 * preserving any valid fields from the original settings.
 *
 * @param settings - The settings object to migrate
 * @param defaults - Default settings to use for missing fields or on failure
 * @returns Migrated settings with defaults applied
 *
 * Requirements: 6.4, 6.5
 */
export function migrateSettingsWithDefaults(
	settings: unknown,
	defaults: Record<string, unknown>
): { settings: Record<string, unknown>; migrationResult: FullMigrationResult } {
	const migrationResult = migrateSettings(settings);

	if (migrationResult.success) {
		// Merge with defaults (defaults first, then migrated settings)
		const mergedSettings = {
			...defaults,
			...migrationResult.settings,
		};

		return {
			settings: mergedSettings,
			migrationResult,
		};
	}

	// Migration failed - fall back to defaults but preserve any valid fields
	// Errors are captured in migrationResult.errors for caller to handle

	// Try to preserve fields that don't need migration
	const settingsObj = settings && typeof settings === "object" ? settings as Record<string, unknown> : {};

	const fallbackSettings = {
		...defaults,
	};

	// Preserve non-model-related fields if they exist
	const preserveFields = [
		"language",
		"numberOfQuestions",
		"quizFolder",
		"flashcardSettings",
		// Add other non-model fields that should be preserved
	];

	for (const field of preserveFields) {
		if (field in settingsObj && settingsObj[field] !== undefined) {
			fallbackSettings[field] = settingsObj[field];
		}
	}

	return {
		settings: fallbackSettings,
		migrationResult,
	};
}

/**
 * Options for migration with existing registry support.
 */
export interface MigrateWithRegistryOptions {
	/** Existing registry to check for duplicates */
	existingRegistry?: ModelRegistry;

	/** Default settings to merge with migrated settings */
	defaults?: Record<string, unknown>;
}

/**
 * Extended migration result with registry deduplication info.
 */
export interface MigrateWithRegistryResult extends FullMigrationResult {
	/** Number of models that matched existing registry entries */
	matchedExistingModels: number;

	/** Number of new models added to registry */
	newModelsAdded: number;

	/** Details about which models were reused vs created */
	registryMatchDetails: Array<{
		originalId: string;
		originalDisplayName: string;
		matched: boolean;
		resultingId: string;
		matchedDisplayName?: string;
	}>;
}

/**
 * Migrates settings with duplicate detection against an existing registry.
 *
 * This is the recommended migration function when you may have an existing
 * model registry and want to avoid creating duplicate entries. It:
 *
 * 1. Extracts models from legacy settings (main, consensus, council)
 * 2. Deduplicates models within the extracted set
 * 3. Checks extracted models against the existing registry
 * 4. Reuses existing registry entries where configurations match
 * 5. Only adds truly new models to the registry
 *
 * This ensures that if a user has already manually configured a model in
 * the registry that matches a legacy model configuration, the migration
 * will reuse the existing entry rather than creating a duplicate.
 *
 * @param settings - The settings object to migrate
 * @param options - Options including existing registry and defaults
 * @returns Extended migration result with registry match details
 *
 * Requirements: 1.4, 7.5
 */
export function migrateSettingsWithRegistryCheck(
	settings: unknown,
	options: MigrateWithRegistryOptions = {}
): MigrateWithRegistryResult {
	const { existingRegistry, defaults } = options;

	// First, run the standard migration
	const baseMigrationResult = defaults
		? migrateSettingsWithDefaults(settings, defaults).migrationResult
		: migrateSettings(settings);

	// Initialize extended result
	const extendedResult: MigrateWithRegistryResult = {
		...baseMigrationResult,
		matchedExistingModels: 0,
		newModelsAdded: 0,
		registryMatchDetails: [],
	};

	// If migration wasn't needed or failed, return early
	if (!baseMigrationResult.migrated || !baseMigrationResult.success) {
		return extendedResult;
	}

	// If no existing registry provided, all models are new
	if (!existingRegistry || Object.keys(existingRegistry.models).length === 0) {
		const registry = baseMigrationResult.settings.modelRegistry as ModelRegistry;
		if (registry) {
			extendedResult.newModelsAdded = Object.keys(registry.models).length;
			// Populate match details showing all as new
			for (const model of Object.values(registry.models)) {
				extendedResult.registryMatchDetails.push({
					originalId: model.id,
					originalDisplayName: model.displayName,
					matched: false,
					resultingId: model.id,
				});
			}
		}
		return extendedResult;
	}

	// We have an existing registry - check for duplicates
	const migratedSettings = baseMigrationResult.settings;
	const migratedRegistry = migratedSettings.modelRegistry as ModelRegistry;

	if (!migratedRegistry) {
		return extendedResult;
	}

	// Process the migrated models against the existing registry
	const extractedModels = Object.values(migratedRegistry.models);
	const matchResult = processModelsAgainstRegistry(extractedModels, existingRegistry);

	// Update statistics
	extendedResult.matchedExistingModels = matchResult.stats.matchedExisting;
	extendedResult.newModelsAdded = matchResult.stats.newModels;
	extendedResult.registryMatchDetails = matchResult.matchDetails;

	// Build the final registry by merging existing with new
	const finalRegistry: ModelRegistry = {
		...existingRegistry,
		models: { ...existingRegistry.models },
	};

	// Add only the new models
	for (const newModel of matchResult.modelsToAdd) {
		finalRegistry.models[newModel.id] = newModel;
	}

	// Update the settings with the merged registry
	migratedSettings.modelRegistry = finalRegistry;

	// Update activeModelId if it was remapped
	if (migratedSettings.activeModelId) {
		const remappedId = matchResult.idRemapping.get(migratedSettings.activeModelId as string);
		if (remappedId && remappedId !== migratedSettings.activeModelId) {
			migratedSettings.activeModelId = remappedId;
		}
	}

	// Update consensus model references if remapped
	if (migratedSettings.consensusSettings) {
		const consensus = migratedSettings.consensusSettings as Record<string, unknown>;
		if (Array.isArray(consensus.models)) {
			consensus.models = (consensus.models as ConsensusModelReference[]).map((ref) => {
				const remappedId = matchResult.idRemapping.get(ref.modelId);
				return remappedId && remappedId !== ref.modelId
					? { ...ref, modelId: remappedId }
					: ref;
			});
		}
	}

	// Update council model references if remapped
	if (migratedSettings.councilSettings) {
		const council = migratedSettings.councilSettings as Record<string, unknown>;
		if (Array.isArray(council.models)) {
			council.models = (council.models as CouncilModelReference[]).map((ref) => {
				const remappedId = matchResult.idRemapping.get(ref.modelId);
				return remappedId && remappedId !== ref.modelId
					? { ...ref, modelId: remappedId }
					: ref;
			});
		}

		// Update chair model reference if configured
		if (council.chairModel && typeof council.chairModel === "object") {
			const chairConfig = council.chairModel as Record<string, unknown>;
			if (chairConfig.configuredChairId) {
				const remappedId = matchResult.idRemapping.get(chairConfig.configuredChairId as string);
				if (remappedId && remappedId !== chairConfig.configuredChairId) {
					chairConfig.configuredChairId = remappedId;
				}
			}
		}
	}

	// Add warning if duplicates were found
	if (matchResult.stats.matchedExisting > 0) {
		extendedResult.warnings.push(
			`Found ${matchResult.stats.matchedExisting} model(s) that match existing registry entries. ` +
			`Reusing existing entries to avoid duplicates.`
		);
	}

	return extendedResult;
}

/**
 * Settings version constants for migration tracking.
 *
 * Version history:
 * - LEGACY (0): No version field, has legacy provider/model fields at root level
 * - REGISTRY_V1 (1): Has modelRegistry, may still have legacy fields
 * - REGISTRY_V2 (2): Fully migrated, legacy fields removed
 *
 * Requirements: 7.3
 */
export const SETTINGS_VERSION = {
	/** No version field, has legacy fields */
	LEGACY: 0,

	/** Has modelRegistry, may have legacy fields */
	REGISTRY_V1: 1,

	/** Fully migrated, legacy fields removed */
	REGISTRY_V2: 2,
} as const;

/**
 * Current settings version for new/migrated settings.
 */
export const CURRENT_SETTINGS_VERSION = SETTINGS_VERSION.REGISTRY_V2;

/**
 * Gets the current settings version from settings object.
 *
 * @param settings - The settings object to check
 * @returns The version number, or LEGACY (0) if not present
 */
export function getSettingsVersion(settings: unknown): number {
	if (settings === null || settings === undefined || typeof settings !== "object") {
		return SETTINGS_VERSION.LEGACY;
	}

	const settingsObj = settings as Record<string, unknown>;

	if ("settingsVersion" in settingsObj && typeof settingsObj.settingsVersion === "number") {
		return settingsObj.settingsVersion;
	}

	// Check for presence of modelRegistry to distinguish REGISTRY_V1 from LEGACY
	if ("modelRegistry" in settingsObj && isModelRegistry(settingsObj.modelRegistry)) {
		return SETTINGS_VERSION.REGISTRY_V1;
	}

	return SETTINGS_VERSION.LEGACY;
}

/**
 * List of legacy fields that should be removed after migration.
 *
 * These fields were part of the old "direct-provider" configuration system
 * where model settings were stored directly on the QuizSettings object.
 *
 * Requirements: 1.1, 1.3, 7.7
 */
export const LEGACY_ROOT_FIELDS = [
	"provider",
	"openAIApiKey",
	"openAIBaseURL",
	"openAITextGenModel",
	"openAIEmbeddingModel",
	"ollamaBaseURL",
	"ollamaTextGenModel",
	"ollamaEmbeddingModel",
] as const;

/**
 * Legacy fields in consensusSettings that should be removed.
 */
export const LEGACY_CONSENSUS_FIELDS = [
	"consensusModels",
] as const;

/**
 * Legacy fields in councilSettings that should be removed.
 */
export const LEGACY_COUNCIL_FIELDS = [
	"councilModels",
] as const;

/**
 * Result of legacy field removal operation.
 *
 * Requirements: 7.7
 */
export interface LegacyFieldRemovalResult {
	/** Whether any fields were removed */
	fieldsRemoved: boolean;

	/** List of field names that were removed */
	removedFields: string[];

	/** The settings object after removal (mutated in place) */
	settings: Record<string, unknown>;
}

/**
 * Removes legacy fields from the settings object after successful migration.
 *
 * This function removes the deprecated direct-provider configuration fields
 * that are no longer needed after migration to the Model Registry system.
 *
 * Fields removed from root:
 * - provider
 * - openAIApiKey, openAIBaseURL, openAITextGenModel, openAIEmbeddingModel
 * - ollamaBaseURL, ollamaTextGenModel, ollamaEmbeddingModel
 *
 * Fields removed from consensusSettings:
 * - consensusModels (legacy embedded model configs)
 *
 * Fields removed from councilSettings:
 * - councilModels (legacy embedded model configs)
 *
 * @param settings - The settings object to modify (mutated in place)
 * @returns Object containing list of removed fields and the modified settings
 *
 * Requirements: 1.1, 1.3, 7.7
 */
export function removeLegacyFields(settings: Record<string, unknown>): LegacyFieldRemovalResult {
	const removedFields: string[] = [];

	// Remove legacy root-level fields
	for (const field of LEGACY_ROOT_FIELDS) {
		if (field in settings) {
			delete settings[field];
			removedFields.push(field);
		}
	}

	// Remove legacy consensus fields
	if (settings.consensusSettings && typeof settings.consensusSettings === "object") {
		const consensusSettings = settings.consensusSettings as Record<string, unknown>;
		for (const field of LEGACY_CONSENSUS_FIELDS) {
			if (field in consensusSettings) {
				delete consensusSettings[field];
				removedFields.push(`consensusSettings.${field}`);
			}
		}
	}

	// Remove legacy council fields
	if (settings.councilSettings && typeof settings.councilSettings === "object") {
		const councilSettings = settings.councilSettings as Record<string, unknown>;
		for (const field of LEGACY_COUNCIL_FIELDS) {
			if (field in councilSettings) {
				delete councilSettings[field];
				removedFields.push(`councilSettings.${field}`);
			}
		}
	}

	return {
		fieldsRemoved: removedFields.length > 0,
		removedFields,
		settings,
	};
}

/**
 * Options for generating migration display names.
 */
export interface MigrationDisplayNameOptions {
	/** Optional source context ("main", "consensus", "council") */
	source?: "main" | "consensus" | "council";
	/** Optional index for multiple models of the same type (e.g., "Consensus OpenAI 2") */
	index?: number;
}

/**
 * Generates a meaningful display name for a migrated model.
 *
 * The display name format follows these patterns:
 * - For models with custom base URL: "{Source} {Provider} - {hostname}" (e.g., "OpenAI - lmstudio.local")
 * - For models with default base URL: "{Source} {Provider} (migrated)" (e.g., "Main OpenAI (migrated)")
 * - With index: "{Source} {Provider} {index}" or "{Source} {Provider} - {hostname} {index}"
 *   (e.g., "Consensus OpenAI 2", "Consensus OpenAI - lmstudio.local 2")
 *
 * Examples:
 * - generateMigrationDisplayName(OPENAI, "https://api.openai.com/v1") → "OpenAI (migrated)"
 * - generateMigrationDisplayName(OPENAI, "https://api.openai.com/v1", { source: "main" }) → "Main OpenAI (migrated)"
 * - generateMigrationDisplayName(OPENAI, "https://lmstudio.local:1234/v1") → "OpenAI - lmstudio.local"
 * - generateMigrationDisplayName(OLLAMA, "http://localhost:11434", { source: "consensus", index: 2 }) → "Consensus Ollama 2 (migrated)"
 * - generateMigrationDisplayName(OPENAI, "https://custom.api.com/v1", { source: "council", index: 1 }) → "Council OpenAI 1 - custom.api.com"
 *
 * @param provider - The provider type (OpenAI or Ollama)
 * @param baseUrl - The base URL of the provider
 * @param options - Optional configuration for source context and indexing
 * @returns A meaningful display name for the model
 *
 * Requirements: 7.6
 */
export function generateMigrationDisplayName(
	provider: Provider,
	baseUrl: string,
	options?: MigrationDisplayNameOptions | "main" | "consensus" | "council"
): string {
	// Handle backward compatibility with string source parameter
	const normalizedOptions: MigrationDisplayNameOptions =
		typeof options === "string" ? { source: options } : options ?? {};

	const { source, index } = normalizedOptions;

	const providerName = provider === Provider.OPENAI ? "OpenAI" : "Ollama";
	const sourcePrefix = source ? capitalizeFirst(source) + " " : "";
	const indexSuffix = index !== undefined ? ` ${index}` : "";

	// Extract hostname from base URL for custom endpoints
	const hostname = extractHostname(baseUrl);

	// Check if using default base URLs
	const isDefaultUrl = isDefaultBaseUrl(provider, baseUrl, hostname);

	if (isDefaultUrl) {
		return `${sourcePrefix}${providerName}${indexSuffix} (migrated)`;
	}

	// For custom base URLs, include the hostname
	if (hostname && hostname !== "localhost") {
		return `${sourcePrefix}${providerName}${indexSuffix} - ${hostname}`;
	}

	return `${sourcePrefix}${providerName}${indexSuffix} (migrated)`;
}

/**
 * Checks if a base URL is a default/standard URL for the given provider.
 *
 * @param provider - The provider type
 * @param baseUrl - The base URL to check
 * @param hostname - Pre-extracted hostname (optional, for efficiency)
 * @returns true if the URL is a default URL for the provider
 */
function isDefaultBaseUrl(provider: Provider, baseUrl: string, hostname?: string): boolean {
	const extractedHostname = hostname ?? extractHostname(baseUrl);

	if (provider === Provider.OPENAI) {
		return (
			baseUrl === DEFAULT_OPENAI_BASE_URL ||
			baseUrl === "https://api.openai.com/v1" ||
			baseUrl === "https://api.openai.com" ||
			extractedHostname === "api.openai.com"
		);
	}

	if (provider === Provider.OLLAMA) {
		return (
			baseUrl === DEFAULT_OLLAMA_BASE_URL ||
			baseUrl === "http://localhost:11434" ||
			extractedHostname === "localhost" ||
			extractedHostname === "127.0.0.1"
		);
	}

	return false;
}

/**
 * Extracts the hostname from a URL string.
 *
 * @param url - The URL to extract hostname from
 * @returns The hostname, or empty string if extraction fails
 */
function extractHostname(url: string): string {
	if (!url) {
		return "";
	}

	try {
		const urlObj = new URL(url);
		return urlObj.hostname;
	} catch {
		// If URL parsing fails, try a simple regex extraction
		const match = url.match(/^(?:https?:\/\/)?([^/:]+)/);
		return match ? match[1] : "";
	}
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalizeFirst(str: string): string {
	if (!str) return str;
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Result of the complete migrateToRegistry operation.
 *
 * This extends FullMigrationResult with additional information about
 * backup creation and legacy field removal.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.5, 2.6, 7.1, 7.3, 7.5, 7.6, 7.7
 */
export interface MigrationResult {
	/** Whether the migration operation was successful */
	success: boolean;

	/** The migrated settings object (or original if migration failed or wasn't needed) */
	settings: Record<string, unknown>;

	/** Whether migration was actually performed (false if not needed) */
	migrated: boolean;

	/** Backup information if a backup was created */
	backup?: {
		/** Path to the backup file */
		path: string;
		/** Timestamp when backup was created */
		timestamp: number;
	};

	/** Number of models migrated to the registry */
	migratedModels: number;

	/** Number of consensus model references created */
	migratedConsensusRefs: number;

	/** Number of council model references created */
	migratedCouncilRefs: number;

	/** List of legacy fields that were removed */
	removedLegacyFields: string[];

	/** Error messages if migration failed */
	errors: string[];

	/** Warning messages from the migration process */
	warnings: string[];
}

/**
 * Options for the migrateToRegistry function.
 */
export interface MigrateToRegistryOptions {
	/** Skip creating a backup before migration (not recommended) */
	skipBackup?: boolean;

	/** Skip removing legacy fields after migration */
	skipLegacyFieldRemoval?: boolean;

	/** Plugin version for backup metadata */
	pluginVersion?: string;
}

/**
 * Performs complete migration from legacy settings to the Model Registry system.
 *
 * This function orchestrates the full migration process:
 * 1. **Create backup**: Saves current settings before modification (unless skipped)
 * 2. **Migrate main model**: Converts legacy provider fields to registry entry
 * 3. **Convert consensusModels**: Migrates to models[] references
 * 4. **Convert councilModels**: Migrates to models[] references
 * 5. **Remove legacy fields**: Cleans up deprecated fields
 * 6. **Update settings version**: Sets to REGISTRY_V2
 *
 * If migration fails at any step, the backup can be used to restore settings.
 *
 * @param settings - The settings object to migrate
 * @param app - Optional Obsidian App instance for file-based backup (if not provided, backup is in-memory only)
 * @param options - Migration options
 * @returns MigrationResult with the migrated settings and operation details
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.5, 2.6, 7.1, 7.3, 7.5, 7.6, 7.7
 */
export function migrateToRegistry(
	settings: unknown,
	options: MigrateToRegistryOptions = {}
): MigrationResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Default result for early returns
	const defaultResult: MigrationResult = {
		success: true,
		settings: {},
		migrated: false,
		migratedModels: 0,
		migratedConsensusRefs: 0,
		migratedCouncilRefs: 0,
		removedLegacyFields: [],
		errors: [],
		warnings: [],
	};

	// Handle null/undefined settings
	if (settings === null || settings === undefined) {
		return {
			...defaultResult,
			settings: {},
		};
	}

	// Ensure settings is an object
	if (typeof settings !== "object") {
		return {
			...defaultResult,
			success: false,
			errors: [`Settings must be an object, received ${typeof settings}`],
		};
	}

	const settingsObj = settings as Record<string, unknown>;

	// Check if migration is needed
	const currentVersion = getSettingsVersion(settingsObj);
	const detection = detectMigrationNeeds(settingsObj);

	if (!detection.needsMigration && currentVersion >= SETTINGS_VERSION.REGISTRY_V2) {
		// Already fully migrated
		return {
			...defaultResult,
			settings: settingsObj,
		};
	}

	// Step 1: Create in-memory backup
	let backupSettings: Record<string, unknown> | null = null;
	if (!options.skipBackup) {
		backupSettings = JSON.parse(JSON.stringify(settingsObj));
	}

	try {
		// Step 2: Run the main migration logic
		const migrationResult = migrateSettings(settingsObj);

		if (!migrationResult.success) {
			// Migration failed
			return {
				...defaultResult,
				success: false,
				settings: backupSettings || settingsObj,
				errors: migrationResult.errors,
				warnings: migrationResult.warnings,
			};
		}

		let migratedSettings = migrationResult.settings;

		// Count migrated models and references
		const migratedModels = migrationResult.stats.totalModelsAfterDedup;

		// Count consensus references
		let migratedConsensusRefs = 0;
		if (
			migratedSettings.consensusSettings &&
			typeof migratedSettings.consensusSettings === "object"
		) {
			const consensus = migratedSettings.consensusSettings as Record<string, unknown>;
			if (Array.isArray(consensus.models)) {
				migratedConsensusRefs = consensus.models.length;
			}
		}

		// Count council references
		let migratedCouncilRefs = 0;
		if (
			migratedSettings.councilSettings &&
			typeof migratedSettings.councilSettings === "object"
		) {
			const council = migratedSettings.councilSettings as Record<string, unknown>;
			if (Array.isArray(council.models)) {
				migratedCouncilRefs = council.models.length;
			}
		}

		// Step 5: Remove legacy fields (unless skipped)
		let removedLegacyFields: string[] = [];
		if (!options.skipLegacyFieldRemoval) {
			const removalResult = removeLegacyFields(migratedSettings);
			removedLegacyFields = removalResult.removedFields;
		}

		// Step 6: Update settings version
		migratedSettings.settingsVersion = CURRENT_SETTINGS_VERSION;

		// Add warnings about migration
		warnings.push(...migrationResult.warnings);
		if (migrationResult.stats.duplicatesRemoved > 0) {
			warnings.push(
				`Removed ${migrationResult.stats.duplicatesRemoved} duplicate model configurations`
			);
		}

		return {
			success: true,
			settings: migratedSettings,
			migrated: migrationResult.migrated,
			migratedModels,
			migratedConsensusRefs,
			migratedCouncilRefs,
			removedLegacyFields,
			errors: [],
			warnings,
		};

	} catch (error) {
		// Migration failed - return backup if available
		const errorMessage = error instanceof Error ? error.message : String(error);
		errors.push(`Migration failed: ${errorMessage}`);

		return {
			...defaultResult,
			success: false,
			settings: backupSettings || settingsObj,
			errors,
			warnings,
		};
	}
}

/**
 * Performs complete migration with file-based backup using BackupService.
 *
 * This is an async version of migrateToRegistry that uses the Obsidian
 * file system to create a persistent backup before migration.
 *
 * @param settings - The settings object to migrate
 * @param app - Obsidian App instance for file operations
 * @param options - Migration options
 * @returns Promise resolving to MigrationResult with backup path
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export async function migrateToRegistryWithBackup(
	settings: unknown,
	app: import("obsidian").App,
	options: MigrateToRegistryOptions = {}
): Promise<MigrationResult> {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Import backup service dynamically to avoid circular dependencies
	const { BackupService } = await import("./backup");

	// Default result
	const defaultResult: MigrationResult = {
		success: true,
		settings: {},
		migrated: false,
		migratedModels: 0,
		migratedConsensusRefs: 0,
		migratedCouncilRefs: 0,
		removedLegacyFields: [],
		errors: [],
		warnings: [],
	};

	// Handle null/undefined settings
	if (settings === null || settings === undefined) {
		return {
			...defaultResult,
			settings: {},
		};
	}

	// Ensure settings is an object
	if (typeof settings !== "object") {
		return {
			...defaultResult,
			success: false,
			errors: [`Settings must be an object, received ${typeof settings}`],
		};
	}

	const settingsObj = settings as Record<string, unknown>;

	// Check if migration is needed
	const currentVersion = getSettingsVersion(settingsObj);
	const detection = detectMigrationNeeds(settingsObj);

	if (!detection.needsMigration && currentVersion >= SETTINGS_VERSION.REGISTRY_V2) {
		// Already fully migrated
		return {
			...defaultResult,
			settings: settingsObj,
		};
	}

	// Step 1: Create file-based backup
	let backupInfo: { path: string; timestamp: number } | undefined;

	if (!options.skipBackup) {
		const backupService = new BackupService(app, options.pluginVersion || "1.0.0");
		const backupResult = await backupService.createBackup(
			settingsObj as unknown as import("../config").QuizSettings,
			"migration",
			"Automatic backup before settings migration"
		);

		if (!backupResult.success) {
			// Backup failed - abort migration
			return {
				...defaultResult,
				success: false,
				settings: settingsObj,
				errors: [`Failed to create backup: ${backupResult.error}`],
			};
		}

		backupInfo = {
			path: backupResult.backupPath!,
			timestamp: backupResult.backup!.metadata.timestamp,
		};

		warnings.push(`Created backup at: ${backupResult.backupPath}`);
	}

	// Steps 2-6: Run synchronous migration
	const migrationResult = migrateToRegistry(settingsObj, {
		skipBackup: true, // Already created file backup
		skipLegacyFieldRemoval: options.skipLegacyFieldRemoval,
		pluginVersion: options.pluginVersion,
	});

	// Add backup info to result
	return {
		...migrationResult,
		backup: backupInfo,
		warnings: [...warnings, ...migrationResult.warnings],
	};
}

/**
 * Checks if settings need migration based on version and structure.
 *
 * This is a convenience function that combines version checking with
 * structural detection for comprehensive migration need assessment.
 *
 * @param settings - The settings to check
 * @returns True if migration is needed, false otherwise
 *
 * Requirements: 7.1
 */
export function needsRegistryMigration(settings: unknown): boolean {
	if (settings === null || settings === undefined) {
		return false; // New settings don't need migration
	}

	const version = getSettingsVersion(settings);

	// If version is already at V2, no migration needed
	if (version >= SETTINGS_VERSION.REGISTRY_V2) {
		return false;
	}

	// Check if structural migration is needed
	const detection = detectMigrationNeeds(settings);
	return detection.needsMigration;
}
