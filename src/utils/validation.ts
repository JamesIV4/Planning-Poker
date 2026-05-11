import { CARD_VALUES } from "../types";
import type { CardValue, PlayerAction } from "../types";

/**
 * Validates that a session name is non-empty and at most 100 characters.
 */
export function isValidSessionName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 100;
}

/**
 * Validates that a display name is non-empty and at most 50 characters.
 */
export function isValidDisplayName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 50;
}

/**
 * Type guard that checks if a value is a valid CardValue.
 */
export function isValidCardValue(value: unknown): value is CardValue {
  return (CARD_VALUES as unknown[]).includes(value);
}

/**
 * Type guard that validates a message conforms to the PlayerAction schema.
 * Accepts: { type: "join", displayName: string }
 *        | { type: "vote", card: CardValue }
 *        | { type: "removeVote" }
 */
export function isValidPlayerAction(msg: unknown): msg is PlayerAction {
  if (msg === null || typeof msg !== "object") {
    return false;
  }

  const obj = msg as Record<string, unknown>;

  if (typeof obj.type !== "string") {
    return false;
  }

  switch (obj.type) {
    case "join":
      return (
        typeof obj.displayName === "string" && obj.displayName.trim().length > 0
      );
    case "vote":
      return isValidCardValue(obj.card);
    case "removeVote":
      return true;
    default:
      return false;
  }
}

/**
 * Strips HTML/script tags from input to prevent XSS.
 */
export function sanitize(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}
