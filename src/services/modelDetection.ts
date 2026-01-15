/**
 * Model Detection Service
 *
 * Service for automatically detecting available models from AI providers.
 * Supports OpenAI-compatible APIs and Ollama instances.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { Provider } from "../generators/providers";

/**
 * Model capability classification.
 * Used to categorize detected models by their primary purpose.
 */
export interface ModelCapabilities {
	/** Whether the model supports text generation (chat/completion) */
	textGeneration: boolean;
	/** Whether the model supports embedding generation */
	embedding: boolean;
}

/**
 * A model discovered from a provider.
 * Contains the essential information needed to configure the model.
 */
export interface DetectedModel {
	/** Model identifier (e.g., "gpt-4", "llama3:latest") */
	id: string;
	/** Display name (may be same as id, or enhanced with metadata) */
	name: string;
	/** The provider this model was detected from */
	provider: Provider;
	/** Model capabilities (text generation, embedding) */
	capabilities: ModelCapabilities;
	/** Additional metadata from the provider (size, family, etc.) */
	metadata?: Record<string, unknown>;
}

/**
 * Result of a model detection operation.
 * Contains either successful results or error information.
 */
export interface ModelDetectionResult {
	/** Whether the detection was successful */
	success: boolean;
	/** Array of detected models (empty on failure) */
	models: DetectedModel[];
	/** Error message if detection failed */
	error?: string;
	/** Whether this result came from cache */
	cached: boolean;
}

/**
 * Cached detection result with expiration tracking.
 * Used internally by ModelDetectionService.
 */
export interface CachedDetection {
	/** The base URL this cache entry is for */
	baseUrl: string;
	/** Timestamp when the detection was performed */
	detectedAt: number;
	/** Timestamp when this cache entry expires */
	expiresAt: number;
	/** The detected models */
	models: DetectedModel[];
}

/**
 * Types of errors that can occur during model detection.
 */
export enum ModelDetectionErrorType {
	/** Cannot reach the endpoint */
	NETWORK_ERROR = "NETWORK_ERROR",
	/** Invalid or missing API key */
	AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
	/** Endpoint doesn't support model listing */
	UNSUPPORTED_ENDPOINT = "UNSUPPORTED_ENDPOINT",
	/** Response format is unexpected */
	PARSE_ERROR = "PARSE_ERROR",
	/** Request took too long */
	TIMEOUT_ERROR = "TIMEOUT_ERROR",
}

/**
 * User-friendly error messages for each error type.
 */
export const ERROR_MESSAGES: Record<ModelDetectionErrorType, string> = {
	[ModelDetectionErrorType.NETWORK_ERROR]:
		"Could not connect to the server. Please check the URL and try again.",
	[ModelDetectionErrorType.AUTHENTICATION_ERROR]:
		"Invalid API key. Please check your credentials.",
	[ModelDetectionErrorType.UNSUPPORTED_ENDPOINT]:
		"This provider doesn't support automatic model detection.",
	[ModelDetectionErrorType.PARSE_ERROR]:
		"Unexpected response from provider. Please try again or enter models manually.",
	[ModelDetectionErrorType.TIMEOUT_ERROR]:
		"Request timed out. The server may be slow or unreachable.",
};

/**
 * Single model object from OpenAI /v1/models response.
 */
interface OpenAIModelObject {
	id: string;
	object: string;
	created?: number;
	owned_by?: string;
}

/**
 * Response from OpenAI /v1/models endpoint.
 */
interface OpenAIModelsResponse {
	object: string;
	data: OpenAIModelObject[];
}

/**
 * Model details from Ollama response.
 */
interface OllamaModelDetails {
	format?: string;
	family?: string;
	parameter_size?: string;
	quantization_level?: string;
}

/**
 * Single model object from Ollama /api/tags response.
 */
interface OllamaModelObject {
	name: string;
	modified_at?: string;
	size?: number;
	digest?: string;
	details?: OllamaModelDetails;
}

/**
 * Response from Ollama /api/tags endpoint.
 */
interface OllamaTagsResponse {
	models: OllamaModelObject[];
}

/**
 * Type guard to check if an object is a valid DetectedModel.
 */
export function isDetectedModel(obj: unknown): obj is DetectedModel {
	if (obj === null || typeof obj !== "object") {
		return false;
	}
	const model = obj as Record<string, unknown>;
	return (
		typeof model.id === "string" &&
		typeof model.name === "string" &&
		(model.provider === Provider.OPENAI || model.provider === Provider.OLLAMA) &&
		model.capabilities !== null &&
		typeof model.capabilities === "object" &&
		typeof (model.capabilities as Record<string, unknown>).textGeneration === "boolean" &&
		typeof (model.capabilities as Record<string, unknown>).embedding === "boolean"
	);
}

/**
 * Type guard to check if an object is a valid ModelDetectionResult.
 */
export function isModelDetectionResult(obj: unknown): obj is ModelDetectionResult {
	if (obj === null || typeof obj !== "object") {
		return false;
	}
	const result = obj as Record<string, unknown>;
	return (
		typeof result.success === "boolean" &&
		Array.isArray(result.models) &&
		result.models.every(isDetectedModel) &&
		typeof result.cached === "boolean"
	);
}

/**
 * Type guard to check if an object is a valid CachedDetection.
 */
export function isCachedDetection(obj: unknown): obj is CachedDetection {
	if (obj === null || typeof obj !== "object") {
		return false;
	}
	const cache = obj as Record<string, unknown>;
	return (
		typeof cache.baseUrl === "string" &&
		typeof cache.detectedAt === "number" &&
		typeof cache.expiresAt === "number" &&
		Array.isArray(cache.models) &&
		cache.models.every(isDetectedModel)
	);
}

/**
 * Normalize a base URL by removing trailing slashes.
 */
function normalizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, "");
}

/**
 * Check if a model name suggests it's an embedding model.
 * Based on common naming patterns from various providers.
 */
function isEmbeddingModelName(modelId: string): boolean {
	const lowerName = modelId.toLowerCase();
	return (
		lowerName.includes("embed") ||
		lowerName.includes("embedding") ||
		lowerName.includes("nomic-bert") ||
		lowerName.includes("bge-") ||
		lowerName.includes("e5-") ||
		lowerName.includes("sentence-")
	);
}

/**
 * Classify model capabilities based on model ID.
 * Most models support text generation; embedding models are identified by name patterns.
 */
function classifyModelCapabilities(modelId: string): ModelCapabilities {
	const isEmbedding = isEmbeddingModelName(modelId);
	return {
		textGeneration: !isEmbedding,
		embedding: isEmbedding,
	};
}

/**
 * Format model size in human-readable format.
 */
function formatModelSize(sizeBytes: number): string {
	if (sizeBytes < 1024 * 1024 * 1024) {
		return `${(sizeBytes / (1024 * 1024)).toFixed(0)} MB`;
	}
	return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Default cache duration in milliseconds (5 minutes).
 */
const DEFAULT_CACHE_DURATION_MS = 5 * 60 * 1000;

/**
 * Default request timeout in milliseconds (10 seconds).
 */
const DEFAULT_TIMEOUT_MS = 10 * 1000;

/**
 * Service for detecting available models from AI providers.
 *
 * Supports:
 * - OpenAI-compatible APIs (OpenAI, LM Studio, OpenRouter, etc.)
 * - Ollama instances
 *
 * Features:
 * - Automatic model capability classification
 * - Session caching to avoid repeated API calls
 * - Comprehensive error handling with user-friendly messages
 */
export class ModelDetectionService {
	/** Cache of detection results keyed by base URL */
	private cache: Map<string, CachedDetection>;

	/** Cache duration in milliseconds */
	private readonly cacheDurationMs: number;

	/** Request timeout in milliseconds */
	private readonly timeoutMs: number;

	/**
	 * Create a new ModelDetectionService.
	 *
	 * @param cacheDurationMs - How long to cache detection results (default: 5 minutes)
	 * @param timeoutMs - Request timeout (default: 10 seconds)
	 */
	constructor(
		cacheDurationMs: number = DEFAULT_CACHE_DURATION_MS,
		timeoutMs: number = DEFAULT_TIMEOUT_MS
	) {
		this.cache = new Map();
		this.cacheDurationMs = cacheDurationMs;
		this.timeoutMs = timeoutMs;
	}

	/**
	 * Detect models from an OpenAI-compatible endpoint.
	 * Queries GET /v1/models with the provided API key.
	 *
	 * @param baseUrl - The base URL of the OpenAI-compatible API
	 * @param apiKey - The API key for authentication
	 * @returns ModelDetectionResult with detected models or error
	 *
	 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
	 */
	async detectOpenAIModels(baseUrl: string, apiKey: string): Promise<ModelDetectionResult> {
		const normalizedUrl = normalizeBaseUrl(baseUrl);
		const cacheKey = `openai:${normalizedUrl}`;

		// Check cache first
		const cached = this.getCachedResult(cacheKey);
		if (cached) {
			return {
				success: true,
				models: cached.models,
				cached: true,
			};
		}

		try {
			// Build the models endpoint URL
			const modelsUrl = `${normalizedUrl}/models`;

			// Create abort controller for timeout
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

			try {
				const response = await fetch(modelsUrl, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				// Handle HTTP errors
				if (!response.ok) {
					if (response.status === 401 || response.status === 403) {
						return this.createErrorResult(ModelDetectionErrorType.AUTHENTICATION_ERROR);
					}
					if (response.status === 404) {
						return this.createErrorResult(ModelDetectionErrorType.UNSUPPORTED_ENDPOINT);
					}
					return this.createErrorResult(
						ModelDetectionErrorType.NETWORK_ERROR,
						`Server returned ${response.status}: ${response.statusText}`
					);
				}

				// Parse response
				const data = await response.json();
				const models = this.parseOpenAIResponse(data);

				// Cache the result
				this.setCachedResult(cacheKey, models);

				return {
					success: true,
					models,
					cached: false,
				};
			} catch (fetchError) {
				clearTimeout(timeoutId);
				throw fetchError;
			}
		} catch (error) {
			return this.handleDetectionError(error);
		}
	}

	/**
	 * Detect models from an Ollama instance.
	 * Queries GET /api/tags to retrieve installed models.
	 *
	 * @param baseUrl - The base URL of the Ollama instance (typically http://localhost:11434)
	 * @returns ModelDetectionResult with detected models or error
	 *
	 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
	 */
	async detectOllamaModels(baseUrl: string): Promise<ModelDetectionResult> {
		const normalizedUrl = normalizeBaseUrl(baseUrl);
		const cacheKey = `ollama:${normalizedUrl}`;

		// Check cache first
		const cached = this.getCachedResult(cacheKey);
		if (cached) {
			return {
				success: true,
				models: cached.models,
				cached: true,
			};
		}

		try {
			// Build the tags endpoint URL
			const tagsUrl = `${normalizedUrl}/api/tags`;

			// Create abort controller for timeout
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

			try {
				const response = await fetch(tagsUrl, {
					method: "GET",
					headers: {
						"Content-Type": "application/json",
					},
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				// Handle HTTP errors
				if (!response.ok) {
					if (response.status === 404) {
						return this.createErrorResult(ModelDetectionErrorType.UNSUPPORTED_ENDPOINT);
					}
					return this.createErrorResult(
						ModelDetectionErrorType.NETWORK_ERROR,
						`Server returned ${response.status}: ${response.statusText}`
					);
				}

				// Parse response
				const data = await response.json();
				const models = this.parseOllamaResponse(data);

				// Cache the result
				this.setCachedResult(cacheKey, models);

				return {
					success: true,
					models,
					cached: false,
				};
			} catch (fetchError) {
				clearTimeout(timeoutId);
				throw fetchError;
			}
		} catch (error) {
			return this.handleDetectionError(error, true);
		}
	}

	/**
	 * Clear the detection cache.
	 *
	 * @param baseUrl - Optional URL to clear cache for. If not provided, clears all cache.
	 */
	clearCache(baseUrl?: string): void {
		if (baseUrl) {
			const normalizedUrl = normalizeBaseUrl(baseUrl);
			// Clear both possible cache keys for this URL
			this.cache.delete(`openai:${normalizedUrl}`);
			this.cache.delete(`ollama:${normalizedUrl}`);
		} else {
			this.cache.clear();
		}
	}

	/**
	 * Check if a cached result exists and is still valid for the given URL.
	 *
	 * @param baseUrl - The base URL to check
	 * @returns true if a valid cached result exists
	 */
	hasCachedResult(baseUrl: string): boolean {
		const normalizedUrl = normalizeBaseUrl(baseUrl);
		const openaiKey = `openai:${normalizedUrl}`;
		const ollamaKey = `ollama:${normalizedUrl}`;

		const openaiCached = this.cache.get(openaiKey);
		if (openaiCached && openaiCached.expiresAt > Date.now()) {
			return true;
		}

		const ollamaCached = this.cache.get(ollamaKey);
		if (ollamaCached && ollamaCached.expiresAt > Date.now()) {
			return true;
		}

		return false;
	}

	/**
	 * Get the current cache size (for testing/debugging).
	 */
	getCacheSize(): number {
		return this.cache.size;
	}

	/**
	 * Get a cached result if it exists and hasn't expired.
	 */
	private getCachedResult(cacheKey: string): CachedDetection | null {
		const cached = this.cache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) {
			return cached;
		}
		// Remove expired entry
		if (cached) {
			this.cache.delete(cacheKey);
		}
		return null;
	}

	/**
	 * Store a detection result in the cache.
	 */
	private setCachedResult(cacheKey: string, models: DetectedModel[]): void {
		const now = Date.now();
		const baseUrl = cacheKey.split(":").slice(1).join(":"); // Remove provider prefix
		this.cache.set(cacheKey, {
			baseUrl,
			detectedAt: now,
			expiresAt: now + this.cacheDurationMs,
			models,
		});
	}

	/**
	 * Parse OpenAI /v1/models response into DetectedModel array.
	 */
	private parseOpenAIResponse(data: unknown): DetectedModel[] {
		if (!data || typeof data !== "object") {
			throw new Error("Invalid response format");
		}

		const response = data as OpenAIModelsResponse;
		if (!Array.isArray(response.data)) {
			throw new Error("Invalid response format: missing data array");
		}

		return response.data.map((model: OpenAIModelObject) => ({
			id: model.id,
			name: model.id,
			provider: Provider.OPENAI,
			capabilities: classifyModelCapabilities(model.id),
			metadata: {
				object: model.object,
				created: model.created,
				owned_by: model.owned_by,
			},
		}));
	}

	/**
	 * Parse Ollama /api/tags response into DetectedModel array.
	 */
	private parseOllamaResponse(data: unknown): DetectedModel[] {
		if (!data || typeof data !== "object") {
			throw new Error("Invalid response format");
		}

		const response = data as OllamaTagsResponse;
		if (!Array.isArray(response.models)) {
			throw new Error("Invalid response format: missing models array");
		}

		return response.models.map((model: OllamaModelObject) => {
			const metadata: Record<string, unknown> = {};

			if (model.size !== undefined) {
				metadata.size = model.size;
				metadata.sizeFormatted = formatModelSize(model.size);
			}
			if (model.details) {
				metadata.family = model.details.family;
				metadata.parameterSize = model.details.parameter_size;
				metadata.quantizationLevel = model.details.quantization_level;
			}
			if (model.modified_at) {
				metadata.modifiedAt = model.modified_at;
			}

			// Create a display name with size info if available
			let displayName = model.name;
			if (model.details?.parameter_size) {
				displayName = `${model.name} (${model.details.parameter_size})`;
			}

			return {
				id: model.name,
				name: displayName,
				provider: Provider.OLLAMA,
				capabilities: classifyModelCapabilities(model.name),
				metadata,
			};
		});
	}

	/**
	 * Create an error result with appropriate message.
	 */
	private createErrorResult(
		errorType: ModelDetectionErrorType,
		customMessage?: string
	): ModelDetectionResult {
		return {
			success: false,
			models: [],
			error: customMessage || ERROR_MESSAGES[errorType],
			cached: false,
		};
	}

	/**
	 * Handle errors from detection attempts.
	 */
	private handleDetectionError(error: unknown, isOllama: boolean = false): ModelDetectionResult {
		// Handle abort/timeout
		if (error instanceof Error && error.name === "AbortError") {
			return this.createErrorResult(ModelDetectionErrorType.TIMEOUT_ERROR);
		}

		// Handle network errors
		if (error instanceof TypeError && error.message.includes("fetch")) {
			const customMessage = isOllama
				? "Could not connect to Ollama. Please verify Ollama is running and the URL is correct."
				: ERROR_MESSAGES[ModelDetectionErrorType.NETWORK_ERROR];
			return this.createErrorResult(ModelDetectionErrorType.NETWORK_ERROR, customMessage);
		}

		// Handle parse errors
		if (error instanceof SyntaxError) {
			return this.createErrorResult(ModelDetectionErrorType.PARSE_ERROR);
		}

		// Handle other errors
		if (error instanceof Error) {
			if (error.message.includes("Invalid response format")) {
				return this.createErrorResult(ModelDetectionErrorType.PARSE_ERROR);
			}
			return this.createErrorResult(
				ModelDetectionErrorType.NETWORK_ERROR,
				error.message
			);
		}

		return this.createErrorResult(ModelDetectionErrorType.NETWORK_ERROR);
	}
}

/**
 * Singleton instance of ModelDetectionService.
 * Use this for most cases to benefit from shared caching.
 */
export const modelDetectionService = new ModelDetectionService();

/**
 * Convenience function to detect OpenAI models using the singleton service.
 *
 * @param baseUrl - The base URL of the OpenAI-compatible API
 * @param apiKey - The API key for authentication
 * @returns ModelDetectionResult with detected models or error
 */
export async function detectOpenAIModels(
	baseUrl: string,
	apiKey: string
): Promise<ModelDetectionResult> {
	return modelDetectionService.detectOpenAIModels(baseUrl, apiKey);
}

/**
 * Convenience function to detect Ollama models using the singleton service.
 *
 * @param baseUrl - The base URL of the Ollama instance
 * @returns ModelDetectionResult with detected models or error
 */
export async function detectOllamaModels(baseUrl: string): Promise<ModelDetectionResult> {
	return modelDetectionService.detectOllamaModels(baseUrl);
}

/**
 * Filter detected models by capability.
 *
 * @param models - Array of detected models to filter
 * @param capability - The capability to filter by ("textGeneration" or "embedding")
 * @returns Array of models that have the specified capability
 */
export function filterModelsByCapability(
	models: DetectedModel[],
	capability: keyof ModelCapabilities
): DetectedModel[] {
	return models.filter((model) => model.capabilities[capability]);
}

/**
 * Sort detected models for display.
 * Text generation models first, then embedding models, alphabetically within each group.
 *
 * @param models - Array of detected models to sort
 * @returns Sorted array of models
 */
export function sortModelsForDisplay(models: DetectedModel[]): DetectedModel[] {
	return [...models].sort((a, b) => {
		// Text generation models first
		if (a.capabilities.textGeneration && !b.capabilities.textGeneration) {
			return -1;
		}
		if (!a.capabilities.textGeneration && b.capabilities.textGeneration) {
			return 1;
		}
		// Then sort alphabetically by name
		return a.name.localeCompare(b.name);
	});
}
