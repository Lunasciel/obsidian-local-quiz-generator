import { Quiz, Question } from "../utils/types";
import { Provider } from "../generators/providers";
import { QuizSettings } from "../settings/config";
import { CostEstimate } from "../generators/generatorTypes";
import { CouncilModelReference } from "../settings/modelRegistry/types";

/**
 * Configuration for LLM Council debate-based quiz generation
 *
 * The LLM Council feature orchestrates multiple language models in a structured
 * debate process where models critique and rank each other's outputs, culminating
 * in a chair model synthesizing the best elements into a final answer.
 *
 * This interface uses the new reference-based model configuration where
 * model references point to entries in the central ModelRegistry.
 * Legacy councilModels have been removed after migration to the
 * simplified settings architecture.
 *
 * Requirements: 2.2, 2.3
 */
export interface CouncilSettings {
	/** Enable/disable council mode */
	enabled: boolean;

	/**
	 * Model references for council (registry-based)
	 * Each reference points to a model in the central ModelRegistry.
	 * Models are stored centrally and referenced by ID for consistency
	 * across main, consensus, and council settings.
	 *
	 * Requirements: 2.2, 2.3
	 */
	models: CouncilModelReference[];

	/** Minimum models required for council (default: 2) */
	minModelsRequired: number;

	/** Chair model configuration */
	chairModel: ChairModelConfig;

	/** Enable critique phase */
	enableCritique: boolean;

	/** Enable ranking phase */
	enableRanking: boolean;

	/** Show debate transparency to users */
	showDebateTrail: boolean;

	/** Fallback to single model if council fails */
	fallbackToSingleModel: boolean;

	/** Cache council results */
	enableCaching: boolean;

	/** Timeout per phase (milliseconds) */
	phaseTimeouts: {
		parallelQuery: number;
		critique: number;
		ranking: number;
		synthesis: number;
	};
}

/**
 * Configuration for chair model selection and synthesis
 *
 * The chair model receives all responses, critiques, and rankings,
 * then synthesizes the best elements into a final quiz.
 */
export interface ChairModelConfig {
	/** How to select chair: "configured" | "highest-ranked" | "rotating" */
	selectionStrategy: "configured" | "highest-ranked" | "rotating";

	/** Specific model ID if strategy is "configured" */
	configuredChairId?: string;

	/** Weight given to chair model in final output (default: 1.0) */
	synthesisWeight: number;

	/** Index for rotating strategy (internal state) */
	rotationIndex?: number;
}

/**
 * Final result of the LLM Council debate process
 */
export interface CouncilResult {
	/** Final quiz after council process */
	quiz: Quiz;

	/** Complete debate trail for transparency */
	debateTrail: CouncilDebateTrail;

	/** Whether council succeeded */
	success: boolean;

	/** Reason if failed */
	failureReason?: string;
}

/**
 * Complete audit trail of the council debate process
 *
 * Captures all phases of the debate including initial responses,
 * critiques, rankings, and chair synthesis for full transparency.
 */
export interface CouncilDebateTrail {
	/** Total duration (ms) */
	totalDuration: number;

	/** Phase 1: Parallel query results */
	initialResponses: ModelResponse[];

	/** Phase 2: Critique results */
	critiques: CritiqueResult[];

	/** Phase 3: Ranking results */
	rankings: RankingResult;

	/** Phase 4: Chair synthesis metadata */
	synthesis: {
		chairModelId: string;
		synthesisStrategy: string;
		elementsIncorporated: string[];  // Which responses influenced final output
	};

	/** Models that participated successfully */
	participatingModels: string[];

	/** Models that failed */
	failedModels: string[];

	/** Token usage tracking */
	tokenUsage: TokenUsageBreakdown;

	/** Cost estimation across all phases */
	costEstimate: CostEstimate;
}

/**
 * Token usage breakdown across all council phases
 */
export interface TokenUsageBreakdown {
	parallelQuery: { total: number; byModel: Map<string, number> };
	critique: { total: number; byModel: Map<string, number> };
	ranking: { total: number; byModel: Map<string, number> };
	synthesis: { total: number; byModel: Map<string, number> };
	grandTotal: number;
}

/**
 * Response from a single model during council generation
 * Extends the consensus ModelResponse concept
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

	/** Token usage for this response (if available) */
	tokenUsage?: number;
}

/**
 * Anonymized response for unbiased critique
 *
 * During the critique phase, model identifiers are hidden to ensure
 * models evaluate responses purely on merit rather than reputation.
 */
export interface AnonymizedResponse {
	/** Anonymous identifier (e.g., "Response A", "Response B") */
	anonymousId: string;

	/** Original model ID (hidden during critique) */
	originalModelId: string;

	/** The quiz generated by this model */
	quiz: Quiz;
}

/**
 * Result of critique phase for a single model
 *
 * Each model provides critiques for all responses except its own.
 */
export interface CritiqueResult {
	/** Model that provided critique */
	criticModelId: string;

	/** Critiques for each response (excluding own response) */
	critiques: ResponseCritique[];

	/** Whether critique was successfully obtained */
	success: boolean;

	/** Error message if critique failed */
	error?: string;

	/** Token usage for critique (if available) */
	tokenUsage?: number;
}

/**
 * Critique of a single response
 *
 * Models identify strengths, weaknesses, and errors in each response
 * to inform the ranking and synthesis phases.
 */
export interface ResponseCritique {
	/** Anonymous response ID being critiqued */
	responseId: string;

	/** Identified strengths */
	strengths: string[];

	/** Identified weaknesses */
	weaknesses: string[];

	/** Identified errors (factual, formatting, etc.) */
	errors: string[];

	/** Overall assessment */
	overallAssessment: string;
}

/**
 * Parsed critique response from a model
 * Used internally for parsing and validation
 */
export interface ParsedCritique {
	/** Whether parsing was successful */
	success: boolean;

	/** Parsed critiques */
	critiques: ResponseCritique[];

	/** Error message if parsing failed */
	error?: string;
}

/**
 * Ranking from a single model
 *
 * Each model orders all responses from best to worst based on
 * the initial responses and critiques.
 */
export interface ModelRanking {
	/** Model that provided ranking */
	modelId: string;

	/** Ordered array from best to worst (e.g., ["Response B", "Response A", "Response C"]) */
	ranking: string[];

	/** Reasoning for the ranking */
	reasoning: string;

	/** Whether ranking was successfully obtained */
	success: boolean;

	/** Error message if ranking failed */
	error?: string;

	/** Token usage for ranking (if available) */
	tokenUsage?: number;
}

/**
 * Aggregated ranking result using Borda count
 *
 * Combines individual model rankings into a consensus ranking
 * that determines which response is highest quality.
 */
export interface RankingResult {
	/** Final aggregated order from best to worst */
	consensusRanking: string[];

	/** Borda count scores for each response */
	scores: Map<string, number>;

	/** Individual rankings from each model */
	individualRankings: ModelRanking[];
}

/**
 * Parsed ranking response from a model
 * Used internally for parsing and validation
 */
export interface ParsedRanking {
	/** Whether parsing was successful */
	success: boolean;

	/** Ordered ranking array */
	ranking: string[];

	/** Reasoning for ranking */
	reasoning: string;

	/** Error message if parsing failed */
	error?: string;
}

/**
 * Phases of the LLM Council process
 */
export enum CouncilPhase {
	PARALLEL_QUERY = "parallel_query",
	CRITIQUE = "critique",
	RANKING = "ranking",
	SYNTHESIS = "synthesis",
	FINALIZATION = "finalization",
}

/**
 * Progress information for UI updates during council generation
 */
export interface CouncilProgress {
	/** Current phase */
	phase: CouncilPhase;

	/** Progress in current phase (0-1) */
	phaseProgress: number;

	/** Overall progress (0-1) */
	overallProgress: number;

	/** Current status message */
	statusMessage: string;

	// Phase-specific details
	/** Number of models that have responded (Phase 1) */
	modelsResponded?: number;

	/** Total number of models (Phase 1) */
	totalModels?: number;

	/** Number of critiques completed (Phase 2) */
	critiquesCompleted?: number;

	/** Number of rankings completed (Phase 3) */
	rankingsCompleted?: number;
}

/**
 * Callback function for progress updates
 */
export type CouncilProgressCallback = (progress: CouncilProgress) => void;

/**
 * Callback for reporting model-level errors and warnings
 *
 * Allows UI to display real-time feedback about model failures
 */
export type CouncilModelErrorCallback = (
	modelId: string,
	error: string,
	severity: "error" | "warning" | "info",
	retry?: boolean
) => void;

/**
 * Categories of errors that can occur during council process
 */
export enum CouncilErrorCategory {
	/** Model connection or API errors */
	MODEL_FAILURE = "model_failure",

	/** JSON parsing errors */
	PARSING_FAILURE = "parsing_failure",

	/** Not enough successful models */
	INSUFFICIENT_MODELS = "insufficient_models",

	/** Chair model failed */
	CHAIR_FAILURE = "chair_failure",

	/** Timeout exceeded */
	TIMEOUT = "timeout",

	/** Configuration error */
	CONFIGURATION_ERROR = "configuration_error",
}

/**
 * Actions to take when errors occur
 */
export enum ErrorAction {
	/** Retry the operation once */
	RETRY_ONCE = "retry_once",

	/** Skip this model and continue */
	SKIP_MODEL = "skip_model",

	/** Continue with partial results */
	CONTINUE = "continue",

	/** Abort the entire process */
	ABORT = "abort",
}

/**
 * Fallback strategies when council process fails
 */
export enum FallbackStrategy {
	/** Use highest-ranked response as final output */
	USE_HIGHEST_RANKED_RESPONSE = "use_highest_ranked_response",

	/** Use consensus response (if available) */
	USE_CONSENSUS_RESPONSE = "use_consensus_response",

	/** Fallback to single-model generation */
	FALLBACK_TO_SINGLE_MODEL = "fallback_to_single_model",

	/** Abort with error message */
	ABORT_WITH_ERROR = "abort_with_error",
}

/**
 * Detailed error information for debugging and user feedback
 */
export interface CouncilError {
	/** Error category */
	category: CouncilErrorCategory;

	/** Phase where error occurred */
	phase: CouncilPhase;

	/** Model ID if error is model-specific */
	modelId?: string;

	/** Error message */
	message: string;

	/** Original error object */
	originalError?: Error;

	/** Recommended action */
	action: ErrorAction;

	/** Timestamp when error occurred */
	timestamp: number;
}

/**
 * Type guard to check if an object is valid CouncilSettings
 *
 * Validates the models field which must be present as an array.
 * The legacy councilModels field has been removed from the interface.
 *
 * Requirements: 2.2, 2.3
 */
export function isCouncilSettings(obj: any): obj is CouncilSettings {
	if (obj === null || typeof obj !== "object") {
		return false;
	}

	// Check required base fields
	const hasRequiredFields =
		typeof obj.enabled === "boolean" &&
		typeof obj.minModelsRequired === "number" &&
		obj.chairModel !== null &&
		typeof obj.chairModel === "object" &&
		typeof obj.enableCritique === "boolean" &&
		typeof obj.enableRanking === "boolean" &&
		typeof obj.showDebateTrail === "boolean" &&
		typeof obj.fallbackToSingleModel === "boolean" &&
		typeof obj.enableCaching === "boolean" &&
		obj.phaseTimeouts !== null &&
		typeof obj.phaseTimeouts === "object";

	if (!hasRequiredFields) {
		return false;
	}

	// Check that models field is present and is an array
	const hasModels = Array.isArray(obj.models);

	return hasModels;
}

/**
 * Type guard to check if an object is valid ChairModelConfig
 */
export function isChairModelConfig(obj: any): obj is ChairModelConfig {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.selectionStrategy === "string" &&
		["configured", "highest-ranked", "rotating"].includes(obj.selectionStrategy) &&
		typeof obj.synthesisWeight === "number"
	);
}

/**
 * Type guard to check if an object is valid CouncilResult
 */
export function isCouncilResult(obj: any): obj is CouncilResult {
	return (
		obj !== null &&
		typeof obj === "object" &&
		obj.quiz !== null &&
		typeof obj.quiz === "object" &&
		Array.isArray(obj.quiz.questions) &&
		obj.debateTrail !== null &&
		typeof obj.debateTrail === "object" &&
		typeof obj.success === "boolean"
	);
}

/**
 * Type guard to check if an object is valid CouncilDebateTrail
 */
export function isCouncilDebateTrail(obj: any): obj is CouncilDebateTrail {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.totalDuration === "number" &&
		Array.isArray(obj.initialResponses) &&
		Array.isArray(obj.critiques) &&
		obj.rankings !== null &&
		typeof obj.rankings === "object" &&
		obj.synthesis !== null &&
		typeof obj.synthesis === "object" &&
		Array.isArray(obj.participatingModels) &&
		Array.isArray(obj.failedModels) &&
		obj.tokenUsage !== null &&
		typeof obj.tokenUsage === "object" &&
		obj.costEstimate !== null &&
		typeof obj.costEstimate === "object"
	);
}

/**
 * Type guard to check if an object is valid ModelResponse
 */
export function isModelResponse(obj: any): obj is ModelResponse {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.modelId === "string" &&
		typeof obj.rawResponse === "string" &&
		typeof obj.success === "boolean" &&
		typeof obj.duration === "number"
	);
}

/**
 * Type guard to check if an object is valid AnonymizedResponse
 */
export function isAnonymizedResponse(obj: any): obj is AnonymizedResponse {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.anonymousId === "string" &&
		typeof obj.originalModelId === "string" &&
		obj.quiz !== null &&
		typeof obj.quiz === "object" &&
		Array.isArray(obj.quiz.questions)
	);
}

/**
 * Type guard to check if an object is valid CritiqueResult
 */
export function isCritiqueResult(obj: any): obj is CritiqueResult {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.criticModelId === "string" &&
		Array.isArray(obj.critiques) &&
		typeof obj.success === "boolean"
	);
}

/**
 * Type guard to check if an object is valid ResponseCritique
 */
export function isResponseCritique(obj: any): obj is ResponseCritique {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.responseId === "string" &&
		Array.isArray(obj.strengths) &&
		Array.isArray(obj.weaknesses) &&
		Array.isArray(obj.errors) &&
		typeof obj.overallAssessment === "string"
	);
}

/**
 * Type guard to check if an object is valid ModelRanking
 */
export function isModelRanking(obj: any): obj is ModelRanking {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.modelId === "string" &&
		Array.isArray(obj.ranking) &&
		typeof obj.reasoning === "string" &&
		typeof obj.success === "boolean"
	);
}

/**
 * Type guard to check if an object is valid RankingResult
 */
export function isRankingResult(obj: any): obj is RankingResult {
	return (
		obj !== null &&
		typeof obj === "object" &&
		Array.isArray(obj.consensusRanking) &&
		obj.scores !== null &&
		typeof obj.scores === "object" &&
		Array.isArray(obj.individualRankings)
	);
}

/**
 * Type guard to check if an object is valid CouncilProgress
 */
export function isCouncilProgress(obj: any): obj is CouncilProgress {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.phase === "string" &&
		typeof obj.phaseProgress === "number" &&
		typeof obj.overallProgress === "number" &&
		typeof obj.statusMessage === "string"
	);
}

/**
 * Type guard to check if an object is valid CouncilError
 */
export function isCouncilError(obj: any): obj is CouncilError {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.category === "string" &&
		typeof obj.phase === "string" &&
		typeof obj.message === "string" &&
		typeof obj.action === "string" &&
		typeof obj.timestamp === "number"
	);
}

/**
 * Type guard to check if an object is valid TokenUsageBreakdown
 */
export function isTokenUsageBreakdown(obj: any): obj is TokenUsageBreakdown {
	return (
		obj !== null &&
		typeof obj === "object" &&
		obj.parallelQuery !== null &&
		typeof obj.parallelQuery === "object" &&
		typeof obj.parallelQuery.total === "number" &&
		obj.critique !== null &&
		typeof obj.critique === "object" &&
		typeof obj.critique.total === "number" &&
		obj.ranking !== null &&
		typeof obj.ranking === "object" &&
		typeof obj.ranking.total === "number" &&
		obj.synthesis !== null &&
		typeof obj.synthesis === "object" &&
		typeof obj.synthesis.total === "number" &&
		typeof obj.grandTotal === "number"
	);
}
