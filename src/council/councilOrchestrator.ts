import { Quiz, Question } from "../utils/types";
import { QuizSettings } from "../settings/config";
import {
	CouncilSettings,
	CouncilResult,
	CouncilDebateTrail,
	TokenUsageBreakdown,
	CouncilProgressCallback,
	CouncilModelErrorCallback,
	CouncilPhase,
	CouncilProgress,
	ModelResponse,
	AnonymizedResponse,
	CritiqueResult,
	RankingResult,
	FallbackStrategy,
	ErrorAction,
} from "./types";
import { ModelCoordinator, ModelResponse as ConsensusModelResponse, ResolvedConsensusModel } from "../consensus/modelCoordinator";
import { ConsensusModelConfig } from "../consensus/types";
import { CritiqueEngine } from "./critiqueEngine";
import { RankingEngine } from "./rankingEngine";
import { ChairSynthesisEngine } from "./chairSynthesisEngine";
import { RateLimitManager } from "../consensus/rateLimitManager";
import { CouncilErrorHandler, ErrorContext } from "./councilErrorHandler";
import { CostEstimator } from "./costEstimator";
import { TokenUsage } from "../generators/generatorTypes";
import { CouncilCache, hashContent, hashCouncilSettings } from "./councilCache";
import {
	ModelResolver,
	ModelNotFoundError,
	createModelResolver,
	isModelNotFoundError,
	CouncilModelReference,
	ModelConfiguration,
} from "../settings/modelRegistry";
import { Provider } from "../generators/providers";

/**
 * Main orchestrator for the LLM Council debate-based quiz generation process
 *
 * The CouncilOrchestrator coordinates all phases of the council process:
 *
 * 1. **Phase 1 - Parallel Query**: Invokes all configured models in parallel to
 *    independently generate quiz questions from the source material
 *
 * 2. **Phase 2 - Anonymous Critique**: Models anonymously critique each other's
 *    outputs, identifying strengths, weaknesses, and errors
 *
 * 3. **Phase 3 - Ranking**: Models rank all responses from best to worst,
 *    then aggregated using Borda count algorithm
 *
 * 4. **Phase 4 - Chair Synthesis**: A designated chair model synthesizes
 *    the best elements from all responses and critiques into a final quiz
 *
 * 5. **Phase 5 - Finalization**: Builds comprehensive audit trail and
 *    compiles final result
 *
 * The orchestrator handles:
 * - Progress reporting to UI via callbacks
 * - Error handling and graceful degradation
 * - Fallback strategies when phases fail
 * - Token usage tracking across all phases
 * - Building comprehensive debate trails for transparency
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 4.1, 4.8, 5.1-5.7, 6.1-6.7, 8.1-8.6
 */
export class CouncilOrchestrator {
	/** Council configuration settings */
	private readonly settings: CouncilSettings;

	/** Quiz generation settings */
	private readonly quizSettings: QuizSettings;

	/** Model coordinator for parallel invocation */
	private readonly modelCoordinator: ModelCoordinator;

	/** Critique engine for Phase 2 */
	private readonly critiqueEngine: CritiqueEngine;

	/** Ranking engine for Phase 3 */
	private readonly rankingEngine: RankingEngine;

	/** Chair synthesis engine for Phase 4 */
	private readonly chairSynthesisEngine: ChairSynthesisEngine;

	/** Rate limit manager for API throttling */
	private readonly rateLimitManager: RateLimitManager;

	/** Error handler for council-specific error handling */
	private readonly errorHandler: CouncilErrorHandler;

	/** Optional callback for progress updates */
	private readonly progressCallback?: CouncilProgressCallback;

	/** Optional callback for model-level error reporting */
	private readonly modelErrorCallback?: CouncilModelErrorCallback;

	/** Optional cache for council results */
	private readonly cache?: CouncilCache;

	/** Start time for duration tracking */
	private startTime: number = 0;

	/** Models that failed during execution */
	private failedModels: string[] = [];

	/** Model IDs that failed resolution */
	private resolutionErrors: string[] = [];

	/** Resolved model configurations (after registry lookup) */
	private readonly resolvedModels: ResolvedConsensusModel[];

	/** Token usage tracking */
	private tokenUsage: TokenUsageBreakdown = {
		parallelQuery: { total: 0, byModel: new Map() },
		critique: { total: 0, byModel: new Map() },
		ranking: { total: 0, byModel: new Map() },
		synthesis: { total: 0, byModel: new Map() },
		grandTotal: 0,
	};

	/**
	 * Create a new council orchestrator
	 *
	 * This constructor now supports both the legacy format (councilModels with
	 * embedded settings) and the new registry-based format (models with references
	 * to the central ModelRegistry).
	 *
	 * When using the new format:
	 * 1. Model references are resolved from the registry using ModelResolver
	 * 2. Resolution errors are collected and reported
	 * 3. Only successfully resolved models are used for council
	 *
	 * @param settings - Council configuration
	 * @param quizSettings - Quiz generation settings (contains model registry)
	 * @param progressCallback - Optional callback for UI progress updates
	 * @param modelErrorCallback - Optional callback for model-level error reporting
	 * @param rateLimitManager - Optional rate limit manager (creates default if not provided)
	 * @param cache - Optional cache for council results
	 *
	 * @throws Error if council is not enabled or insufficient models configured
	 *
	 * Requirements: 1.1, 1.4, 4.1, 4.8, 9.4, 9.7
	 */
	constructor(
		settings: CouncilSettings,
		quizSettings: QuizSettings,
		progressCallback?: CouncilProgressCallback,
		modelErrorCallback?: CouncilModelErrorCallback,
		rateLimitManager?: RateLimitManager,
		cache?: CouncilCache
	) {
		// Validate that council is enabled
		if (!settings.enabled) {
			throw new Error("Council mode is not enabled in settings");
		}

		this.settings = settings;
		this.quizSettings = quizSettings;
		this.progressCallback = progressCallback;
		this.modelErrorCallback = modelErrorCallback;
		this.cache = cache;

		// Resolve model references to full configurations
		// This supports both new format (models) and legacy format (councilModels)
		this.resolvedModels = this.resolveModelReferences(settings, quizSettings) ?? [];

		// Validate minimum models requirement after resolution
		const enabledModels = this.resolvedModels.filter(m => m.enabled);
		if (enabledModels.length < settings.minModelsRequired) {
			const errorMessage = this.resolutionErrors.length > 0
				? `Insufficient models enabled: ${enabledModels.length} enabled, ` +
				  `${settings.minModelsRequired} required. ` +
				  `Failed to resolve: ${this.resolutionErrors.join(", ")}`
				: `Insufficient models enabled: ${enabledModels.length} enabled, ` +
				  `${settings.minModelsRequired} required`;
			throw new Error(errorMessage);
		}

		// Initialize rate limit manager
		this.rateLimitManager = rateLimitManager || new RateLimitManager();

		// Initialize error handler
		this.errorHandler = new CouncilErrorHandler(settings);

		// Initialize model coordinator with resolved models
		this.modelCoordinator = new ModelCoordinator(
			this.resolvedModels,
			quizSettings,
			this.rateLimitManager,
			undefined, // performanceMonitor
			modelErrorCallback
		);

		// Initialize engines for each phase
		this.critiqueEngine = new CritiqueEngine(
			settings,
			quizSettings,
			this.resolvedModels,
			this.modelCoordinator,
			this.rateLimitManager
		);

		this.rankingEngine = new RankingEngine(
			settings,
			quizSettings,
			this.resolvedModels,
			this.modelCoordinator,
			this.rateLimitManager
		);

		this.chairSynthesisEngine = new ChairSynthesisEngine(
			settings,
			quizSettings,
			this.resolvedModels,
			this.modelCoordinator,
			this.rateLimitManager
		);
	}

	/**
	 * Resolve model references to full configurations.
	 *
	 * This method supports both:
	 * 1. New format: settings.models contains CouncilModelReference[] with model IDs
	 * 2. Legacy format: settings.councilModels contains ConsensusModelConfig[] with embedded settings
	 *
	 * For the new format, it uses ModelResolver to look up full configurations from
	 * the central ModelRegistry. Resolution errors are collected but don't fail the
	 * entire operation - only successfully resolved models are returned.
	 *
	 * @param settings - Council settings with model references or configs
	 * @param quizSettings - Quiz settings containing the model registry
	 * @returns Array of resolved model configurations ready for use
	 *
	 * Requirements: 1.4, 9.4, 9.7
	 */
	private resolveModelReferences(
		settings: CouncilSettings,
		quizSettings: QuizSettings
	): ResolvedConsensusModel[] {
		this.resolutionErrors = [];

		// Resolve model references from the models array
		if (settings.models && settings.models.length > 0) {
			return this.resolveFromRegistry(settings.models, quizSettings);
		}

		// No models configured
		return [];
	}

	/**
	 * Resolve model references from the central registry.
	 *
	 * Uses ModelResolver to look up each model ID and extract the full
	 * configuration. Models that can't be resolved are logged and skipped.
	 *
	 * @param references - Array of model references with IDs
	 * @param quizSettings - Quiz settings containing the model registry
	 * @returns Array of resolved models
	 *
	 * Requirements: 1.4, 9.4
	 */
	private resolveFromRegistry(
		references: CouncilModelReference[],
		quizSettings: QuizSettings
	): ResolvedConsensusModel[] {
		const resolver = createModelResolver(quizSettings);
		const resolved: ResolvedConsensusModel[] = [];

		for (const ref of references) {
			try {
				const modelConfig = resolver.resolve(ref.modelId);

				// Create a resolved council model that combines registry config with council settings
				resolved.push({
					id: ref.modelId,
					modelConfig,
					weight: ref.weight,
					enabled: ref.enabled,
					provider: modelConfig.providerConfig.provider,
				});
			} catch (error) {
				// Log resolution error but continue with other models
				if (isModelNotFoundError(error)) {
					console.error(`Council model resolution failed: ${error.getUserFriendlyMessage()}`);
					this.resolutionErrors.push(ref.modelId);

					// Report to UI if callback available
					if (this.modelErrorCallback) {
						this.modelErrorCallback(
							ref.modelId,
							`Model not found in registry: ${ref.modelId}. Please reconfigure in settings.`,
							"error",
							false
						);
					}
				} else {
					console.error(`Unexpected error resolving model ${ref.modelId}:`, error);
					this.resolutionErrors.push(ref.modelId);
				}
			}
		}

		return resolved;
	}

	/**
	 * Convert ConsensusModelConfig to ResolvedConsensusModel format.
	 *
	 * Now uses ProviderConfig directly from the ConsensusModelConfig.
	 *
	 * @param models - Model configurations with ProviderConfig
	 * @param quizSettings - Base quiz settings for fallback values
	 * @returns Array of resolved models in the new format
	 *
	 * Requirements: 6.2 (simplified settings mapping)
	 */
	private convertLegacyModels(
		models: ConsensusModelConfig[],
		quizSettings: QuizSettings
	): ResolvedConsensusModel[] {
		return models.map(model => {
			// Create ModelConfiguration from ProviderConfig
			const modelConfig: ModelConfiguration = this.createModelConfigFromConsensus(model);

			return {
				id: model.id,
				modelConfig,
				weight: model.weight,
				enabled: model.enabled,
				provider: model.provider,
			};
		});
	}

	/**
	 * Create a ModelConfiguration from ConsensusModelConfig.
	 *
	 * Uses the ProviderConfig directly from the consensus config.
	 *
	 * @param model - Model configuration with ProviderConfig
	 * @returns ModelConfiguration suitable for GeneratorFactory
	 *
	 * Requirements: 6.2 (simplified settings mapping)
	 */
	private createModelConfigFromConsensus(model: ConsensusModelConfig): ModelConfiguration {
		const now = Date.now();

		return {
			id: model.id,
			displayName: `${model.provider} Model`,
			isAutoGeneratedName: true,
			providerConfig: model.providerConfig,
			createdAt: now,
			modifiedAt: now,
		};
	}

	/**
	 * Get the list of model IDs that failed resolution.
	 *
	 * This can be used by callers to display warnings about missing models.
	 *
	 * @returns Array of model IDs that couldn't be resolved
	 */
	public getResolutionErrors(): string[] {
		return [...this.resolutionErrors];
	}

	/**
	 * Get the count of successfully resolved models.
	 *
	 * @returns Number of models that were successfully resolved
	 */
	public getResolvedModelCount(): number {
		return this.resolvedModels.length;
	}

	/**
	 * Get the count of enabled resolved models.
	 *
	 * @returns Number of enabled models ready for council
	 */
	public getEnabledModelCount(): number {
		return this.resolvedModels.filter(m => m.enabled).length;
	}

	/**
	 * Generate quiz with LLM Council debate process
	 *
	 * This is the main entry point for council-based quiz generation.
	 * It orchestrates all five phases of the council process and returns
	 * a complete result with the final quiz and debate trail.
	 *
	 * Error Handling:
	 * - Phase 1 failure: Attempt fallback to single-model if enabled
	 * - Phase 2 failure: Continue without critiques if possible
	 * - Phase 3 failure: Use simple voting or skip to synthesis
	 * - Phase 4 failure: Return highest-ranked response
	 *
	 * @param contents - Source content for quiz generation (note text)
	 * @returns Council result with quiz and debate trail
	 *
	 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
	 */
	public async generateQuizWithCouncil(
		contents: string[]
	): Promise<CouncilResult> {
		this.startTime = Date.now();
		this.failedModels = [];
		this.resetTokenUsage();

		try {
			// Phase 1: Parallel Query
			const modelResponses = await this.executeParallelQuery(contents);

			// Check if we have enough successful responses
			const successfulResponses = modelResponses.filter(r => r.success);
			if (successfulResponses.length < this.settings.minModelsRequired) {
				return await this.handleInsufficientModels(modelResponses, contents);
			}

			// Phase 2: Anonymous Critique (optional)
			let critiques: CritiqueResult[] = [];
			if (this.settings.enableCritique) {
				critiques = await this.executeCritique(modelResponses, contents);
			}

			// Phase 3: Ranking (optional)
			let rankings: RankingResult | null = null;
			if (this.settings.enableRanking) {
				rankings = await this.executeRanking(modelResponses, critiques, contents);
			}

			// Phase 4: Chair Synthesis
			const finalQuiz = await this.executeChairSynthesis(
				modelResponses,
				critiques,
				rankings,
				contents
			);

			// Phase 5: Finalization
			return await this.executeFinalization(
				finalQuiz,
				modelResponses,
				critiques,
				rankings
			);

		} catch (error) {
			// Handle any unexpected errors
			return this.handleFatalError(error);
		}
	}

	/**
	 * Generate quiz with LLM Council debate process with caching support
	 *
	 * This method wraps the main generateQuizWithCouncil method with caching
	 * capabilities. It checks the cache for existing results before initiating
	 * the full council process, and stores successful results for future use.
	 *
	 * Cache invalidation occurs when:
	 * - Content changes (different source material)
	 * - Settings change (model configs, chair selection, etc.)
	 * - TTL expires (default: 7 days)
	 *
	 * If caching is disabled in settings or no cache is provided, this method
	 * falls through to the normal generation process.
	 *
	 * @param contents - Source content for quiz generation (note text)
	 * @returns Council result with quiz and debate trail
	 * @throws Error if council cannot be established and fallback is disabled
	 *
	 * Requirements: 4.7, 7.6
	 */
	public async generateWithCache(
		contents: string[]
	): Promise<CouncilResult> {
		// Check if caching is enabled
		if (!this.settings.enableCaching || !this.cache) {
			// Caching disabled - fall through to normal generation
			return this.generateQuizWithCouncil(contents);
		}

		// Generate cache keys
		const contentHash = hashContent(contents);
		const settingsHash = hashCouncilSettings(this.settings);

		this.reportProgress({
			phase: CouncilPhase.PARALLEL_QUERY,
			phaseProgress: 0,
			overallProgress: 0,
			statusMessage: "Checking cache for existing council result...",
		});

		try {
			// Check cache
			const cachedResult = await this.cache.get(contentHash, settingsHash);

			if (cachedResult) {
				// Cache HIT - return cached result
				console.log("Council cache HIT - returning cached result");

				this.reportProgress({
					phase: CouncilPhase.FINALIZATION,
					phaseProgress: 1,
					overallProgress: 1,
					statusMessage: `Quiz loaded from cache! ${cachedResult.quiz.questions.length} questions retrieved.`,
				});

				return cachedResult;
			}

			// Cache MISS - generate new result
			console.log("Council cache MISS - generating new result");

			this.reportProgress({
				phase: CouncilPhase.PARALLEL_QUERY,
				phaseProgress: 0,
				overallProgress: 0,
				statusMessage: "No cached result found. Starting council debate...",
			});

			const result = await this.generateQuizWithCouncil(contents);

			// Cache the result if generation was successful
			if (result.success && result.quiz.questions.length > 0) {
				try {
					await this.cache.set(contentHash, settingsHash, result);
					console.log("Council result cached for future use");
				} catch (cacheError) {
					// Cache storage failed - log but don't fail the request
					console.error("Failed to cache council result:", cacheError);
				}
			}

			return result;

		} catch (error) {
			// Handle cache errors gracefully
			console.error("Cache operation failed:", error);
			console.log("Falling back to uncached generation");

			// Fall through to normal generation
			return this.generateQuizWithCouncil(contents);
		}
	}

	/**
	 * Execute Phase 1: Parallel Query
	 *
	 * Delegates to ModelCoordinator (existing infrastructure) to invoke
	 * all configured models in parallel and collect their responses.
	 *
	 * @param contents - Source content for quiz generation
	 * @returns Array of model responses
	 *
	 * Requirements: 1.1, 1.2, 1.3, 1.4, 5.1, 5.2
	 */
	private async executeParallelQuery(
		contents: string[]
	): Promise<ConsensusModelResponse[]> {
		const enabledModels = this.resolvedModels.filter(m => m.enabled);
		this.reportProgress({
			phase: CouncilPhase.PARALLEL_QUERY,
			phaseProgress: 0,
			overallProgress: 0,
			statusMessage: `Querying ${enabledModels.length} models in parallel...`,
			totalModels: enabledModels.length,
			modelsResponded: 0,
		});

		try {
			const responses = await this.modelCoordinator.invokeModels(contents, {
				timeout: this.settings.phaseTimeouts.parallelQuery,
				continueOnError: true,
			});

			// Track failed models
			this.failedModels = responses
				.filter(r => !r.success)
				.map(r => r.modelId);

			// Log detailed information about failures
			if (this.failedModels.length > 0) {
				console.warn(
					`[Council/ParallelQuery] ${this.failedModels.length} model(s) failed:`,
					this.failedModels.map(modelId => {
						const response = responses.find(r => r.modelId === modelId);
						return {
							modelId,
							error: response?.error || "Unknown error",
						};
					})
				);

				// Report each failure to user if callback provided
				responses.filter(r => !r.success).forEach(response => {
					if (this.modelErrorCallback && response.error) {
						this.modelErrorCallback(
							response.modelId,
							`Model failed in parallel query: ${response.error}`,
							"error",
							false
						);
					}
				});
			}

			// Track token usage (if available in response)
			// Note: tokenUsage may not be available in all generator responses
			responses.forEach(response => {
				const tokenCount = (response as any).tokenUsage;
				if (tokenCount && typeof tokenCount === 'number') {
					this.tokenUsage.parallelQuery.byModel.set(
						response.modelId,
						tokenCount
					);
					this.tokenUsage.parallelQuery.total += tokenCount;
					this.tokenUsage.grandTotal += tokenCount;
				}
			});

			const successCount = responses.filter(r => r.success).length;
			const totalCount = responses.length;

			console.log(
				`[Council/ParallelQuery] Phase complete: ${successCount}/${totalCount} models succeeded`,
				{
					successful: responses.filter(r => r.success).map(r => r.modelId),
					failed: this.failedModels,
					totalTokens: this.tokenUsage.parallelQuery.total,
				}
			);

			this.reportProgress({
				phase: CouncilPhase.PARALLEL_QUERY,
				phaseProgress: 1,
				overallProgress: 0.2,
				statusMessage: `Parallel query complete (${successCount}/${totalCount} models succeeded)`,
				totalModels: totalCount,
				modelsResponded: successCount,
			});

			return responses;

		} catch (error) {
			console.error("[Council/ParallelQuery] Fatal error:", error);
			throw new Error(`Failed to query models: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Execute Phase 2: Anonymous Critique
	 *
	 * Delegates to CritiqueEngine to anonymize responses and request
	 * critiques from all models.
	 *
	 * @param responses - Original model responses
	 * @param contents - Source content for context
	 * @returns Array of critique results
	 *
	 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.3, 6.1
	 */
	private async executeCritique(
		responses: ConsensusModelResponse[],
		contents: string[]
	): Promise<CritiqueResult[]> {
		this.reportProgress({
			phase: CouncilPhase.CRITIQUE,
			phaseProgress: 0,
			overallProgress: 0.2,
			statusMessage: "Models are critiquing each other's responses...",
		});

		try {
			// Anonymize responses
			const anonymizedResponses = this.critiqueEngine.anonymizeResponses(responses);

			console.log(
				`[Council/Critique] Starting critique phase with ${anonymizedResponses.length} anonymized responses`
			);

			// Request critiques from all models
			const critiques = await this.critiqueEngine.requestCritiques(
				anonymizedResponses,
				responses,
				contents
			);

			// Track token usage
			critiques.forEach(critique => {
				if (critique.tokenUsage) {
					this.tokenUsage.critique.byModel.set(
						critique.criticModelId,
						critique.tokenUsage
					);
					this.tokenUsage.critique.total += critique.tokenUsage;
					this.tokenUsage.grandTotal += critique.tokenUsage;
				}
			});

			const successCount = critiques.filter(c => c.success).length;
			const totalCount = critiques.length;
			const failedCritiques = critiques.filter(c => !c.success);

			// Log detailed critique results
			console.log(
				`[Council/Critique] Phase complete: ${successCount}/${totalCount} critiques successful`,
				{
					successful: critiques.filter(c => c.success).map(c => c.criticModelId),
					failed: failedCritiques.map(c => ({
						modelId: c.criticModelId,
						error: c.error,
					})),
					totalTokens: this.tokenUsage.critique.total,
				}
			);

			// Report failures to user
			if (failedCritiques.length > 0) {
				console.warn(
					`[Council/Critique] ${failedCritiques.length} critique(s) failed`
				);

				failedCritiques.forEach(critique => {
					if (this.modelErrorCallback && critique.error) {
						this.modelErrorCallback(
							critique.criticModelId,
							`Critique failed: ${critique.error}`,
							"warning",
							false
						);
					}
				});
			}

			this.reportProgress({
				phase: CouncilPhase.CRITIQUE,
				phaseProgress: 1,
				overallProgress: 0.4,
				statusMessage: `Critique phase complete (${successCount}/${totalCount} critiques successful)`,
				critiquesCompleted: successCount,
			});

			return critiques;

		} catch (error) {
			console.error("[Council/Critique] Fatal error:", error);

			// Use error handler to determine if we should continue
			const handleResult = this.errorHandler.handleCritiqueFailure(0, responses.length);

			console.log(
				`[Council/Critique] Error handling decision: ${handleResult.shouldContinue ? "Continue" : "Abort"}`,
				{ message: handleResult.message }
			);

			this.reportProgress({
				phase: CouncilPhase.CRITIQUE,
				phaseProgress: 1,
				overallProgress: 0.4,
				statusMessage: handleResult.message,
			});

			// Report error to user if callback is provided
			if (this.modelErrorCallback) {
				this.modelErrorCallback(
					"critique-phase",
					handleResult.message,
					"warning",
					false
				);
			}

			return [];
		}
	}

	/**
	 * Execute Phase 3: Ranking
	 *
	 * Delegates to RankingEngine to request rankings from all models
	 * and aggregate them using Borda count.
	 *
	 * @param responses - Original model responses
	 * @param critiques - Critiques from Phase 2
	 * @param contents - Source content for context
	 * @returns Aggregated ranking result
	 *
	 * Requirements: 2.4, 2.5, 2.6, 5.4, 6.1
	 */
	private async executeRanking(
		responses: ConsensusModelResponse[],
		critiques: CritiqueResult[],
		contents: string[]
	): Promise<RankingResult | null> {
		this.reportProgress({
			phase: CouncilPhase.RANKING,
			phaseProgress: 0,
			overallProgress: 0.4,
			statusMessage: "Models are ranking responses...",
		});

		try {
			// Anonymize responses for ranking
			const anonymizedResponses = this.critiqueEngine.anonymizeResponses(responses);

			console.log(
				`[Council/Ranking] Starting ranking phase with ${anonymizedResponses.length} responses`
			);

			// Request rankings from all models
			const modelRankings = await this.rankingEngine.requestRankings(
				anonymizedResponses,
				critiques,
				contents
			);

			// Track token usage
			modelRankings.forEach(ranking => {
				if (ranking.tokenUsage) {
					this.tokenUsage.ranking.byModel.set(
						ranking.modelId,
						ranking.tokenUsage
					);
					this.tokenUsage.ranking.total += ranking.tokenUsage;
					this.tokenUsage.grandTotal += ranking.tokenUsage;
				}
			});

			// Aggregate rankings using Borda count
			const rankings = this.rankingEngine.aggregateRankings(modelRankings);

			const successCount = modelRankings.filter(r => r.success).length;
			const totalCount = modelRankings.length;
			const failedRankings = modelRankings.filter(r => !r.success);

			// Log detailed ranking results
			console.log(
				`[Council/Ranking] Phase complete: ${successCount}/${totalCount} rankings successful`,
				{
					successful: modelRankings.filter(r => r.success).map(r => r.modelId),
					failed: failedRankings.map(r => ({
						modelId: r.modelId,
						error: r.error,
					})),
					consensusRanking: rankings.consensusRanking,
					totalTokens: this.tokenUsage.ranking.total,
				}
			);

			// Report failures to user
			if (failedRankings.length > 0) {
				console.warn(
					`[Council/Ranking] ${failedRankings.length} ranking(s) failed`
				);

				failedRankings.forEach(ranking => {
					if (this.modelErrorCallback && ranking.error) {
						this.modelErrorCallback(
							ranking.modelId,
							`Ranking failed: ${ranking.error}`,
							"warning",
							false
						);
					}
				});
			}

			this.reportProgress({
				phase: CouncilPhase.RANKING,
				phaseProgress: 1,
				overallProgress: 0.6,
				statusMessage: `Ranking phase complete (${successCount}/${totalCount} rankings successful)`,
				rankingsCompleted: successCount,
			});

			return rankings;

		} catch (error) {
			console.error("[Council/Ranking] Fatal error:", error);

			// Use error handler to determine if we should continue
			const handleResult = this.errorHandler.handleRankingFailure(0, responses.length);

			console.log(
				`[Council/Ranking] Error handling decision: ${handleResult.shouldContinue ? "Continue" : "Abort"}`,
				{ message: handleResult.message }
			);

			this.reportProgress({
				phase: CouncilPhase.RANKING,
				phaseProgress: 1,
				overallProgress: 0.6,
				statusMessage: handleResult.message,
			});

			// Report error to user if callback is provided
			if (this.modelErrorCallback) {
				this.modelErrorCallback(
					"ranking-phase",
					handleResult.message,
					"warning",
					false
				);
			}

			return null;
		}
	}

	/**
	 * Execute Phase 4: Chair Synthesis
	 *
	 * Delegates to ChairSynthesisEngine to select chair model and
	 * synthesize final quiz from all debate data.
	 *
	 * Implements fallback strategy:
	 * 1. Try chair model synthesis
	 * 2. If chair fails, try second-choice chair
	 * 3. If all chairs fail, return highest-ranked response
	 *
	 * @param responses - Original model responses
	 * @param critiques - Critiques from Phase 2
	 * @param rankings - Rankings from Phase 3
	 * @param contents - Source content for context
	 * @returns Final synthesized quiz
	 *
	 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.5, 6.2, 6.3
	 */
	private async executeChairSynthesis(
		responses: ConsensusModelResponse[],
		critiques: CritiqueResult[],
		rankings: RankingResult | null,
		contents: string[]
	): Promise<Quiz> {
		this.reportProgress({
			phase: CouncilPhase.SYNTHESIS,
			phaseProgress: 0,
			overallProgress: 0.6,
			statusMessage: "Chair model is synthesizing final quiz...",
		});

		try {
			// Anonymize responses for synthesis
			const anonymizedResponses = this.critiqueEngine.anonymizeResponses(responses);

			// Use empty ranking if not available
			const effectiveRankings: RankingResult = rankings || {
				consensusRanking: anonymizedResponses.map(r => r.anonymousId),
				scores: new Map(),
				individualRankings: [],
			};

			// Select chair model
			const chairModelId = this.chairSynthesisEngine.selectChairModel(
				effectiveRankings,
				anonymizedResponses
			);

			console.log(
				`[Council/Synthesis] Starting synthesis with chair model: ${chairModelId}`,
				{
					strategy: this.settings.chairModel.selectionStrategy,
					responsesCount: anonymizedResponses.length,
					critiquesCount: critiques.length,
					hasRankings: rankings !== null,
				}
			);

			this.reportProgress({
				phase: CouncilPhase.SYNTHESIS,
				phaseProgress: 0.3,
				overallProgress: 0.7,
				statusMessage: `Chair model ${chairModelId} is synthesizing responses...`,
			});

			// Synthesize final quiz
			const synthesisResult = await this.chairSynthesisEngine.synthesizeFinalQuiz(
				anonymizedResponses,
				responses,
				critiques,
				effectiveRankings,
				chairModelId,
				contents
			);

			const finalQuiz = synthesisResult.quiz;

			// Track token usage from synthesis if available
			if (synthesisResult.tokenUsage !== undefined) {
				this.tokenUsage.synthesis.byModel.set(chairModelId, synthesisResult.tokenUsage);
				this.tokenUsage.synthesis.total = synthesisResult.tokenUsage;
				this.tokenUsage.grandTotal += synthesisResult.tokenUsage;
			}

			console.log(
				`[Council/Synthesis] Synthesis complete with ${finalQuiz.questions.length} questions`,
				{
					chairModel: chairModelId,
					questionsGenerated: finalQuiz.questions.length,
					tokenUsage: synthesisResult.tokenUsage,
				}
			);

			this.reportProgress({
				phase: CouncilPhase.SYNTHESIS,
				phaseProgress: 1,
				overallProgress: 0.8,
				statusMessage: `Chair synthesis complete (${finalQuiz.questions.length} questions)`,
			});

			return finalQuiz;

		} catch (error) {
			console.error("[Council/Synthesis] Chair synthesis failed:", error);

			// Use error handler to determine fallback strategy
			const successfulResponses = responses.filter(r => r.success);
			const availableModelIds = successfulResponses.map(r => r.modelId);
			const hasRankings = rankings !== null && rankings.consensusRanking.length > 0;

			// Determine which chair was attempted (if selection succeeded before synthesis failed)
			let attemptedChairId = "unknown-chair";
			try {
				const anonymizedResponses = this.critiqueEngine.anonymizeResponses(responses);
				const effectiveRankings: RankingResult = rankings || {
					consensusRanking: anonymizedResponses.map(r => r.anonymousId),
					scores: new Map(),
					individualRankings: [],
				};
				attemptedChairId = this.chairSynthesisEngine.selectChairModel(
					effectiveRankings,
					anonymizedResponses
				);
			} catch (selectError) {
				console.warn("[Council/Synthesis] Could not determine attempted chair model:", selectError);
			}

			const fallbackStrategy = this.errorHandler.handleChairFailure(
				attemptedChairId,
				error instanceof Error ? error : new Error(String(error)),
				availableModelIds,
				hasRankings
			);

			console.log(
				`[Council/Synthesis] Using fallback strategy: ${fallbackStrategy}`,
				{
					attemptedChair: attemptedChairId,
					availableModels: availableModelIds,
					hasRankings,
				}
			);

			this.reportProgress({
				phase: CouncilPhase.SYNTHESIS,
				phaseProgress: 1,
				overallProgress: 0.8,
				statusMessage: `Chair synthesis failed, using fallback: ${fallbackStrategy}`,
			});

			// Report error to user if callback is provided
			if (this.modelErrorCallback) {
				this.modelErrorCallback(
					attemptedChairId,
					`Chair model failed during synthesis. Using fallback strategy: ${fallbackStrategy}`,
					"error",
					false
				);
			}

			return this.getFallbackQuiz(responses, rankings);
		}
	}

	/**
	 * Execute Phase 5: Finalization
	 *
	 * Builds comprehensive audit trail and compiles final result.
	 *
	 * @param quiz - Final synthesized quiz
	 * @param responses - Original model responses
	 * @param critiques - Critiques from Phase 2
	 * @param rankings - Rankings from Phase 3
	 * @returns Complete council result
	 *
	 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
	 */
	private async executeFinalization(
		quiz: Quiz,
		responses: ConsensusModelResponse[],
		critiques: CritiqueResult[],
		rankings: RankingResult | null
	): Promise<CouncilResult> {
		this.reportProgress({
			phase: CouncilPhase.FINALIZATION,
			phaseProgress: 0,
			overallProgress: 0.8,
			statusMessage: "Finalizing quiz and building debate trail...",
		});

		// Build comprehensive audit trail
		const debateTrail = this.buildAuditTrail(
			responses,
			critiques,
			rankings
		);

		// Check if we have any questions
		const success = quiz.questions.length > 0;

		this.reportProgress({
			phase: CouncilPhase.FINALIZATION,
			phaseProgress: 1,
			overallProgress: 1,
			statusMessage: success
				? `Council generation complete! ${quiz.questions.length} questions generated.`
				: "Council generation failed - no questions could be generated",
		});

		return {
			quiz,
			debateTrail,
			success,
			failureReason: success ? undefined : "No questions could be generated through council process",
		};
	}

	/**
	 * Build comprehensive audit trail from all phases
	 *
	 * Collects data from all phases (responses, critiques, rankings, synthesis)
	 * into a complete CouncilDebateTrail structure for transparency and debugging.
	 *
	 * This method calculates:
	 * - Total duration from start to current time
	 * - Token usage breakdown by phase and model
	 * - Participating and failed models
	 * - Chair model selection and synthesis strategy
	 * - Elements incorporated into final output
	 *
	 * @param responses - Original model responses from Phase 1
	 * @param critiques - Critique results from Phase 2
	 * @param rankings - Ranking results from Phase 3
	 * @returns Complete audit trail structure
	 *
	 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
	 */
	private buildAuditTrail(
		responses: ConsensusModelResponse[],
		critiques: CritiqueResult[],
		rankings: RankingResult | null
	): CouncilDebateTrail {
		// Calculate total duration
		const totalDuration = Date.now() - this.startTime;

		// Anonymize responses for determining incorporated elements
		const anonymizedResponses = this.critiqueEngine.anonymizeResponses(responses);

		// Create effective rankings (use empty if not available)
		const effectiveRankings: RankingResult = rankings || {
			consensusRanking: anonymizedResponses.map(r => r.anonymousId),
			scores: new Map(),
			individualRankings: [],
		};

		// Determine chair model ID
		const chairModelId = this.chairSynthesisEngine.selectChairModel(
			effectiveRankings,
			anonymizedResponses
		);

		// Determine which responses influenced the final output
		const elementsIncorporated = this.determineIncorporatedElements(
			anonymizedResponses,
			rankings
		);

		// Extract participating models (successful responses)
		const participatingModels = responses
			.filter(r => r.success)
			.map(r => r.modelId);

		// Calculate cost estimate from token usage
		const costEstimate = this.calculateCostEstimate(responses, critiques, rankings);

		// Build complete audit trail
		return {
			totalDuration,
			initialResponses: responses.map(r => this.toModelResponse(r)),
			critiques,
			rankings: rankings || {
				consensusRanking: [],
				scores: new Map(),
				individualRankings: [],
			},
			synthesis: {
				chairModelId,
				synthesisStrategy: this.settings.chairModel.selectionStrategy,
				elementsIncorporated,
			},
			participatingModels,
			failedModels: this.failedModels,
			tokenUsage: this.tokenUsage,
			costEstimate,
		};
	}

	/**
	 * Convert ConsensusModelResponse to council ModelResponse
	 *
	 * @param response - Consensus model response
	 * @returns Council model response
	 */
	private toModelResponse(response: ConsensusModelResponse): ModelResponse {
		const tokenCount = (response as any).tokenUsage;
		return {
			modelId: response.modelId,
			quiz: response.quiz,
			rawResponse: response.rawResponse,
			success: response.success,
			error: response.error,
			duration: response.duration,
			tokenUsage: (tokenCount && typeof tokenCount === 'number') ? tokenCount : undefined,
		};
	}

	/**
	 * Determine which responses influenced the final output
	 *
	 * @param anonymizedResponses - Anonymized responses
	 * @param rankings - Ranking results
	 * @returns Array of response IDs that influenced synthesis
	 */
	private determineIncorporatedElements(
		anonymizedResponses: AnonymizedResponse[],
		rankings: RankingResult | null
	): string[] {
		if (!rankings || rankings.consensusRanking.length === 0) {
			// No rankings - assume all responses contributed
			return anonymizedResponses.map(r => r.anonymousId);
		}

		// Return top-ranked responses (typically top 2-3)
		const topCount = Math.min(3, rankings.consensusRanking.length);
		return rankings.consensusRanking.slice(0, topCount);
	}

	/**
	 * Calculate cost estimate from token usage across all phases
	 *
	 * This method aggregates token usage from all phases and calculates
	 * the estimated cost based on each model's pricing.
	 *
	 * Since we don't always have prompt/completion breakdown, we estimate:
	 * - 60% of tokens are prompt tokens (input context)
	 * - 40% of tokens are completion tokens (output)
	 *
	 * @param responses - Initial model responses
	 * @param critiques - Critique results
	 * @param rankings - Ranking results
	 * @returns Total cost estimate
	 *
	 * Requirements: 7.1, 7.2, 7.3, 7.4
	 */
	private calculateCostEstimate(
		responses: ConsensusModelResponse[],
		critiques: CritiqueResult[],
		rankings: RankingResult | null
	) {
		const usages: Array<{ usage: TokenUsage; modelId: string }> = [];

		// Helper function to create token usage with estimated breakdown
		const createTokenUsage = (totalTokens: number): TokenUsage => {
			// Estimate 60% prompt, 40% completion (typical for quiz generation)
			const promptTokens = Math.round(totalTokens * 0.6);
			const completionTokens = totalTokens - promptTokens;
			return {
				promptTokens,
				completionTokens,
				totalTokens,
			};
		};

		// Collect token usage from parallel query phase
		for (const [modelId, tokenCount] of this.tokenUsage.parallelQuery.byModel.entries()) {
			if (tokenCount > 0) {
				usages.push({
					usage: createTokenUsage(tokenCount),
					modelId,
				});
			}
		}

		// Collect token usage from critique phase
		for (const [modelId, tokenCount] of this.tokenUsage.critique.byModel.entries()) {
			if (tokenCount > 0) {
				usages.push({
					usage: createTokenUsage(tokenCount),
					modelId,
				});
			}
		}

		// Collect token usage from ranking phase
		for (const [modelId, tokenCount] of this.tokenUsage.ranking.byModel.entries()) {
			if (tokenCount > 0) {
				usages.push({
					usage: createTokenUsage(tokenCount),
					modelId,
				});
			}
		}

		// Collect token usage from synthesis phase
		for (const [modelId, tokenCount] of this.tokenUsage.synthesis.byModel.entries()) {
			if (tokenCount > 0) {
				usages.push({
					usage: createTokenUsage(tokenCount),
					modelId,
				});
			}
		}

		// Calculate total cost
		return CostEstimator.estimateTotalCost(usages);
	}

	/**
	 * Get fallback quiz when chair synthesis fails
	 *
	 * Returns the highest-ranked quiz, or first successful quiz if no rankings.
	 *
	 * @param responses - Original model responses
	 * @param rankings - Ranking results
	 * @returns Fallback quiz
	 */
	private getFallbackQuiz(
		responses: ConsensusModelResponse[],
		rankings: RankingResult | null
	): Quiz {
		const anonymizedResponses = this.critiqueEngine.anonymizeResponses(responses);

		if (rankings && rankings.consensusRanking.length > 0) {
			// Get highest-ranked response ID
			const highestRankedId = rankings.consensusRanking[0];

			// Find the corresponding quiz
			const highestRankedResponse = anonymizedResponses.find(
				r => r.anonymousId === highestRankedId
			);

			if (highestRankedResponse) {
				return highestRankedResponse.quiz;
			}
		}

		// Fallback to first successful response
		const firstSuccessful = responses.find(r => r.success && r.quiz);
		if (firstSuccessful && firstSuccessful.quiz) {
			return firstSuccessful.quiz;
		}

		// Ultimate fallback: empty quiz
		console.warn("No valid quiz found for fallback");
		return { questions: [] };
	}

	/**
	 * Handle insufficient models scenario
	 *
	 * When not enough models succeed, either fallback to single-model
	 * generation or fail based on settings.
	 *
	 * @param responses - All model responses (mostly failed)
	 * @param contents - Source content for potential single-model fallback
	 * @returns Council result (fallback or failure)
	 *
	 * Requirements: 6.1, 6.2, 6.4, 6.5
	 */
	private async handleInsufficientModels(
		responses: ConsensusModelResponse[],
		contents: string[]
	): Promise<CouncilResult> {
		const successCount = responses.filter(r => r.success).length;
		const totalCount = responses.length;

		// Use error handler to determine fallback strategy
		const fallbackStrategy = this.errorHandler.handleInsufficientModels(
			successCount,
			totalCount
		);

		console.warn(
			`[Council/InsufficientModels] Only ${successCount}/${this.settings.minModelsRequired} models succeeded`,
			{
				successfulModels: responses.filter(r => r.success).map(r => r.modelId),
				failedModels: responses.filter(r => !r.success).map(r => r.modelId),
				fallbackStrategy,
				fallbackEnabled: this.settings.fallbackToSingleModel,
			}
		);

		switch (fallbackStrategy) {
			case FallbackStrategy.FALLBACK_TO_SINGLE_MODEL: {
				this.reportProgress({
					phase: CouncilPhase.FINALIZATION,
					phaseProgress: 1,
					overallProgress: 1,
					statusMessage: `Insufficient models, using single-model fallback...`,
				});

				// Use the first successful response
				const successfulResponse = responses.find(r => r.success && r.quiz);
				if (successfulResponse && successfulResponse.quiz) {
					const debateTrail = this.buildAuditTrail(responses, [], null);
					debateTrail.synthesis.synthesisStrategy = "fallback-single-model";

					return {
						quiz: successfulResponse.quiz,
						debateTrail,
						success: true,
					};
				}
				break;
			}

			case FallbackStrategy.USE_HIGHEST_RANKED_RESPONSE: {
				// Use highest-ranked if we have multiple responses
				this.reportProgress({
					phase: CouncilPhase.FINALIZATION,
					phaseProgress: 1,
					overallProgress: 1,
					statusMessage: `Using highest-ranked response as fallback...`,
				});

				const successfulResponse = responses.find(r => r.success && r.quiz);
				if (successfulResponse && successfulResponse.quiz) {
					const debateTrail = this.buildAuditTrail(responses, [], null);
					debateTrail.synthesis.synthesisStrategy = "fallback-highest-ranked";

					return {
						quiz: successfulResponse.quiz,
						debateTrail,
						success: true,
					};
				}
				break;
			}

			case FallbackStrategy.ABORT_WITH_ERROR:
			default: {
				// Cannot proceed - build audit trail showing failure
				const debateTrail = this.buildAuditTrail(responses, [], null);
				debateTrail.synthesis.synthesisStrategy = "none";
				debateTrail.synthesis.chairModelId = "";

				const errorMessage = this.errorHandler.getCouncilFailureMessage(
					CouncilPhase.PARALLEL_QUERY,
					`Only ${successCount}/${this.settings.minModelsRequired} models succeeded`
				);

				return {
					quiz: { questions: [] },
					debateTrail,
					success: false,
					failureReason: errorMessage,
				};
			}
		}

		// Fallback if all strategies failed
		const debateTrail = this.buildAuditTrail(responses, [], null);
		debateTrail.synthesis.synthesisStrategy = "none";
		debateTrail.synthesis.chairModelId = "";

		return {
			quiz: { questions: [] },
			debateTrail,
			success: false,
			failureReason: `Insufficient models available: ${successCount}/${this.settings.minModelsRequired} succeeded`,
		};
	}

	/**
	 * Handle fatal errors during council process
	 *
	 * @param error - The error that occurred
	 * @returns Council result indicating failure
	 */
	private handleFatalError(error: unknown): CouncilResult {
		const errorMessage = error instanceof Error ? error.message : String(error);

		console.error("Fatal error during council:", errorMessage);

		// Build audit trail showing error state
		const debateTrail = this.buildAuditTrail([], [], null);
		debateTrail.synthesis.synthesisStrategy = "error";
		debateTrail.synthesis.chairModelId = "";

		return {
			quiz: { questions: [] },
			debateTrail,
			success: false,
			failureReason: `Fatal error: ${errorMessage}`,
		};
	}

	/**
	 * Reset token usage tracking
	 */
	private resetTokenUsage(): void {
		this.tokenUsage = {
			parallelQuery: { total: 0, byModel: new Map() },
			critique: { total: 0, byModel: new Map() },
			ranking: { total: 0, byModel: new Map() },
			synthesis: { total: 0, byModel: new Map() },
			grandTotal: 0,
		};
	}

	/**
	 * Report progress to the UI via callback
	 *
	 * @param progress - Progress information
	 */
	private reportProgress(progress: CouncilProgress): void {
		if (this.progressCallback) {
			this.progressCallback(progress);
		}
	}

	/**
	 * Execute a model invocation with retry logic and exponential backoff
	 *
	 * This method wraps model invocations to provide consistent retry behavior
	 * across all council phases. It uses the CouncilErrorHandler to determine
	 * whether errors should be retried, and implements exponential backoff.
	 *
	 * @param modelId - ID of the model being invoked
	 * @param phase - Current council phase
	 * @param invokeFn - Async function to invoke the model
	 * @param context - Error context for handler decisions
	 * @returns Result of the invocation (or throws if all retries fail)
	 *
	 * Requirements: 6.1, 6.6
	 */
	private async executeWithRetry<T>(
		modelId: string,
		phase: CouncilPhase,
		invokeFn: () => Promise<T>,
		context: Partial<ErrorContext>
	): Promise<T> {
		let retryCount = 0;
		const maxRetries = 2; // Max 2 retries (3 total attempts)

		while (true) {
			try {
				return await invokeFn();
			} catch (error) {
				const errorContext: ErrorContext = {
					modelId,
					phase,
					retryCount,
					totalModels: this.resolvedModels.filter(m => m.enabled).length,
					successfulModels: context.successfulModels || 0,
					minModelsRequired: this.settings.minModelsRequired,
				};

				// Use error handler to determine action
				const handleResult = this.errorHandler.handleModelError(
					error as Error,
					errorContext
				);

				// Log error details
				console.error(
					`[Council/${phase}] Model ${modelId} error (attempt ${retryCount + 1}/${maxRetries + 1}):`,
					{
						message: (error as Error).message,
						action: handleResult.action,
						retryDelayMs: handleResult.retryDelayMs,
					}
				);

				// Report error to user if callback is provided
				if (this.modelErrorCallback) {
					const isRetrying = handleResult.action === ErrorAction.RETRY_ONCE;
					this.modelErrorCallback(
						modelId,
						handleResult.userMessage,
						isRetrying ? "warning" : "error",
						isRetrying
					);
				}

				// Handle based on error handler decision
				switch (handleResult.action) {
					case ErrorAction.RETRY_ONCE:
						if (retryCount < maxRetries && handleResult.retryDelayMs) {
							retryCount++;
							// Wait for exponential backoff delay
							await new Promise(resolve =>
								setTimeout(resolve, handleResult.retryDelayMs)
							);
							// Continue to next iteration (retry)
							continue;
						}
						// Exceeded retries, fall through to skip/abort
						throw error;

					case ErrorAction.SKIP_MODEL:
						// Skip this model, let caller handle gracefully
						throw error;

					case ErrorAction.ABORT:
						// Abort entire process
						throw new Error(
							`Council process aborted due to ${modelId} failure: ${handleResult.userMessage}`
						);

					case ErrorAction.CONTINUE:
					default:
						// Continue with partial results
						throw error;
				}
			}
		}
	}

	/**
	 * Clear generator caches in all engines
	 *
	 * Useful for cleanup and testing.
	 */
	public clearCaches(): void {
		this.critiqueEngine.clearCache();
		this.rankingEngine.clearCache();
		this.chairSynthesisEngine.clearCache();
		this.modelCoordinator.clearGeneratorCache();
	}
}
