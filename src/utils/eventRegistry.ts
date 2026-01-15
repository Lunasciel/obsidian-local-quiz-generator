/**
 * Represents a registered event listener with all necessary information for cleanup
 */
interface RegisteredListener {
	target: EventTarget;
	event: string;
	handler: EventListener;
	options?: boolean | AddEventListenerOptions;
}

/**
 * EventListenerRegistry - Centralized tracking and cleanup of event listeners
 *
 * This class provides a robust solution for managing event listeners in modal lifecycles.
 * It tracks all registered listeners and provides batch cleanup functionality to prevent
 * memory leaks and ensure proper resource disposal.
 *
 * Key Features:
 * - Automatic tracking of all registered event listeners
 * - Batch cleanup with unregisterAll()
 * - Diagnostic verification with getActiveCount()
 * - Handles missing targets gracefully during cleanup
 * - Type-safe API with full TypeScript support
 *
 * @example
 * ```typescript
 * const registry = new EventListenerRegistry();
 *
 * // Register listeners
 * registry.register(document.body, 'keydown', handleEscape);
 * registry.register(button, 'click', handleClick);
 *
 * // Later, cleanup all listeners at once
 * registry.unregisterAll();
 *
 * // Verify cleanup
 * console.log('Active listeners:', registry.getActiveCount()); // Should be 0
 * ```
 */
export class EventListenerRegistry {
	private listeners: RegisteredListener[] = [];

	/**
	 * Registers an event listener and tracks it for later cleanup.
	 *
	 * This method wraps addEventListener while maintaining a reference to all
	 * parameters needed for proper cleanup. The listener is added to the target
	 * immediately and tracked in the internal registry.
	 *
	 * @param target - The event target (e.g., window, document, HTMLElement)
	 * @param event - The event type (e.g., 'click', 'keydown')
	 * @param handler - The event handler function
	 * @param options - Optional event listener options (capture, once, passive, signal)
	 *
	 * @example
	 * ```typescript
	 * const registry = new EventListenerRegistry();
	 * registry.register(window, 'resize', handleResize);
	 * registry.register(document, 'keydown', handleKeyDown, { capture: true });
	 * ```
	 */
	public register(
		target: EventTarget,
		event: string,
		handler: EventListener,
		options?: boolean | AddEventListenerOptions
	): void {
		// Add the event listener to the target
		target.addEventListener(event, handler, options);

		// Track the listener for cleanup
		this.listeners.push({
			target,
			event,
			handler,
			options,
		});
	}

	/**
	 * Removes all registered event listeners from their targets.
	 *
	 * This method performs batch cleanup of all tracked listeners. It iterates
	 * through the registry and calls removeEventListener for each tracked listener.
	 * After cleanup, the registry is cleared.
	 *
	 * The method handles edge cases gracefully:
	 * - If a target has been removed from DOM, the removeEventListener call is ignored
	 * - If a listener was already removed manually, no error is thrown
	 * - All listeners are attempted to be removed even if some fail
	 *
	 * @example
	 * ```typescript
	 * const registry = new EventListenerRegistry();
	 * registry.register(document.body, 'click', handleClick);
	 * registry.register(window, 'resize', handleResize);
	 *
	 * // Later, during modal cleanup
	 * registry.unregisterAll(); // Removes both listeners
	 * ```
	 */
	public unregisterAll(): void {
		for (const listener of this.listeners) {
			try {
				listener.target.removeEventListener(
					listener.event,
					listener.handler,
					listener.options
				);
			} catch (error) {
				// Silently ignore errors from removing already-removed listeners
				// or listeners on removed DOM nodes. This is expected behavior
				// during cleanup and doesn't indicate a problem.
				console.debug(
					`[EventRegistry] Failed to remove listener for ${listener.event}:`,
					error
				);
			}
		}

		// Clear the registry
		this.listeners = [];
	}

	/**
	 * Returns the number of currently tracked event listeners.
	 *
	 * This method is primarily used for diagnostic purposes and verification
	 * that cleanup completed successfully. In a properly functioning cleanup
	 * flow, this should return 0 after unregisterAll() is called.
	 *
	 * @returns The count of active (tracked) event listeners
	 *
	 * @example
	 * ```typescript
	 * const registry = new EventListenerRegistry();
	 * registry.register(window, 'resize', handleResize);
	 * console.log(registry.getActiveCount()); // 1
	 *
	 * registry.unregisterAll();
	 * console.log(registry.getActiveCount()); // 0
	 * ```
	 */
	public getActiveCount(): number {
		return this.listeners.length;
	}

	/**
	 * Clears all tracked listeners without removing them from their targets.
	 *
	 * WARNING: This method is primarily for testing purposes. In production code,
	 * you should always use unregisterAll() to properly cleanup listeners.
	 *
	 * Use case: Resetting registry state in tests without affecting actual DOM.
	 */
	public clear(): void {
		this.listeners = [];
	}
}
