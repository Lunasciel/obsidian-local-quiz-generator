import { PausedSessionState } from "./types";

/**
 * LocalStorage key for paused flashcard sessions
 */
const SESSION_STORAGE_KEY = "flashcard-paused-session";

/**
 * Saves the current session state to localStorage
 *
 * @param state - The session state to save
 * @throws Error if localStorage is not available or save fails
 */
export function savePausedSession(state: PausedSessionState): void {
	try {
		const serialized = JSON.stringify(state);
		localStorage.setItem(SESSION_STORAGE_KEY, serialized);
	} catch (error) {
		console.error("Failed to save paused session to localStorage:", error);
		throw new Error("Unable to save session. Please try again.");
	}
}

/**
 * Loads a paused session state from localStorage
 *
 * @returns The paused session state, or null if no session is saved
 * @throws Error if localStorage data is corrupted
 */
export function loadPausedSession(): PausedSessionState | null {
	try {
		const serialized = localStorage.getItem(SESSION_STORAGE_KEY);
		if (!serialized) {
			return null;
		}

		const state = JSON.parse(serialized) as PausedSessionState;

		// Validate that required fields exist
		if (!state.deckId || typeof state.cardIndex !== "number") {
			console.warn("Invalid paused session data found in localStorage");
			clearPausedSession();
			return null;
		}

		return state;
	} catch (error) {
		console.error("Failed to load paused session from localStorage:", error);
		// Clear corrupted data
		clearPausedSession();
		return null;
	}
}

/**
 * Clears any saved paused session from localStorage
 */
export function clearPausedSession(): void {
	try {
		localStorage.removeItem(SESSION_STORAGE_KEY);
	} catch (error) {
		console.error("Failed to clear paused session from localStorage:", error);
	}
}

/**
 * Checks if a paused session exists for a specific deck
 *
 * @param deckId - The deck ID to check
 * @returns true if a paused session exists for the deck, false otherwise
 */
export function hasPausedSessionForDeck(deckId: string): boolean {
	const state = loadPausedSession();
	return state !== null && state.deckId === deckId;
}

/**
 * Gets information about the paused session without loading full state
 *
 * @returns Basic info about the paused session, or null if none exists
 */
export function getPausedSessionInfo(): { deckId: string; pausedAt: number; cardIndex: number } | null {
	const state = loadPausedSession();
	if (!state) {
		return null;
	}

	return {
		deckId: state.deckId,
		pausedAt: state.pausedAt,
		cardIndex: state.cardIndex
	};
}
