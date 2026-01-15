/**
 * Display Name Generator
 *
 * Utility for automatically generating display names for models in the registry.
 * Provides consistent naming based on provider and model identifier, with handling
 * for duplicate names through numeric suffixes.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * @example
 * ```typescript
 * // Generate a display name for a new model
 * const displayName = generateDisplayName({
 *   provider: Provider.OPENAI,
 *   textGenerationModel: 'gpt-4',
 *   existingNames: ['OpenAI Compatible: gpt-3.5-turbo'],
 * });
 * // Result: 'OpenAI Compatible: gpt-4'
 *
 * // Handle duplicate names
 * const displayName2 = generateDisplayName({
 *   provider: Provider.OPENAI,
 *   textGenerationModel: 'gpt-4',
 *   existingNames: ['OpenAI Compatible: gpt-4'],
 * });
 * // Result: 'OpenAI Compatible: gpt-4 (2)'
 * ```
 */

import { Provider, providers } from "../../generators/providers";

/**
 * Options for generating a display name.
 */
export interface DisplayNameOptions {
	/** The provider type (OpenAI, Ollama, etc.) */
	provider: Provider;

	/** The text generation model identifier (e.g., 'gpt-4', 'llama2') */
	textGenerationModel: string;

	/** Optional embedding model identifier (not used in display name generation) */
	embeddingModel?: string;

	/** List of existing display names in the registry (for duplicate detection) */
	existingNames: string[];
}

/**
 * Get the human-readable display name for a provider.
 *
 * @param provider - The provider enum value
 * @returns Human-readable provider name
 *
 * @example
 * ```typescript
 * getProviderDisplayName(Provider.OPENAI); // 'OpenAI Compatible'
 * getProviderDisplayName(Provider.OLLAMA); // 'Ollama'
 * ```
 */
export function getProviderDisplayName(provider: Provider): string {
	// Use the providers map from the providers module
	const displayName = providers[provider];
	if (displayName) {
		// Simplify the OpenAI name for display names (remove the LM Studio part)
		if (provider === Provider.OPENAI) {
			return "OpenAI Compatible";
		}
		return displayName;
	}
	return "Unknown Provider";
}

/**
 * Generate a display name for a model based on provider and model identifier.
 * Format: "{Provider}: {ModelName}"
 *
 * If the generated name already exists in existingNames, a numeric suffix
 * is appended: "{Provider}: {ModelName} (2)", "(3)", etc.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * @param options - The options for generating the display name
 * @returns The generated display name
 *
 * @example
 * ```typescript
 * // Basic usage
 * generateDisplayName({
 *   provider: Provider.OLLAMA,
 *   textGenerationModel: 'llama2',
 *   existingNames: [],
 * });
 * // Result: 'Ollama: llama2'
 *
 * // With duplicate handling
 * generateDisplayName({
 *   provider: Provider.OLLAMA,
 *   textGenerationModel: 'llama2',
 *   existingNames: ['Ollama: llama2'],
 * });
 * // Result: 'Ollama: llama2 (2)'
 * ```
 */
export function generateDisplayName(options: DisplayNameOptions): string {
	const { provider, textGenerationModel, existingNames } = options;

	// Get the provider display name
	const providerName = getProviderDisplayName(provider);

	// Handle empty or whitespace-only model names
	const modelName = textGenerationModel?.trim() || "Unknown Model";

	// Create the base display name
	let baseName = `${providerName}: ${modelName}`;

	// Check for duplicates and add numeric suffix if needed
	if (existingNames.includes(baseName)) {
		let counter = 2;
		while (existingNames.includes(`${baseName} (${counter})`)) {
			counter++;
		}
		baseName = `${baseName} (${counter})`;
	}

	return baseName;
}

/**
 * Check if a display name should be auto-generated.
 * Returns true if the name is empty, only whitespace, or undefined.
 *
 * This is used to determine whether to use the auto-generated name
 * or preserve a user-provided custom name.
 *
 * Requirement: 3.3
 *
 * @param displayName - The display name to check
 * @returns true if the name should be auto-generated, false otherwise
 *
 * @example
 * ```typescript
 * shouldAutoGenerateName('');          // true
 * shouldAutoGenerateName('   ');       // true
 * shouldAutoGenerateName(undefined);   // true
 * shouldAutoGenerateName('My Model');  // false
 * ```
 */
export function shouldAutoGenerateName(displayName: string | undefined): boolean {
	return !displayName || displayName.trim() === "";
}

/**
 * Check if a display name matches the auto-generated pattern.
 * Auto-generated names follow the format: "{Provider}: {ModelName}" or
 * "{Provider}: {ModelName} (n)" for duplicates.
 *
 * This can be used to detect if a name was likely auto-generated,
 * which helps when deciding whether to update the name when the
 * text generation model changes.
 *
 * @param displayName - The display name to check
 * @param provider - The provider to check against
 * @param textGenerationModel - The model name to check against
 * @returns true if the name matches the auto-generated pattern
 *
 * @example
 * ```typescript
 * isAutoGeneratedName('OpenAI Compatible: gpt-4', Provider.OPENAI, 'gpt-4');
 * // true
 *
 * isAutoGeneratedName('OpenAI Compatible: gpt-4 (2)', Provider.OPENAI, 'gpt-4');
 * // true
 *
 * isAutoGeneratedName('My Custom Model', Provider.OPENAI, 'gpt-4');
 * // false
 * ```
 */
export function isAutoGeneratedName(
	displayName: string,
	provider: Provider,
	textGenerationModel: string
): boolean {
	const providerName = getProviderDisplayName(provider);
	const modelName = textGenerationModel?.trim() || "Unknown Model";
	const expectedBase = `${providerName}: ${modelName}`;

	// Check exact match
	if (displayName === expectedBase) {
		return true;
	}

	// Check match with numeric suffix pattern: "Base Name (n)"
	const suffixPattern = new RegExp(`^${escapeRegExp(expectedBase)} \\(\\d+\\)$`);
	return suffixPattern.test(displayName);
}

/**
 * Extract the numeric suffix from a display name if present.
 * Returns undefined if no suffix is found.
 *
 * @param displayName - The display name to check
 * @returns The numeric suffix, or undefined if none
 *
 * @example
 * ```typescript
 * extractNumericSuffix('Ollama: llama2 (2)');  // 2
 * extractNumericSuffix('Ollama: llama2 (10)'); // 10
 * extractNumericSuffix('Ollama: llama2');      // undefined
 * ```
 */
export function extractNumericSuffix(displayName: string): number | undefined {
	const match = displayName.match(/\((\d+)\)$/);
	if (match) {
		return parseInt(match[1], 10);
	}
	return undefined;
}

/**
 * Escape special regex characters in a string.
 * Used internally for building regex patterns.
 *
 * @param string - The string to escape
 * @returns The escaped string safe for use in regex
 */
function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Update an auto-generated display name when the model changes.
 * If the current name was auto-generated, generates a new name based on
 * the new model. If the name was custom, returns it unchanged.
 *
 * @param currentDisplayName - The current display name
 * @param oldProvider - The old provider (before change)
 * @param oldTextGenerationModel - The old model name (before change)
 * @param newProvider - The new provider
 * @param newTextGenerationModel - The new model name
 * @param existingNames - List of existing display names for duplicate detection
 * @returns The updated display name
 *
 * @example
 * ```typescript
 * // Auto-generated name gets updated
 * updateAutoGeneratedName(
 *   'OpenAI Compatible: gpt-3.5-turbo',
 *   Provider.OPENAI, 'gpt-3.5-turbo',
 *   Provider.OPENAI, 'gpt-4',
 *   []
 * );
 * // Result: 'OpenAI Compatible: gpt-4'
 *
 * // Custom name is preserved
 * updateAutoGeneratedName(
 *   'My Production Model',
 *   Provider.OPENAI, 'gpt-3.5-turbo',
 *   Provider.OPENAI, 'gpt-4',
 *   []
 * );
 * // Result: 'My Production Model'
 * ```
 */
export function updateAutoGeneratedName(
	currentDisplayName: string,
	oldProvider: Provider,
	oldTextGenerationModel: string,
	newProvider: Provider,
	newTextGenerationModel: string,
	existingNames: string[]
): string {
	// Check if the current name was auto-generated
	if (isAutoGeneratedName(currentDisplayName, oldProvider, oldTextGenerationModel)) {
		// Generate a new name based on the new model
		// Filter out the current name from existing names (we're replacing it)
		const filteredExistingNames = existingNames.filter(
			(name) => name !== currentDisplayName
		);
		return generateDisplayName({
			provider: newProvider,
			textGenerationModel: newTextGenerationModel,
			existingNames: filteredExistingNames,
		});
	}

	// Custom name - preserve it
	return currentDisplayName;
}
