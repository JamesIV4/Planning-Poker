import confetti from "canvas-confetti";
import { COFFEE_CARD, NUMERIC_CARDS } from "../types";
import type { NumericCard, Vote } from "../types";

/** Minimum number of tallied voters before unanimity counts as consensus. */
const MIN_VOTERS_FOR_CONSENSUS = 2;

/**
 * True when every tallied voter picked the same numeric card.
 *
 * Deliberately stricter than `getAgreementRatio() === 1`, which also returns 1
 * for a lone voter (nobody to agree with) and for a table that unanimously
 * picked "?" (agreement that nobody knows, not an estimate). Coffee (away)
 * votes are excluded, matching the rest of the tabulation.
 */
export function hasUnanimousNumericVote(votes: Vote[]): boolean {
  const tallied = votes.filter((v) => v.card !== COFFEE_CARD);
  if (tallied.length < MIN_VOTERS_FOR_CONSENSUS) return false;

  const card = tallied[0].card;
  if (!NUMERIC_CARDS.includes(card as NumericCard)) return false;

  return tallied.every((v) => v.card === card);
}

/**
 * Vertical origin for the burst, just above the top edge of the voting bar.
 * Falls back to canvas-confetti's usual 0.7 when the bar isn't measurable
 * (not yet mounted, or a zero-height layout in tests).
 */
function getVotingBarOriginY(doc: Document = document): number {
  const panel = doc.querySelector(".card-selection-panel");
  if (!panel) return 0.7;

  const rect = panel.getBoundingClientRect();
  const viewportHeight = doc.defaultView?.innerHeight ?? 0;
  if (viewportHeight === 0 || rect.height === 0) return 0.7;

  return Math.min(Math.max(rect.top / viewportHeight, 0), 1);
}

/**
 * Fire the celebratory burst for a unanimous vote. Emits upward from just
 * above the voting bar, layering five bursts with different spreads and
 * velocities so the shower reads as one organic pop rather than a single ring.
 */
export function fireConsensusConfetti(doc: Document = document): void {
  const count = 200;
  const defaults: confetti.Options = {
    origin: { y: getVotingBarOriginY(doc) },
  };

  const fire = (particleRatio: number, opts: confetti.Options) => {
    void confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  };

  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.1, { spread: 120, startVelocity: 45 });
}
