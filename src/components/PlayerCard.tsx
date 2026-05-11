import type { CardValue, GameState } from "../types";
import "./PlayerCard.css";

/**
 * distanceRatio: 0–1 continuous value (0 = at winner, 1 = farthest from winner).
 * isSpecial: true for ? and ☕ cards (shown in blue).
 * Only meaningful when gameState is "revealed" and hasVoted is true.
 */
export interface PlayerCardProps {
  gameState: GameState;
  hasVoted: boolean;
  voteValue: CardValue | null;
  wasChanged: boolean;
  playerName: string;
  isWinner?: boolean;
  isSpecial?: boolean;
  distanceRatio?: number;
}

export function PlayerCard({
  gameState,
  hasVoted,
  voteValue,
  wasChanged,
  playerName,
  isWinner = false,
  isSpecial = false,
  distanceRatio = 0,
}: PlayerCardProps) {
  const getCardClassName = (): string => {
    const classes = ["player-card"];

    if (gameState === "voting" && hasVoted) {
      classes.push("player-card--voted");
    } else if (gameState === "voting" && !hasVoted) {
      classes.push("player-card--unvoted");
    } else if (gameState === "revealed") {
      classes.push("player-card--revealed");
    }

    // Add flip class only when revealed AND the player had voted
    if (gameState === "revealed" && hasVoted) {
      classes.push("player-card--flipped");

      if (isWinner) {
        classes.push("player-card--winner");
      } else if (isSpecial) {
        classes.push("player-card--special");
      } else {
        classes.push("player-card--off-winner");
      }
    }

    return classes.join(" ");
  };

  const getAriaLabel = (): string => {
    if (gameState === "revealed") {
      return `${playerName} voted ${voteValue ?? "no vote"}`;
    }
    if (gameState === "voting" && hasVoted) {
      return `${playerName} has voted`;
    }
    return `${playerName} has not voted`;
  };

  // Compute dynamic color based on distanceRatio (yellow → orange → red)
  // Yellow: hsl(45, 95%, 60%)  Orange: hsl(25, 95%, 55%)  Red: hsl(0, 90%, 65%)
  const getDistanceStyle = (): React.CSSProperties | undefined => {
    if (gameState !== "revealed" || !hasVoted || isWinner || isSpecial) {
      return undefined;
    }

    // Interpolate from blue to yellow without passing through green or purple.
    // Use color mixing: start with pure blue, gradually desaturate and shift
    // toward yellow by blending RGB values directly via HSL tricks.
    // Blue (hue 220) at ratio 0, then desaturate toward neutral, then yellow (hue 45) at ratio 1.
    // Split into two phases:
    //   0–0.5: blue (220) → desaturated steel blue (210), saturation drops
    //   0.5–1: warm neutral (50) → yellow (45), saturation rises
    let hue: number;
    let sat: number;
    if (distanceRatio <= 0.5) {
      // Blue phase: stay in blue range, reduce saturation to fade toward neutral
      const t = distanceRatio / 0.5;
      hue = Math.round(220 - 10 * t); // 220 → 210
      sat = Math.round(60 - 30 * t); // 60% → 30% (fading blue)
    } else {
      // Yellow phase: emerge from neutral into warm yellow
      const t = (distanceRatio - 0.5) / 0.5;
      hue = Math.round(55 - 10 * t); // 55 → 45
      sat = Math.round(30 + 60 * t); // 30% → 90% (vivid yellow)
    }
    // Lightness: consistent for readability on dark bg
    const light = Math.round(65 - 3 * distanceRatio);

    return {
      "--card-distance-hue": `${hue}`,
      "--card-distance-sat": `${sat}%`,
      "--card-distance-light": `${light}%`,
    } as React.CSSProperties;
  };

  return (
    <div
      className={getCardClassName()}
      aria-label={getAriaLabel()}
      style={getDistanceStyle()}
    >
      <div className="player-card__inner">
        {/* Front face: shown during voting (face-down card) */}
        <div className="player-card__front">
          {hasVoted ? (
            <span className="player-card__back-icon">✓</span>
          ) : (
            <span className="player-card__placeholder">?</span>
          )}
        </div>

        {/* Back face: shown after flip (revealed value) */}
        <div className="player-card__back-face">
          {hasVoted ? (
            <span className="player-card__value">{voteValue}</span>
          ) : (
            <span className="player-card__placeholder">?</span>
          )}
        </div>
      </div>

      {gameState === "revealed" && wasChanged && (
        <span
          className="player-card__changed-indicator"
          title="Vote was changed"
          aria-label="Vote was changed"
        >
          ✏️
        </span>
      )}
    </div>
  );
}
