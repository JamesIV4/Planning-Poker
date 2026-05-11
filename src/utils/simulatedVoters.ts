import { nanoid } from "nanoid";
import { CARD_VALUES } from "../types";
import type { CardValue, Player } from "../types";

const SIMULATED_NAMES = [
  "Alex",
  "Jordan",
  "Sam",
  "Taylor",
  "Morgan",
  "Casey",
  "Riley",
  "Quinn",
  "Avery",
  "Dakota",
  "Skyler",
  "Reese",
  "Finley",
  "Rowan",
  "Sage",
];

let nameIndex = 0;

/**
 * Create a simulated voter player.
 */
export function createSimulatedPlayer(): Player {
  const name = SIMULATED_NAMES[nameIndex % SIMULATED_NAMES.length];
  const cycle = Math.floor(nameIndex / SIMULATED_NAMES.length);
  nameIndex++;
  const displayName =
    cycle === 0 ? `${name} (bot)` : `${name} ${cycle + 1} (bot)`;
  return {
    id: `sim-${nanoid(6)}`,
    displayName,
    isAdmin: false,
  };
}

/**
 * Pick a random card value, weighted toward middle values.
 */
export function getRandomVote(): CardValue {
  return CARD_VALUES[Math.floor(Math.random() * CARD_VALUES.length)];
}

/**
 * Check if running on localhost (dev mode).
 */
export function isLocalhost(): boolean {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}
