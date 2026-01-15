/**
 * Model Registry Utility Functions
 *
 * Provides CRUD operations for managing model configurations in the registry.
 * All mutations to the registry should go through these functions to ensure
 * proper validation, consistency, and event emission for reactive updates.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 8.1, 8.2, 8.3
 */

import {
	ModelConfiguration,
	ModelRegistry,
	ProviderConfig,
	generateModelId,
	createEmptyModelUsageInfo,
	ModelUsageInfo,
} from "./types";
import { ModelValidator, modelValidator, ValidationResult } from "./modelValidator";
import { QuizSettings } from "../config";
import { modelRegistryEvents } from "./eventEmitter";

/**
 * Error thrown when attempting to add a model with a duplicate ID.
 */
export class DuplicateModelIdError extends Error {
	public readonly modelId: string;

	constructor(modelId: string) {
		super(`A model with ID "${modelId}" already exists in the registry`);
		this.name = "DuplicateModelIdError";
		this.modelId = modelId;
		Object.setPrototypeOf(this, DuplicateModelIdError.prototype);
	}
}

/**
 * Error thrown when attempting to add a model with a duplicate display name.
 */
export class DuplicateDisplayNameError extends Error {
	public readonly displayName: string;

	constructor(displayName: string) {
		super(`A model with display name "${displayName}" already exists in the registry`);
		this.name = "DuplicateDisplayNameError";
		this.displayName = displayName;
		Object.setPrototypeOf(this, DuplicateDisplayNameError.prototype);
	}
}

/**
 * Error thrown when a model is not found in the registry.
 */
export class ModelNotInRegistryError extends Error {
	public readonly modelId: string;

	constructor(modelId: string) {
		super(`Model with ID "${modelId}" not found in registry`);
		this.name = "ModelNotInRegistryError";
		this.modelId = modelId;
		Object.setPrototypeOf(this, ModelNotInRegistryError.prototype);
	}
}

/**
 * Error thrown when model validation fails.
 */
export class ModelValidationError extends Error {
	public readonly validationResult: ValidationResult;

	constructor(validationResult: ValidationResult) {
		const errorMessages = validationResult.errors.join("; ");
		super(`Model validation failed: ${errorMessages}`);
		this.name = "ModelValidationError";
		this.validationResult = validationResult;
		Object.setPrototypeOf(this, ModelValidationError.prototype);
	}
}

/**
 * Error thrown when attempting to delete a model that is in use.
 */
export class ModelInUseError extends Error {
	public readonly modelId: string;
	public readonly usageInfo: ModelUsageInfo;

	constructor(modelId: string, usageInfo: ModelUsageInfo) {
		const locations = usageInfo.usageLocations.join(", ");
		super(`Cannot delete model "${modelId}" - it is in use by: ${locations}`);
		this.name = "ModelInUseError";
		this.modelId = modelId;
		this.usageInfo = usageInfo;
		Object.setPrototypeOf(this, ModelInUseError.prototype);
	}
}

/**
 * Result of an add or update operation.
 */
export interface ModelOperationResult {
	/** Whether the operation was successful */
	success: boolean;

	/** The model that was added or updated */
	model?: ModelConfiguration;

	/** Validation result if validation was performed */
	validation?: ValidationResult;

	/** Error message if operation failed */
	error?: string;
}

/**
 * Result of a delete operation.
 */
export interface DeleteModelResult {
	/** Whether the deletion was successful */
	success: boolean;

	/** The model that was deleted (if successful) */
	deletedModel?: ModelConfiguration;

	/** Usage info if the model was in use */
	usageInfo?: ModelUsageInfo;

	/** Error message if deletion failed */
	error?: string;
}

/**
 * Get a model by ID from the registry.
 *
 * @param registry - The model registry to search
 * @param modelId - The ID of the model to find
 * @returns The model configuration or undefined if not found
 *
 * Requirements: 4.1
 */
export function getModelById(
	registry: ModelRegistry,
	modelId: string
): ModelConfiguration | undefined {
	if (!modelId || modelId.trim() === "") {
		return undefined;
	}

	return registry.models[modelId];
}

/**
 * Get a model by display name from the registry.
 *
 * @param registry - The model registry to search
 * @param displayName - The display name to search for (case-insensitive)
 * @returns The model configuration or undefined if not found
 */
export function getModelByDisplayName(
	registry: ModelRegistry,
	displayName: string
): ModelConfiguration | undefined {
	if (!displayName || displayName.trim() === "") {
		return undefined;
	}

	const normalizedName = displayName.trim().toLowerCase();
	return Object.values(registry.models).find(
		(model) => model.displayName.trim().toLowerCase() === normalizedName
	);
}

/**
 * Get all models from the registry as an array.
 *
 * @param registry - The model registry
 * @returns Array of all model configurations
 */
export function getAllModels(registry: ModelRegistry): ModelConfiguration[] {
	return Object.values(registry.models);
}

/**
 * Get the count of models in the registry.
 *
 * @param registry - The model registry
 * @returns The number of models
 */
export function getModelCount(registry: ModelRegistry): number {
	return Object.keys(registry.models).length;
}

/**
 * Check if a model ID exists in the registry.
 *
 * @param registry - The model registry
 * @param modelId - The ID to check
 * @returns true if the model exists
 */
export function modelExists(registry: ModelRegistry, modelId: string): boolean {
	return modelId in registry.models;
}

/**
 * Generate a unique model ID that doesn't exist in the registry.
 *
 * @param registry - The model registry to check against
 * @returns A unique model ID
 */
export function generateUniqueModelId(registry: ModelRegistry): string {
	let id = generateModelId();

	// Extremely unlikely, but ensure uniqueness
	let attempts = 0;
	while (modelExists(registry, id) && attempts < 100) {
		id = generateModelId();
		attempts++;
	}

	if (modelExists(registry, id)) {
		// Fallback with UUID-like suffix if somehow still not unique
		id = `model_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
	}

	return id;
}

/**
 * Add a new model to the registry.
 *
 * This function validates the model configuration, checks for duplicate IDs
 * and display names, and adds the model to the registry.
 *
 * @param registry - The model registry to add to (will be mutated)
 * @param model - The model configuration to add
 * @param validator - Optional validator instance (defaults to singleton)
 * @returns Result of the add operation
 * @throws DuplicateModelIdError if a model with the same ID exists
 * @throws DuplicateDisplayNameError if a model with the same display name exists
 * @throws ModelValidationError if validation fails
 *
 * Requirements: 4.2
 */
export function addModel(
	registry: ModelRegistry,
	model: ModelConfiguration,
	validator: ModelValidator = modelValidator
): ModelOperationResult {
	// Validate the model configuration
	const validation = validator.validateConfiguration(model);
	if (!validation.isValid) {
		throw new ModelValidationError(validation);
	}

	// Check for duplicate ID
	if (modelExists(registry, model.id)) {
		throw new DuplicateModelIdError(model.id);
	}

	// Check for duplicate display name
	if (!validator.validateUniqueDisplayName(model.displayName, registry)) {
		throw new DuplicateDisplayNameError(model.displayName);
	}

	// Set timestamps and isAutoGeneratedName if not already set
	const now = Date.now();
	const modelToAdd: ModelConfiguration = {
		...model,
		isAutoGeneratedName: model.isAutoGeneratedName ?? false,
		createdAt: model.createdAt || now,
		modifiedAt: model.modifiedAt || now,
	};

	// Add to registry
	registry.models[modelToAdd.id] = modelToAdd;

	// Emit model-added event for reactive updates (Requirement 8.1)
	modelRegistryEvents.emit("model-added", {
		modelId: modelToAdd.id,
		model: modelToAdd,
	});

	return {
		success: true,
		model: modelToAdd,
		validation,
	};
}

/**
 * Add a model to the registry, returning the result without throwing.
 *
 * This is a safer alternative to addModel() that returns errors as part
 * of the result instead of throwing exceptions.
 *
 * @param registry - The model registry to add to (will be mutated)
 * @param model - The model configuration to add
 * @param validator - Optional validator instance
 * @returns Result of the add operation
 */
export function tryAddModel(
	registry: ModelRegistry,
	model: ModelConfiguration,
	validator: ModelValidator = modelValidator
): ModelOperationResult {
	try {
		return addModel(registry, model, validator);
	} catch (error) {
		if (error instanceof ModelValidationError) {
			return {
				success: false,
				validation: error.validationResult,
				error: error.message,
			};
		}
		if (
			error instanceof DuplicateModelIdError ||
			error instanceof DuplicateDisplayNameError
		) {
			return {
				success: false,
				error: error.message,
			};
		}
		throw error; // Re-throw unexpected errors
	}
}

/**
 * Options for creating and adding a model.
 */
export interface CreateModelOptions {
	/** Whether the display name was auto-generated (defaults to false) */
	isAutoGeneratedName?: boolean;
}

/**
 * Create and add a new model to the registry from provider config.
 *
 * Convenience function that creates a ModelConfiguration with generated ID
 * and timestamps, then adds it to the registry.
 *
 * @param registry - The model registry to add to (will be mutated)
 * @param displayName - Display name for the new model
 * @param providerConfig - Provider-specific configuration
 * @param validator - Optional validator instance
 * @param options - Optional creation options (e.g., isAutoGeneratedName)
 * @returns Result containing the created model
 *
 * Requirements: 3.1, 3.3, 4.2
 */
export function createAndAddModel(
	registry: ModelRegistry,
	displayName: string,
	providerConfig: ProviderConfig,
	validator: ModelValidator = modelValidator,
	options: CreateModelOptions = {}
): ModelOperationResult {
	const now = Date.now();
	const model: ModelConfiguration = {
		id: generateUniqueModelId(registry),
		displayName,
		isAutoGeneratedName: options.isAutoGeneratedName ?? false,
		providerConfig,
		createdAt: now,
		modifiedAt: now,
	};

	return addModel(registry, model, validator);
}

/**
 * Update an existing model in the registry.
 *
 * This function validates the updated configuration and replaces the
 * existing model in the registry. The model ID cannot be changed.
 *
 * @param registry - The model registry to update (will be mutated)
 * @param modelId - The ID of the model to update
 * @param updates - Partial model configuration with updates
 * @param validator - Optional validator instance
 * @returns Result of the update operation
 * @throws ModelNotInRegistryError if the model doesn't exist
 * @throws DuplicateDisplayNameError if new display name conflicts
 * @throws ModelValidationError if validation fails
 *
 * Requirements: 4.3
 */
export function updateModel(
	registry: ModelRegistry,
	modelId: string,
	updates: Partial<Omit<ModelConfiguration, "id" | "createdAt">>,
	validator: ModelValidator = modelValidator
): ModelOperationResult {
	// Check model exists
	const existingModel = getModelById(registry, modelId);
	if (!existingModel) {
		throw new ModelNotInRegistryError(modelId);
	}

	// Create updated model
	const updatedModel: ModelConfiguration = {
		...existingModel,
		...updates,
		id: existingModel.id, // ID cannot be changed
		createdAt: existingModel.createdAt, // createdAt cannot be changed
		modifiedAt: Date.now(),
	};

	// Validate the updated model
	const validation = validator.validateConfiguration(updatedModel);
	if (!validation.isValid) {
		throw new ModelValidationError(validation);
	}

	// Check for duplicate display name (excluding current model)
	if (
		updates.displayName &&
		updates.displayName !== existingModel.displayName &&
		!validator.validateUniqueDisplayName(updates.displayName, registry, modelId)
	) {
		throw new DuplicateDisplayNameError(updates.displayName);
	}

	// Update in registry
	registry.models[modelId] = updatedModel;

	// Emit model-updated event for reactive updates (Requirement 8.2)
	modelRegistryEvents.emit("model-updated", {
		modelId: modelId,
		model: updatedModel,
		previousModel: existingModel,
	});

	return {
		success: true,
		model: updatedModel,
		validation,
	};
}

/**
 * Update a model in the registry, returning the result without throwing.
 *
 * @param registry - The model registry to update (will be mutated)
 * @param modelId - The ID of the model to update
 * @param updates - Partial model configuration with updates
 * @param validator - Optional validator instance
 * @returns Result of the update operation
 */
export function tryUpdateModel(
	registry: ModelRegistry,
	modelId: string,
	updates: Partial<Omit<ModelConfiguration, "id" | "createdAt">>,
	validator: ModelValidator = modelValidator
): ModelOperationResult {
	try {
		return updateModel(registry, modelId, updates, validator);
	} catch (error) {
		if (error instanceof ModelValidationError) {
			return {
				success: false,
				validation: error.validationResult,
				error: error.message,
			};
		}
		if (
			error instanceof ModelNotInRegistryError ||
			error instanceof DuplicateDisplayNameError
		) {
			return {
				success: false,
				error: error.message,
			};
		}
		throw error;
	}
}

/**
 * Delete a model from the registry.
 *
 * By default, this function will NOT delete a model that is in use.
 * Use the `force` option to delete even if the model is in use.
 *
 * @param registry - The model registry to delete from (will be mutated)
 * @param modelId - The ID of the model to delete
 * @param settings - Full settings to check for usage (optional)
 * @param options - Delete options
 * @returns Result of the delete operation
 * @throws ModelNotInRegistryError if the model doesn't exist
 * @throws ModelInUseError if the model is in use and force is false
 *
 * Requirements: 4.4, 4.5
 */
export function deleteModel(
	registry: ModelRegistry,
	modelId: string,
	settings?: QuizSettings,
	options: { force?: boolean } = {}
): DeleteModelResult {
	// Check model exists
	const existingModel = getModelById(registry, modelId);
	if (!existingModel) {
		throw new ModelNotInRegistryError(modelId);
	}

	// Check usage if settings provided
	if (settings && !options.force) {
		const usageInfo = getModelUsageInfo(modelId, settings);
		if (usageInfo.usageCount > 0) {
			throw new ModelInUseError(modelId, usageInfo);
		}
	}

	// Delete from registry
	delete registry.models[modelId];

	// Emit model-deleted event for reactive updates (Requirement 8.3)
	modelRegistryEvents.emit("model-deleted", {
		modelId: modelId,
		model: existingModel,
	});

	return {
		success: true,
		deletedModel: existingModel,
	};
}

/**
 * Delete a model from the registry, returning the result without throwing.
 *
 * @param registry - The model registry to delete from (will be mutated)
 * @param modelId - The ID of the model to delete
 * @param settings - Full settings to check for usage (optional)
 * @param options - Delete options
 * @returns Result of the delete operation
 */
export function tryDeleteModel(
	registry: ModelRegistry,
	modelId: string,
	settings?: QuizSettings,
	options: { force?: boolean } = {}
): DeleteModelResult {
	try {
		return deleteModel(registry, modelId, settings, options);
	} catch (error) {
		if (error instanceof ModelNotInRegistryError) {
			return {
				success: false,
				error: error.message,
			};
		}
		if (error instanceof ModelInUseError) {
			return {
				success: false,
				usageInfo: error.usageInfo,
				error: error.message,
			};
		}
		throw error;
	}
}

/**
 * Delete a model and remove all references to it from settings.
 *
 * This is a convenience function that deletes the model and cleans up
 * all references in main, consensus, and council settings.
 *
 * @param registry - The model registry to delete from (will be mutated)
 * @param settings - The settings to clean up (will be mutated)
 * @param modelId - The ID of the model to delete
 * @returns Result of the delete operation
 *
 * Requirements: 4.4, 4.5
 */
export function deleteModelAndCleanupReferences(
	registry: ModelRegistry,
	settings: QuizSettings,
	modelId: string
): DeleteModelResult {
	// Get model before deletion
	const existingModel = getModelById(registry, modelId);
	if (!existingModel) {
		throw new ModelNotInRegistryError(modelId);
	}

	// Get usage info for return value
	const usageInfo = getModelUsageInfo(modelId, settings);

	// Remove from main model
	if (settings.activeModelId === modelId) {
		settings.activeModelId = null;
	}

	// Remove from consensus models
	if (settings.consensusSettings?.models) {
		settings.consensusSettings.models = settings.consensusSettings.models.filter(
			(ref) => ref.modelId !== modelId
		);
	}

	// Remove from council models
	if (settings.councilSettings?.models) {
		settings.councilSettings.models = settings.councilSettings.models.filter(
			(ref) => ref.modelId !== modelId
		);
	}

	// Remove from chair model
	if (
		settings.councilSettings?.chairModel?.selectionStrategy === "configured" &&
		settings.councilSettings.chairModel.configuredChairId === modelId
	) {
		settings.councilSettings.chairModel.configuredChairId = undefined;
	}

	// Delete from registry
	delete registry.models[modelId];

	// Emit model-deleted event for reactive updates (Requirement 8.3)
	modelRegistryEvents.emit("model-deleted", {
		modelId: modelId,
		model: existingModel,
	});

	return {
		success: true,
		deletedModel: existingModel,
		usageInfo,
	};
}

/**
 * Get usage information for a model across all settings.
 *
 * @param modelId - The model ID to check
 * @param settings - The full quiz settings to check against
 * @returns ModelUsageInfo describing where the model is used
 *
 * Requirements: 4.6, 7.3
 */
export function getModelUsageInfo(
	modelId: string,
	settings: QuizSettings
): ModelUsageInfo {
	const usageInfo = createEmptyModelUsageInfo(modelId);

	// Check if used as main model
	if (settings.activeModelId === modelId) {
		usageInfo.isMainModel = true;
		usageInfo.usageLocations.push("main");
	}

	// Check if used in consensus
	if (settings.consensusSettings?.models) {
		const inConsensus = settings.consensusSettings.models.some(
			(ref) => ref.modelId === modelId
		);
		if (inConsensus) {
			usageInfo.isInConsensus = true;
			usageInfo.usageLocations.push("consensus");
		}
	}

	// Check if used in council
	if (settings.councilSettings?.models) {
		const inCouncil = settings.councilSettings.models.some(
			(ref) => ref.modelId === modelId
		);
		if (inCouncil) {
			usageInfo.isInCouncil = true;
			usageInfo.usageLocations.push("council");
		}
	}

	// Check if used as chair model
	if (
		settings.councilSettings?.chairModel?.selectionStrategy === "configured" &&
		settings.councilSettings.chairModel.configuredChairId === modelId
	) {
		usageInfo.isChairModel = true;
		usageInfo.usageLocations.push("chair");
	}

	usageInfo.usageCount = usageInfo.usageLocations.length;

	return usageInfo;
}

/**
 * Get formatted usage string for a model.
 *
 * @param usageInfo - The usage info to format
 * @returns Human-readable string describing usage locations
 */
export function formatModelUsage(usageInfo: ModelUsageInfo): string {
	if (usageInfo.usageCount === 0) {
		return "Not in use";
	}

	const locationNames: Record<string, string> = {
		main: "Main Generation",
		consensus: "Consensus Mode",
		council: "Council Mode",
		chair: "Council Chair",
	};

	return usageInfo.usageLocations
		.map((loc) => locationNames[loc] || loc)
		.join(", ");
}

/**
 * Check if any model in the registry is used in settings.
 *
 * @param registry - The model registry to check
 * @param settings - The settings to check against
 * @returns Map of model ID to usage info for models that are in use
 */
export function getUsedModels(
	registry: ModelRegistry,
	settings: QuizSettings
): Map<string, ModelUsageInfo> {
	const usedModels = new Map<string, ModelUsageInfo>();

	for (const modelId of Object.keys(registry.models)) {
		const usageInfo = getModelUsageInfo(modelId, settings);
		if (usageInfo.usageCount > 0) {
			usedModels.set(modelId, usageInfo);
		}
	}

	return usedModels;
}

/**
 * Get models that are not used anywhere in settings.
 *
 * @param registry - The model registry to check
 * @param settings - The settings to check against
 * @returns Array of unused model configurations
 */
export function getUnusedModels(
	registry: ModelRegistry,
	settings: QuizSettings
): ModelConfiguration[] {
	return Object.values(registry.models).filter((model) => {
		const usageInfo = getModelUsageInfo(model.id, settings);
		return usageInfo.usageCount === 0;
	});
}

/**
 * Type guard to check if an error is a DuplicateModelIdError.
 */
export function isDuplicateModelIdError(error: unknown): error is DuplicateModelIdError {
	return error instanceof DuplicateModelIdError;
}

/**
 * Type guard to check if an error is a DuplicateDisplayNameError.
 */
export function isDuplicateDisplayNameError(
	error: unknown
): error is DuplicateDisplayNameError {
	return error instanceof DuplicateDisplayNameError;
}

/**
 * Type guard to check if an error is a ModelNotInRegistryError.
 */
export function isModelNotInRegistryError(error: unknown): error is ModelNotInRegistryError {
	return error instanceof ModelNotInRegistryError;
}

/**
 * Type guard to check if an error is a ModelValidationError.
 */
export function isModelValidationError(error: unknown): error is ModelValidationError {
	return error instanceof ModelValidationError;
}

/**
 * Type guard to check if an error is a ModelInUseError.
 */
export function isModelInUseError(error: unknown): error is ModelInUseError {
	return error instanceof ModelInUseError;
}
