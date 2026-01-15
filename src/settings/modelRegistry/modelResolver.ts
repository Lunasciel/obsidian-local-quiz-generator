/**
 * Model Resolver
 *
 * Resolves model references (IDs) to their full configurations from the registry.
 * Provides methods for single and batch resolution, as well as usage tracking.
 *
 * This class is the primary interface for runtime model resolution - when
 * consensus, council, or main generation modes need to use a model, they
 * resolve the model ID to get the complete configuration.
 *
 * Requirements: 1.4, 4.6, 7.3, 7.6
 */

import {
	ModelConfiguration,
	ModelRegistry,
	ModelUsageInfo,
	ModelUsageLocation,
	ConsensusModelReference,
	CouncilModelReference,
	createEmptyModelUsageInfo,
} from "./types";
import { QuizSettings } from "../config";

/**
 * Error thrown when a model ID cannot be found in the registry.
 *
 * This error should be caught by callers and handled gracefully,
 * typically by showing a user-friendly message and suggesting
 * reconfiguration in settings.
 *
 * Requirements: 7.6
 */
export class ModelNotFoundError extends Error {
	/** The model ID that was not found */
	public readonly modelId: string;

	/** The registry that was searched (for debugging) */
	public readonly registrySize: number;

	constructor(modelId: string, registrySize: number = 0) {
		super(`Model configuration not found: ${modelId}`);
		this.name = "ModelNotFoundError";
		this.modelId = modelId;
		this.registrySize = registrySize;

		// Maintain proper prototype chain for instanceof checks
		Object.setPrototypeOf(this, ModelNotFoundError.prototype);
	}

	/**
	 * Get a user-friendly error message for display in notifications.
	 * The message is contextual based on whether the registry has models or not.
	 */
	getUserFriendlyMessage(): string {
		if (!this.modelId || this.modelId.trim() === "") {
			return "No model selected. Please select a model in Settings → Model Management.";
		}

		if (this.registrySize === 0) {
			return `Model "${this.modelId}" not found. No models are configured yet. Please add models in Settings → Model Management.`;
		}

		return `Model "${this.modelId}" was not found in the model registry. It may have been deleted or renamed. Please reconfigure in Settings → Model Management.`;
	}

	/**
	 * Get suggestions for resolving the error.
	 */
	getSuggestions(): string[] {
		const suggestions: string[] = [];

		if (!this.modelId || this.modelId.trim() === "") {
			suggestions.push("Open Settings and navigate to Model Management");
			suggestions.push("Add a new model configuration");
			suggestions.push("Select the model for your desired mode (Main, Consensus, or Council)");
		} else if (this.registrySize === 0) {
			suggestions.push("Open Settings → Model Management");
			suggestions.push("Click 'Add Model' to create a new model configuration");
			suggestions.push("Configure your OpenAI or Ollama provider settings");
		} else {
			suggestions.push("Open Settings → Model Management to view available models");
			suggestions.push("The model may have been deleted - re-add it if needed");
			suggestions.push("Update the mode configuration to use an existing model");
		}

		return suggestions;
	}
}

/**
 * Result of resolving a model reference.
 * Contains the full configuration plus the reference metadata.
 */
export interface ResolvedModelReference {
	/** The full model configuration from the registry */
	config: ModelConfiguration;

	/** Weight for this model (from the reference) */
	weight: number;

	/** Whether this model is enabled (from the reference) */
	enabled: boolean;
}

/**
 * Resolves model IDs to their full configurations from the registry.
 *
 * The ModelResolver is the bridge between the reference-based settings
 * (where models are stored as IDs) and runtime usage (where full
 * configurations are needed).
 *
 * @example
 * ```typescript
 * import { noticeService } from '../../utils/noticeService';
 *
 * const resolver = new ModelResolver(settings.modelRegistry);
 *
 * // Resolve a single model
 * try {
 *   const model = resolver.resolve(settings.activeModelId);
 *   // Use model.providerConfig, model.displayName, etc.
 * } catch (error) {
 *   if (error instanceof ModelNotFoundError) {
 *     // Task 40: Use noticeService for consistent error notices
 *     noticeService.error(error.getUserFriendlyMessage());
 *   }
 * }
 *
 * // Resolve all consensus models
 * const consensusModels = resolver.resolveMany(settings.consensusSettings.models);
 * const enabledModels = consensusModels.filter(m => m.enabled);
 * ```
 *
 * Requirements: 1.4, 4.6, 7.3, 7.6
 */
export class ModelResolver {
	private readonly registry: ModelRegistry;

	/**
	 * Create a new ModelResolver instance.
	 *
	 * @param registry - The model registry to resolve IDs from
	 */
	constructor(registry: ModelRegistry) {
		this.registry = registry;
	}

	/**
	 * Resolve a model ID to its full configuration.
	 *
	 * @param modelId - The model ID to resolve
	 * @returns The full ModelConfiguration
	 * @throws ModelNotFoundError if the model ID is not in the registry
	 *
	 * Requirements: 1.4
	 */
	resolve(modelId: string): ModelConfiguration {
		if (!modelId || modelId.trim() === "") {
			throw new ModelNotFoundError(modelId, this.getRegistrySize());
		}

		const model = this.registry.models[modelId];

		if (!model) {
			throw new ModelNotFoundError(modelId, this.getRegistrySize());
		}

		return model;
	}

	/**
	 * Try to resolve a model ID, returning null instead of throwing.
	 *
	 * Use this method when you want to handle missing models gracefully
	 * without try/catch blocks.
	 *
	 * @param modelId - The model ID to resolve
	 * @returns The ModelConfiguration or null if not found
	 */
	tryResolve(modelId: string): ModelConfiguration | null {
		if (!modelId || modelId.trim() === "") {
			return null;
		}

		return this.registry.models[modelId] ?? null;
	}

	/**
	 * Check if a model ID exists in the registry.
	 *
	 * @param modelId - The model ID to check
	 * @returns true if the model exists, false otherwise
	 */
	exists(modelId: string): boolean {
		if (!modelId || modelId.trim() === "") {
			return false;
		}

		return modelId in this.registry.models;
	}

	/**
	 * Resolve multiple model references for Consensus or Council modes.
	 *
	 * This method resolves an array of model references (which contain
	 * modelId, weight, and enabled flags) to their full configurations.
	 *
	 * If a model reference cannot be resolved (model not found), it will
	 * throw a ModelNotFoundError. Use resolveManyIgnoreErrors for graceful
	 * handling of missing models.
	 *
	 * @param references - Array of ConsensusModelReference or CouncilModelReference
	 * @returns Array of resolved references with full configurations
	 * @throws ModelNotFoundError if any model ID is not found
	 *
	 * Requirements: 1.4
	 */
	resolveMany(
		references: Array<ConsensusModelReference | CouncilModelReference>
	): ResolvedModelReference[] {
		if (!references || references.length === 0) {
			return [];
		}

		return references.map((ref) => ({
			config: this.resolve(ref.modelId),
			weight: ref.weight,
			enabled: ref.enabled,
		}));
	}

	/**
	 * Resolve multiple model references, skipping those that can't be found.
	 *
	 * Unlike resolveMany, this method will not throw on missing models.
	 * Instead, it will skip them and return only the successfully resolved
	 * references. This is useful for graceful degradation.
	 *
	 * @param references - Array of ConsensusModelReference or CouncilModelReference
	 * @returns Array of successfully resolved references
	 */
	resolveManyIgnoreErrors(
		references: Array<ConsensusModelReference | CouncilModelReference>
	): ResolvedModelReference[] {
		if (!references || references.length === 0) {
			return [];
		}

		const results: ResolvedModelReference[] = [];

		for (const ref of references) {
			const config = this.tryResolve(ref.modelId);
			if (config) {
				results.push({
					config,
					weight: ref.weight,
					enabled: ref.enabled,
				});
			}
		}

		return results;
	}

	/**
	 * Resolve only enabled model references.
	 *
	 * Convenience method that resolves references and filters to only
	 * those that are enabled. Useful for getting the active models
	 * for consensus or council generation.
	 *
	 * @param references - Array of ConsensusModelReference or CouncilModelReference
	 * @returns Array of resolved references where enabled is true
	 * @throws ModelNotFoundError if any enabled model ID is not found
	 */
	resolveEnabled(
		references: Array<ConsensusModelReference | CouncilModelReference>
	): ResolvedModelReference[] {
		if (!references || references.length === 0) {
			return [];
		}

		// Filter to enabled references first, then resolve
		const enabledRefs = references.filter((ref) => ref.enabled);
		return this.resolveMany(enabledRefs);
	}

	/**
	 * Get usage information for a model across all settings.
	 *
	 * This method checks where a model is being used (main, consensus,
	 * council, chair) to provide information for warnings when editing
	 * or deleting shared models.
	 *
	 * @param modelId - The model ID to check
	 * @param settings - The full quiz settings to check against
	 * @returns ModelUsageInfo describing where the model is used
	 *
	 * Requirements: 4.6, 7.3
	 */
	getUsageInfo(modelId: string, settings: QuizSettings): ModelUsageInfo {
		const usageInfo = createEmptyModelUsageInfo(modelId);
		const usageLocations: ModelUsageLocation[] = [];

		// Check if used as main model
		if (settings.activeModelId === modelId) {
			usageInfo.isMainModel = true;
			usageLocations.push("main");
		}

		// Check if used in consensus
		if (settings.consensusSettings?.models) {
			const inConsensus = settings.consensusSettings.models.some(
				(ref) => ref.modelId === modelId
			);
			if (inConsensus) {
				usageInfo.isInConsensus = true;
				usageLocations.push("consensus");
			}
		}

		// Check if used in council
		if (settings.councilSettings?.models) {
			const inCouncil = settings.councilSettings.models.some(
				(ref) => ref.modelId === modelId
			);
			if (inCouncil) {
				usageInfo.isInCouncil = true;
				usageLocations.push("council");
			}
		}

		// Check if used as chair model
		if (
			settings.councilSettings?.chairModel?.selectionStrategy === "configured" &&
			settings.councilSettings.chairModel.configuredChairId === modelId
		) {
			usageInfo.isChairModel = true;
			usageLocations.push("chair");
		}

		usageInfo.usageLocations = usageLocations;
		usageInfo.usageCount = usageLocations.length;

		return usageInfo;
	}

	/**
	 * Get all models from the registry.
	 *
	 * @returns Array of all ModelConfiguration objects
	 */
	getAllModels(): ModelConfiguration[] {
		return Object.values(this.registry.models);
	}

	/**
	 * Get the number of models in the registry.
	 *
	 * @returns The count of models
	 */
	getRegistrySize(): number {
		return Object.keys(this.registry.models).length;
	}

	/**
	 * Check if the registry is empty.
	 *
	 * @returns true if no models are configured
	 */
	isEmpty(): boolean {
		return this.getRegistrySize() === 0;
	}

	/**
	 * Get model IDs that are referenced but don't exist in the registry.
	 *
	 * This is useful for validation and migration - finding broken
	 * references that need to be cleaned up.
	 *
	 * @param settings - The full quiz settings to check
	 * @returns Array of model IDs that are referenced but missing
	 */
	findBrokenReferences(settings: QuizSettings): string[] {
		const brokenRefs: Set<string> = new Set();

		// Check main model
		if (settings.activeModelId && !this.exists(settings.activeModelId)) {
			brokenRefs.add(settings.activeModelId);
		}

		// Check consensus models
		if (settings.consensusSettings?.models) {
			for (const ref of settings.consensusSettings.models) {
				if (!this.exists(ref.modelId)) {
					brokenRefs.add(ref.modelId);
				}
			}
		}

		// Check council models
		if (settings.councilSettings?.models) {
			for (const ref of settings.councilSettings.models) {
				if (!this.exists(ref.modelId)) {
					brokenRefs.add(ref.modelId);
				}
			}
		}

		// Check chair model
		if (
			settings.councilSettings?.chairModel?.selectionStrategy === "configured" &&
			settings.councilSettings.chairModel.configuredChairId &&
			!this.exists(settings.councilSettings.chairModel.configuredChairId)
		) {
			brokenRefs.add(settings.councilSettings.chairModel.configuredChairId);
		}

		return Array.from(brokenRefs);
	}
}

/**
 * Create a ModelResolver from quiz settings.
 *
 * Convenience function that creates a resolver from the settings object,
 * handling the case where modelRegistry might not exist yet.
 *
 * @param settings - The quiz settings
 * @returns A ModelResolver instance
 */
export function createModelResolver(settings: QuizSettings): ModelResolver {
	const registry = settings.modelRegistry ?? { models: {}, version: 1 };
	return new ModelResolver(registry);
}

/**
 * Type guard to check if an error is a ModelNotFoundError.
 */
export function isModelNotFoundError(error: unknown): error is ModelNotFoundError {
	return error instanceof ModelNotFoundError;
}

/**
 * Type guard to check if an object is a valid ResolvedModelReference.
 */
export function isResolvedModelReference(obj: unknown): obj is ResolvedModelReference {
	if (obj === null || typeof obj !== "object") {
		return false;
	}
	const ref = obj as Record<string, unknown>;
	return (
		ref.config !== null &&
		typeof ref.config === "object" &&
		typeof ref.weight === "number" &&
		typeof ref.enabled === "boolean"
	);
}
