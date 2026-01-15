import Generator from "../generators/generator";
import GeneratorFactory from "../generators/generatorFactory";
import { Provider } from "../generators/providers";
import { Quiz, Question } from "../utils/types";
import { ConsensusModelConfig, ReEvaluationRequest, ReEvaluationResponse, AnonymizedAnswer, ModelErrorCallback } from "./types";
import { RateLimitManager } from "./rateLimitManager";
import { PerformanceMonitor } from "./performanceMonitor";
import { ConsensusErrorHandler, ErrorCategory } from "./consensusErrorHandler";
import { ModelConfiguration } from "../settings/modelRegistry/types";
import { QuizSettings } from "../settings/config";

/**
 * A resolved consensus model that combines registry configuration with consensus-specific settings.
 *
 * This interface represents a model that has been resolved from the central ModelRegistry
 * and is ready to be used for consensus generation. It contains both the full model
 * configuration (API keys, endpoints, model names) and consensus-specific settings
 * (weight, enabled status).
 *
 * Requirements: 1.4, 9.3
 */
export interface ResolvedConsensusModel {
	/** Unique identifier for this model in consensus */
	id: string;

	/** Full model configuration from the registry */
	modelConfig: ModelConfiguration;

	/** Weight for this model in consensus voting (default: 1.0) */
	weight: number;

	/** Whether this model is enabled for consensus */
	enabled: boolean;

	/** Provider type (extracted from modelConfig for convenience) */
	provider: Provider;

	// NOTE: legacySettings has been removed as part of task 6.1
	// All generator creation now uses createFromModelConfig with modelConfig
}

/**
 * Response from a single model during consensus generation
 */
export interface ModelResponse {
	/** Unique identifier for the model that generated this response */
	modelId: string;

	/** The parsed quiz from the model's response */
	quiz: Quiz | null;

	/** Raw JSON string response from the model */
	rawResponse: string;

	/** Whether the response was successfully parsed */
	success: boolean;

	/** Error message if the response failed to parse */
	error?: string;

	/** Time taken for this model to respond (milliseconds) */
	duration: number;

	/** Token usage for this response (if available from the generator) */
	tokenUsage?: number;
}

/**
 * Options for model invocation
 */
export interface InvocationOptions {
	/** Maximum time to wait for a model response (milliseconds) */
	timeout?: number;

	/** Whether to continue on individual model failures */
	continueOnError?: boolean;

	/** Maximum number of retry attempts per model */
	maxRetries?: number;
}

/**
 * Coordinates parallel invocation of multiple AI models for consensus generation.
 *
 * This class handles:
 * - Creating generator instances for each configured model
 * - Invoking models in parallel with rate limiting
 * - Collecting and normalizing responses
 * - Error handling and retry logic
 * - Timeout management
 *
 * The ModelCoordinator now supports both:
 * 1. New format: ResolvedConsensusModel[] with resolved ModelConfiguration
 * 2. Legacy format: ConsensusModelConfig[] with embedded settings (deprecated)
 *
 * Requirements: 1.4, 9.3, 9.7
 */
export class ModelCoordinator {
	/** Resolved model configurations for the consensus system */
	private readonly resolvedModels: ResolvedConsensusModel[];

	/** Base quiz settings for generator creation */
	private readonly quizSettings: QuizSettings;

	/** Rate limit manager for API throttling */
	private readonly rateLimitManager: RateLimitManager;

	/** Default timeout for model requests (2 minutes) */
	private readonly defaultTimeout: number = 120000;

	/** Default maximum retries per model */
	private readonly defaultMaxRetries: number = 2;

	/** Performance monitor (optional) */
	private performanceMonitor?: PerformanceMonitor;

	/** Generator instance cache for connection pooling */
	private generatorCache: Map<string, Generator> = new Map();

	/** Optional callback for model-level error reporting */
	private modelErrorCallback?: ModelErrorCallback;

	/** Error handler for providing user-friendly error messages */
	private errorHandler: ConsensusErrorHandler;

	/**
	 * Create a new model coordinator.
	 *
	 * This constructor supports two signatures for backward compatibility:
	 *
	 * New format (recommended):
	 * - resolvedModels: ResolvedConsensusModel[] - Pre-resolved model configurations
	 * - quizSettings: QuizSettings - Base settings for generator creation
	 * - rateLimitManager?: RateLimitManager
	 * - performanceMonitor?: PerformanceMonitor
	 * - modelErrorCallback?: ModelErrorCallback
	 *
	 * Legacy format (deprecated, for backward compatibility):
	 * - modelConfigs: ConsensusModelConfig[] - Legacy configs with embedded settings
	 * - rateLimitManager?: RateLimitManager
	 * - performanceMonitor?: PerformanceMonitor
	 * - modelErrorCallback?: ModelErrorCallback
	 *
	 * @param modelsOrConfigs - Either ResolvedConsensusModel[] or ConsensusModelConfig[]
	 * @param settingsOrRateLimiter - Either QuizSettings (new) or RateLimitManager (legacy)
	 * @param rateLimitManagerOrMonitor - RateLimitManager (new) or PerformanceMonitor (legacy)
	 * @param performanceMonitorOrCallback - PerformanceMonitor (new) or ModelErrorCallback (legacy)
	 * @param modelErrorCallback - ModelErrorCallback (new format only)
	 *
	 * Requirements: 1.4, 9.3
	 */
	constructor(
		modelsOrConfigs: ResolvedConsensusModel[] | ConsensusModelConfig[],
		settingsOrRateLimiter?: QuizSettings | RateLimitManager,
		rateLimitManagerOrMonitor?: RateLimitManager | PerformanceMonitor,
		performanceMonitorOrCallback?: PerformanceMonitor | ModelErrorCallback,
		modelErrorCallback?: ModelErrorCallback
	) {
		// Detect which constructor signature is being used
		const isNewFormat = this.isNewConstructorFormat(modelsOrConfigs, settingsOrRateLimiter);

		if (isNewFormat) {
			// New format: (ResolvedConsensusModel[], QuizSettings, RateLimitManager?, PerformanceMonitor?, ModelErrorCallback?)
			this.resolvedModels = (modelsOrConfigs as ResolvedConsensusModel[]).filter(model => model.enabled);
			this.quizSettings = settingsOrRateLimiter as QuizSettings;
			this.rateLimitManager = (rateLimitManagerOrMonitor as RateLimitManager) || new RateLimitManager();
			this.performanceMonitor = performanceMonitorOrCallback as PerformanceMonitor | undefined;
			this.modelErrorCallback = modelErrorCallback;
		} else {
			// Legacy format: (ConsensusModelConfig[], RateLimitManager?, PerformanceMonitor?, ModelErrorCallback?)
			const legacyConfigs = modelsOrConfigs as ConsensusModelConfig[];
			this.resolvedModels = this.convertLegacyConfigs(legacyConfigs);
			this.quizSettings = {} as QuizSettings; // Not used in legacy mode
			this.rateLimitManager = (settingsOrRateLimiter as RateLimitManager) || new RateLimitManager();
			this.performanceMonitor = rateLimitManagerOrMonitor as PerformanceMonitor | undefined;
			this.modelErrorCallback = performanceMonitorOrCallback as ModelErrorCallback | undefined;
		}

		this.errorHandler = new ConsensusErrorHandler();

		// Configure rate limits for each model
		this.configureRateLimits();
	}

	/**
	 * Detect if the new constructor format is being used.
	 *
	 * The key differentiator is the second argument:
	 * - New format: QuizSettings (an object with provider, openAIApiKey, etc.)
	 * - Legacy format: RateLimitManager (an instance of RateLimitManager class)
	 *
	 * @param modelsOrConfigs - First argument
	 * @param settingsOrRateLimiter - Second argument
	 * @returns true if new format, false if legacy format
	 */
	private isNewConstructorFormat(
		modelsOrConfigs: ResolvedConsensusModel[] | ConsensusModelConfig[],
		settingsOrRateLimiter?: QuizSettings | RateLimitManager
	): boolean {
		// If second arg is undefined, check the first argument
		if (!settingsOrRateLimiter) {
			// Check if first arg contains modelConfig property (new format)
			if (modelsOrConfigs.length > 0) {
				return 'modelConfig' in modelsOrConfigs[0];
			}
			return false;
		}

		// If second arg is RateLimitManager instance, it's legacy format
		if (settingsOrRateLimiter instanceof RateLimitManager) {
			return false;
		}

		// If second arg is an object with provider (QuizSettings), it's new format
		if (typeof settingsOrRateLimiter === 'object' && 'provider' in settingsOrRateLimiter) {
			return true;
		}

		// Check if first arg has modelConfig property (definitive new format indicator)
		if (modelsOrConfigs.length > 0 && 'modelConfig' in modelsOrConfigs[0]) {
			return true;
		}

		// Default to legacy format
		return false;
	}

	/**
	 * Convert ConsensusModelConfig[] to ResolvedConsensusModel[] format.
	 *
	 * Now uses the simplified ConsensusModelConfig with providerConfig directly.
	 *
	 * @param configs - Model configurations with ProviderConfig
	 * @returns Converted models in new format
	 *
	 * Requirements: 6.2 (simplified settings mapping)
	 */
	private convertLegacyConfigs(configs: ConsensusModelConfig[]): ResolvedConsensusModel[] {
		return configs
			.filter(config => config.enabled)
			.map(config => ({
				id: config.id,
				modelConfig: this.createModelConfigFromConsensus(config),
				weight: config.weight,
				enabled: config.enabled,
				provider: config.provider,
			}));
	}

	/**
	 * Create a ModelConfiguration from ConsensusModelConfig.
	 *
	 * Uses the ProviderConfig directly from the consensus config instead of
	 * extracting from legacy settings fields.
	 *
	 * @param config - Model configuration with ProviderConfig
	 * @returns ModelConfiguration for the new format
	 *
	 * Requirements: 6.2 (simplified settings mapping)
	 */
	private createModelConfigFromConsensus(config: ConsensusModelConfig): ModelConfiguration {
		const now = Date.now();

		return {
			id: config.id,
			displayName: `${config.provider} Model`,
			isAutoGeneratedName: true,
			providerConfig: config.providerConfig,
			createdAt: now,
			modifiedAt: now,
		};
	}

	/**
	 * Invoke multiple models in parallel to generate quizzes
	 *
	 * Each model independently generates a quiz from the provided content.
	 * Responses are collected in parallel with rate limiting and error handling.
	 *
	 * @param contents - Source content for quiz generation
	 * @param options - Invocation options (timeout, retry, etc.)
	 * @returns Array of model responses (successful and failed)
	 */
	public async invokeModels(
		contents: string[],
		options?: InvocationOptions
	): Promise<ModelResponse[]> {
		const timeout = options?.timeout ?? this.defaultTimeout;
		const continueOnError = options?.continueOnError ?? true;
		const maxRetries = options?.maxRetries ?? this.defaultMaxRetries;

		// Track parallel request count for performance monitoring
		if (this.performanceMonitor) {
			this.performanceMonitor.recordParallelRequests(this.resolvedModels.length);
		}

		// Create promises for each model invocation
		const invocationPromises = this.resolvedModels.map(resolvedModel =>
			this.invokeModel(resolvedModel, contents, timeout, maxRetries)
		);

		// Execute all invocations in parallel
		if (continueOnError) {
			// Use allSettled to continue even if some models fail
			const results = await Promise.allSettled(invocationPromises);

			return results.map((result, index) => {
				if (result.status === "fulfilled") {
					return result.value;
				} else {
					// Return error response for failed model
					return this.createErrorResponse(
						this.resolvedModels[index].id,
						result.reason?.message || "Unknown error",
						0
					);
				}
			});
		} else {
			// Use all to fail fast if any model fails
			const results = await Promise.all(invocationPromises);

			// Check if any model failed
			const failedModel = results.find(r => !r.success);
			if (failedModel) {
				throw new Error(`Model ${failedModel.modelId} failed: ${failedModel.error}`);
			}

			return results;
		}
	}

	/**
	 * Invoke a single model with rate limiting and retry logic
	 *
	 * @param resolvedModel - Resolved model configuration from registry
	 * @param contents - Source content for quiz generation
	 * @param timeout - Maximum time to wait for response
	 * @param maxRetries - Maximum number of retry attempts
	 * @returns Model response
	 *
	 * Requirements: 1.4, 9.3
	 */
	private async invokeModel(
		resolvedModel: ResolvedConsensusModel,
		contents: string[],
		timeout: number,
		maxRetries: number
	): Promise<ModelResponse> {
		let lastError: Error | null = null;
		let attempt = 0;

		while (attempt <= maxRetries) {
			try {
				// Acquire rate limit permission
				await this.rateLimitManager.acquire(resolvedModel.id);

				const startTime = Date.now();

				// Create generator instance for this model
				const generator = this.createGenerator(resolvedModel);

				// Invoke the model with timeout
				const rawResponse = await this.invokeWithTimeout(
					generator,
					contents,
					timeout
				);

				const duration = Date.now() - startTime;

				// Track successful response time
				if (this.performanceMonitor) {
					this.performanceMonitor.recordModelResponse(duration);
				}

				// Parse and normalize the response
				const quiz = this.normalizeResponse(rawResponse, resolvedModel.provider);

				// Try to extract token usage from generator if available
				const tokenUsage = this.extractTokenUsage(generator);

				// Return successful response
				return {
					modelId: resolvedModel.id,
					quiz,
					rawResponse: rawResponse || "",
					success: quiz !== null,
					error: quiz === null ? "Failed to parse quiz from response" : undefined,
					duration,
					tokenUsage
				};
			} catch (error) {
				lastError = error as Error;

				// Categorize error for user-friendly messaging
				const category = this.categorizeError(lastError);

				// Track error types for performance monitoring
				if (this.performanceMonitor) {
					const errorMessage = (error as Error).message.toLowerCase();
					if (errorMessage.includes("timeout")) {
						this.performanceMonitor.recordTimeout();
					} else if (errorMessage.includes("rate limit")) {
						this.performanceMonitor.recordRateLimitHit();
					}
				}

				// Release rate limit token on error
				this.rateLimitManager.release(resolvedModel.id);

				// Check if we should retry
				if (attempt < maxRetries && this.isRetryableError(error as Error)) {
					attempt++;

					// Track retry for performance monitoring
					if (this.performanceMonitor) {
						this.performanceMonitor.recordRetry();
					}

					// Notify UI of retry attempt
					if (this.modelErrorCallback) {
						const formattedError = this.errorHandler.formatError(lastError, category);
						this.modelErrorCallback(
							resolvedModel.id,
							`${formattedError.message} (Retry ${attempt}/${maxRetries})`,
							"warning",
							true
						);
					}

					// Exponential backoff: 1s, 2s, 4s, etc.
					const backoffMs = Math.pow(2, attempt) * 1000;
					await this.delay(backoffMs);
					continue;
				}

				// No more retries - notify UI of permanent failure
				if (this.modelErrorCallback) {
					const formattedError = this.errorHandler.formatError(lastError, category);
					this.modelErrorCallback(
						resolvedModel.id,
						`${formattedError.message}. ${formattedError.suggestions[0] || ''}`,
						"error",
						false
					);
				}

				// No more retries, return error response
				break;
			}
		}

		// All retries exhausted
		const errorMessage = lastError?.message || "Unknown error after retries";
		return this.createErrorResponse(
			resolvedModel.id,
			errorMessage,
			0
		);
	}

	/**
	 * Invoke a generator with a timeout
	 *
	 * @param generator - Generator instance to invoke
	 * @param contents - Source content for quiz generation
	 * @param timeout - Maximum time to wait for response
	 * @returns Raw response string from the generator
	 * @throws Error if timeout is exceeded or generation fails
	 */
	private async invokeWithTimeout(
		generator: Generator,
		contents: string[],
		timeout: number
	): Promise<string | null> {
		return await Promise.race([
			generator.generateQuiz(contents),
			this.createTimeoutPromise(timeout)
		]);
	}

	/**
	 * Create a timeout promise that rejects after the specified duration
	 *
	 * @param ms - Timeout duration in milliseconds
	 * @returns Promise that rejects after timeout
	 */
	private createTimeoutPromise(ms: number): Promise<never> {
		return new Promise((_, reject) => {
			setTimeout(() => {
				reject(new Error(`Model invocation timed out after ${ms}ms`));
			}, ms);
		});
	}

	/**
	 * Parse and normalize a JSON response from a model
	 *
	 * Different model providers may return responses in slightly different formats.
	 * This method attempts to extract a valid Quiz object from the raw response.
	 *
	 * @param rawResponse - Raw JSON string from the model
	 * @param provider - The provider type that generated this response
	 * @returns Parsed Quiz object or null if parsing failed
	 */
	public normalizeResponse(
		rawResponse: string | null,
		provider: Provider
	): Quiz | null {
		if (!rawResponse) {
			return null;
		}

		try {
			// First, try to parse as JSON
			const parsed = JSON.parse(rawResponse);

			// Check if the response has a "questions" array
			if (parsed && Array.isArray(parsed.questions)) {
				return parsed as Quiz;
			}

			// Some models might return just an array of questions
			if (Array.isArray(parsed)) {
				return { questions: parsed };
			}

			// OpenAI might wrap the response in a "content" field
			if (parsed.content && typeof parsed.content === "string") {
				const contentParsed = JSON.parse(parsed.content);
				if (contentParsed && Array.isArray(contentParsed.questions)) {
					return contentParsed as Quiz;
				}
			}

			// Failed to extract quiz
			return null;
		} catch (error) {
			// JSON parsing failed
			// Try to extract JSON from markdown code blocks
			const jsonMatch = rawResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
			if (jsonMatch) {
				try {
					const parsed = JSON.parse(jsonMatch[1]);
					if (parsed && Array.isArray(parsed.questions)) {
						return parsed as Quiz;
					}
				} catch {
					// Failed to parse extracted JSON
				}
			}

			// All parsing attempts failed
			return null;
		}
	}

	/**
	 * Create or retrieve a cached generator instance for a resolved model.
	 *
	 * This implements connection pooling by reusing generator instances,
	 * which can maintain HTTP client connections for better performance.
	 *
	 * For the new registry-based format, it uses GeneratorFactory.createFromModelConfig()
	 * to create generators from the resolved ModelConfiguration.
	 *
	 * For legacy format (with legacySettings), it falls back to the old behavior.
	 *
	 * @param resolvedModel - Resolved model from registry
	 * @returns Generator instance
	 *
	 * Requirements: 1.4, 9.3
	 */
	private createGenerator(resolvedModel: ResolvedConsensusModel): Generator {
		// Check if we have a cached generator for this model
		const cached = this.generatorCache.get(resolvedModel.id);
		if (cached) {
			return cached;
		}

		// Create generator from ModelConfiguration using the registry-based factory
		// (Legacy createInstance path has been removed as part of task 6.1)
		const generator = GeneratorFactory.createFromModelConfig(
			resolvedModel.modelConfig,
			this.quizSettings
		);

		this.generatorCache.set(resolvedModel.id, generator);
		return generator;
	}

	/**
	 * Extract token usage from a generator if available
	 *
	 * This method attempts to get token usage from generators that support it
	 * (e.g., OpenAIGenerator). If the generator doesn't support token usage
	 * tracking, this returns undefined.
	 *
	 * @param generator - Generator instance to extract from
	 * @returns Total token count, or undefined if not available
	 */
	private extractTokenUsage(generator: Generator): number | undefined {
		// Try to get token usage from OpenAI generator
		if (typeof (generator as any).getLastTokenUsage === "function") {
			const usage = (generator as any).getLastTokenUsage();
			if (usage && typeof usage.totalTokens === "number") {
				return usage.totalTokens;
			}
		}

		// Generator doesn't support token usage tracking
		return undefined;
	}

	/**
	 * Clear the generator cache
	 *
	 * This should be called when model configurations change to ensure
	 * generators are recreated with new settings.
	 */
	public clearGeneratorCache(): void {
		this.generatorCache.clear();
	}

	/**
	 * Create an error response for a failed model invocation
	 *
	 * @param modelId - Model identifier
	 * @param errorMessage - Error message
	 * @param duration - Time taken before failure
	 * @returns Error model response
	 */
	private createErrorResponse(
		modelId: string,
		errorMessage: string,
		duration: number
	): ModelResponse {
		return {
			modelId,
			quiz: null,
			rawResponse: "",
			success: false,
			error: errorMessage,
			duration
		};
	}

	/**
	 * Check if an error is retryable
	 *
	 * Network errors, timeouts, and rate limits are retryable.
	 * Invalid API keys, malformed requests, and validation errors are not.
	 *
	 * @param error - Error to check
	 * @returns True if the error is retryable
	 */
	/**
	 * Categorize an error for user-friendly messaging
	 *
	 * Requirement 8.2: Categorize errors for appropriate messaging
	 *
	 * @param error - Error to categorize
	 * @returns Error category
	 */
	private categorizeError(error: Error): ErrorCategory {
		const message = error.message.toLowerCase();

		if (message.includes("timeout")) {
			return ErrorCategory.NETWORK;
		} else if (message.includes("rate limit") || message.includes("429")) {
			return ErrorCategory.RATE_LIMIT;
		} else if (message.includes("unauthorized") || message.includes("api key") || message.includes("401") || message.includes("403")) {
			return ErrorCategory.AUTHENTICATION;
		} else if (message.includes("network") || message.includes("econnreset") || message.includes("econnrefused")) {
			return ErrorCategory.NETWORK;
		} else if (message.includes("503") || message.includes("502") || message.includes("504")) {
			return ErrorCategory.SERVICE_UNAVAILABLE;
		} else if (message.includes("json") || message.includes("parse")) {
			return ErrorCategory.PARSE_ERROR;
		} else {
			return ErrorCategory.UNKNOWN;
		}
	}

	private isRetryableError(error: Error): boolean {
		const message = error.message.toLowerCase();

		// Retryable errors
		const retryablePatterns = [
			"timeout",
			"network",
			"econnreset",
			"enotfound",
			"econnrefused",
			"rate limit",
			"too many requests",
			"503", // Service unavailable
			"502", // Bad gateway
			"504", // Gateway timeout
		];

		// Check if error message matches any retryable pattern
		return retryablePatterns.some(pattern => message.includes(pattern));
	}

	/**
	 * Configure rate limits for all models
	 */
	private configureRateLimits(): void {
		for (const resolvedModel of this.resolvedModels) {
			// Configure provider-specific rate limits
			const rateLimitConfig = this.getRateLimitConfig(resolvedModel.provider);
			this.rateLimitManager.configureModel(resolvedModel.id, rateLimitConfig);
		}
	}

	/**
	 * Get rate limit configuration for a provider
	 *
	 * @param provider - Provider type
	 * @returns Rate limit configuration
	 */
	private getRateLimitConfig(provider: Provider): {
		maxRequests: number;
		windowMs: number;
		maxQueueSize?: number;
	} {
		// Provider-specific rate limits
		switch (provider) {
			case Provider.OPENAI:
				return {
					maxRequests: 60, // 60 requests per minute
					windowMs: 60000,
					maxQueueSize: 100
				};
			case Provider.OLLAMA:
				// Local models - more generous limits
				return {
					maxRequests: 120, // 120 requests per minute
					windowMs: 60000,
					maxQueueSize: 200
				};
			default:
				// Conservative default for unknown providers
				return {
					maxRequests: 30,
					windowMs: 60000,
					maxQueueSize: 50
				};
		}
	}

	/**
	 * Delay execution for specified milliseconds
	 *
	 * @param ms - Delay duration in milliseconds
	 * @returns Promise that resolves after delay
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Get the number of enabled models
	 *
	 * @returns Number of enabled models
	 */
	public getEnabledModelCount(): number {
		return this.resolvedModels.length;
	}

	/**
	 * Get rate limit status for all models
	 *
	 * @returns Map of model ID to rate limit status
	 */
	public getRateLimitStatus(): Map<string, {
		availableTokens: number;
		queueLength: number;
		isThrottled: boolean;
	}> {
		const statusMap = new Map();

		for (const resolvedModel of this.resolvedModels) {
			const status = this.rateLimitManager.getStatus(resolvedModel.id);
			statusMap.set(resolvedModel.id, status);
		}

		return statusMap;
	}

	/**
	 * Reset rate limits for all models
	 */
	public resetRateLimits(): void {
		this.rateLimitManager.reset();
	}

	/**
	 * Request re-evaluation from a specific model during consensus rounds
	 *
	 * This method generates a prompt that presents the model with:
	 * 1. The original question
	 * 2. The model's original answer
	 * 3. Alternative answers from other models (anonymized)
	 * 4. A request to reconsider and justify their answer
	 *
	 * @param request - Re-evaluation request containing question and alternatives
	 * @param modelId - ID of the model to request re-evaluation from
	 * @returns Re-evaluation response with updated answer and reasoning
	 */
	public async requestReEvaluation(
		request: ReEvaluationRequest,
		modelId: string
	): Promise<ReEvaluationResponse> {
		// Find the resolved model configuration
		const resolvedModel = this.resolvedModels.find(m => m.id === modelId);

		if (!resolvedModel) {
			return this.createReEvaluationErrorResponse(
				modelId,
				request.originalAnswer,
				`Model configuration not found for ID: ${modelId}`
			);
		}

		try {
			// Acquire rate limit permission
			await this.rateLimitManager.acquire(modelId);

			const startTime = Date.now();

			// Generate the re-evaluation prompt
			const prompt = this.generateReEvaluationPrompt(request);

			// Create generator instance
			const generator = this.createGenerator(resolvedModel);

			// Invoke the model with the re-evaluation prompt
			const rawResponse = await this.invokeWithReEvaluationPrompt(
				generator,
				prompt,
				this.defaultTimeout
			);

			const duration = Date.now() - startTime;

			// Parse the re-evaluation response
			const parsedResponse = this.parseReEvaluationResponse(
				rawResponse,
				modelId,
				request.originalAnswer
			);

			return parsedResponse;
		} catch (error) {
			// Release rate limit token on error
			this.rateLimitManager.release(modelId);

			return this.createReEvaluationErrorResponse(
				modelId,
				request.originalAnswer,
				(error as Error).message || "Unknown error during re-evaluation"
			);
		}
	}

	/**
	 * Generate a re-evaluation prompt for a model
	 *
	 * The prompt asks the model to:
	 * 1. Review the original question
	 * 2. Consider their original answer
	 * 3. Review alternative answers from other models (anonymized)
	 * 4. Provide their final answer with justification and confidence
	 *
	 * @param request - Re-evaluation request
	 * @returns Formatted prompt string
	 */
	private generateReEvaluationPrompt(request: ReEvaluationRequest): string {
		const { question, originalAnswer, alternativeAnswers, roundNumber } = request;

		// Format the question based on its type
		const questionText = this.formatQuestionForPrompt(question);

		// Format the original answer
		const originalAnswerText = this.formatAnswerForPrompt(originalAnswer, question);

		// Format alternative answers
		const alternativesText = alternativeAnswers
			.map((alt, index) => {
				const formattedAnswer = this.formatAnswerForPrompt(alt.answer, question);
				return `Alternative ${index + 1}:\n  Answer: ${formattedAnswer}\n  Reasoning: ${alt.reasoning}${alt.confidence ? `\n  Confidence: ${(alt.confidence * 100).toFixed(0)}%` : ""}`;
			})
			.join("\n\n");

		return `You are participating in a consensus-building process (Round ${roundNumber}) to ensure the accuracy of quiz questions.

ORIGINAL QUESTION:
${questionText}

YOUR PREVIOUS ANSWER:
${originalAnswerText}

ALTERNATIVE ANSWERS FROM OTHER MODELS:
${alternativesText}

TASK:
Please reconsider your answer in light of the alternative answers provided. You should:
1. Critically evaluate your original answer
2. Consider the reasoning behind the alternative answers
3. Provide your final answer (which may be the same or different from your original)
4. Justify your final answer with clear reasoning
5. Indicate your confidence level (0.0 to 1.0)

IMPORTANT:
- Do not be biased by the number of models agreeing with any particular answer
- Base your decision on logical reasoning and correctness
- If you change your answer, explain why
- If you keep your answer, explain why the alternatives are incorrect

Please respond in the following JSON format:
{
  "answer": <your final answer in the same format as the question type>,
  "reasoning": "<your detailed justification>",
  "confidence": <number between 0.0 and 1.0>
}

For reference, the expected answer format based on question type:
${this.getAnswerFormatGuidance(question)}`;
	}

	/**
	 * Format a question for display in the re-evaluation prompt
	 *
	 * @param question - Question to format
	 * @returns Formatted question string
	 */
	private formatQuestionForPrompt(question: Question): string {
		if ("question" in question) {
			let formatted = question.question;

			// Add options if available
			if ("options" in question && Array.isArray(question.options)) {
				formatted += "\n\nOptions:";
				question.options.forEach((option, index) => {
					formatted += `\n  ${index + 1}. ${option}`;
				});
			}

			// Add pairs for matching questions
			if ("pairs" in question && Array.isArray(question.pairs)) {
				formatted += "\n\nPairs to match:";
				(question as any).pairs.forEach((pair: any, index: number) => {
					formatted += `\n  ${index + 1}. ${pair.left} → ${pair.right}`;
				});
			}

			return formatted;
		}

		return JSON.stringify(question);
	}

	/**
	 * Format an answer for display in the re-evaluation prompt
	 *
	 * @param answer - Answer to format
	 * @param question - Associated question for context
	 * @returns Formatted answer string
	 */
	private formatAnswerForPrompt(answer: any, question: Question): string {
		// Handle boolean answers (TrueFalse)
		if (typeof answer === "boolean") {
			return answer ? "True" : "False";
		}

		// Handle number answers (MultipleChoice)
		if (typeof answer === "number" && "options" in question) {
			const options = (question as any).options;
			if (Array.isArray(options) && answer >= 0 && answer < options.length) {
				return `Option ${answer + 1}: ${options[answer]}`;
			}
			return `Option ${answer + 1}`;
		}

		// Handle array of numbers (SelectAllThatApply)
		if (Array.isArray(answer) && answer.every(a => typeof a === "number")) {
			if ("options" in question) {
				const options = (question as any).options;
				return answer
					.map(index => {
						if (Array.isArray(options) && index >= 0 && index < options.length) {
							return `Option ${index + 1}: ${options[index]}`;
						}
						return `Option ${index + 1}`;
					})
					.join(", ");
			}
			return answer.map(index => `Option ${index + 1}`).join(", ");
		}

		// Handle string answers (FillInTheBlank, ShortOrLongAnswer)
		if (typeof answer === "string") {
			return answer;
		}

		// Handle array of strings (FillInTheBlank with multiple blanks)
		if (Array.isArray(answer) && answer.every(a => typeof a === "string")) {
			return answer.join(", ");
		}

		// Handle matching answers (array of pairs)
		if (Array.isArray(answer) && answer.length > 0 && typeof answer[0] === "object") {
			return answer
				.map((pair: any, index: number) => {
					return `${index + 1}. ${pair.left || pair[0]} → ${pair.right || pair[1]}`;
				})
				.join("\n  ");
		}

		// Fallback to JSON stringify
		return JSON.stringify(answer);
	}

	/**
	 * Get answer format guidance for a specific question type
	 *
	 * @param question - Question to get format guidance for
	 * @returns Guidance string
	 */
	private getAnswerFormatGuidance(question: Question): string {
		if ("answer" in question) {
			const sampleAnswer = (question as any).answer;

			if (typeof sampleAnswer === "boolean") {
				return '"answer": true or false';
			}

			if (typeof sampleAnswer === "number") {
				return '"answer": <index number> (e.g., 0 for first option, 1 for second option, etc.)';
			}

			if (Array.isArray(sampleAnswer) && sampleAnswer.every(a => typeof a === "number")) {
				return '"answer": [<array of index numbers>] (e.g., [0, 2] for first and third options)';
			}

			if (typeof sampleAnswer === "string") {
				return '"answer": "<your answer as a string>"';
			}

			if (Array.isArray(sampleAnswer) && sampleAnswer.every(a => typeof a === "string")) {
				return '"answer": ["<answer1>", "<answer2>", ...] (array of strings)';
			}

			if (Array.isArray(sampleAnswer) && sampleAnswer.length > 0 && typeof sampleAnswer[0] === "object") {
				return '"answer": [{"left": "<item>", "right": "<match>"}, ...] (array of matched pairs)';
			}
		}

		return '"answer": <appropriate format based on question type>';
	}

	/**
	 * Invoke a generator with a re-evaluation prompt
	 *
	 * @param generator - Generator instance
	 * @param prompt - Re-evaluation prompt
	 * @param timeout - Maximum wait time
	 * @returns Raw response string
	 */
	private async invokeWithReEvaluationPrompt(
		generator: Generator,
		prompt: string,
		timeout: number
	): Promise<string | null> {
		// For re-evaluation, we wrap the prompt in the contents array
		// The generator will use its standard systemPrompt() and userPrompt() methods,
		// but we craft the content to contain our re-evaluation instructions
		// Note: This is a workaround since generators don't have a custom prompt method
		// The re-evaluation prompt is self-contained and doesn't rely on the generator's
		// standard quiz generation prompts
		return await Promise.race([
			generator.generateQuiz([prompt]),
			this.createTimeoutPromise(timeout)
		]);
	}

	/**
	 * Parse a re-evaluation response from a model
	 *
	 * @param rawResponse - Raw response string from the model
	 * @param modelId - ID of the model that generated the response
	 * @param originalAnswer - The original answer before re-evaluation
	 * @returns Parsed re-evaluation response
	 */
	private parseReEvaluationResponse(
		rawResponse: string | null,
		modelId: string,
		originalAnswer: any
	): ReEvaluationResponse {
		if (!rawResponse) {
			return this.createReEvaluationErrorResponse(
				modelId,
				originalAnswer,
				"No response received from model"
			);
		}

		try {
			// Try to parse as JSON
			let parsed: any;

			// First, try direct JSON parsing
			try {
				parsed = JSON.parse(rawResponse);
			} catch {
				// Try to extract JSON from markdown code blocks
				const jsonMatch = rawResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
				if (jsonMatch) {
					parsed = JSON.parse(jsonMatch[1]);
				} else {
					// Try to find any JSON object in the response
					const objectMatch = rawResponse.match(/\{[\s\S]*"answer"[\s\S]*\}/);
					if (objectMatch) {
						parsed = JSON.parse(objectMatch[0]);
					} else {
						throw new Error("Could not find valid JSON in response");
					}
				}
			}

			// Validate required fields
			if (!parsed || typeof parsed !== "object") {
				throw new Error("Response is not a valid object");
			}

			if (!("answer" in parsed)) {
				throw new Error("Response missing 'answer' field");
			}

			if (!("reasoning" in parsed) || typeof parsed.reasoning !== "string") {
				throw new Error("Response missing or invalid 'reasoning' field");
			}

			// Extract confidence (default to 0.5 if missing)
			const confidence = typeof parsed.confidence === "number"
				? Math.max(0, Math.min(1, parsed.confidence))
				: 0.5;

			// Check if answer changed
			const changed = !this.answersAreEqual(originalAnswer, parsed.answer);

			return {
				modelId,
				answer: parsed.answer,
				reasoning: parsed.reasoning,
				confidence,
				changed,
				previousAnswer: changed ? originalAnswer : undefined,
				rawResponse,
				success: true
			};
		} catch (error) {
			return this.createReEvaluationErrorResponse(
				modelId,
				originalAnswer,
				`Failed to parse response: ${(error as Error).message}`
			);
		}
	}

	/**
	 * Check if two answers are equal
	 *
	 * Handles different answer types (primitives, arrays, objects)
	 *
	 * @param answer1 - First answer
	 * @param answer2 - Second answer
	 * @returns True if answers are equal
	 */
	private answersAreEqual(answer1: any, answer2: any): boolean {
		// Handle primitive types
		if (typeof answer1 !== "object" || typeof answer2 !== "object") {
			return answer1 === answer2;
		}

		// Handle null
		if (answer1 === null || answer2 === null) {
			return answer1 === answer2;
		}

		// Handle arrays
		if (Array.isArray(answer1) && Array.isArray(answer2)) {
			if (answer1.length !== answer2.length) {
				return false;
			}

			// For arrays of primitives, check each element
			if (answer1.every(a => typeof a !== "object")) {
				return answer1.every((val, index) => val === answer2[index]);
			}

			// For arrays of objects (e.g., matching pairs), do deep comparison
			return JSON.stringify(answer1) === JSON.stringify(answer2);
		}

		// Handle objects
		return JSON.stringify(answer1) === JSON.stringify(answer2);
	}

	/**
	 * Create an error response for a failed re-evaluation
	 *
	 * @param modelId - Model identifier
	 * @param originalAnswer - The original answer
	 * @param errorMessage - Error message
	 * @returns Error re-evaluation response
	 */
	private createReEvaluationErrorResponse(
		modelId: string,
		originalAnswer: any,
		errorMessage: string
	): ReEvaluationResponse {
		return {
			modelId,
			answer: originalAnswer, // Keep original answer on error
			reasoning: "",
			confidence: 0,
			changed: false,
			rawResponse: "",
			success: false,
			error: errorMessage
		};
	}
}
