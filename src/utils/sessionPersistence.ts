import type { GameState, Player, Session } from "../types";

const STORAGE_KEY = "planning-poker-session";
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface PersistedSession {
  session: Session;
  currentPlayer: Player;
  gameState: GameState;
  savedAt: number;
}

/**
 * Save the current session state to localStorage.
 */
export function saveSession(data: {
  session: Session;
  currentPlayer: Player;
  gameState: GameState;
}): void {
  const persisted: PersistedSession = {
    ...data,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // localStorage might be full or unavailable — silently ignore
  }
}

/**
 * Load a persisted session from localStorage.
 * Returns null if no session exists, it's expired (>10 min), or it doesn't match the given sessionId.
 */
export function loadSession(sessionId: string): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const persisted: PersistedSession = JSON.parse(raw);

    // Check if it matches the requested session
    if (persisted.session.id !== sessionId) return null;

    // Check if it's expired
    if (Date.now() - persisted.savedAt > SESSION_TTL_MS) {
      clearSession();
      return null;
    }

    return persisted;
  } catch {
    return null;
  }
}

/**
 * Clear the persisted session from localStorage.
 */
export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently ignore
  }
}
