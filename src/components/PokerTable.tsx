import { useState, useEffect, useRef } from "react";
import type { Player, Vote, GameState, CardValue } from "../types";
import { COFFEE_CARD } from "../types";
import { PlayerCard } from "./PlayerCard";
import type { PlayerCardProps } from "./PlayerCard";
import "./PokerTable.css";

export interface PokerTableProps {
  players: Player[];
  votes: Vote[];
  gameState: GameState;
  isAdmin: boolean;
  isEditing: boolean;
  isEditingParticipants: boolean;
  currentPlayerId: string;
  votesChanged: Set<string>;
  onRevealCards: () => void;
  onStartNewVoting: () => void;
  onEditVote: () => void;
  onKickPlayer: (playerId: string) => void;
}

/** Numeric value of a card for distance calculation. Special cards return null. */
function numericValue(card: CardValue): number | null {
  if (typeof card === "number") return card;
  return null;
}

// --- Layout geometry constants (unscaled, in px) -------------------------
// The table view is a 3x3 grid: an outer band of player cards (top / bottom /
// left / right) surrounding a central table surface. A single grid `gap`
// keeps the spacing between the table and every surrounding card identical.
const CARD_W = 64; // player card width
const CARD_H = 90; // player card height
const NAME_H = 24; // name label above/below a card
// Breathing room between the table and every surrounding card. Applied as the
// grid gap, so it is identical on all four sides. Single tunable knob for how
// much space frames the table — larger value = smaller table, more room.
const GAP = 28;
const BAND_H = CARD_H + NAME_H; // height reserved for a top/bottom card + name
// Minimum footprint a single card needs along a table edge, so cards on the
// same side never crowd each other. Drives how the table grows with players.
// SLOT_W is a fixed, name-independent width for each top/bottom seat: every
// seat is exactly this wide, so cards stay evenly spaced no matter how long a
// player's name is. The card is 64px, so this leaves a 30px minimum gutter
// between cards (~50% more breathing room than before).
const SLOT_W = CARD_W + 30; // horizontal footprint per top/bottom card
const SLOT_H = CARD_H + NAME_H + 14; // vertical footprint per side card
// Base table size at low player counts. Landscape on desktop, portrait on
// narrow screens. MIN_ASPECT keeps the surface from drifting toward square as
// it grows to fit more side players.
const BASE_W_LANDSCAPE = 360;
const BASE_H_LANDSCAPE = 200;
const BASE_W_PORTRAIT = 200;
const BASE_H_PORTRAIT = 340;
const MIN_ASPECT = 1.6; // long-side / short-side floor
// How strongly the long sides (top/bottom on desktop) are favored over the
// short sides when seating players. 1 = perfectly even all around; higher =
// more players pile onto the long sides before the short sides fill. Tunable.
const SIDE_WEIGHT = 1.5;
// Hard cap on players per short side. Once both short sides are full, extra
// players only ever extend the long sides, growing the table horizontally.
const SIDE_MAX = 3;
// When fitting the layout to the container requires scaling below this, the
// table view is too cramped to be comfortable and we fall back to the compact
// grid instead. Tunable.
const COMFORT_SCALE = 0.6;

interface Slots {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Seat players around the table one at a time, each going to the least-loaded
 * side. Short-side placements are penalized by SIDE_WEIGHT, so the long sides
 * (top/bottom on desktop) accrue players faster while the short sides still
 * start filling early — e.g. a 4th player lands on a short side, giving one
 * voter on each side, rather than packing everyone onto top/bottom.
 *
 * Empty sides always have zero cost, so the first four players form a balanced
 * diamond; beyond that the weight biases growth toward the long sides. The
 * short sides are capped at SIDE_MAX, after which every extra player extends
 * the long sides and the table simply grows wider.
 */
function getSlots(total: number, portrait: boolean): Slots {
  // Long sides are top/bottom in landscape, left/right in portrait.
  const long = portrait
    ? (["left", "right"] as const)
    : (["top", "bottom"] as const);
  const short = portrait
    ? (["top", "bottom"] as const)
    : (["left", "right"] as const);
  const isShort = (side: keyof Slots) => side === short[0] || side === short[1];

  const counts: Slots = { top: 0, right: 0, bottom: 0, left: 0 };
  // Fill order for tie-breaking: long sides first, then short sides.
  const order = [long[0], long[1], short[0], short[1]] as const;

  for (let placed = 0; placed < total; placed++) {
    let best: keyof Slots | null = null;
    let bestCost = Infinity;
    for (const side of order) {
      if (isShort(side) && counts[side] >= SIDE_MAX) continue; // side is full
      const cost = counts[side] * (isShort(side) ? SIDE_WEIGHT : 1);
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        best = side;
      }
    }
    // Once the short sides are capped, only the long sides remain eligible.
    counts[best ?? order[0]]++;
  }

  return counts;
}

/** Split the ordered player list into the four bands per the slot counts. */
function bucketPlayers(players: Player[], slots: Slots) {
  const topEnd = slots.top;
  const rightEnd = topEnd + slots.right;
  const bottomEnd = rightEnd + slots.bottom;
  return {
    top: players.slice(0, topEnd),
    right: players.slice(topEnd, rightEnd),
    bottom: players.slice(rightEnd, bottomEnd),
    left: players.slice(bottomEnd, bottomEnd + slots.left),
  };
}

interface LayoutResult {
  slots: Slots;
  scale: number;
  tableW: number; // unscaled
  tableH: number; // unscaled
}

/**
 * Compute the table dimensions and a fit-to-container scale.
 * The table grows only as more players require more room along an edge, so it
 * never shrinks when side players first appear and grows in smooth steps.
 */
function computeLayout(
  count: number,
  availW: number,
  availH: number,
  portrait: boolean,
): LayoutResult {
  const slots = getSlots(count, portrait);
  const rowCards = Math.max(slots.top, slots.bottom); // along top/bottom
  const sideCards = Math.max(slots.left, slots.right); // along left/right

  let tableW = Math.max(
    portrait ? BASE_W_PORTRAIT : BASE_W_LANDSCAPE,
    rowCards * SLOT_W,
  );
  let tableH = Math.max(
    portrait ? BASE_H_PORTRAIT : BASE_H_LANDSCAPE,
    sideCards * SLOT_H,
  );

  // Keep the surface unmistakably landscape (desktop) / portrait (narrow).
  if (portrait) {
    tableH = Math.max(tableH, tableW * MIN_ASPECT);
  } else {
    tableW = Math.max(tableW, tableH * MIN_ASPECT);
  }

  const layoutW = tableW + 2 * (CARD_W + GAP);
  const layoutH = tableH + 2 * (BAND_H + GAP);

  const scale = Math.min(
    1,
    availW > 0 ? availW / layoutW : 1,
    availH > 0 ? availH / layoutH : 1,
  );

  return { slots, scale, tableW, tableH };
}

export function PokerTable({
  players,
  votes,
  gameState,
  isAdmin,
  isEditing,
  isEditingParticipants,
  currentPlayerId,
  votesChanged,
  onRevealCards,
  onStartNewVoting,
  onEditVote,
  onKickPlayer,
}: PokerTableProps) {
  const hasVoted = (playerId: string): boolean => {
    return votes.some((v) => v.playerId === playerId);
  };

  const getVoteValue = (playerId: string): CardValue | null => {
    const vote = votes.find((v) => v.playerId === playerId);
    return vote ? vote.card : null;
  };

  // Determine the winning card(s) (mode — most voted cards)
  const getWinnerInfo = (): {
    winningCards: Set<CardValue>;
    winningNumeric: number | null;
    maxDistance: number;
  } => {
    // Coffee (away) players are ignored when determining the winner/spread.
    const countedVotes = votes.filter((v) => v.card !== COFFEE_CARD);
    if (gameState !== "revealed" || countedVotes.length === 0) {
      return { winningCards: new Set(), winningNumeric: null, maxDistance: 0 };
    }

    // Count votes per card
    const counts = new Map<CardValue, number>();
    for (const vote of countedVotes) {
      counts.set(vote.card, (counts.get(vote.card) ?? 0) + 1);
    }

    // Find the max vote count
    let maxCount = 0;
    for (const count of counts.values()) {
      if (count > maxCount) {
        maxCount = count;
      }
    }

    // Collect all cards that share the max count
    const winningCards = new Set<CardValue>();
    for (const [card, count] of counts) {
      if (count === maxCount) {
        winningCards.add(card);
      }
    }

    // Use the first numeric winner for distance calculation
    let winningNumeric: number | null = null;
    for (const card of winningCards) {
      const val = numericValue(card);
      if (val !== null) {
        winningNumeric = val;
        break;
      }
    }

    // Calculate max distance among all numeric votes from the winning numeric
    let maxDist = 0;
    if (winningNumeric !== null) {
      for (const vote of votes) {
        const val = numericValue(vote.card);
        if (val !== null) {
          maxDist = Math.max(maxDist, Math.abs(val - winningNumeric));
        }
      }
    }

    return { winningCards, winningNumeric, maxDistance: maxDist };
  };

  const { winningCards, winningNumeric, maxDistance } = getWinnerInfo();

  /** Get continuous distance ratio (0–1) for a given card value relative to the winner. */
  const getDistanceRatio = (card: CardValue): number => {
    if (winningNumeric === null) return 0.5;
    const val = numericValue(card);
    if (val === null) return 0; // Special cards handled separately

    const dist = Math.abs(val - winningNumeric);
    if (maxDistance === 0) return 0;
    return dist / maxDistance;
  };

  // Only "?" is a special (blue) card. Coffee is handled as "ignored" instead,
  // so an away player's card is left visually neutral.
  const isSpecialCard = (card: CardValue): boolean => {
    return card === "?";
  };

  const isIgnoredCard = (card: CardValue): boolean => {
    return card === COFFEE_CARD;
  };

  const isWinnerCard = (card: CardValue): boolean => {
    return winningCards.has(card);
  };

  /**
   * Card props for one player, shared by the table and compact layouts.
   *
   * While the current player is editing their post-reveal vote, their own card
   * drops back to the un-voted look so it reads as "re-picking" — everyone
   * else's card stays revealed. The stored vote is untouched, so cancelling the
   * edit flips the card straight back to its value.
   */
  const cardPropsFor = (player: Player): PlayerCardProps => {
    const isReVoting =
      gameState === "revealed" && isEditing && player.id === currentPlayerId;

    if (isReVoting) {
      return {
        gameState: "voting",
        hasVoted: false,
        voteValue: null,
        wasChanged: false,
        playerName: player.displayName,
      };
    }

    const voteValue = getVoteValue(player.id);
    const isRevealedVote = gameState === "revealed" && voteValue !== null;

    return {
      gameState,
      hasVoted: hasVoted(player.id),
      voteValue,
      wasChanged: votesChanged.has(player.id),
      playerName: player.displayName,
      isWinner: isRevealedVote && isWinnerCard(voteValue),
      isSpecial: isRevealedVote && isSpecialCard(voteValue),
      isIgnored: isRevealedVote && isIgnoredCard(voteValue),
      distanceRatio: isRevealedVote ? getDistanceRatio(voteValue) : 0,
    };
  };

  const playerCount = players.length;

  // Measure the available space so the layout can fit itself to the container.
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState(600);
  const [availableWidth, setAvailableWidth] = useState(1000);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setAvailableWidth(entry.contentRect.width);
        setAvailableHeight(entry.contentRect.height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isPortrait = availableWidth > 0 && availableWidth < 500;

  // Small inset so the layout never touches the container edges.
  const { slots, scale, tableW, tableH } = computeLayout(
    playerCount,
    availableWidth - 16,
    availableHeight - 16,
    isPortrait,
  );

  // Expanding the table horizontally keeps things comfortable up to a point.
  // Once fitting to the container forces the cards below a comfortable size,
  // fall back to the plain grid instead.
  const useCompactLayout = playerCount > 4 && scale < COMFORT_SCALE;

  // Scaled pixel values fed to the grid via CSS custom properties.
  const s = scale;
  const cardW = Math.round(CARD_W * s);
  const cardH = Math.round(CARD_H * s);
  const bandH = Math.round(BAND_H * s);
  const gap = Math.max(6, Math.round(GAP * s));
  const nameSize = `${Math.max(0.55, 0.75 * s)}rem`;
  const valueSize = `${Math.max(0.7, 1.25 * s)}rem`;

  const layoutStyle: React.CSSProperties = {
    "--side-w": `${cardW}px`,
    "--band-h": `${bandH}px`,
    "--slot-w": `${Math.round(SLOT_W * s)}px`,
    "--table-gap": `${gap}px`,
    "--table-w": `${Math.round(tableW * s)}px`,
    "--table-h": `${Math.round(tableH * s)}px`,
    "--card-width": `${cardW}px`,
    "--card-height": `${cardH}px`,
    "--player-name-size": nameSize,
    "--card-value-size": valueSize,
  } as React.CSSProperties;

  // Render one player: name/badges plus the card. Band CSS controls whether the
  // name sits above (top/left/right) or below (bottom) so the card always abuts
  // the table with the uniform gap.
  const renderSlotPlayer = (player: Player) => (
    <div key={player.id} className="poker-table__player">
      <div className="poker-table__player-info">
        <span className="poker-table__player-name">{player.displayName}</span>
        {player.isAdmin && (
          <span className="poker-table__admin-badge" aria-label="Admin">
            ★
          </span>
        )}
        {isEditingParticipants && !player.isAdmin && (
          <button
            className="poker-table__kick-btn"
            onClick={() => onKickPlayer(player.id)}
            title="Remove player"
            aria-label={`Remove ${player.displayName}`}
          >
            ✕
          </button>
        )}
        {gameState === "revealed" && player.id === currentPlayerId && (
          <button
            className={`poker-table__edit-btn${isEditing ? " poker-table__edit-btn--active" : ""}`}
            onClick={onEditVote}
            title={isEditing ? "Cancel editing" : "Edit vote"}
            aria-label={isEditing ? "Cancel editing" : "Edit vote"}
            aria-pressed={isEditing}
          >
            {isEditing ? "✓" : "✏️"}
          </button>
        )}
      </div>
      <PlayerCard {...cardPropsFor(player)} />
    </div>
  );

  // Render a player for the compact grid fallback (name below the card).
  const renderGridPlayer = (player: Player) => (
    <div key={player.id} className="poker-table__grid-player">
      <PlayerCard {...cardPropsFor(player)} />
      <span className="poker-table__grid-name">{player.displayName}</span>
    </div>
  );

  // Center-table controls, shared between the surface and compact layouts.
  const renderControls = () => (
    <>
      {isAdmin && gameState === "waiting" && (
        <button
          className="poker-table__action-btn"
          onClick={onStartNewVoting}
          aria-label="Start Voting"
        >
          Start Voting
        </button>
      )}
      {isAdmin && gameState === "voting" && (
        <button
          className="poker-table__action-btn"
          onClick={onRevealCards}
          aria-label="Reveal Cards"
        >
          Reveal Cards
        </button>
      )}
      {isAdmin && gameState === "revealed" && (
        <button
          className="poker-table__action-btn"
          onClick={onStartNewVoting}
          aria-label="Start New Voting"
        >
          Start New Voting
        </button>
      )}
      {!isAdmin && gameState === "waiting" && (
        <div className="poker-table__status">
          Waiting for voting to begin...
        </div>
      )}
      {!isAdmin && gameState === "voting" && (
        <div className="poker-table__status">Pick your estimate</div>
      )}
    </>
  );

  // Compact grid layout for narrow screens or very large groups.
  if (useCompactLayout) {
    return (
      <div
        className="poker-table poker-table--compact"
        role="region"
        aria-label="Poker table"
        ref={containerRef}
      >
        <div className="poker-table__compact-controls">{renderControls()}</div>
        <div
          className="poker-table__grid"
          style={
            {
              "--card-width": `${cardW}px`,
              "--card-height": `${cardH}px`,
              "--card-value-size": valueSize,
            } as React.CSSProperties
          }
        >
          {players.map(renderGridPlayer)}
        </div>
      </div>
    );
  }

  const buckets = bucketPlayers(players, slots);

  return (
    <div
      className="poker-table"
      role="region"
      aria-label="Poker table"
      ref={containerRef}
    >
      <div className="poker-table__layout" style={layoutStyle}>
        <div className="poker-table__band poker-table__band--top">
          {buckets.top.map(renderSlotPlayer)}
        </div>
        <div className="poker-table__band poker-table__band--left">
          {buckets.left.map(renderSlotPlayer)}
        </div>

        <div className="poker-table__surface">
          <div className="poker-table__controls">{renderControls()}</div>
        </div>

        <div className="poker-table__band poker-table__band--right">
          {buckets.right.map(renderSlotPlayer)}
        </div>
        <div className="poker-table__band poker-table__band--bottom">
          {buckets.bottom.map(renderSlotPlayer)}
        </div>
      </div>
    </div>
  );
}
