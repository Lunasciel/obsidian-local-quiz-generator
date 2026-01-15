/**
 * Rate limit manager for API throttling in the consensus system.
 *
 * Uses the token bucket algorithm to enforce rate limits per model.
 * Supports queueing of requests when rate limits are exceeded.
 */

/**
 * Configuration for rate limiting a specific model
 */
export interface RateLimitConfig {
	/** Maximum number of requests allowed per time window */
	maxRequests: number;

	/** Time window in milliseconds */
	windowMs: number;

	/** Maximum size of the request queue */
	maxQueueSize?: number;
}

/**
 * Internal state tracking for a rate limit bucket
 */
interface TokenBucket {
	/** Current number of available tokens */
	tokens: number;

	/** Maximum number of tokens (capacity) */
	capacity: number;

	/** Token refill rate (tokens per millisecond) */
	refillRate: number;

	/** Timestamp of last token refill */
	lastRefillTime: number;

	/** Queue of pending requests */
	queue: QueuedRequest[];
}

/**
 * A queued request waiting for rate limit capacity
 */
interface QueuedRequest {
	/** Unique identifier for this request */
	id: string;

	/** Promise resolve function */
	resolve: () => void;

	/** Promise reject function */
	reject: (error: Error) => void;

	/** Timestamp when request was queued */
	queuedAt: number;
}

/**
 * Manages rate limiting for multiple models using token bucket algorithm
 */
export class RateLimitManager {
	/** Rate limit buckets per model ID */
	private readonly buckets: Map<string, TokenBucket>;

	/** Default rate limit configuration */
	private readonly defaultConfig: RateLimitConfig;

	/** Model-specific rate limit configurations */
	private readonly modelConfigs: Map<string, RateLimitConfig>;

	/** Timer for periodic queue processing */
	private processingTimer: ReturnType<typeof setInterval> | null;

	/** Whether the manager is actively processing queues */
	private isProcessing: boolean;

	/**
	 * Create a new rate limit manager
	 *
	 * @param defaultConfig - Default rate limit configuration for models
	 */
	constructor(defaultConfig: RateLimitConfig = {
		maxRequests: 60,
		windowMs: 60000, // 1 minute
		maxQueueSize: 100
	}) {
		this.buckets = new Map();
		this.defaultConfig = defaultConfig;
		this.modelConfigs = new Map();
		this.processingTimer = null;
		this.isProcessing = false;
	}

	/**
	 * Configure rate limit for a specific model
	 *
	 * @param modelId - Unique identifier for the model
	 * @param config - Rate limit configuration for this model
	 */
	public configureModel(modelId: string, config: RateLimitConfig): void {
		this.modelConfigs.set(modelId, config);

		// Initialize or update bucket for this model
		this.getOrCreateBucket(modelId);
	}

	/**
	 * Acquire permission to make a request for a specific model
	 *
	 * If rate limit allows, resolves immediately.
	 * If rate limit exceeded, queues the request and resolves when capacity is available.
	 *
	 * @param modelId - Unique identifier for the model
	 * @returns Promise that resolves when request can proceed
	 * @throws Error if queue is full
	 */
	public async acquire(modelId: string): Promise<void> {
		const bucket = this.getOrCreateBucket(modelId);
		const config = this.getConfig(modelId);

		// Refill tokens based on elapsed time
		this.refillTokens(bucket);

		// Check if we have tokens available
		if (bucket.tokens >= 1) {
			bucket.tokens -= 1;
			return Promise.resolve();
		}

		// No tokens available - queue the request
		return this.queueRequest(modelId, bucket, config);
	}

	/**
	 * Release a token back to the bucket (if request failed or was cancelled)
	 *
	 * @param modelId - Unique identifier for the model
	 */
	public release(modelId: string): void {
		const bucket = this.buckets.get(modelId);
		if (!bucket) {
			return;
		}

		// Return token to bucket (up to capacity)
		bucket.tokens = Math.min(bucket.tokens + 1, bucket.capacity);
	}

	/**
	 * Get current rate limit status for a model
	 *
	 * @param modelId - Unique identifier for the model
	 * @returns Rate limit status information
	 */
	public getStatus(modelId: string): {
		availableTokens: number;
		queueLength: number;
		isThrottled: boolean;
	} {
		const bucket = this.buckets.get(modelId);
		if (!bucket) {
			const config = this.getConfig(modelId);
			return {
				availableTokens: config.maxRequests,
				queueLength: 0,
				isThrottled: false
			};
		}

		this.refillTokens(bucket);

		return {
			availableTokens: Math.floor(bucket.tokens),
			queueLength: bucket.queue.length,
			isThrottled: bucket.tokens < 1 || bucket.queue.length > 0
		};
	}

	/**
	 * Clear all rate limits and queued requests
	 */
	public reset(): void {
		// Cancel all queued requests
		for (const bucket of this.buckets.values()) {
			for (const request of bucket.queue) {
				request.reject(new Error("Rate limit manager reset"));
			}
			bucket.queue = [];
		}

		// Clear all buckets
		this.buckets.clear();

		// Stop processing timer
		this.stopProcessing();
	}

	/**
	 * Get or create a token bucket for a model
	 *
	 * @param modelId - Unique identifier for the model
	 * @returns Token bucket for the model
	 */
	private getOrCreateBucket(modelId: string): TokenBucket {
		let bucket = this.buckets.get(modelId);

		if (!bucket) {
			const config = this.getConfig(modelId);
			bucket = {
				tokens: config.maxRequests,
				capacity: config.maxRequests,
				refillRate: config.maxRequests / config.windowMs,
				lastRefillTime: Date.now(),
				queue: []
			};
			this.buckets.set(modelId, bucket);
		}

		return bucket;
	}

	/**
	 * Get rate limit configuration for a model
	 *
	 * @param modelId - Unique identifier for the model
	 * @returns Rate limit configuration
	 */
	private getConfig(modelId: string): RateLimitConfig {
		return this.modelConfigs.get(modelId) || this.defaultConfig;
	}

	/**
	 * Refill tokens in a bucket based on elapsed time
	 *
	 * @param bucket - Token bucket to refill
	 */
	private refillTokens(bucket: TokenBucket): void {
		const now = Date.now();
		const elapsedMs = now - bucket.lastRefillTime;

		// Calculate tokens to add based on elapsed time
		const tokensToAdd = elapsedMs * bucket.refillRate;

		// Add tokens (up to capacity)
		bucket.tokens = Math.min(bucket.tokens + tokensToAdd, bucket.capacity);
		bucket.lastRefillTime = now;
	}

	/**
	 * Queue a request when rate limit is exceeded
	 *
	 * @param modelId - Unique identifier for the model
	 * @param bucket - Token bucket for the model
	 * @param config - Rate limit configuration
	 * @returns Promise that resolves when request can proceed
	 * @throws Error if queue is full
	 */
	private async queueRequest(
		modelId: string,
		bucket: TokenBucket,
		config: RateLimitConfig
	): Promise<void> {
		const maxQueueSize = config.maxQueueSize ?? 100;

		// Check if queue is full
		if (bucket.queue.length >= maxQueueSize) {
			throw new Error(
				`Rate limit queue full for model ${modelId}. ` +
				`Maximum queue size: ${maxQueueSize}`
			);
		}

		// Create queued request
		return new Promise<void>((resolve, reject) => {
			const request: QueuedRequest = {
				id: `${modelId}-${Date.now()}-${Math.random()}`,
				resolve,
				reject,
				queuedAt: Date.now()
			};

			bucket.queue.push(request);

			// Start processing if not already running
			this.startProcessing();
		});
	}

	/**
	 * Start periodic processing of queued requests
	 */
	private startProcessing(): void {
		if (this.isProcessing) {
			return;
		}

		this.isProcessing = true;

		// Process queues every 100ms
		this.processingTimer = setInterval(() => {
			this.processQueues();
		}, 100);
	}

	/**
	 * Stop periodic processing of queued requests
	 */
	private stopProcessing(): void {
		if (this.processingTimer) {
			clearInterval(this.processingTimer);
			this.processingTimer = null;
		}
		this.isProcessing = false;
	}

	/**
	 * Process all queued requests across all models
	 */
	private processQueues(): void {
		let hasQueuedRequests = false;

		for (const [modelId, bucket] of this.buckets.entries()) {
			// Refill tokens
			this.refillTokens(bucket);

			// Process queued requests while we have tokens
			while (bucket.queue.length > 0 && bucket.tokens >= 1) {
				const request = bucket.queue.shift();
				if (!request) {
					break;
				}

				// Consume token
				bucket.tokens -= 1;

				// Resolve the waiting request
				request.resolve();
			}

			// Track if any buckets still have queued requests
			if (bucket.queue.length > 0) {
				hasQueuedRequests = true;
			}
		}

		// Stop processing if no more queued requests
		if (!hasQueuedRequests) {
			this.stopProcessing();
		}
	}

	/**
	 * Get the estimated wait time for a queued request
	 *
	 * @param modelId - Unique identifier for the model
	 * @returns Estimated wait time in milliseconds, or 0 if no wait
	 */
	public getEstimatedWaitTime(modelId: string): number {
		const bucket = this.buckets.get(modelId);
		if (!bucket || bucket.queue.length === 0) {
			return 0;
		}

		this.refillTokens(bucket);

		// If we already have tokens, no wait
		if (bucket.tokens >= 1) {
			return 0;
		}

		// Calculate time needed to refill 1 token
		const tokensNeeded = 1 - bucket.tokens;
		const msNeeded = tokensNeeded / bucket.refillRate;

		// Add time for queued requests ahead
		const queuePosition = bucket.queue.length;
		const msPerRequest = 1 / bucket.refillRate;
		const queueDelay = queuePosition * msPerRequest;

		return Math.ceil(msNeeded + queueDelay);
	}
}
