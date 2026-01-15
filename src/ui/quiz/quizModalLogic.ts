import { App, TFile } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { QuizSettings } from "../../settings/config";
import { Question } from "../../utils/types";
import QuizSaver from "../../services/quizSaver";
import QuizModalWrapper from "./QuizModalWrapper";
import { shuffleArray } from "../../utils/helpers";
import { ConsensusAuditTrail } from "../../consensus/types";
import { safeUnmountReactRoot, ModalCloseMetrics } from "../../utils/modalCleanup";
import { EventListenerRegistry } from "../../utils/eventRegistry";

export default class QuizModalLogic {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly quiz: Question[];
	private readonly quizSources: TFile[];
	private readonly quizSaver: QuizSaver;
	private readonly auditTrail?: ConsensusAuditTrail;
	private container: HTMLDivElement | undefined;
	private root: Root | undefined;
	private readonly handleEscapePressed: (event: KeyboardEvent) => void;

	/**
	 * Event listener registry for centralized tracking and cleanup.
	 * All event listeners registered through this registry can be batch
	 * cleaned up with a single unregisterAll() call, ensuring no listeners
	 * are leaked during modal cleanup.
	 */
	private readonly eventRegistry: EventListenerRegistry;

	/**
	 * Cleanup guard to prevent race conditions during modal dismissal.
	 * When true, indicates cleanup is already in progress and subsequent
	 * close attempts should be ignored.
	 */
	private isCleaningUp: boolean = false;

	/**
	 * Timestamp when cleanup was initiated, used for performance monitoring
	 * and diagnostics.
	 */
	private cleanupStartTime: number = 0;

	constructor(
		app: App,
		settings: QuizSettings,
		quiz: Question[],
		quizSources: TFile[],
		auditTrail?: ConsensusAuditTrail
	) {
		this.app = app;
		this.settings = settings;
		this.quiz = quiz;
		this.quizSources = quizSources;
		this.auditTrail = auditTrail;
		this.quizSaver = new QuizSaver(this.app, this.settings, this.quizSources);
		this.eventRegistry = new EventListenerRegistry();
		this.handleEscapePressed = (event: KeyboardEvent): void => {
			if (event.key === "Escape" && !(event.target instanceof HTMLInputElement)) {
				this.removeQuiz();
			}
		};
	}

	public async renderQuiz(): Promise<void> {
		const quiz = this.settings.randomizeQuestions ? shuffleArray(this.quiz) : this.quiz;

		if (this.settings.autoSave && this.quizSources.length > 0) {
			await this.quizSaver.saveAllQuestions(quiz); // move into QuizModal or QuizModalWrapper?
		}

		this.container = document.body.createDiv();
		this.root = createRoot(this.container as unknown as Element);
		this.root.render(QuizModalWrapper({
			app: this.app,
			settings: this.settings,
			quiz: quiz,
			quizSaver: this.quizSaver,
			reviewing: this.quizSources.length === 0,
			handleClose: () => this.removeQuiz(),
			auditTrail: this.auditTrail,
		}));
		this.eventRegistry.register(document.body, "keydown", this.handleEscapePressed as EventListener);
	}

	/**
	 * Attempts to begin cleanup process, checking for race conditions.
	 * This method implements a cleanup guard pattern to prevent multiple
	 * simultaneous close operations that could cause UI freezes or errors.
	 *
	 * @returns true if cleanup can proceed (not already in progress), false otherwise
	 *
	 * @example
	 * ```typescript
	 * if (!this.beginCleanup()) {
	 *   console.log('Cleanup already in progress, ignoring duplicate close request');
	 *   return;
	 * }
	 * // Proceed with cleanup...
	 * ```
	 */
	private beginCleanup(): boolean {
		// Check if cleanup is already in progress
		if (this.isCleaningUp) {
			console.log(
				`[QuizModalLogic] Cleanup already in progress (started ${performance.now() - this.cleanupStartTime}ms ago), ignoring duplicate close request`
			);
			return false;
		}

		// Mark cleanup as in progress
		this.isCleaningUp = true;
		this.cleanupStartTime = performance.now();

		console.log('[QuizModalLogic] Cleanup initiated at', this.cleanupStartTime);
		return true;
	}

	/**
	 * Safely removes the quiz modal, cleaning up all associated resources.
	 * Uses a cleanup guard to prevent race conditions from multiple close attempts
	 * (e.g., rapid button clicks, ESC key + mouse click).
	 *
	 * This method will return early if cleanup is already in progress, preventing
	 * duplicate unmount operations that could cause UI freezes or errors.
	 *
	 * Implements comprehensive error handling, metrics collection, and logging
	 * to diagnose and recover from cleanup failures.
	 */
	private async removeQuiz(): Promise<void> {
		// Guard against multiple simultaneous close attempts
		if (!this.beginCleanup()) {
			// Cleanup already in progress, ignore this call
			return;
		}

		// Initialize metrics collection
		const metrics: ModalCloseMetrics = {
			modalType: 'quiz',
			closeInitiatedAt: this.cleanupStartTime,
			errors: [],
			cleanupSteps: [],
		};

		try {
			// Step 1: Unmount React root
			console.log('[QuizModalLogic] Starting React root unmount');
			const unmountStepStart = performance.now();

			try {
				const unmountResult = await safeUnmountReactRoot(this.root, 500);
				const unmountDuration = performance.now() - unmountStepStart;

				metrics.cleanupSteps.push({
					name: 'React unmount',
					duration: unmountDuration,
					success: unmountResult.success,
				});

				if (unmountResult.success) {
					console.log(`[QuizModalLogic] React unmount completed in ${unmountDuration.toFixed(2)}ms`);
				} else {
					const errorMessage = `React unmount failed: ${unmountResult.error?.message}`;
					console.error(`[QuizModalLogic] ${errorMessage}`, unmountResult.error);
					metrics.errors.push({
						step: 'React unmount',
						error: unmountResult.error || new Error('Unknown unmount error'),
						timestamp: performance.now(),
					});
				}
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				const unmountDuration = performance.now() - unmountStepStart;

				console.error('[QuizModalLogic] Unexpected error during React unmount:', err);
				metrics.cleanupSteps.push({
					name: 'React unmount',
					duration: unmountDuration,
					success: false,
				});
				metrics.errors.push({
					step: 'React unmount',
					error: err,
					timestamp: performance.now(),
				});
			}

			// Step 2: Remove DOM container
			console.log('[QuizModalLogic] Removing DOM container');
			const containerStepStart = performance.now();

			try {
				this.container?.remove();
				const containerDuration = performance.now() - containerStepStart;

				metrics.cleanupSteps.push({
					name: 'DOM container removal',
					duration: containerDuration,
					success: true,
				});
				console.log(`[QuizModalLogic] DOM container removed in ${containerDuration.toFixed(2)}ms`);
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				const containerDuration = performance.now() - containerStepStart;

				console.error('[QuizModalLogic] Error removing DOM container:', err);
				metrics.cleanupSteps.push({
					name: 'DOM container removal',
					duration: containerDuration,
					success: false,
				});
				metrics.errors.push({
					step: 'DOM container removal',
					error: err,
					timestamp: performance.now(),
				});
			}

			// Step 3: Remove event listeners
			console.log('[QuizModalLogic] Removing event listeners');
			const listenerStepStart = performance.now();

			try {
				const activeCountBefore = this.eventRegistry.getActiveCount();
				console.log(`[QuizModalLogic] Active listeners before cleanup: ${activeCountBefore}`);

				this.eventRegistry.unregisterAll();
				const listenerDuration = performance.now() - listenerStepStart;

				const activeCountAfter = this.eventRegistry.getActiveCount();
				console.log(`[QuizModalLogic] Active listeners after cleanup: ${activeCountAfter}`);

				if (activeCountAfter > 0) {
					console.warn(
						`[QuizModalLogic] Warning: ${activeCountAfter} listeners still active after cleanup. This may indicate a memory leak.`
					);
				}

				metrics.cleanupSteps.push({
					name: 'Event listener cleanup',
					duration: listenerDuration,
					success: true,
				});
				console.log(`[QuizModalLogic] Event listeners removed in ${listenerDuration.toFixed(2)}ms`);
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				const listenerDuration = performance.now() - listenerStepStart;

				console.error('[QuizModalLogic] Error removing event listeners:', err);
				metrics.cleanupSteps.push({
					name: 'Event listener cleanup',
					duration: listenerDuration,
					success: false,
				});
				metrics.errors.push({
					step: 'Event listener cleanup',
					error: err,
					timestamp: performance.now(),
				});
			}

		} catch (error) {
			// Catch any unexpected errors during the entire cleanup process
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('[QuizModalLogic] Unexpected error during cleanup:', err);
			metrics.errors.push({
				step: 'Overall cleanup',
				error: err,
				timestamp: performance.now(),
			});
		} finally {
			// Always finalize metrics and reset cleanup flag
			metrics.closeCompletedAt = performance.now();
			metrics.duration = metrics.closeCompletedAt - metrics.closeInitiatedAt;

			// Log final metrics summary
			console.log(`[QuizModalLogic] Cleanup completed in ${metrics.duration.toFixed(2)}ms`, {
				modalType: metrics.modalType,
				totalSteps: metrics.cleanupSteps.length,
				successfulSteps: metrics.cleanupSteps.filter(s => s.success).length,
				failedSteps: metrics.cleanupSteps.filter(s => !s.success).length,
				errorCount: metrics.errors.length,
				stepDetails: metrics.cleanupSteps,
			});

			if (metrics.errors.length > 0) {
				console.warn('[QuizModalLogic] Cleanup completed with errors:', metrics.errors);
			}

			// Reset cleanup flag to allow future close operations
			this.isCleaningUp = false;
		}
	}
}
