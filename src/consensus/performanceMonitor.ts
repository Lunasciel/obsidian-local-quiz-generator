/**
 * Performance metrics for consensus operations
 */
export interface PerformanceMetrics {
	/** Total operation duration (milliseconds) */
	totalDuration: number;

	/** Duration of model invocations (milliseconds) */
	modelInvocationDuration: number;

	/** Duration of consensus building (milliseconds) */
	consensusBuildingDuration: number;

	/** Number of parallel requests made */
	parallelRequests: number;

	/** Number of sequential requests made */
	sequentialRequests: number;

	/** Average response time per model (milliseconds) */
	averageResponseTime: number;

	/** Number of cache hits */
	cacheHits: number;

	/** Number of cache misses */
	cacheMisses: number;

	/** Number of retry attempts */
	retryAttempts: number;

	/** Number of timeouts */
	timeouts: number;

	/** Number of rate limit hits */
	rateLimitHits: number;

	/** Total tokens used (estimated) */
	totalTokensUsed?: number;

	/** Number of early terminations */
	earlyTerminations: number;

	/** Questions resolved without additional rounds */
	questionsResolvedImmediately: number;

	/** Questions requiring consensus rounds */
	questionsRequiringRounds: number;
}

/**
 * Performance monitor for tracking consensus operation metrics
 */
export class PerformanceMonitor {
	private startTime: number = 0;
	private metrics: PerformanceMetrics;
	private phaseStartTimes: Map<string, number> = new Map();
	private modelResponseTimes: number[] = [];

	constructor() {
		this.metrics = this.createEmptyMetrics();
	}

	/**
	 * Create an empty metrics object
	 */
	private createEmptyMetrics(): PerformanceMetrics {
		return {
			totalDuration: 0,
			modelInvocationDuration: 0,
			consensusBuildingDuration: 0,
			parallelRequests: 0,
			sequentialRequests: 0,
			averageResponseTime: 0,
			cacheHits: 0,
			cacheMisses: 0,
			retryAttempts: 0,
			timeouts: 0,
			rateLimitHits: 0,
			earlyTerminations: 0,
			questionsResolvedImmediately: 0,
			questionsRequiringRounds: 0,
		};
	}

	/**
	 * Start monitoring overall operation
	 */
	public start(): void {
		this.startTime = Date.now();
		this.metrics = this.createEmptyMetrics();
		this.phaseStartTimes.clear();
		this.modelResponseTimes = [];
	}

	/**
	 * Start monitoring a specific phase
	 */
	public startPhase(phaseName: string): void {
		this.phaseStartTimes.set(phaseName, Date.now());
	}

	/**
	 * End monitoring a specific phase
	 */
	public endPhase(phaseName: string): number {
		const startTime = this.phaseStartTimes.get(phaseName);
		if (!startTime) {
			return 0;
		}

		const duration = Date.now() - startTime;
		this.phaseStartTimes.delete(phaseName);

		// Update specific phase metrics
		if (phaseName === "modelInvocation") {
			this.metrics.modelInvocationDuration += duration;
		} else if (phaseName === "consensusBuilding") {
			this.metrics.consensusBuildingDuration += duration;
		}

		return duration;
	}

	/**
	 * Record a parallel request batch
	 */
	public recordParallelRequests(count: number): void {
		this.metrics.parallelRequests += count;
	}

	/**
	 * Record a sequential request
	 */
	public recordSequentialRequest(): void {
		this.metrics.sequentialRequests++;
	}

	/**
	 * Record a model response time
	 */
	public recordModelResponse(duration: number): void {
		this.modelResponseTimes.push(duration);
	}

	/**
	 * Record a cache hit
	 */
	public recordCacheHit(): void {
		this.metrics.cacheHits++;
	}

	/**
	 * Record a cache miss
	 */
	public recordCacheMiss(): void {
		this.metrics.cacheMisses++;
	}

	/**
	 * Record a retry attempt
	 */
	public recordRetry(): void {
		this.metrics.retryAttempts++;
	}

	/**
	 * Record a timeout
	 */
	public recordTimeout(): void {
		this.metrics.timeouts++;
	}

	/**
	 * Record a rate limit hit
	 */
	public recordRateLimitHit(): void {
		this.metrics.rateLimitHits++;
	}

	/**
	 * Record an early termination
	 */
	public recordEarlyTermination(): void {
		this.metrics.earlyTerminations++;
	}

	/**
	 * Record a question resolved immediately (without additional rounds)
	 */
	public recordQuestionResolvedImmediately(): void {
		this.metrics.questionsResolvedImmediately++;
	}

	/**
	 * Record a question requiring consensus rounds
	 */
	public recordQuestionRequiringRounds(): void {
		this.metrics.questionsRequiringRounds++;
	}

	/**
	 * Record token usage
	 */
	public recordTokenUsage(tokens: number): void {
		this.metrics.totalTokensUsed = (this.metrics.totalTokensUsed || 0) + tokens;
	}

	/**
	 * Finish monitoring and return metrics
	 */
	public finish(): PerformanceMetrics {
		this.metrics.totalDuration = Date.now() - this.startTime;

		// Calculate average response time
		if (this.modelResponseTimes.length > 0) {
			const sum = this.modelResponseTimes.reduce((a, b) => a + b, 0);
			this.metrics.averageResponseTime = sum / this.modelResponseTimes.length;
		}

		return this.metrics;
	}

	/**
	 * Get current metrics snapshot (without finishing)
	 */
	public getSnapshot(): PerformanceMetrics {
		const snapshot = { ...this.metrics };
		snapshot.totalDuration = Date.now() - this.startTime;

		// Calculate average response time
		if (this.modelResponseTimes.length > 0) {
			const sum = this.modelResponseTimes.reduce((a, b) => a + b, 0);
			snapshot.averageResponseTime = sum / this.modelResponseTimes.length;
		}

		return snapshot;
	}

	/**
	 * Format metrics for logging
	 */
	public formatMetrics(metrics: PerformanceMetrics): string {
		const lines = [
			"=== Performance Metrics ===",
			`Total Duration: ${(metrics.totalDuration / 1000).toFixed(2)}s`,
			`Model Invocation: ${(metrics.modelInvocationDuration / 1000).toFixed(2)}s`,
			`Consensus Building: ${(metrics.consensusBuildingDuration / 1000).toFixed(2)}s`,
			``,
			`Parallel Requests: ${metrics.parallelRequests}`,
			`Sequential Requests: ${metrics.sequentialRequests}`,
			`Average Response Time: ${metrics.averageResponseTime.toFixed(0)}ms`,
			``,
			`Cache Hits: ${metrics.cacheHits}`,
			`Cache Misses: ${metrics.cacheMisses}`,
			`Cache Hit Rate: ${metrics.cacheHits + metrics.cacheMisses > 0 ? ((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100).toFixed(1) : 0}%`,
			``,
			`Retry Attempts: ${metrics.retryAttempts}`,
			`Timeouts: ${metrics.timeouts}`,
			`Rate Limit Hits: ${metrics.rateLimitHits}`,
			``,
			`Questions Resolved Immediately: ${metrics.questionsResolvedImmediately}`,
			`Questions Requiring Rounds: ${metrics.questionsRequiringRounds}`,
			`Early Terminations: ${metrics.earlyTerminations}`,
		];

		if (metrics.totalTokensUsed !== undefined) {
			lines.push(`Total Tokens Used: ${metrics.totalTokensUsed.toLocaleString()}`);
		}

		lines.push("========================");

		return lines.join("\n");
	}

	/**
	 * Log metrics to console
	 */
	public logMetrics(metrics: PerformanceMetrics): void {
		console.log(this.formatMetrics(metrics));
	}

	/**
	 * Get performance summary as a single-line string
	 */
	public getSummary(metrics: PerformanceMetrics): string {
		const totalSeconds = (metrics.totalDuration / 1000).toFixed(1);
		const parallelEfficiency = metrics.parallelRequests > 0
			? ((metrics.parallelRequests / (metrics.parallelRequests + metrics.sequentialRequests)) * 100).toFixed(0)
			: "0";

		return `${totalSeconds}s total | ${metrics.parallelRequests} parallel (${parallelEfficiency}%) | ` +
			`${metrics.questionsResolvedImmediately}/${metrics.questionsResolvedImmediately + metrics.questionsRequiringRounds} immediate | ` +
			`${metrics.earlyTerminations} early terminations`;
	}
}
