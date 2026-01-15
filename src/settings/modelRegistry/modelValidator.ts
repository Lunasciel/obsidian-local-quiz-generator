/**
 * Model Validator
 *
 * Validates model configurations before they are saved to the registry.
 * Handles required field validation, provider-specific validation,
 * and uniqueness checks.
 *
 * Requirements: 1.3, 5.1, 5.2, 5.3, 9.1, 9.2, 9.4
 */

import { Provider } from "../../generators/providers";
import {
	ModelConfiguration,
	ModelRegistry,
	ProviderConfig,
	OpenAIProviderConfig,
	OllamaProviderConfig,
} from "./types";

/**
 * Severity level for validation messages.
 * - error: Validation failed, configuration cannot be saved
 * - warning: Validation passed but with recommendations
 */
export type ValidationSeverity = "error" | "warning";

/**
 * A single validation message with severity and field information.
 */
export interface ValidationMessage {
	/** Severity of the validation issue */
	severity: ValidationSeverity;

	/** Human-readable message describing the issue */
	message: string;

	/** The field that caused the validation issue (optional) */
	field?: string;
}

/**
 * Result of a validation operation.
 */
export interface ValidationResult {
	/** Whether the configuration is valid (no errors) */
	isValid: boolean;

	/** List of validation messages (errors and warnings) */
	messages: ValidationMessage[];

	/** Convenience accessor for error messages only */
	errors: string[];

	/** Convenience accessor for warning messages only */
	warnings: string[];
}

/**
 * Maximum length for display name to prevent UI issues.
 */
export const MAX_DISPLAY_NAME_LENGTH = 100;

/**
 * Maximum length for model names.
 */
export const MAX_MODEL_NAME_LENGTH = 200;

/**
 * Maximum length for API keys.
 */
export const MAX_API_KEY_LENGTH = 500;

/**
 * Maximum length for base URLs.
 */
export const MAX_BASE_URL_LENGTH = 500;

/**
 * Validates model configurations for the model registry.
 *
 * Provides comprehensive validation including:
 * - Required field checks
 * - Provider-specific validation (OpenAI vs Ollama)
 * - Uniqueness validation for model IDs
 * - Length and format validation
 * - Warnings for missing optional but recommended fields
 *
 * @example
 * ```typescript
 * const validator = new ModelValidator();
 *
 * // Validate a model configuration
 * const result = validator.validateConfiguration(modelConfig);
 * if (!result.isValid) {
 *   console.error('Validation failed:', result.errors);
 * }
 *
 * // Check for uniqueness
 * const isUnique = validator.validateUniqueId('new-model-id', registry);
 * ```
 */
export class ModelValidator {
	/**
	 * Validate a complete model configuration.
	 *
	 * Checks all required fields, provider-specific requirements,
	 * and adds warnings for missing recommended fields.
	 *
	 * @param model - The model configuration to validate
	 * @returns ValidationResult with isValid flag and any messages
	 */
	validateConfiguration(model: Partial<ModelConfiguration>): ValidationResult {
		const messages: ValidationMessage[] = [];

		// Validate required core fields
		this.validateRequiredFields(model, messages);

		// Validate provider config if present
		if (model.providerConfig) {
			this.validateProviderConfig(model.providerConfig, messages);
		}

		// Check for recommended fields (warnings)
		this.validateRecommendedFields(model, messages);

		return this.createValidationResult(messages);
	}

	/**
	 * Validate that a model ID is unique within the registry.
	 *
	 * @param modelId - The model ID to check
	 * @param registry - The model registry to check against
	 * @param excludeId - Optional ID to exclude (for edit operations)
	 * @returns true if the ID is unique, false if it already exists
	 */
	validateUniqueId(
		modelId: string,
		registry: ModelRegistry,
		excludeId?: string
	): boolean {
		if (!modelId || modelId.trim() === "") {
			return false;
		}

		const existingIds = Object.keys(registry.models);
		return !existingIds.some((id) => id === modelId && id !== excludeId);
	}

	/**
	 * Validate that a display name is unique within the registry.
	 *
	 * @param displayName - The display name to check
	 * @param registry - The model registry to check against
	 * @param excludeId - Optional model ID to exclude (for edit operations)
	 * @returns true if the name is unique, false if it already exists
	 */
	validateUniqueDisplayName(
		displayName: string,
		registry: ModelRegistry,
		excludeId?: string
	): boolean {
		if (!displayName || displayName.trim() === "") {
			return false;
		}

		const normalizedName = displayName.trim().toLowerCase();
		return !Object.values(registry.models).some(
			(model) =>
				model.displayName.trim().toLowerCase() === normalizedName &&
				model.id !== excludeId
		);
	}

	/**
	 * Validate provider-specific configuration.
	 *
	 * @param providerConfig - The provider configuration to validate
	 * @returns ValidationResult with provider-specific validation messages
	 */
	validateProviderConfiguration(
		providerConfig: ProviderConfig
	): ValidationResult {
		const messages: ValidationMessage[] = [];
		this.validateProviderConfig(providerConfig, messages);
		return this.createValidationResult(messages);
	}

	/**
	 * Validate required core fields on the model configuration.
	 */
	private validateRequiredFields(
		model: Partial<ModelConfiguration>,
		messages: ValidationMessage[]
	): void {
		// Model ID validation
		if (!model.id || model.id.trim() === "") {
			messages.push({
				severity: "error",
				message: "Model ID is required. This is an internal identifier used to reference this model configuration.",
				field: "id",
			});
		}

		// Display name validation
		if (!model.displayName || model.displayName.trim() === "") {
			messages.push({
				severity: "error",
				message: "Display name is required. Enter a friendly name to identify this model (e.g., 'My GPT-4', 'Local Llama').",
				field: "displayName",
			});
		} else if (model.displayName.length > MAX_DISPLAY_NAME_LENGTH) {
			messages.push({
				severity: "error",
				message: `Display name is too long (${model.displayName.length} characters). Please use ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
				field: "displayName",
			});
		}

		// Provider config validation
		if (!model.providerConfig) {
			messages.push({
				severity: "error",
				message: "Provider configuration is required. Please select a provider (OpenAI or Ollama) and enter the required settings.",
				field: "providerConfig",
			});
		}
	}

	/**
	 * Validate provider-specific configuration.
	 */
	private validateProviderConfig(
		config: ProviderConfig,
		messages: ValidationMessage[]
	): void {
		switch (config.provider) {
			case Provider.OPENAI:
				this.validateOpenAIConfig(config as OpenAIProviderConfig, messages);
				break;
			case Provider.OLLAMA:
				this.validateOllamaConfig(config as OllamaProviderConfig, messages);
				break;
			default: {
				// TypeScript's exhaustive checking identifies config as `never` here.
				// We need to cast to access the provider for the error message.
				const unknownProvider = (config as { provider: string }).provider;
				messages.push({
					severity: "error",
					message: `Unknown provider type "${unknownProvider}". Please select a valid provider: OpenAI or Ollama.`,
					field: "providerConfig.provider",
				});
			}
		}
	}

	/**
	 * Validate OpenAI-specific configuration.
	 */
	private validateOpenAIConfig(
		config: OpenAIProviderConfig,
		messages: ValidationMessage[]
	): void {
		// API key is required for OpenAI
		if (!config.apiKey || config.apiKey.trim() === "") {
			messages.push({
				severity: "error",
				message: "API Key is required for OpenAI provider. You can find your API key at https://platform.openai.com/api-keys",
				field: "providerConfig.apiKey",
			});
		} else if (config.apiKey.length > MAX_API_KEY_LENGTH) {
			messages.push({
				severity: "error",
				message: `API Key is too long (${config.apiKey.length} characters). Please verify you've entered a valid API key (maximum ${MAX_API_KEY_LENGTH} characters).`,
				field: "providerConfig.apiKey",
			});
		}

		// Base URL validation
		if (!config.baseUrl || config.baseUrl.trim() === "") {
			messages.push({
				severity: "error",
				message: "Base URL is required. For OpenAI, use 'https://api.openai.com/v1'. For OpenAI-compatible providers like LM Studio, enter their API endpoint.",
				field: "providerConfig.baseUrl",
			});
		} else {
			this.validateBaseUrl(config.baseUrl, messages);
		}

		// Text generation model is required
		if (!config.textGenerationModel || config.textGenerationModel.trim() === "") {
			messages.push({
				severity: "error",
				message: "Generation Model is required. Enter the model name that will create quiz questions (e.g., 'gpt-4', 'gpt-3.5-turbo', 'gpt-4o').",
				field: "providerConfig.textGenerationModel",
			});
		} else if (config.textGenerationModel.length > MAX_MODEL_NAME_LENGTH) {
			messages.push({
				severity: "error",
				message: `Generation Model name is too long (${config.textGenerationModel.length} characters). Please use ${MAX_MODEL_NAME_LENGTH} characters or fewer.`,
				field: "providerConfig.textGenerationModel",
			});
		}

		// Embedding model is optional but recommended
		if (!config.embeddingModel || config.embeddingModel.trim() === "") {
			messages.push({
				severity: "warning",
				message:
					"Embedding Model not configured. Without an embedding model, short/long answer questions cannot be evaluated automatically. Consider adding one (e.g., 'text-embedding-3-small').",
				field: "providerConfig.embeddingModel",
			});
		} else if (config.embeddingModel.length > MAX_MODEL_NAME_LENGTH) {
			messages.push({
				severity: "error",
				message: `Embedding Model name is too long (${config.embeddingModel.length} characters). Please use ${MAX_MODEL_NAME_LENGTH} characters or fewer.`,
				field: "providerConfig.embeddingModel",
			});
		}
	}

	/**
	 * Validate Ollama-specific configuration.
	 */
	private validateOllamaConfig(
		config: OllamaProviderConfig,
		messages: ValidationMessage[]
	): void {
		// Base URL is required for Ollama
		if (!config.baseUrl || config.baseUrl.trim() === "") {
			messages.push({
				severity: "error",
				message: "Base URL is required for Ollama provider. The default Ollama server runs at 'http://localhost:11434'. Ensure Ollama is running before use.",
				field: "providerConfig.baseUrl",
			});
		} else {
			this.validateBaseUrl(config.baseUrl, messages);
		}

		// Text generation model is required
		if (!config.textGenerationModel || config.textGenerationModel.trim() === "") {
			messages.push({
				severity: "error",
				message: "Generation Model is required. Enter the model name that will create quiz questions (e.g., 'llama3', 'mistral', 'mixtral'). Run 'ollama list' to see available models.",
				field: "providerConfig.textGenerationModel",
			});
		} else if (config.textGenerationModel.length > MAX_MODEL_NAME_LENGTH) {
			messages.push({
				severity: "error",
				message: `Generation Model name is too long (${config.textGenerationModel.length} characters). Please use ${MAX_MODEL_NAME_LENGTH} characters or fewer.`,
				field: "providerConfig.textGenerationModel",
			});
		}

		// Embedding model is optional but recommended
		if (!config.embeddingModel || config.embeddingModel.trim() === "") {
			messages.push({
				severity: "warning",
				message:
					"Embedding Model not configured. Without an embedding model, short/long answer questions cannot be evaluated automatically. Consider adding one (e.g., 'nomic-embed-text').",
				field: "providerConfig.embeddingModel",
			});
		} else if (config.embeddingModel.length > MAX_MODEL_NAME_LENGTH) {
			messages.push({
				severity: "error",
				message: `Embedding Model name is too long (${config.embeddingModel.length} characters). Please use ${MAX_MODEL_NAME_LENGTH} characters or fewer.`,
				field: "providerConfig.embeddingModel",
			});
		}
	}

	/**
	 * Validate a base URL format.
	 */
	private validateBaseUrl(baseUrl: string, messages: ValidationMessage[]): void {
		if (baseUrl.length > MAX_BASE_URL_LENGTH) {
			messages.push({
				severity: "error",
				message: `Base URL is too long (${baseUrl.length} characters). Please use ${MAX_BASE_URL_LENGTH} characters or fewer.`,
				field: "providerConfig.baseUrl",
			});
			return;
		}

		try {
			const url = new URL(baseUrl);
			// Validate that it's http or https
			if (url.protocol !== "http:" && url.protocol !== "https:") {
				messages.push({
					severity: "error",
					message: `Base URL must use http:// or https:// protocol. Found: '${url.protocol}'. Example: 'https://api.openai.com/v1' or 'http://localhost:11434'.`,
					field: "providerConfig.baseUrl",
				});
			}
		} catch {
			messages.push({
				severity: "error",
				message: `Base URL is not a valid URL format. Please enter a complete URL starting with http:// or https:// (e.g., 'https://api.openai.com/v1').`,
				field: "providerConfig.baseUrl",
			});
		}
	}

	/**
	 * Validate recommended fields and add warnings if missing.
	 */
	private validateRecommendedFields(
		model: Partial<ModelConfiguration>,
		messages: ValidationMessage[]
	): void {
		// Timestamps are recommended for tracking
		if (typeof model.createdAt !== "number" || model.createdAt <= 0) {
			messages.push({
				severity: "warning",
				message: "Creation timestamp should be set",
				field: "createdAt",
			});
		}

		if (typeof model.modifiedAt !== "number" || model.modifiedAt <= 0) {
			messages.push({
				severity: "warning",
				message: "Modification timestamp should be set",
				field: "modifiedAt",
			});
		}
	}

	/**
	 * Create a ValidationResult from a list of messages.
	 */
	private createValidationResult(messages: ValidationMessage[]): ValidationResult {
		const errors = messages
			.filter((m) => m.severity === "error")
			.map((m) => m.message);

		const warnings = messages
			.filter((m) => m.severity === "warning")
			.map((m) => m.message);

		return {
			isValid: errors.length === 0,
			messages,
			errors,
			warnings,
		};
	}
}

/**
 * Default ModelValidator instance for convenience.
 */
export const modelValidator = new ModelValidator();
