/**
 * Model Registry Module
 *
 * Provides centralized model configuration management for the plugin.
 * All model-related types, defaults, and utilities are exported from here.
 */

export {
	// Provider Config Types
	type BaseProviderConfig,
	type OpenAIProviderConfig,
	type OllamaProviderConfig,
	type ProviderConfig,

	// Model Configuration Types
	type ModelConfiguration,
	type ModelRegistry,

	// Model Usage Types
	type ModelUsageLocation,
	type ModelUsageInfo,

	// Model Reference Types
	type ConsensusModelReference,
	type CouncilModelReference,

	// Default Values
	DEFAULT_OPENAI_PROVIDER_CONFIG,
	DEFAULT_OLLAMA_PROVIDER_CONFIG,
	DEFAULT_MODEL_REGISTRY,

	// Type Guards
	isOpenAIProviderConfig,
	isOllamaProviderConfig,
	isProviderConfig,
	isModelConfiguration,
	isModelRegistry,
	isModelUsageInfo,
	isConsensusModelReference,
	isCouncilModelReference,

	// Utility Functions
	generateModelId,
	createModelConfiguration,
	createEmptyModelUsageInfo,
	getProviderDisplayName,
	formatModelForDisplay,
} from "./types";

// Model Validator
export {
	type ValidationSeverity,
	type ValidationMessage,
	type ValidationResult,
	MAX_DISPLAY_NAME_LENGTH,
	MAX_MODEL_NAME_LENGTH,
	MAX_API_KEY_LENGTH,
	MAX_BASE_URL_LENGTH,
	ModelValidator,
	modelValidator,
} from "./modelValidator";

// Model Resolver
export {
	ModelNotFoundError,
	type ResolvedModelReference,
	ModelResolver,
	createModelResolver,
	isModelNotFoundError,
	isResolvedModelReference,
} from "./modelResolver";

// Model Registry Utilities
export {
	// Error Types
	DuplicateModelIdError,
	DuplicateDisplayNameError,
	ModelNotInRegistryError,
	ModelValidationError,
	ModelInUseError,

	// Result Types
	type ModelOperationResult,
	type DeleteModelResult,

	// Query Functions
	getModelById,
	getModelByDisplayName,
	getAllModels,
	getModelCount,
	modelExists,
	generateUniqueModelId,

	// CRUD Operations
	addModel,
	tryAddModel,
	createAndAddModel,
	updateModel,
	tryUpdateModel,
	deleteModel,
	tryDeleteModel,
	deleteModelAndCleanupReferences,

	// Usage Tracking
	getModelUsageInfo,
	formatModelUsage,
	getUsedModels,
	getUnusedModels,

	// Type Guards
	isDuplicateModelIdError,
	isDuplicateDisplayNameError,
	isModelNotInRegistryError,
	isModelValidationError,
	isModelInUseError,
} from "./modelRegistry";

// Migration Detection and Extraction
export {
	// Types
	MigrationReason,
	type MigrationDetectionResult,
	type MainModelExtractionResult,
	type ConsensusModelExtractionResult,
	type CouncilModelExtractionResult,
	type ChairModelExtractionResult,
	type BatchConsensusExtractionResult,
	type BatchCouncilExtractionResult,

	// Detection Functions
	needsMigration,
	detectMigrationNeeds,

	// Model Extraction Functions
	extractMainModel,
	extractConsensusModel,
	extractCouncilModel,
	extractChairModel,
	extractAllConsensusModels,
	extractAllCouncilModels,
	generateMigrationModelId,
	mapChairIdToNewModelId,

	// Type Guards
	isLegacyConsensusModelConfig,
	hasAnyLegacyFields,

	// Deduplication Types
	type DeduplicationResult,
	type DeduplicationMergeInfo,
	type DeduplicationStats,
	type ModelSource,
	type ModelWithSource,
	type DeduplicationWithSourcesResult,

	// Deduplication Functions
	getModelKey,
	deduplicateModels,
	deduplicateModelsWithSources,
	updateConsensusReferences,
	updateCouncilReferences,
	updateChairReference,

	// Settings Migration Types
	type ConsensusSettingsMigrationResult,
	type MigratedConsensusSettings,
	type CouncilSettingsMigrationResult,
	type MigratedCouncilSettings,
	type MigratedChairModelConfig,

	// Full Migration Types
	type FullMigrationResult,
	type MigrationStats,

	// Settings Migration Functions
	migrateConsensusSettings,
	migrateCouncilSettings,
	applyDeduplicationToConsensusSettings,
	applyDeduplicationToCouncilSettings,

	// Full Migration Orchestration Functions
	migrateSettings,
	migrateSettingsWithDefaults,

	// Settings Version Management
	SETTINGS_VERSION,
	CURRENT_SETTINGS_VERSION,
	getSettingsVersion,

	// Legacy Field Removal
	LEGACY_ROOT_FIELDS,
	LEGACY_CONSENSUS_FIELDS,
	LEGACY_COUNCIL_FIELDS,
	type LegacyFieldRemovalResult,
	removeLegacyFields,

	// Display Name Generation
	type MigrationDisplayNameOptions,
	generateMigrationDisplayName,

	// Complete Migration Orchestration
	type MigrationResult,
	type MigrateToRegistryOptions,
	migrateToRegistry,
	migrateToRegistryWithBackup,
	needsRegistryMigration,
} from "./migration";

// Settings Backup Module
export {
	// Constants
	BACKUP_DIRECTORY,
	BACKUP_FILE_PREFIX,
	BACKUP_FILE_EXTENSION,
	MAX_BACKUP_COUNT,
	PLUGIN_ID,

	// Types
	type BackupMetadata,
	type BackupReason,
	type SettingsBackup,
	type BackupResult,
	type RestoreResult,
	type BackupInfo,

	// Validation Types
	type BackupValidationError,
	type BackupValidationErrorCode,
	type BackupValidationResult,
	type InMemoryRestoreResult,

	// Type Guards
	isBackupMetadata,
	isSettingsBackup,

	// Utility Functions
	generateBackupFilename,
	extractTimestampFromFilename,
	formatBackupTimestamp,

	// Validation Functions
	validateBackupForRestoration,

	// Service Class
	BackupService,

	// Convenience Functions
	createBackup,
	restoreFromLatestBackup,

	// In-Memory Restoration Functions
	restoreFromBackup,
	safeRestoreFromBackup,
} from "./backup";

// Model Registry Event Emitter
export {
	// Event Types
	type ModelRegistryEventType,
	type ModelRegistryEvent,
	type ModelRegistryEventCallback,
	type IModelRegistryEventEmitter,

	// Event Emitter Class
	ModelRegistryEventEmitter,

	// Singleton Instance
	modelRegistryEvents,

	// Factory Function
	createModelRegistryEventEmitter,

	// Type Guards
	isModelRegistryEventType,
	isModelRegistryEvent,
} from "./eventEmitter";

// Reactive Model Dropdown
export {
	// Types
	type ReactiveModelDropdownOptions,
	type ReactiveModelDropdownResult,
	type ReactiveModelSettingOptions,
	type ReactiveModelSettingResult,
	type ReactiveDropdownManager,

	// Constants
	DEFAULT_PLACEHOLDER,
	DEFAULT_DELETED_MODEL_TEXT,

	// Factory Functions
	createReactiveModelDropdown,
	createReactiveModelSetting,
	createReactiveDropdownManager,
} from "./reactiveDropdown";

// Deleted Model Handler
export {
	// Types
	type ModelReferenceLocation,
	type BrokenModelReference,
	type ModelReferenceValidationResult,
	type ValidationOptions,
	type CleanupResult,
	type OnLoadHandlingOptions,

	// Validation Functions
	validateModelReferences,
	isModelReferenceValid,
	getModelReferenceDisplayInfo,

	// Cleanup Functions
	cleanupBrokenReferences,

	// Warning/Logging Functions
	getBrokenReferencesWarningMessage,
	formatBrokenReferencesForLog,

	// Main Entry Point
	handleModelReferencesOnLoad,

	// Utility Functions
	consensusHasBrokenReferences,
	councilHasBrokenReferences,
	getBrokenReferenceCount,
} from "./deletedModelHandler";
