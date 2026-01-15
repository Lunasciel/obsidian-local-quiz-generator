import { PerformanceMetrics, PerformanceMonitor } from "./performanceMonitor";

/**
 * Log level for performance logging
 */
export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	NONE = 4,
}

/**
 * Performance log entry
 */
export interface PerformanceLogEntry {
	/** Timestamp of the log entry */
	timestamp: number;

	/** Log level */
	level: LogLevel;

	/** Operation name */
	operation: string;

	/** Duration in milliseconds (if applicable) */
	duration?: number;

	/** Message */
	message: string;

	/** Additional metadata */
	metadata?: Record<string, any>;
}

/**
 * Performance logger for consensus operations
 *
 * This logger provides structured performance logging with configurable
 * verbosity levels and the ability to export logs for analysis.
 */
export class PerformanceLogger {
	private logs: PerformanceLogEntry[] = [];
	private logLevel: LogLevel = LogLevel.INFO;
	private maxLogEntries: number = 1000;

	/**
	 * Create a new performance logger
	 *
	 * @param logLevel - Minimum log level to record
	 * @param maxLogEntries - Maximum number of log entries to keep
	 */
	constructor(logLevel: LogLevel = LogLevel.INFO, maxLogEntries: number = 1000) {
		this.logLevel = logLevel;
		this.maxLogEntries = maxLogEntries;
	}

	/**
	 * Set the log level
	 */
	public setLogLevel(level: LogLevel): void {
		this.logLevel = level;
	}

	/**
	 * Log a debug message
	 */
	public debug(operation: string, message: string, metadata?: Record<string, any>): void {
		this.log(LogLevel.DEBUG, operation, message, metadata);
	}

	/**
	 * Log an info message
	 */
	public info(operation: string, message: string, metadata?: Record<string, any>): void {
		this.log(LogLevel.INFO, operation, message, metadata);
	}

	/**
	 * Log a warning message
	 */
	public warn(operation: string, message: string, metadata?: Record<string, any>): void {
		this.log(LogLevel.WARN, operation, message, metadata);
	}

	/**
	 * Log an error message
	 */
	public error(operation: string, message: string, metadata?: Record<string, any>): void {
		this.log(LogLevel.ERROR, operation, message, metadata);
	}

	/**
	 * Log an operation with timing
	 */
	public logTiming(
		operation: string,
		duration: number,
		level: LogLevel = LogLevel.INFO,
		metadata?: Record<string, any>
	): void {
		if (level < this.logLevel) {
			return;
		}

		this.addLogEntry({
			timestamp: Date.now(),
			level,
			operation,
			duration,
			message: `Operation completed in ${duration}ms`,
			metadata,
		});
	}

	/**
	 * Log a message
	 */
	private log(
		level: LogLevel,
		operation: string,
		message: string,
		metadata?: Record<string, any>
	): void {
		if (level < this.logLevel) {
			return;
		}

		this.addLogEntry({
			timestamp: Date.now(),
			level,
			operation,
			message,
			metadata,
		});
	}

	/**
	 * Add a log entry
	 */
	private addLogEntry(entry: PerformanceLogEntry): void {
		this.logs.push(entry);

		// Trim logs if we exceed max entries
		if (this.logs.length > this.maxLogEntries) {
			this.logs.shift();
		}

		// Also log to console if appropriate
		this.logToConsole(entry);
	}

	/**
	 * Log to console
	 */
	private logToConsole(entry: PerformanceLogEntry): void {
		const prefix = `[${this.formatTimestamp(entry.timestamp)}] [${LogLevel[entry.level]}] [${entry.operation}]`;
		const message = entry.duration
			? `${entry.message} (${entry.duration}ms)`
			: entry.message;
		const fullMessage = `${prefix} ${message}`;

		switch (entry.level) {
			case LogLevel.DEBUG:
				console.debug(fullMessage, entry.metadata);
				break;
			case LogLevel.INFO:
				console.info(fullMessage, entry.metadata);
				break;
			case LogLevel.WARN:
				console.warn(fullMessage, entry.metadata);
				break;
			case LogLevel.ERROR:
				console.error(fullMessage, entry.metadata);
				break;
		}
	}

	/**
	 * Format timestamp for display
	 */
	private formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		const seconds = date.getSeconds().toString().padStart(2, "0");
		const ms = date.getMilliseconds().toString().padStart(3, "0");
		return `${hours}:${minutes}:${seconds}.${ms}`;
	}

	/**
	 * Get all log entries
	 */
	public getLogs(): PerformanceLogEntry[] {
		return [...this.logs];
	}

	/**
	 * Get logs for a specific operation
	 */
	public getLogsForOperation(operation: string): PerformanceLogEntry[] {
		return this.logs.filter(log => log.operation === operation);
	}

	/**
	 * Get logs by level
	 */
	public getLogsByLevel(level: LogLevel): PerformanceLogEntry[] {
		return this.logs.filter(log => log.level === level);
	}

	/**
	 * Clear all logs
	 */
	public clear(): void {
		this.logs = [];
	}

	/**
	 * Export logs as JSON
	 */
	public exportLogsAsJSON(): string {
		return JSON.stringify(this.logs, null, 2);
	}

	/**
	 * Export logs as CSV
	 */
	public exportLogsAsCSV(): string {
		const headers = ["Timestamp", "Level", "Operation", "Duration (ms)", "Message"];
		const rows = this.logs.map(log => [
			this.formatTimestamp(log.timestamp),
			LogLevel[log.level],
			log.operation,
			log.duration?.toString() || "",
			log.message,
		]);

		return [
			headers.join(","),
			...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
		].join("\n");
	}

	/**
	 * Generate a performance report
	 */
	public generateReport(): string {
		const lines: string[] = [
			"=== Performance Report ===",
			"",
		];

		// Group logs by operation
		const operationGroups = new Map<string, PerformanceLogEntry[]>();

		for (const log of this.logs) {
			const existing = operationGroups.get(log.operation) || [];
			existing.push(log);
			operationGroups.set(log.operation, existing);
		}

		// Report on each operation
		for (const [operation, logs] of operationGroups) {
			lines.push(`Operation: ${operation}`);
			lines.push(`  Total Calls: ${logs.length}`);

			// Calculate timing statistics
			const timings = logs.filter(l => l.duration !== undefined).map(l => l.duration!);
			if (timings.length > 0) {
				const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
				const min = Math.min(...timings);
				const max = Math.max(...timings);
				const median = this.calculateMedian(timings);

				lines.push(`  Avg Duration: ${avg.toFixed(2)}ms`);
				lines.push(`  Min Duration: ${min}ms`);
				lines.push(`  Max Duration: ${max}ms`);
				lines.push(`  Median Duration: ${median}ms`);
			}

			// Count by level
			const errorCount = logs.filter(l => l.level === LogLevel.ERROR).length;
			const warnCount = logs.filter(l => l.level === LogLevel.WARN).length;

			if (errorCount > 0) {
				lines.push(`  Errors: ${errorCount}`);
			}
			if (warnCount > 0) {
				lines.push(`  Warnings: ${warnCount}`);
			}

			lines.push("");
		}

		lines.push("======================");

		return lines.join("\n");
	}

	/**
	 * Calculate median of an array of numbers
	 */
	private calculateMedian(numbers: number[]): number {
		const sorted = [...numbers].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);

		if (sorted.length % 2 === 0) {
			return (sorted[mid - 1] + sorted[mid]) / 2;
		} else {
			return sorted[mid];
		}
	}

	/**
	 * Log performance metrics from a PerformanceMonitor
	 */
	public logMetrics(metrics: PerformanceMetrics, operation: string = "consensus"): void {
		this.info(operation, "Performance metrics", {
			totalDuration: metrics.totalDuration,
			modelInvocationDuration: metrics.modelInvocationDuration,
			consensusBuildingDuration: metrics.consensusBuildingDuration,
			parallelRequests: metrics.parallelRequests,
			sequentialRequests: metrics.sequentialRequests,
			averageResponseTime: metrics.averageResponseTime,
			cacheHitRate: metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses || 1),
			earlyTerminations: metrics.earlyTerminations,
			questionsResolvedImmediately: metrics.questionsResolvedImmediately,
		});
	}

	/**
	 * Create a summary of recent performance
	 */
	public getRecentSummary(windowMs: number = 60000): string {
		const now = Date.now();
		const recentLogs = this.logs.filter(log => now - log.timestamp < windowMs);

		if (recentLogs.length === 0) {
			return "No recent activity";
		}

		const operations = new Set(recentLogs.map(l => l.operation));
		const errors = recentLogs.filter(l => l.level === LogLevel.ERROR).length;
		const warnings = recentLogs.filter(l => l.level === LogLevel.WARN).length;

		const timings = recentLogs.filter(l => l.duration !== undefined).map(l => l.duration!);
		const avgTiming = timings.length > 0
			? timings.reduce((a, b) => a + b, 0) / timings.length
			: 0;

		return `Last ${windowMs / 1000}s: ${recentLogs.length} logs, ${operations.size} operations, ` +
			`${errors} errors, ${warnings} warnings, avg ${avgTiming.toFixed(0)}ms`;
	}
}
