/**
 * Notice Service
 *
 * Provides a centralized utility for displaying consistent notices throughout the plugin.
 * Handles success, error, warning, and info notices with appropriate timing and dismissal.
 *
 * Task 40: Add success/error notices for all user actions
 * Requirements: 9.1, 9.2, 9.5, 10.1
 */

import { Notice } from "obsidian";

/**
 * Notice types for consistent styling and timing
 */
export type NoticeType = "success" | "error" | "warning" | "info";

/**
 * Options for displaying a notice
 */
export interface NoticeOptions {
	/** Optional duration in milliseconds (0 = stays until dismissed) */
	duration?: number;
	/** Optional prefix to add before the message */
	prefix?: string;
}

/**
 * Default durations for different notice types (in milliseconds)
 *
 * - Success: 3000ms - Quick acknowledgment
 * - Info: 4000ms - Informational, slightly longer
 * - Warning: 5000ms - Important, needs attention
 * - Error: 0 - Stays until dismissed (critical issues)
 */
export const NOTICE_DURATIONS: Record<NoticeType, number> = {
	success: 3000,
	info: 4000,
	warning: 5000,
	error: 0, // Stays until user dismisses
};

/**
 * Prefixes for different notice types
 */
export const NOTICE_PREFIXES: Record<NoticeType, string> = {
	success: "",
	info: "",
	warning: "Warning: ",
	error: "Error: ",
};

/**
 * Notice messages for model management operations
 */
export const MODEL_NOTICES = {
	// Add operations
	ADD_SUCCESS: (displayName: string) => `Model "${displayName}" added successfully`,
	ADD_ERROR: (error: string) => `Failed to add model: ${error}`,

	// Edit operations
	EDIT_SUCCESS: (displayName: string) => `Model "${displayName}" updated successfully`,
	EDIT_ERROR: (error: string) => `Failed to update model: ${error}`,

	// Delete operations
	DELETE_SUCCESS: (displayName: string) => `Model "${displayName}" deleted`,
	DELETE_WITH_CLEANUP: (displayName: string) =>
		`Model "${displayName}" deleted and removed from all features`,
	DELETE_ERROR: (error: string) => `Failed to delete model: ${error}`,

	// Validation messages
	VALIDATION_DISPLAY_NAME_REQUIRED: "Display name is required",
	VALIDATION_DISPLAY_NAME_EXISTS: (name: string) =>
		`A model with the name "${name}" already exists`,
	VALIDATION_API_KEY_REQUIRED: "API key is required for OpenAI provider",
	VALIDATION_BASE_URL_REQUIRED: "Base URL is required",
	VALIDATION_GENERATION_MODEL_REQUIRED: "Generation model is required",
	VALIDATION_EMBEDDING_MISSING:
		"Warning: No embedding model configured. Short/long answer questions cannot be evaluated automatically.",

	// Model reference errors
	MODEL_NOT_FOUND: (modelId: string) =>
		`Model "${modelId}" not found. It may have been deleted. Please reconfigure in Settings.`,
	MODEL_NOT_SELECTED: "No model selected. Please select a model in Settings → Model Management.",
	NO_MODELS_CONFIGURED:
		"No models configured. Please add a model in Settings → Model Management.",

	// Usage warnings
	MODEL_IN_USE_DELETED: (locations: string) =>
		`Model was removed from: ${locations}. Some features may need reconfiguration.`,
	MODEL_SHARED_UPDATED: (locations: string) =>
		`Changes applied to all locations: ${locations}`,
} as const;

/**
 * Notice messages for validation failures
 */
export const VALIDATION_NOTICES = {
	// Field-specific errors
	FIELD_REQUIRED: (fieldName: string) => `${fieldName} is required`,
	FIELD_TOO_LONG: (fieldName: string, maxLength: number) =>
		`${fieldName} is too long. Maximum ${maxLength} characters allowed.`,
	FIELD_INVALID_FORMAT: (fieldName: string, hint: string) =>
		`${fieldName} format is invalid. ${hint}`,

	// URL validation
	INVALID_URL: (url: string) =>
		`Invalid URL format: "${url}". Please enter a complete URL starting with http:// or https://`,

	// Provider-specific
	OPENAI_API_KEY_REQUIRED:
		"OpenAI API Key is required. You can find your API key at https://platform.openai.com/api-keys",
	OLLAMA_NOT_RUNNING:
		"Could not connect to Ollama. Ensure Ollama is running at the specified URL.",

	// General validation
	SAVE_PREVENTED: "Cannot save: Please fix the validation errors above",
	CONFIGURATION_INCOMPLETE: "Configuration is incomplete. Please fill in all required fields.",
} as const;

/**
 * Notice messages for mode operations (Consensus/Council)
 */
export const MODE_NOTICES = {
	// Consensus
	CONSENSUS_ENABLED: "Consensus mode enabled",
	CONSENSUS_MODEL_ADDED: "Model added to Consensus",
	CONSENSUS_INSUFFICIENT_MODELS: (required: number, current: number) =>
		`Consensus mode requires at least ${required} models. Currently have ${current}.`,
	CONSENSUS_MODEL_NOT_FOUND: (modelId: string) =>
		`Consensus model "${modelId}" not found in registry. Please reconfigure.`,

	// Council
	COUNCIL_ENABLED: "Council mode enabled",
	COUNCIL_MODEL_ADDED: "Model added to Council",
	COUNCIL_INSUFFICIENT_MODELS: (required: number, current: number) =>
		`Council mode requires at least ${required} models. Currently have ${current}.`,
	COUNCIL_CHAIR_NOT_FOUND:
		"Council chair model not found in registry. Please reconfigure.",
	COUNCIL_MODEL_NOT_FOUND: (modelId: string) =>
		`Council model "${modelId}" not found in registry. Please reconfigure.`,
} as const;

/**
 * Centralized service for displaying notices with consistent timing and styling.
 *
 * @example
 * ```typescript
 * const noticeService = new NoticeService();
 *
 * // Show success notice (auto-dismisses after 3 seconds)
 * noticeService.success("Model saved successfully");
 *
 * // Show error notice (stays until dismissed)
 * noticeService.error("Failed to save model: Invalid configuration");
 *
 * // Show warning notice (5 seconds)
 * noticeService.warning("Model is used in multiple places");
 *
 * // Custom duration
 * noticeService.info("Processing...", { duration: 2000 });
 * ```
 */
export class NoticeService {
	/**
	 * Show a success notice
	 *
	 * @param message - The message to display
	 * @param options - Optional configuration
	 * @returns The Notice instance
	 */
	success(message: string, options?: NoticeOptions): Notice {
		return this.show("success", message, options);
	}

	/**
	 * Show an error notice (stays until dismissed by default)
	 *
	 * @param message - The error message to display
	 * @param options - Optional configuration
	 * @returns The Notice instance
	 */
	error(message: string, options?: NoticeOptions): Notice {
		return this.show("error", message, options);
	}

	/**
	 * Show a warning notice
	 *
	 * @param message - The warning message to display
	 * @param options - Optional configuration
	 * @returns The Notice instance
	 */
	warning(message: string, options?: NoticeOptions): Notice {
		return this.show("warning", message, options);
	}

	/**
	 * Show an informational notice
	 *
	 * @param message - The info message to display
	 * @param options - Optional configuration
	 * @returns The Notice instance
	 */
	info(message: string, options?: NoticeOptions): Notice {
		return this.show("info", message, options);
	}

	/**
	 * Show a notice with the specified type
	 *
	 * @param type - The type of notice
	 * @param message - The message to display
	 * @param options - Optional configuration
	 * @returns The Notice instance
	 */
	show(type: NoticeType, message: string, options?: NoticeOptions): Notice {
		const duration = options?.duration ?? NOTICE_DURATIONS[type];
		const prefix = options?.prefix ?? NOTICE_PREFIXES[type];
		const fullMessage = prefix ? `${prefix}${message}` : message;

		return new Notice(fullMessage, duration);
	}

	/**
	 * Show a success notice for adding a model
	 */
	modelAdded(displayName: string): Notice {
		return this.success(MODEL_NOTICES.ADD_SUCCESS(displayName));
	}

	/**
	 * Show a success notice for updating a model
	 */
	modelUpdated(displayName: string): Notice {
		return this.success(MODEL_NOTICES.EDIT_SUCCESS(displayName));
	}

	/**
	 * Show a success notice for deleting a model
	 */
	modelDeleted(displayName: string, hadUsages: boolean = false): Notice {
		const message = hadUsages
			? MODEL_NOTICES.DELETE_WITH_CLEANUP(displayName)
			: MODEL_NOTICES.DELETE_SUCCESS(displayName);
		return this.success(message);
	}

	/**
	 * Show an error notice for a model operation failure
	 */
	modelOperationFailed(operation: "add" | "edit" | "delete", error: string): Notice {
		const messages = {
			add: MODEL_NOTICES.ADD_ERROR(error),
			edit: MODEL_NOTICES.EDIT_ERROR(error),
			delete: MODEL_NOTICES.DELETE_ERROR(error),
		};
		return this.error(messages[operation]);
	}

	/**
	 * Show an error notice for a missing model reference
	 */
	modelNotFound(modelId: string): Notice {
		return this.error(MODEL_NOTICES.MODEL_NOT_FOUND(modelId));
	}

	/**
	 * Show an error notice when no model is selected
	 */
	noModelSelected(): Notice {
		return this.error(MODEL_NOTICES.MODEL_NOT_SELECTED);
	}

	/**
	 * Show an error notice when no models are configured
	 */
	noModelsConfigured(): Notice {
		return this.error(MODEL_NOTICES.NO_MODELS_CONFIGURED);
	}

	/**
	 * Show a warning notice for missing embedding model
	 */
	embeddingModelMissing(): Notice {
		return this.warning(MODEL_NOTICES.VALIDATION_EMBEDDING_MISSING);
	}

	/**
	 * Show an error notice for a required field
	 */
	fieldRequired(fieldName: string): Notice {
		return this.error(VALIDATION_NOTICES.FIELD_REQUIRED(fieldName));
	}

	/**
	 * Show an error notice for a field that's too long
	 */
	fieldTooLong(fieldName: string, maxLength: number): Notice {
		return this.error(VALIDATION_NOTICES.FIELD_TOO_LONG(fieldName, maxLength));
	}

	/**
	 * Show an error notice for invalid field format
	 */
	fieldInvalidFormat(fieldName: string, hint: string): Notice {
		return this.error(VALIDATION_NOTICES.FIELD_INVALID_FORMAT(fieldName, hint));
	}

	/**
	 * Show an error notice for validation preventing save
	 */
	validationPreventsSave(): Notice {
		return this.error(VALIDATION_NOTICES.SAVE_PREVENTED);
	}

	/**
	 * Show a success notice for enabling consensus mode
	 */
	consensusEnabled(): Notice {
		return this.success(MODE_NOTICES.CONSENSUS_ENABLED);
	}

	/**
	 * Show a success notice for adding a model to consensus
	 */
	consensusModelAdded(): Notice {
		return this.success(MODE_NOTICES.CONSENSUS_MODEL_ADDED);
	}

	/**
	 * Show an error notice for insufficient consensus models
	 */
	consensusInsufficientModels(required: number, current: number): Notice {
		return this.error(MODE_NOTICES.CONSENSUS_INSUFFICIENT_MODELS(required, current));
	}

	/**
	 * Show a success notice for enabling council mode
	 */
	councilEnabled(): Notice {
		return this.success(MODE_NOTICES.COUNCIL_ENABLED);
	}

	/**
	 * Show a success notice for adding a model to council
	 */
	councilModelAdded(): Notice {
		return this.success(MODE_NOTICES.COUNCIL_MODEL_ADDED);
	}

	/**
	 * Show an error notice for insufficient council models
	 */
	councilInsufficientModels(required: number, current: number): Notice {
		return this.error(MODE_NOTICES.COUNCIL_INSUFFICIENT_MODELS(required, current));
	}
}

/**
 * Default NoticeService instance for convenience.
 *
 * @example
 * ```typescript
 * import { noticeService } from './utils/noticeService';
 *
 * noticeService.success("Operation completed");
 * ```
 */
export const noticeService = new NoticeService();

/**
 * Show a success notice using the default service.
 */
export function showSuccess(message: string, options?: NoticeOptions): Notice {
	return noticeService.success(message, options);
}

/**
 * Show an error notice using the default service.
 */
export function showError(message: string, options?: NoticeOptions): Notice {
	return noticeService.error(message, options);
}

/**
 * Show a warning notice using the default service.
 */
export function showWarning(message: string, options?: NoticeOptions): Notice {
	return noticeService.warning(message, options);
}

/**
 * Show an info notice using the default service.
 */
export function showInfo(message: string, options?: NoticeOptions): Notice {
	return noticeService.info(message, options);
}

/**
 * Format a list of validation errors for display in a notice.
 *
 * @param errors - Array of error messages
 * @returns Formatted error string
 */
export function formatValidationErrors(errors: string[]): string {
	if (errors.length === 0) {
		return "";
	}

	if (errors.length === 1) {
		return errors[0];
	}

	return errors.map((e, i) => `${i + 1}. ${e}`).join("\n");
}

/**
 * Format model usage locations for display in a notice.
 *
 * @param locations - Array of location identifiers
 * @returns Human-readable string of locations
 */
export function formatUsageLocations(
	locations: Array<"main" | "consensus" | "council" | "chair">
): string {
	const locationNames: Record<string, string> = {
		main: "Main Generation",
		consensus: "Consensus Mode",
		council: "Council Mode",
		chair: "Council Chair",
	};

	const formattedLocations = locations.map((loc) => locationNames[loc] || loc);

	if (formattedLocations.length === 0) {
		return "";
	}

	if (formattedLocations.length === 1) {
		return formattedLocations[0];
	}

	const last = formattedLocations.pop();
	return `${formattedLocations.join(", ")} and ${last}`;
}

/**
 * Show an error notice for a ModelNotFoundError.
 * This is a convenience function that extracts the user-friendly message.
 *
 * @param error - An error that may be a ModelNotFoundError
 * @returns The Notice instance if an error was shown, null otherwise
 *
 * @example
 * ```typescript
 * import { showModelNotFoundError } from './utils/noticeService';
 * import { ModelNotFoundError } from './settings/modelRegistry/modelResolver';
 *
 * try {
 *   const model = resolver.resolve(modelId);
 * } catch (error) {
 *   showModelNotFoundError(error);
 * }
 * ```
 */
export function showModelNotFoundError(error: unknown): Notice | null {
	// Check if error has getUserFriendlyMessage method (duck typing for ModelNotFoundError)
	if (
		error !== null &&
		typeof error === "object" &&
		"getUserFriendlyMessage" in error &&
		typeof (error as { getUserFriendlyMessage: unknown }).getUserFriendlyMessage === "function"
	) {
		const message = (error as { getUserFriendlyMessage: () => string }).getUserFriendlyMessage();
		return noticeService.error(message);
	}

	// Fallback for regular errors
	if (error instanceof Error) {
		return noticeService.error(error.message);
	}

	return null;
}
