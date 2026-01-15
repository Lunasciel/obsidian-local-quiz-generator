import { Quiz, Question } from "../utils/types";
import { Provider } from "../generators/providers";
import { QuizSettings } from "../settings/config";
import { ConsensusModelReference, ProviderConfig } from "../settings/modelRegistry/types";

/**
 * Configuration for consensus-based quiz generation
 *
 * This interface uses the new reference-based model configuration where
 * model references point to entries in the central ModelRegistry.
 * Legacy consensusModels have been removed after migration to the
 * simplified settings architecture.
 *
 * Requirements: 2.1, 2.3
 */
export interface ConsensusSettings {
	/** Enable/disable consensus mode */
	enabled: boolean;

	/**
	 * Model references for consensus (registry-based)
	 * Each reference points to a model in the central ModelRegistry.
	 * Models are stored centrally and referenced by ID for consistency
	 * across main, consensus, and council settings.
	 *
	 * Requirements: 2.1, 2.3
	 */
	models: ConsensusModelReference[];

	/** Minimum number of models required (default: 2) */
	minModelsRequired: number;

	/** Consensus threshold percentage (default: 0.66 = 66%) */
	consensusThreshold: number;

	/** Maximum consensus iterations (default: 3) */
	maxIterations: number;

	/** Enable source validation */
	enableSourceValidation: boolean;

	/** Cache consensus results */
	enableCaching: boolean;

	/** Show detailed audit trail to users */
	showAuditTrail: boolean;

	/** Fallback to single model if consensus fails */
	fallbackToSingleModel: boolean;

	/** Privacy preferences for multi-provider consensus */
	privacyPreferences?: ConsensusPrivacyPreferences;
}

/**
 * Privacy preferences for consensus mode
 * Requirement 5.1: User privacy settings for multi-provider data sharing
 */
export interface ConsensusPrivacyPreferences {
	/** Whether user has acknowledged the data privacy warning */
	privacyWarningAcknowledged: boolean;

	/** Date/time when privacy warning was last acknowledged */
	privacyWarningAcknowledgedAt?: number;

	/** Restrict consensus to local-only models (e.g., Ollama) */
	localOnlyMode: boolean;

	/** Providers that user has explicitly approved for data sharing */
	approvedProviders: Provider[];
}

/**
 * Configuration for an individual model in the consensus system
 *
 * Uses ProviderConfig directly instead of legacy QuizSettings.
 * This simplifies settings mapping by reading provider configuration
 * directly from the model registry.
 *
 * Requirements: 6.2 (simplified settings mapping)
 */
export interface ConsensusModelConfig {
	/** Unique identifier for this model in consensus */
	id: string;

	/** Provider type (OpenAI, Ollama, etc.) */
	provider: Provider;

	/** Provider-specific configuration (API keys, base URLs, models) */
	providerConfig: ProviderConfig;

	/** Base quiz settings for generation configuration (question types, language) */
	quizSettings: QuizSettings;

	/** Weight for this model in consensus (default: 1.0) */
	weight: number;

	/** Enable/disable this model */
	enabled: boolean;
}

/**
 * Final result of the consensus generation process
 */
export interface ConsensusResult {
	/** The final quiz after consensus */
	quiz: Quiz;

	/** Audit trail for transparency */
	auditTrail: ConsensusAuditTrail;

	/** Whether consensus was successful */
	success: boolean;

	/** Reason for failure if not successful */
	failureReason?: string;
}

/**
 * Complete audit trail of the consensus process
 */
export interface ConsensusAuditTrail {
	/** Total time taken for consensus (milliseconds) */
	totalDuration: number;

	/** Per-question consensus details */
	questionTrails: QuestionConsensusTrail[];

	/** Source validation results */
	sourceValidation?: SourceValidationResult;

	/** Models that participated */
	participatingModels: string[];

	/** Models that failed */
	failedModels: string[];
}

/**
 * Consensus trail for a single question
 */
export interface QuestionConsensusTrail {
	/** The final question */
	question: Question;

	/** Number of consensus rounds required */
	roundsRequired: number;

	/** All consensus rounds */
	rounds: ConsensusRound[];

	/** Final consensus status */
	consensusReached: boolean;

	/** Agreement percentage (0-1) */
	agreementPercentage: number;

	/** Models that agreed with final answer */
	agreeingModels: string[];

	/** Models that disagreed */
	disagreeingModels: string[];
}

/**
 * A single consensus round
 */
export interface ConsensusRound {
	/** Round number (1-indexed) */
	roundNumber: number;

	/** Responses from each model */
	modelResponses: ModelConsensusResponse[];

	/** Whether consensus was reached in this round */
	consensusReached: boolean;

	/** Duration of this round (milliseconds) */
	duration: number;
}

/**
 * A model's response during consensus
 */
export interface ModelConsensusResponse {
	/** Model identifier (anonymized during consensus) */
	modelId: string;

	/** The answer provided */
	answer: any; // Type depends on question type

	/** Model's reasoning/justification */
	reasoning: string;

	/** Confidence level (0-1) */
	confidence: number;

	/** Whether this answer changed from previous round */
	changed: boolean;

	/** Previous answer if changed */
	previousAnswer?: any;
}

/**
 * Result of source validation through multiple models
 */
export interface SourceValidationResult {
	/** Source content that was validated */
	sourceContent: string;

	/** Fact extractions from each model */
	extractions: FactExtraction[];

	/** Consensus on facts */
	factConsensus: ExtractionConsensus;

	/** Any discrepancies found */
	discrepancies: SourceDiscrepancy[];

	/** Overall validation confidence (0-1) */
	validationConfidence: number;
}

/**
 * Facts extracted by a single model from source material
 */
export interface FactExtraction {
	/** Model that performed extraction */
	modelId: string;

	/** Facts extracted from source */
	facts: string[];

	/** Citations (character ranges in source) */
	citations: Citation[];

	/** Extraction confidence (0-1) */
	confidence: number;
}

/**
 * A citation linking a fact to source material
 */
export interface Citation {
	/** Start character position in source */
	start: number;

	/** End character position in source */
	end: number;

	/** The cited text */
	text: string;

	/** Fact this citation supports */
	supportsFact: string;
}

/**
 * Consensus on extracted facts across models
 */
export interface ExtractionConsensus {
	/** Facts agreed upon by all models */
	agreedFacts: string[];

	/** Facts with partial agreement */
	partialAgreementFacts: ConsensusFact[];

	/** Facts with no agreement */
	disagreedFacts: string[];
}

/**
 * A fact with consensus information
 */
export interface ConsensusFact {
	/** The fact statement */
	fact: string;

	/** Models that agreed with this fact */
	agreeingModels: string[];

	/** Models that disagreed or didn't mention */
	disagreeingModels: string[];

	/** Agreement percentage (0-1) */
	agreementPercentage: number;
}

/**
 * A discrepancy found during source validation
 */
export interface SourceDiscrepancy {
	/** Description of the discrepancy */
	description: string;

	/** Source section where discrepancy occurred */
	sourceSection: string;

	/** Models involved in the discrepancy */
	modelsInvolved: string[];

	/** Conflicting interpretations */
	conflictingInterpretations: string[];
}

/**
 * Anonymized answer for consensus rounds
 */
export interface AnonymizedAnswer {
	/** Unique ID for this answer (not tied to model) */
	answerId: string;

	/** The answer */
	answer: any;

	/** Reasoning provided */
	reasoning: string;

	/** Optional confidence level from the model that provided this answer */
	confidence?: number;
}

/**
 * Re-evaluation request sent to a model during consensus rounds
 */
export interface ReEvaluationRequest {
	/** The original question being evaluated */
	question: Question;

	/** The model's original answer from the previous round */
	originalAnswer: any;

	/** Alternative answers from other models (anonymized) */
	alternativeAnswers: AnonymizedAnswer[];

	/** Round number for this re-evaluation */
	roundNumber: number;
}

/**
 * Response from a model after re-evaluation
 */
export interface ReEvaluationResponse {
	/** Model identifier */
	modelId: string;

	/** The (potentially updated) answer after re-evaluation */
	answer: any;

	/** Justification for the answer (new or updated reasoning) */
	reasoning: string;

	/** Confidence level in the answer (0-1) */
	confidence: number;

	/** Whether the model changed its answer from the original */
	changed: boolean;

	/** The original answer before re-evaluation (if changed) */
	previousAnswer?: any;

	/** Raw response from the model */
	rawResponse: string;

	/** Whether parsing was successful */
	success: boolean;

	/** Error message if parsing failed */
	error?: string;
}

/**
 * Phases of the consensus process
 */
export enum ConsensusPhase {
	SOURCE_VALIDATION = "source_validation",
	INITIAL_GENERATION = "initial_generation",
	CONSENSUS_BUILDING = "consensus_building",
	FINALIZATION = "finalization",
}

/**
 * Progress information for UI updates
 */
export interface ConsensusProgress {
	/** Current phase */
	phase: ConsensusPhase;

	/** Progress in current phase (0-1) */
	phaseProgress: number;

	/** Overall progress (0-1) */
	overallProgress: number;

	/** Current status message */
	statusMessage: string;

	/** For consensus building: current round number */
	currentRound?: number;

	/** For consensus building: total rounds */
	totalRounds?: number;

	/** For consensus building: questions resolved */
	questionsResolved?: number;

	/** For consensus building: total questions */
	totalQuestions?: number;
}

/**
 * Callback function for progress updates
 */
export type ProgressCallback = (progress: ConsensusProgress) => void;

/**
 * Callback for reporting model-level errors and warnings
 *
 * Allows UI to display real-time feedback about model failures
 * Requirements: 8.2, 8.5
 */
export type ModelErrorCallback = (
	modelId: string,
	error: string,
	severity: "error" | "warning" | "info",
	retry?: boolean
) => void;

/**
 * Partial result emitted during progressive streaming
 *
 * Contains a single question that has reached consensus and is ready
 * to be displayed to the user before the entire quiz is complete.
 */
export interface PartialConsensusResult {
	/** The validated question */
	question: Question;

	/** Consensus trail for this question */
	trail: QuestionConsensusTrail;

	/** Index of this question in the final quiz */
	questionIndex: number;

	/** Total number of questions being processed */
	totalQuestions: number;
}

/**
 * Callback function for progressive result streaming
 *
 * Called when individual questions reach consensus before the entire
 * quiz is complete, allowing UI to display results progressively.
 *
 * Requirements:
 * - 7.2: Allow questions that reached consensus early to be displayed immediately
 * - 7.3: Update progress UI to show partial results
 */
export type PartialResultCallback = (result: PartialConsensusResult) => void;

/**
 * Reasons for consensus failure
 */
export enum ConsensusFailureReason {
	INSUFFICIENT_MODELS = "insufficient_models",
	MAX_ITERATIONS_EXCEEDED = "max_iterations_exceeded",
	CIRCULAR_REASONING = "circular_reasoning",
	ALL_MODELS_FAILED = "all_models_failed",
	VALIDATION_FAILURE = "validation_failure",
}

/**
 * Actions to take on model errors
 */
export enum ModelErrorAction {
	RETRY = "retry",
	SKIP_MODEL = "skip_model",
	ABORT = "abort",
}

/**
 * Actions to take on consensus failures
 */
export enum ConsensusFailureAction {
	FALLBACK_SINGLE_MODEL = "fallback_single_model",
	NOTIFY_USER_PARTIAL_CONSENSUS = "notify_user_partial_consensus",
	ABORT_GENERATION = "abort_generation",
}

/**
 * Type guard to check if an object is valid ConsensusSettings
 *
 * Validates the models field which must be present as an array.
 * The legacy consensusModels field has been removed from the interface.
 *
 * Requirements: 2.1, 2.3
 */
export function isConsensusSettings(obj: any): obj is ConsensusSettings {
	if (obj === null || typeof obj !== "object") {
		return false;
	}

	// Check required base fields
	const hasRequiredFields =
		typeof obj.enabled === "boolean" &&
		typeof obj.minModelsRequired === "number" &&
		typeof obj.consensusThreshold === "number" &&
		typeof obj.maxIterations === "number" &&
		typeof obj.enableSourceValidation === "boolean" &&
		typeof obj.enableCaching === "boolean" &&
		typeof obj.showAuditTrail === "boolean" &&
		typeof obj.fallbackToSingleModel === "boolean";

	if (!hasRequiredFields) {
		return false;
	}

	// Check that models field is present and is an array
	const hasModels = Array.isArray(obj.models);

	return hasModels;
}

/**
 * Type guard to check if an object is valid ConsensusPrivacyPreferences
 */
export function isConsensusPrivacyPreferences(obj: any): obj is ConsensusPrivacyPreferences {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.privacyWarningAcknowledged === "boolean" &&
		typeof obj.localOnlyMode === "boolean" &&
		Array.isArray(obj.approvedProviders)
	);
}

/**
 * Type guard to check if an object is valid ConsensusModelConfig
 *
 * Validates the new ProviderConfig-based structure.
 * Requirements: 6.2 (simplified settings mapping)
 */
export function isConsensusModelConfig(obj: any): obj is ConsensusModelConfig {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.id === "string" &&
		typeof obj.provider === "string" &&
		obj.providerConfig !== null &&
		typeof obj.providerConfig === "object" &&
		obj.quizSettings !== null &&
		typeof obj.quizSettings === "object" &&
		typeof obj.weight === "number" &&
		typeof obj.enabled === "boolean"
	);
}

/**
 * Type guard to check if an object is valid ConsensusResult
 */
export function isConsensusResult(obj: any): obj is ConsensusResult {
	return (
		obj !== null &&
		typeof obj === "object" &&
		obj.quiz !== null &&
		typeof obj.quiz === "object" &&
		Array.isArray(obj.quiz.questions) &&
		obj.auditTrail !== null &&
		typeof obj.auditTrail === "object" &&
		typeof obj.success === "boolean"
	);
}

/**
 * Type guard to check if an object is valid ConsensusAuditTrail
 */
export function isConsensusAuditTrail(obj: any): obj is ConsensusAuditTrail {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.totalDuration === "number" &&
		Array.isArray(obj.questionTrails) &&
		Array.isArray(obj.participatingModels) &&
		Array.isArray(obj.failedModels)
	);
}

/**
 * Type guard to check if an object is valid QuestionConsensusTrail
 */
export function isQuestionConsensusTrail(obj: any): obj is QuestionConsensusTrail {
	return (
		obj !== null &&
		typeof obj === "object" &&
		obj.question !== null &&
		typeof obj.question === "object" &&
		typeof obj.roundsRequired === "number" &&
		Array.isArray(obj.rounds) &&
		typeof obj.consensusReached === "boolean" &&
		typeof obj.agreementPercentage === "number" &&
		Array.isArray(obj.agreeingModels) &&
		Array.isArray(obj.disagreeingModels)
	);
}

/**
 * Type guard to check if an object is valid ConsensusRound
 */
export function isConsensusRound(obj: any): obj is ConsensusRound {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.roundNumber === "number" &&
		Array.isArray(obj.modelResponses) &&
		typeof obj.consensusReached === "boolean" &&
		typeof obj.duration === "number"
	);
}

/**
 * Type guard to check if an object is valid ModelConsensusResponse
 */
export function isModelConsensusResponse(obj: any): obj is ModelConsensusResponse {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.modelId === "string" &&
		obj.answer !== undefined &&
		typeof obj.reasoning === "string" &&
		typeof obj.confidence === "number" &&
		typeof obj.changed === "boolean"
	);
}

/**
 * Type guard to check if an object is valid SourceValidationResult
 */
export function isSourceValidationResult(obj: any): obj is SourceValidationResult {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.sourceContent === "string" &&
		Array.isArray(obj.extractions) &&
		obj.factConsensus !== null &&
		typeof obj.factConsensus === "object" &&
		Array.isArray(obj.discrepancies) &&
		typeof obj.validationConfidence === "number"
	);
}

/**
 * Type guard to check if an object is valid FactExtraction
 */
export function isFactExtraction(obj: any): obj is FactExtraction {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.modelId === "string" &&
		Array.isArray(obj.facts) &&
		Array.isArray(obj.citations) &&
		typeof obj.confidence === "number"
	);
}

/**
 * Type guard to check if an object is valid Citation
 */
export function isCitation(obj: any): obj is Citation {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.start === "number" &&
		typeof obj.end === "number" &&
		typeof obj.text === "string" &&
		typeof obj.supportsFact === "string"
	);
}

/**
 * Type guard to check if an object is valid ExtractionConsensus
 */
export function isExtractionConsensus(obj: any): obj is ExtractionConsensus {
	return (
		obj !== null &&
		typeof obj === "object" &&
		Array.isArray(obj.agreedFacts) &&
		Array.isArray(obj.partialAgreementFacts) &&
		Array.isArray(obj.disagreedFacts)
	);
}

/**
 * Type guard to check if an object is valid ConsensusFact
 */
export function isConsensusFact(obj: any): obj is ConsensusFact {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.fact === "string" &&
		Array.isArray(obj.agreeingModels) &&
		Array.isArray(obj.disagreeingModels) &&
		typeof obj.agreementPercentage === "number"
	);
}

/**
 * Type guard to check if an object is valid SourceDiscrepancy
 */
export function isSourceDiscrepancy(obj: any): obj is SourceDiscrepancy {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.description === "string" &&
		typeof obj.sourceSection === "string" &&
		Array.isArray(obj.modelsInvolved) &&
		Array.isArray(obj.conflictingInterpretations)
	);
}

/**
 * Type guard to check if an object is valid AnonymizedAnswer
 */
export function isAnonymizedAnswer(obj: any): obj is AnonymizedAnswer {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.answerId === "string" &&
		obj.answer !== undefined &&
		typeof obj.reasoning === "string"
	);
}

/**
 * Type guard to check if an object is valid ConsensusProgress
 */
export function isConsensusProgress(obj: any): obj is ConsensusProgress {
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
 * Type guard to check if an object is valid ReEvaluationRequest
 */
export function isReEvaluationRequest(obj: any): obj is ReEvaluationRequest {
	return (
		obj !== null &&
		typeof obj === "object" &&
		obj.question !== null &&
		typeof obj.question === "object" &&
		obj.originalAnswer !== undefined &&
		Array.isArray(obj.alternativeAnswers) &&
		typeof obj.roundNumber === "number"
	);
}

/**
 * Type guard to check if an object is valid ReEvaluationResponse
 */
export function isReEvaluationResponse(obj: any): obj is ReEvaluationResponse {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.modelId === "string" &&
		obj.answer !== undefined &&
		typeof obj.reasoning === "string" &&
		typeof obj.confidence === "number" &&
		typeof obj.changed === "boolean" &&
		typeof obj.rawResponse === "string" &&
		typeof obj.success === "boolean"
	);
}
