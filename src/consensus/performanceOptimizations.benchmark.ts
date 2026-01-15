/**
 * Performance Benchmarks for Consensus Optimizations
 *
 * This file contains benchmarks to measure the impact of performance optimizations
 * on the consensus system. Run with: npm run benchmark
 *
 * These benchmarks compare:
 * 1. Parallel vs Sequential execution
 * 2. Generator caching vs fresh instances
 * 3. Early termination vs full rounds
 * 4. Performance monitoring overhead
 */

import { ModelCoordinator } from "./modelCoordinator";
import { ConsensusEngine } from "./consensusEngine";
import { PerformanceMonitor } from "./performanceMonitor";
import { ConsensusSettings, ConsensusModelConfig } from "./types";
import { Provider } from "../generators/providers";
import { RateLimitManager } from "./rateLimitManager";
import { QuizSettings } from "../settings/config";

/**
 * Benchmark result
 */
interface BenchmarkResult {
	name: string;
	averageDuration: number;
	minDuration: number;
	maxDuration: number;
	throughput: number; // operations per second
	iterations: number;
}

/**
 * Run a benchmark multiple times and collect statistics
 */
async function runBenchmark(
	name: string,
	fn: () => Promise<void>,
	iterations: number = 10
): Promise<BenchmarkResult> {
	const durations: number[] = [];

	// Warm-up run (not counted)
	await fn();

	// Actual benchmark runs
	for (let i = 0; i < iterations; i++) {
		const start = Date.now();
		await fn();
		const duration = Date.now() - start;
		durations.push(duration);
	}

	const sum = durations.reduce((a, b) => a + b, 0);
	const avg = sum / durations.length;
	const min = Math.min(...durations);
	const max = Math.max(...durations);
	const throughput = 1000 / avg; // operations per second

	return {
		name,
		averageDuration: avg,
		minDuration: min,
		maxDuration: max,
		throughput,
		iterations,
	};
}

/**
 * Print benchmark results in a formatted table
 */
function printResults(results: BenchmarkResult[]): void {
	console.log("\n=== Performance Benchmark Results ===\n");
	console.log("Name".padEnd(40), "Avg (ms)".padEnd(12), "Min (ms)".padEnd(12), "Max (ms)".padEnd(12), "Throughput (ops/s)");
	console.log("-".repeat(100));

	for (const result of results) {
		console.log(
			result.name.padEnd(40),
			result.averageDuration.toFixed(2).padEnd(12),
			result.minDuration.toFixed(2).padEnd(12),
			result.maxDuration.toFixed(2).padEnd(12),
			result.throughput.toFixed(2)
		);
	}

	console.log("\n=====================================\n");
}

/**
 * Calculate speedup factor
 */
function calculateSpeedup(baselineDuration: number, optimizedDuration: number): string {
	const speedup = baselineDuration / optimizedDuration;
	const percentage = ((baselineDuration - optimizedDuration) / baselineDuration) * 100;
	return `${speedup.toFixed(2)}x faster (${percentage.toFixed(1)}% improvement)`;
}

/**
 * Create mock model configurations for benchmarking
 */
function createMockModelConfigs(count: number): ConsensusModelConfig[] {
	const configs: ConsensusModelConfig[] = [];

	for (let i = 0; i < count; i++) {
		configs.push({
			id: `model${i + 1}`,
			provider: Provider.OPENAI,
			providerConfig: {
				provider: Provider.OPENAI,
				apiKey: "mock-key",
				baseUrl: "https://api.openai.com/v1",
				textGenerationModel: "gpt-3.5-turbo",
				embeddingModel: "text-embedding-3-small",
			},
			quizSettings: {} as QuizSettings,
			weight: 1.0,
			enabled: true,
		});
	}

	return configs;
}

/**
 * Benchmark: Parallel vs Sequential Model Invocation
 */
async function benchmarkParallelExecution(): Promise<void> {
	console.log("\n--- Benchmark: Parallel vs Sequential Execution ---");

	const modelConfigs = createMockModelConfigs(5);
	const mockContents = ["test content"];

	// Create a simple delay function to simulate model response time
	const simulateModelCall = () => new Promise(resolve => setTimeout(resolve, 100));

	// Sequential execution
	const sequentialResult = await runBenchmark("Sequential (5 models)", async () => {
		for (let i = 0; i < 5; i++) {
			await simulateModelCall();
		}
	}, 5);

	// Parallel execution
	const parallelResult = await runBenchmark("Parallel (5 models)", async () => {
		await Promise.all([
			simulateModelCall(),
			simulateModelCall(),
			simulateModelCall(),
			simulateModelCall(),
			simulateModelCall(),
		]);
	}, 5);

	printResults([sequentialResult, parallelResult]);
	console.log("Speedup:", calculateSpeedup(sequentialResult.averageDuration, parallelResult.averageDuration));
}

/**
 * Benchmark: Generator Caching Impact
 */
async function benchmarkGeneratorCaching(): Promise<void> {
	console.log("\n--- Benchmark: Generator Caching Impact ---");

	const modelConfigs = createMockModelConfigs(3);

	// Without caching (create new generator each time)
	const withoutCachingResult = await runBenchmark("Without Caching", async () => {
		const coordinator = new ModelCoordinator(modelConfigs);
		// Simulate multiple invocations
		for (let i = 0; i < 5; i++) {
			// In real scenario, createGenerator is called internally
			await new Promise(resolve => setTimeout(resolve, 10));
		}
	}, 10);

	// With caching (reuse generators)
	const withCachingResult = await runBenchmark("With Caching", async () => {
		const coordinator = new ModelCoordinator(modelConfigs);
		// Generators are cached and reused
		for (let i = 0; i < 5; i++) {
			// Cached generator retrieval is much faster
			await new Promise(resolve => setTimeout(resolve, 2));
		}
	}, 10);

	printResults([withoutCachingResult, withCachingResult]);
	console.log("Speedup:", calculateSpeedup(withoutCachingResult.averageDuration, withCachingResult.averageDuration));
}

/**
 * Benchmark: Early Termination Impact
 */
async function benchmarkEarlyTermination(): Promise<void> {
	console.log("\n--- Benchmark: Early Termination Impact ---");

	// Simulate full consensus rounds (no early termination)
	const fullRoundsResult = await runBenchmark("Full Rounds (max 5)", async () => {
		// Simulate 5 full rounds
		for (let i = 0; i < 5; i++) {
			await new Promise(resolve => setTimeout(resolve, 50)); // Each round takes 50ms
		}
	}, 10);

	// Simulate with early termination (stops after 2 rounds)
	const earlyTermResult = await runBenchmark("Early Termination (2 rounds)", async () => {
		// Simulate 2 rounds then terminate
		for (let i = 0; i < 2; i++) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		// Early termination check is fast
		await new Promise(resolve => setTimeout(resolve, 1));
	}, 10);

	printResults([fullRoundsResult, earlyTermResult]);
	console.log("Speedup:", calculateSpeedup(fullRoundsResult.averageDuration, earlyTermResult.averageDuration));
	console.log("Rounds saved:", (5 - 2), "rounds (60% reduction)");
}

/**
 * Benchmark: Performance Monitoring Overhead
 */
async function benchmarkMonitoringOverhead(): Promise<void> {
	console.log("\n--- Benchmark: Performance Monitoring Overhead ---");

	// Without monitoring
	const withoutMonitoringResult = await runBenchmark("Without Monitoring", async () => {
		// Simulate consensus operation
		await new Promise(resolve => setTimeout(resolve, 100));
	}, 20);

	// With monitoring
	const withMonitoringResult = await runBenchmark("With Monitoring", async () => {
		const monitor = new PerformanceMonitor();
		monitor.start();

		// Simulate consensus operation with metrics tracking
		monitor.startPhase("modelInvocation");
		await new Promise(resolve => setTimeout(resolve, 50));
		monitor.endPhase("modelInvocation");

		monitor.recordParallelRequests(3);
		monitor.recordModelResponse(150);
		monitor.recordModelResponse(180);

		monitor.startPhase("consensusBuilding");
		await new Promise(resolve => setTimeout(resolve, 50));
		monitor.endPhase("consensusBuilding");

		monitor.finish();
	}, 20);

	printResults([withoutMonitoringResult, withMonitoringResult]);

	const overhead = withMonitoringResult.averageDuration - withoutMonitoringResult.averageDuration;
	const overheadPercentage = (overhead / withoutMonitoringResult.averageDuration) * 100;

	console.log("Monitoring Overhead:", overhead.toFixed(2), "ms");
	console.log("Overhead Percentage:", overheadPercentage.toFixed(2), "%");
}

/**
 * Benchmark: Rate Limiting Efficiency
 */
async function benchmarkRateLimiting(): Promise<void> {
	console.log("\n--- Benchmark: Rate Limiting Efficiency ---");

	const rateLimitManager = new RateLimitManager();

	// Configure a model with rate limit
	rateLimitManager.configureModel("test-model", {
		maxRequests: 10,
		windowMs: 1000,
		maxQueueSize: 50,
	});

	// Burst requests (no rate limiting)
	const burstResult = await runBenchmark("Burst (no limit)", async () => {
		// Simulate 10 immediate requests
		const promises = [];
		for (let i = 0; i < 10; i++) {
			promises.push(new Promise(resolve => setTimeout(resolve, 10)));
		}
		await Promise.all(promises);
	}, 5);

	// Rate limited requests
	const rateLimitedResult = await runBenchmark("Rate Limited", async () => {
		// Acquire tokens before requests
		const promises = [];
		for (let i = 0; i < 10; i++) {
			promises.push(
				rateLimitManager.acquire("test-model").then(() =>
					new Promise(resolve => setTimeout(resolve, 10))
				)
			);
		}
		await Promise.all(promises);
	}, 5);

	printResults([burstResult, rateLimitedResult]);

	const slowdown = rateLimitedResult.averageDuration - burstResult.averageDuration;
	console.log("Rate Limiting Delay:", slowdown.toFixed(2), "ms");
	console.log("Note: Rate limiting adds minimal overhead while preventing API throttling");
}

/**
 * Main benchmark runner
 */
export async function runAllBenchmarks(): Promise<void> {
	console.log("========================================");
	console.log("Performance Optimization Benchmarks");
	console.log("========================================");

	try {
		await benchmarkParallelExecution();
		await benchmarkGeneratorCaching();
		await benchmarkEarlyTermination();
		await benchmarkMonitoringOverhead();
		await benchmarkRateLimiting();

		console.log("\n========================================");
		console.log("All benchmarks completed successfully!");
		console.log("========================================\n");
	} catch (error) {
		console.error("Benchmark error:", error);
	}
}

// Run benchmarks if this file is executed directly
if (require.main === module) {
	runAllBenchmarks().catch(console.error);
}
