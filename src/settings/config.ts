import { DEFAULT_GENERAL_SETTINGS, GeneralConfig } from "./general/generalConfig";
import { DEFAULT_GENERATION_SETTINGS, GenerationConfig } from "./generation/generationConfig";
import { DEFAULT_SAVING_SETTINGS, SavingConfig } from "./saving/savingConfig";
import { DEFAULT_FLASHCARD_SETTINGS, FlashcardConfig } from "./flashcards/flashcardConfig";
import { DEFAULT_CONSENSUS_SETTINGS } from "./consensus/consensusConfig";
import { ConsensusSettings } from "../consensus/types";
import { DEFAULT_COUNCIL_SETTINGS } from "./council/councilConfig";
import { CouncilSettings } from "../council/types";
import { ModelRegistry, DEFAULT_MODEL_REGISTRY } from "./modelRegistry";
import {
	SectionCollapseState,
	DEFAULT_SECTION_COLLAPSE_STATE,
} from "./sectionCollapseState";
import { Provider } from "../generators/providers";

/**
 * @deprecated Use Model Registry. Kept for migration compatibility only.
 * Requirements: 1.1
 */
export interface LegacyOpenAIConfig {
	openAIApiKey: string;
	openAIBaseURL: string;
	openAITextGenModel: string;
	openAIEmbeddingModel: string;
}

/**
 * @deprecated Use Model Registry. Kept for migration compatibility only.
 * Requirements: 1.1
 */
export interface LegacyOllamaConfig {
	ollamaBaseURL: string;
	ollamaTextGenModel: string;
	ollamaEmbeddingModel: string;
}

/**
 * @deprecated Use ProviderConfig from Model Registry. Kept for migration compatibility only.
 * Requirements: 1.1
 */
export interface ModelConfig extends LegacyOpenAIConfig, LegacyOllamaConfig {
	provider: string;
}

/** @deprecated Use Model Registry. Defaults for migration compatibility. */
const DEFAULT_LEGACY_OPENAI_SETTINGS: LegacyOpenAIConfig = {
	openAIApiKey: "",
	openAIBaseURL: "https://api.openai.com/v1",
	openAITextGenModel: "gpt-3.5-turbo",
	openAIEmbeddingModel: "text-embedding-3-small",
};

/** @deprecated Use Model Registry. Defaults for migration compatibility. */
const DEFAULT_LEGACY_OLLAMA_SETTINGS: LegacyOllamaConfig = {
	ollamaBaseURL: "http://localhost:11434",
	ollamaTextGenModel: "",
	ollamaEmbeddingModel: "",
};

/** @deprecated Use Model Registry. Defaults for migration compatibility. */
export const DEFAULT_MODEL_SETTINGS: ModelConfig = {
	provider: Provider.OLLAMA,
	...DEFAULT_LEGACY_OPENAI_SETTINGS,
	...DEFAULT_LEGACY_OLLAMA_SETTINGS,
};

/**
 * Settings version numbers for migration tracking.
 *
 * - LEGACY (0): No version field, has legacy direct-provider fields
 * - REGISTRY_V1 (1): Has modelRegistry, may still have legacy fields
 * - REGISTRY_V2 (2): Fully migrated, legacy fields removed
 *
 * Requirements: 3.1, 7.3
 */
export const SETTINGS_VERSION = {
	/** No version field, has legacy fields */
	LEGACY: 0,
	/** Has modelRegistry, may have legacy fields */
	REGISTRY_V1: 1,
	/** Fully migrated, legacy removed */
	REGISTRY_V2: 2,
} as const;

/**
 * Current settings version for new installations
 */
export const CURRENT_SETTINGS_VERSION = SETTINGS_VERSION.REGISTRY_V2;

/**
 * @deprecated Use QuizSettings. Kept for migration compatibility only.
 * Requirements: 1.1, 1.2, 7.1
 */
export type LegacyQuizSettings = GeneralConfig & ModelConfig & GenerationConfig & SavingConfig & {
	flashcardSettings?: FlashcardConfig;
	consensusSettings?: ConsensusSettings;
	councilSettings?: CouncilSettings;

	/** @deprecated Optional here; required in QuizSettings */
	modelRegistry?: ModelRegistry;
	/** @deprecated Optional here; required in QuizSettings */
	activeModelId?: string | null;
	/** @deprecated Optional here; required in QuizSettings */
	settingsVersion?: number;
};

/**
 * Core settings fields required after migration. Requirements: 3.1, 3.2
 */
interface CoreSettingsFields {
	/** Central model registry - single source of truth. Requirements: 1.1, 3.1, 4.1 */
	modelRegistry: ModelRegistry;
	/** Active model ID for single-model generation (null = none selected). Requirements: 1.1, 3.1, 4.1, 6.1 */
	activeModelId: string | null;
	/** Settings version for migration tracking. See SETTINGS_VERSION. Requirements: 3.1, 7.3 */
	settingsVersion: number;

	/** Persisted collapse state for settings panel sections. Requirements: 6.6 */
	sectionCollapseState?: SectionCollapseState;
}

/**
 * Main plugin settings type with centralized model registry.
 * Includes legacy ModelConfig fields for backward compatibility during migration.
 * Requirements: 3.1, 3.2
 */
export type QuizSettings = GeneralConfig & ModelConfig & GenerationConfig & SavingConfig & CoreSettingsFields & {
	flashcardSettings?: FlashcardConfig;
	consensusSettings?: ConsensusSettings;
	councilSettings?: CouncilSettings;
};

/**
 * Type guard: checks if settings need migration (missing modelRegistry/settingsVersion or old version).
 * Requirements: 7.1
 */
export function isLegacySettings(settings: unknown): settings is LegacyQuizSettings {
	if (settings === null || typeof settings !== "object") {
		return false;
	}

	const s = settings as Record<string, unknown>;

	// Check if it's missing required new fields or has old version
	const missingRegistry = s.modelRegistry === undefined;
	const missingVersion = s.settingsVersion === undefined;
	const oldVersion = typeof s.settingsVersion === "number" &&
		s.settingsVersion < SETTINGS_VERSION.REGISTRY_V2;

	return missingRegistry || missingVersion || oldVersion;
}

/**
 * Type guard: checks if settings are in the new format (has modelRegistry, activeModelId, version >= V2).
 * Requirements: 3.1
 */
export function isQuizSettings(settings: unknown): settings is QuizSettings {
	if (settings === null || typeof settings !== "object") {
		return false;
	}

	const s = settings as Record<string, unknown>;

	// Check required new fields
	const hasRegistry = s.modelRegistry !== undefined &&
		typeof s.modelRegistry === "object" &&
		s.modelRegistry !== null;
	const hasActiveModelId = s.activeModelId === null ||
		typeof s.activeModelId === "string";
	const hasVersion = typeof s.settingsVersion === "number" &&
		s.settingsVersion >= SETTINGS_VERSION.REGISTRY_V2;

	return hasRegistry && hasActiveModelId && hasVersion;
}

/** Check if settings need migration to the new format. Requirements: 7.1 */
export function needsMigration(settings: unknown): boolean {
	return isLegacySettings(settings) && !isQuizSettings(settings);
}

/**
 * Default settings for new installations. Uses Model Registry as single source of truth.
 * Legacy fields included with empty defaults for type compatibility only.
 * Requirements: 3.1, 4.4
 */
export const DEFAULT_SETTINGS: QuizSettings = {
	...DEFAULT_GENERAL_SETTINGS,
	...DEFAULT_GENERATION_SETTINGS,
	...DEFAULT_SAVING_SETTINGS,
	flashcardSettings: DEFAULT_FLASHCARD_SETTINGS,
	consensusSettings: DEFAULT_CONSENSUS_SETTINGS,
	councilSettings: DEFAULT_COUNCIL_SETTINGS,
	modelRegistry: DEFAULT_MODEL_REGISTRY,
	activeModelId: null,
	settingsVersion: CURRENT_SETTINGS_VERSION,
	sectionCollapseState: DEFAULT_SECTION_COLLAPSE_STATE,
	// Legacy fields - empty defaults for type compatibility only
	provider: "",
	openAIApiKey: "",
	openAIBaseURL: "",
	openAITextGenModel: "",
	openAIEmbeddingModel: "",
	ollamaBaseURL: "",
	ollamaTextGenModel: "",
	ollamaEmbeddingModel: "",
};

/**
 * @deprecated Use DEFAULT_SETTINGS. Defaults for migration compatibility only.
 * Requirements: 7.1
 */
export const DEFAULT_LEGACY_SETTINGS: LegacyQuizSettings = {
	...DEFAULT_GENERAL_SETTINGS,
	...DEFAULT_MODEL_SETTINGS,
	...DEFAULT_GENERATION_SETTINGS,
	...DEFAULT_SAVING_SETTINGS,
	flashcardSettings: DEFAULT_FLASHCARD_SETTINGS,
	consensusSettings: DEFAULT_CONSENSUS_SETTINGS,
	councilSettings: DEFAULT_COUNCIL_SETTINGS,
	modelRegistry: DEFAULT_MODEL_REGISTRY,
	activeModelId: null,
	settingsVersion: SETTINGS_VERSION.LEGACY,
};
