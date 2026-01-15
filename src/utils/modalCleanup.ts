import { Root } from "react-dom/client";

/**
 * Tracks the state of modal cleanup operations
 */
export interface CleanupState {
	inProgress: boolean;
	startTime: number;
	completedSteps: string[];
	errors: Error[];
}

/**
 * Collects diagnostic information for troubleshooting modal cleanup
 */
export interface ModalCloseMetrics {
	modalType: 'quiz' | 'flashcard' | 'selector';
	closeInitiatedAt: number;
	closeCompletedAt?: number;
	duration?: number;
	errors: Array<{
		step: string;
		error: Error;
		timestamp: number;
	}>;
	cleanupSteps: Array<{
		name: string;
		duration: number;
		success: boolean;
	}>;
}

/**
 * Result of React root cleanup operation
 */
export interface ReactCleanupResult {
	success: boolean;
	error?: Error;
	duration: number;
}

/**
 * Options for async cleanup operations
 */
export interface AsyncCleanupOptions {
	/** Maximum cleanup time in milliseconds */
	timeout: number;
	/** Callback when timeout is exceeded */
	onTimeout: () => void;
	/** Callback when error occurs */
	onError: (error: Error) => void;
}

/**
 * Safely unmounts a React root with timeout protection and error handling.
 *
 * This function wraps React 18's root.unmount() with defensive programming patterns
 * to prevent UI freezes and ensure cleanup always completes within a reasonable timeframe.
 *
 * @param root - The React root to unmount (may be undefined)
 * @param timeout - Maximum time in milliseconds to wait for unmount (default: 500ms)
 * @returns Promise resolving to cleanup result with success status, error, and duration
 *
 * @example
 * ```typescript
 * const result = await safeUnmountReactRoot(this.root, 500);
 * if (!result.success) {
 *   console.error('Unmount failed:', result.error);
 * }
 * console.log(`Cleanup took ${result.duration}ms`);
 * ```
 */
export async function safeUnmountReactRoot(
	root: Root | undefined,
	timeout: number = 500
): Promise<ReactCleanupResult> {
	const startTime = performance.now();

	// Handle undefined root
	if (!root) {
		return {
			success: true,
			duration: performance.now() - startTime,
		};
	}

	try {
		// Create promise that resolves when unmount completes
		const unmountPromise = new Promise<void>((resolve, reject) => {
			try {
				root.unmount();
				resolve();
			} catch (error) {
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});

		// Create timeout promise
		const timeoutPromise = new Promise<void>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`React unmount timed out after ${timeout}ms`));
			}, timeout);
		});

		// Race between unmount and timeout
		await Promise.race([unmountPromise, timeoutPromise]);

		return {
			success: true,
			duration: performance.now() - startTime,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error : new Error(String(error)),
			duration: performance.now() - startTime,
		};
	}
}

/**
 * Performs async cleanup with timeout protection.
 *
 * This utility ensures cleanup operations don't block indefinitely by enforcing
 * a maximum execution time. If the cleanup function exceeds the timeout, the
 * onTimeout callback is invoked and the operation is considered failed.
 *
 * @param cleanup - Async function to execute
 * @param options - Configuration with timeout and error callbacks
 * @returns Promise that resolves when cleanup completes or times out
 *
 * @example
 * ```typescript
 * await performAsyncCleanup(
 *   async () => { await saveState(); },
 *   {
 *     timeout: 1000,
 *     onTimeout: () => console.warn('Save timed out'),
 *     onError: (err) => console.error('Save failed:', err)
 *   }
 * );
 * ```
 */
export async function performAsyncCleanup(
	cleanup: () => Promise<void>,
	options: AsyncCleanupOptions
): Promise<void> {
	const { timeout, onTimeout, onError } = options;

	try {
		// Create cleanup promise
		const cleanupPromise = cleanup();

		// Create timeout promise
		const timeoutPromise = new Promise<void>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`Async cleanup timed out after ${timeout}ms`));
			}, timeout);
		});

		// Race between cleanup and timeout
		await Promise.race([cleanupPromise, timeoutPromise]);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));

		// Check if it's a timeout error
		if (err.message.includes('timed out')) {
			onTimeout();
		} else {
			onError(err);
		}

		// Re-throw to allow caller to handle
		throw err;
	}
}
