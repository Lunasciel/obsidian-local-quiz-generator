import Generator from "./generator";
import { Provider } from "./providers";
import { QuizSettings } from "../settings/config";
import OpenAIGenerator from "./openai/openAIGenerator";
import OllamaGenerator from "./ollama/ollamaGenerator";
import {
	ModelConfiguration,
	ProviderConfig,
} from "../settings/modelRegistry/types";
import {
	createModelResolver,
	isModelNotFoundError,
} from "../settings/modelRegistry/modelResolver";
import { GeneratorSettings, createGeneratorSettings } from "./generatorTypes";

/**
 * Error thrown when generator creation fails
 */
export class GeneratorCreationError extends Error {
	/** The model ID that failed (if applicable) */
	public readonly modelId?: string;

	/** The underlying error */
	public readonly cause?: Error;

	constructor(message: string, modelId?: string, cause?: Error) {
		super(message);
		this.name = "GeneratorCreationError";
		this.modelId = modelId;
		this.cause = cause;
		Object.setPrototypeOf(this, GeneratorCreationError.prototype);
	}

	/**
	 * Get a user-friendly error message for display in notices
	 */
	getUserFriendlyMessage(): string {
		if (this.modelId) {
			return `Failed to create generator for model "${this.modelId}". Please check your settings.`;
		}
		return "Failed to create generator. Please check your settings.";
	}
}

/**
 * Factory for creating Generator instances from model configurations.
 *
 * This factory creates generators from the Model Registry using ProviderConfig
 * directly. All model configuration flows through the centralized registry.
 *
 * Requirements: 3.2, 3.3, 6.1
 */
export default class GeneratorFactory {
	/**
	 * Map of provider types to generator constructors.
	 * Each generator now accepts GeneratorSettings directly.
	 */
	private static generatorMap: { [key in Provider]: new (settings: GeneratorSettings) => Generator } = {
		[Provider.OPENAI]: OpenAIGenerator,
		[Provider.OLLAMA]: OllamaGenerator,
	};

	/**
	 * Create a generator instance from a ModelConfiguration.
	 *
	 * This is the primary method for creating generators. It takes a resolved
	 * ModelConfiguration and creates the appropriate generator with the correct
	 * provider settings.
	 *
	 * @param modelConfig - Resolved model configuration from the registry
	 * @param baseSettings - Base quiz settings for generation configuration (question types, language, etc.)
	 * @returns Generator instance configured for the model
	 * @throws GeneratorCreationError if generator creation fails
	 *
	 * Requirements: 3.2, 3.3, 6.1
	 */
	public static createFromModelConfig(
		modelConfig: ModelConfiguration,
		baseSettings: QuizSettings
	): Generator {
		return GeneratorFactory.createFromProviderConfig(
			modelConfig.providerConfig,
			baseSettings,
			modelConfig.id
		);
	}

	/**
	 * Create a generator instance directly from a ProviderConfig.
	 *
	 * This method creates a generator using the ProviderConfig directly,
	 * without needing a full ModelConfiguration. Useful for consensus/council
	 * modes or other cases where you have a ProviderConfig but not a full
	 * model configuration.
	 *
	 * @param providerConfig - Provider-specific configuration
	 * @param baseSettings - Base quiz settings for generation configuration
	 * @param modelId - Optional model ID for error reporting
	 * @returns Generator instance configured for the provider
	 * @throws GeneratorCreationError if generator creation fails
	 *
	 * Requirements: 3.2, 3.3, 6.1
	 */
	public static createFromProviderConfig(
		providerConfig: ProviderConfig,
		baseSettings: QuizSettings,
		modelId?: string
	): Generator {
		const provider = providerConfig.provider;

		const GeneratorConstructor = this.generatorMap[provider];
		if (!GeneratorConstructor) {
			throw new GeneratorCreationError(
				`Unknown provider: ${provider}`,
				modelId
			);
		}

		// Create GeneratorSettings from ProviderConfig and base settings
		const generatorSettings = createGeneratorSettings(
			providerConfig,
			{
				generateTrueFalse: baseSettings.generateTrueFalse,
				numberOfTrueFalse: baseSettings.numberOfTrueFalse,
				generateMultipleChoice: baseSettings.generateMultipleChoice,
				numberOfMultipleChoice: baseSettings.numberOfMultipleChoice,
				generateSelectAllThatApply: baseSettings.generateSelectAllThatApply,
				numberOfSelectAllThatApply: baseSettings.numberOfSelectAllThatApply,
				generateFillInTheBlank: baseSettings.generateFillInTheBlank,
				numberOfFillInTheBlank: baseSettings.numberOfFillInTheBlank,
				generateMatching: baseSettings.generateMatching,
				numberOfMatching: baseSettings.numberOfMatching,
				generateShortAnswer: baseSettings.generateShortAnswer,
				numberOfShortAnswer: baseSettings.numberOfShortAnswer,
				generateLongAnswer: baseSettings.generateLongAnswer,
				numberOfLongAnswer: baseSettings.numberOfLongAnswer,
			},
			baseSettings.language
		);

		try {
			return new GeneratorConstructor(generatorSettings);
		} catch (error) {
			throw new GeneratorCreationError(
				`Failed to create generator: ${(error as Error).message}`,
				modelId,
				error as Error
			);
		}
	}

	/**
	 * Create a generator by resolving a model ID from the registry.
	 *
	 * This method combines model resolution and generator creation in one step.
	 * It's useful when you have a model ID and need to create a generator.
	 *
	 * @param modelId - The model ID to resolve from the registry
	 * @param settings - Quiz settings containing the model registry
	 * @returns Generator instance for the resolved model
	 * @throws ModelNotFoundError if the model ID is not in the registry
	 * @throws GeneratorCreationError if generator creation fails
	 *
	 * Requirements: 3.2, 3.3, 6.1
	 */
	public static createFromModelId(modelId: string, settings: QuizSettings): Generator {
		const resolver = createModelResolver(settings);
		const modelConfig = resolver.resolve(modelId);
		return GeneratorFactory.createFromModelConfig(modelConfig, settings);
	}

	/**
	 * Try to create a generator from a model ID, returning null on failure.
	 *
	 * This method provides graceful error handling for cases where
	 * a model might not exist or generator creation might fail.
	 *
	 * @param modelId - The model ID to resolve from the registry
	 * @param settings - Quiz settings containing the model registry
	 * @returns Generator instance or null if creation failed
	 *
	 * Requirements: 3.2, 3.3
	 */
	public static tryCreateFromModelId(modelId: string, settings: QuizSettings): Generator | null {
		try {
			return GeneratorFactory.createFromModelId(modelId, settings);
		} catch (error) {
			// Log the error for debugging but return null for graceful handling
			console.warn(`Failed to create generator for model ${modelId}:`, error);
			return null;
		}
	}

	/**
	 * Create a generator with fallback behavior.
	 *
	 * Attempts to create a generator from the primary model ID. If that fails,
	 * falls back to the first available model in the registry.
	 *
	 * @param primaryModelId - Primary model ID to try first
	 * @param settings - Quiz settings containing the model registry
	 * @returns Generator instance
	 * @throws GeneratorCreationError if no generators could be created
	 *
	 * Requirements: 3.2, 3.3, 6.1
	 */
	public static createWithFallback(primaryModelId: string | null | undefined, settings: QuizSettings): Generator {
		// Try primary model first
		if (primaryModelId) {
			const generator = GeneratorFactory.tryCreateFromModelId(primaryModelId, settings);
			if (generator) {
				return generator;
			}
			console.warn(`Primary model ${primaryModelId} not available, trying fallback`);
		}

		// Try fallback to first available model in registry
		const resolver = createModelResolver(settings);
		const allModels = resolver.getAllModels();

		for (const model of allModels) {
			const generator = GeneratorFactory.tryCreateFromModelId(model.id, settings);
			if (generator) {
				console.info(`Using fallback model: ${model.displayName}`);
				return generator;
			}
		}

		throw new GeneratorCreationError(
			"No valid model configuration found. Please configure at least one model in settings.",
			primaryModelId ?? undefined
		);
	}

	/**
	 * Create a generator for the active model in settings.
	 *
	 * This is a convenience method that creates a generator for the currently
	 * active model (settings.activeModelId) with fallback behavior.
	 *
	 * @param settings - Quiz settings containing the model registry and active model ID
	 * @returns Generator instance
	 * @throws GeneratorCreationError if no generators could be created
	 *
	 * Requirements: 3.2, 3.3, 6.1
	 */
	public static createForActiveModel(settings: QuizSettings): Generator {
		return GeneratorFactory.createWithFallback(settings.activeModelId, settings);
	}

	/**
	 * Check if a model ID is valid and can be used to create a generator.
	 *
	 * @param modelId - The model ID to check
	 * @param settings - Quiz settings containing the model registry
	 * @returns true if the model exists and has valid configuration
	 */
	public static isModelValid(modelId: string, settings: QuizSettings): boolean {
		const resolver = createModelResolver(settings);
		return resolver.exists(modelId);
	}

	/**
	 * Get human-readable information about why generator creation failed.
	 *
	 * @param error - The error that occurred
	 * @returns User-friendly error message
	 */
	public static getErrorMessage(error: unknown): string {
		if (isModelNotFoundError(error)) {
			return error.getUserFriendlyMessage();
		}
		if (error instanceof GeneratorCreationError) {
			return error.getUserFriendlyMessage();
		}
		if (error instanceof Error) {
			return error.message;
		}
		return "Unknown error creating generator";
	}
}
