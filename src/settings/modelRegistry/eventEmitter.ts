/**
 * Model Registry Event Emitter
 *
 * Provides an event-driven architecture for reactive model updates across the plugin.
 * This enables UI components to subscribe to model registry changes and update
 * immediately without requiring settings panel refresh or Obsidian restart.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7
 *
 * @example
 * ```typescript
 * // Subscribe to model changes
 * const unsubscribe = modelRegistryEvents.on('model-added', (event) => {
 *   console.log('Model added:', event.modelId);
 *   refreshDropdown();
 * });
 *
 * // Later, clean up the subscription
 * unsubscribe();
 *
 * // Or use off() directly
 * modelRegistryEvents.off('model-added', myCallback);
 * ```
 */

import { ModelConfiguration } from "./types";

/**
 * Types of events that can be emitted by the model registry.
 *
 * - `model-added`: A new model was added to the registry
 * - `model-updated`: An existing model was updated
 * - `model-deleted`: A model was removed from the registry
 * - `registry-changed`: Generic event for any registry change (emitted after specific events)
 */
export type ModelRegistryEventType =
	| "model-added"
	| "model-updated"
	| "model-deleted"
	| "registry-changed";

/**
 * Payload for model registry events.
 */
export interface ModelRegistryEvent {
	/** The type of event that occurred */
	type: ModelRegistryEventType;

	/** The ID of the model that was affected */
	modelId: string;

	/** The model configuration (present for add/update events, absent for delete) */
	model?: ModelConfiguration;

	/** The previous model configuration (present for update events only) */
	previousModel?: ModelConfiguration;

	/** Timestamp when the event occurred */
	timestamp: number;
}

/**
 * Callback function type for model registry event handlers.
 */
export type ModelRegistryEventCallback = (event: ModelRegistryEvent) => void;

/**
 * Interface for the model registry event emitter.
 */
export interface IModelRegistryEventEmitter {
	/**
	 * Subscribe to a model registry event.
	 *
	 * @param eventType - The type of event to listen for
	 * @param callback - The callback to invoke when the event occurs
	 * @returns A function to unsubscribe the callback
	 */
	on(eventType: ModelRegistryEventType, callback: ModelRegistryEventCallback): () => void;

	/**
	 * Unsubscribe a callback from a model registry event.
	 *
	 * @param eventType - The type of event to stop listening for
	 * @param callback - The callback to remove
	 * @returns true if the callback was found and removed, false otherwise
	 */
	off(eventType: ModelRegistryEventType, callback: ModelRegistryEventCallback): boolean;

	/**
	 * Emit a model registry event to all subscribers.
	 *
	 * @param eventType - The type of event to emit
	 * @param payload - The event payload (without the type, which is added automatically)
	 */
	emit(
		eventType: ModelRegistryEventType,
		payload: Omit<ModelRegistryEvent, "type" | "timestamp">
	): void;

	/**
	 * Remove all event listeners.
	 * Useful for cleanup when the plugin is unloaded.
	 */
	removeAllListeners(): void;

	/**
	 * Get the count of listeners for a specific event type.
	 * Useful for debugging and testing.
	 *
	 * @param eventType - The event type to count listeners for
	 * @returns The number of registered listeners
	 */
	listenerCount(eventType: ModelRegistryEventType): number;

	/**
	 * Get the total count of all listeners across all event types.
	 * Useful for debugging and testing.
	 *
	 * @returns The total number of registered listeners
	 */
	totalListenerCount(): number;
}

/**
 * Implementation of the model registry event emitter.
 *
 * This class provides a type-safe, memory-efficient event system for
 * broadcasting model registry changes to UI components.
 *
 * Key features:
 * - Type-safe event types and payloads
 * - Automatic unsubscribe function returned from on()
 * - Proper cleanup with removeAllListeners()
 * - Diagnostic methods for testing (listenerCount, totalListenerCount)
 * - Error handling to prevent one bad listener from breaking others
 *
 * Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7
 */
export class ModelRegistryEventEmitter implements IModelRegistryEventEmitter {
	/**
	 * Map of event types to their registered callbacks.
	 * Uses Set for O(1) add/remove operations and automatic deduplication.
	 */
	private listeners: Map<ModelRegistryEventType, Set<ModelRegistryEventCallback>>;

	/**
	 * Flag to enable debug logging (useful during development).
	 */
	private debugMode: boolean;

	constructor(options?: { debug?: boolean }) {
		this.listeners = new Map();
		this.debugMode = options?.debug ?? false;

		// Initialize listener sets for all event types
		const eventTypes: ModelRegistryEventType[] = [
			"model-added",
			"model-updated",
			"model-deleted",
			"registry-changed",
		];
		for (const eventType of eventTypes) {
			this.listeners.set(eventType, new Set());
		}
	}

	/**
	 * Subscribe to a model registry event.
	 *
	 * @param eventType - The type of event to listen for
	 * @param callback - The callback to invoke when the event occurs
	 * @returns A function to unsubscribe the callback
	 *
	 * @example
	 * ```typescript
	 * const unsubscribe = emitter.on('model-added', (event) => {
	 *   console.log('Model added:', event.modelId);
	 * });
	 *
	 * // Later, unsubscribe
	 * unsubscribe();
	 * ```
	 */
	on(eventType: ModelRegistryEventType, callback: ModelRegistryEventCallback): () => void {
		const listeners = this.listeners.get(eventType);
		if (!listeners) {
			// This shouldn't happen with proper initialization, but handle gracefully
			console.warn(
				`[ModelRegistryEventEmitter] Unknown event type: ${eventType}`
			);
			return () => {};
		}

		listeners.add(callback);

		if (this.debugMode) {
			console.debug(
				`[ModelRegistryEventEmitter] Listener added for "${eventType}". Count: ${listeners.size}`
			);
		}

		// Return unsubscribe function
		return () => {
			this.off(eventType, callback);
		};
	}

	/**
	 * Unsubscribe a callback from a model registry event.
	 *
	 * @param eventType - The type of event to stop listening for
	 * @param callback - The callback to remove
	 * @returns true if the callback was found and removed, false otherwise
	 */
	off(eventType: ModelRegistryEventType, callback: ModelRegistryEventCallback): boolean {
		const listeners = this.listeners.get(eventType);
		if (!listeners) {
			return false;
		}

		const removed = listeners.delete(callback);

		if (this.debugMode && removed) {
			console.debug(
				`[ModelRegistryEventEmitter] Listener removed for "${eventType}". Count: ${listeners.size}`
			);
		}

		return removed;
	}

	/**
	 * Emit a model registry event to all subscribers.
	 *
	 * This method:
	 * 1. Adds the event type and timestamp to the payload
	 * 2. Notifies all listeners for the specific event type
	 * 3. Also emits a 'registry-changed' event for generic subscribers
	 * 4. Catches and logs errors from individual listeners to prevent cascade failures
	 *
	 * @param eventType - The type of event to emit
	 * @param payload - The event payload (without the type, which is added automatically)
	 */
	emit(
		eventType: ModelRegistryEventType,
		payload: Omit<ModelRegistryEvent, "type" | "timestamp">
	): void {
		const event: ModelRegistryEvent = {
			...payload,
			type: eventType,
			timestamp: Date.now(),
		};

		if (this.debugMode) {
			console.debug(
				`[ModelRegistryEventEmitter] Emitting "${eventType}" for model: ${event.modelId}`
			);
		}

		// Emit to specific event type listeners
		this.notifyListeners(eventType, event);

		// Also emit 'registry-changed' for any registry modification
		// (except if we're already emitting 'registry-changed')
		if (eventType !== "registry-changed") {
			const registryChangedEvent: ModelRegistryEvent = {
				...event,
				type: "registry-changed",
			};
			this.notifyListeners("registry-changed", registryChangedEvent);
		}
	}

	/**
	 * Internal method to notify all listeners for a specific event type.
	 * Handles errors gracefully to prevent one bad listener from breaking others.
	 */
	private notifyListeners(eventType: ModelRegistryEventType, event: ModelRegistryEvent): void {
		const listeners = this.listeners.get(eventType);
		if (!listeners || listeners.size === 0) {
			return;
		}

		// Create a copy of listeners to avoid issues if callbacks modify the set
		const listenersCopy = Array.from(listeners);

		for (const callback of listenersCopy) {
			try {
				callback(event);
			} catch (error) {
				// Log error but don't let it break other listeners
				console.error(
					`[ModelRegistryEventEmitter] Error in listener for "${eventType}":`,
					error
				);
			}
		}
	}

	/**
	 * Remove all event listeners.
	 * Useful for cleanup when the plugin is unloaded.
	 */
	removeAllListeners(): void {
		for (const listeners of this.listeners.values()) {
			listeners.clear();
		}

		if (this.debugMode) {
			console.debug("[ModelRegistryEventEmitter] All listeners removed");
		}
	}

	/**
	 * Remove all listeners for a specific event type.
	 *
	 * @param eventType - The event type to clear listeners for
	 */
	removeAllListenersFor(eventType: ModelRegistryEventType): void {
		const listeners = this.listeners.get(eventType);
		if (listeners) {
			listeners.clear();

			if (this.debugMode) {
				console.debug(
					`[ModelRegistryEventEmitter] All listeners removed for "${eventType}"`
				);
			}
		}
	}

	/**
	 * Get the count of listeners for a specific event type.
	 * Useful for debugging and testing.
	 *
	 * @param eventType - The event type to count listeners for
	 * @returns The number of registered listeners
	 */
	listenerCount(eventType: ModelRegistryEventType): number {
		const listeners = this.listeners.get(eventType);
		return listeners ? listeners.size : 0;
	}

	/**
	 * Get the total count of all listeners across all event types.
	 * Useful for debugging and testing.
	 *
	 * @returns The total number of registered listeners
	 */
	totalListenerCount(): number {
		let total = 0;
		for (const listeners of this.listeners.values()) {
			total += listeners.size;
		}
		return total;
	}

	/**
	 * Check if there are any listeners registered for a specific event type.
	 *
	 * @param eventType - The event type to check
	 * @returns true if there are listeners, false otherwise
	 */
	hasListeners(eventType: ModelRegistryEventType): boolean {
		return this.listenerCount(eventType) > 0;
	}

	/**
	 * Enable or disable debug mode for logging.
	 *
	 * @param enabled - Whether to enable debug logging
	 */
	setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}
}

/**
 * Singleton instance of the model registry event emitter.
 * Use this instance throughout the plugin to ensure all components
 * share the same event bus.
 *
 * @example
 * ```typescript
 * import { modelRegistryEvents } from './eventEmitter';
 *
 * // In a UI component
 * const unsubscribe = modelRegistryEvents.on('model-added', (event) => {
 *   refreshModelDropdown();
 * });
 *
 * // In the model registry
 * modelRegistryEvents.emit('model-added', { modelId: 'new-model', model: config });
 * ```
 */
export const modelRegistryEvents = new ModelRegistryEventEmitter();

/**
 * Type guard to check if a value is a valid ModelRegistryEventType.
 */
export function isModelRegistryEventType(value: unknown): value is ModelRegistryEventType {
	return (
		typeof value === "string" &&
		["model-added", "model-updated", "model-deleted", "registry-changed"].includes(value)
	);
}

/**
 * Type guard to check if an object is a valid ModelRegistryEvent.
 */
export function isModelRegistryEvent(obj: unknown): obj is ModelRegistryEvent {
	if (obj === null || typeof obj !== "object") {
		return false;
	}
	const event = obj as Record<string, unknown>;
	return (
		isModelRegistryEventType(event.type) &&
		typeof event.modelId === "string" &&
		typeof event.timestamp === "number"
	);
}

/**
 * Create a new ModelRegistryEventEmitter instance.
 * Useful for testing or when isolated event buses are needed.
 *
 * @param options - Optional configuration
 * @returns A new ModelRegistryEventEmitter instance
 */
export function createModelRegistryEventEmitter(options?: {
	debug?: boolean;
}): ModelRegistryEventEmitter {
	return new ModelRegistryEventEmitter(options);
}
