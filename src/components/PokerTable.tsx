import type { Player, Vote, GameState, CardValue } from "../types";
import { PlayerCard } from "./PlayerCard";
import "./PokerTable.css";

export interface PokerTableProps {
  players: Player[];
  votes: Vote[];
  gameState: GameState;
  isAdmin: boolean;
  isEditing: boolean;
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

export function PokerTable({
  players,
  votes,
  gameState,
  isAdmin,
  isEditing,
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
    if (gameState !== "revealed" || votes.length === 0) {
      return { winningCards: new Set(), winningNumeric: null, maxDistance: 0 };
    }

    // Count votes per card
    const counts = new Map<CardValue, number>();
    for (const vote of votes) {
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

  const isSpecialCard = (card: CardValue): boolean => {
    return card === "?" || card === "☕";
  };

  const isWinnerCard = (card: CardValue): boolean => {
    return winningCards.has(card);
  };

  // Distribute players into slots: top row, right side (1 max), bottom row, left side (1 max)
  // Order: top row first, then right, then bottom, then left
  const getSlots = (total: number) => {
    if (total <= 1) return { top: total, right: 0, bottom: 0, left: 0 };
    if (total === 2) return { top: 1, right: 0, bottom: 1, left: 0 };
    if (total === 3) return { top: 1, right: 1, bottom: 1, left: 0 };
    if (total === 4) return { top: 1, right: 1, bottom: 1, left: 1 };
    // 5+: fill left and right with 1 each, split the rest between top and bottom
    const remaining = total - 2;
    const topCount = Math.ceil(remaining / 2);
    const bottomCount = Math.floor(remaining / 2);
    return { top: topCount, right: 1, bottom: bottomCount, left: 1 };
  };

  const getPlayerPosition = (index: number, total: number) => {
    const slots = getSlots(total);

    // Assign player to a slot region
    let region: "top" | "right" | "bottom" | "left";
    let posInRegion: number;
    let regionCount: number;

    if (index < slots.top) {
      region = "top";
      posInRegion = index;
      regionCount = slots.top;
    } else if (index < slots.top + slots.right) {
      region = "right";
      posInRegion = index - slots.top;
      regionCount = slots.right;
    } else if (index < slots.top + slots.right + slots.bottom) {
      region = "bottom";
      posInRegion = index - slots.top - slots.right;
      regionCount = slots.bottom;
    } else {
      region = "left";
      posInRegion = index - slots.top - slots.right - slots.bottom;
      regionCount = slots.left;
    }

    // Calculate position based on region
    switch (region) {
      case "top": {
        const spacing = 100 / (regionCount + 1);
        return { left: `${spacing * (posInRegion + 1)}%`, top: "0%" };
      }
      case "bottom": {
        const spacing = 100 / (regionCount + 1);
        return { left: `${spacing * (posInRegion + 1)}%`, top: "100%" };
      }
      case "left":
        return { left: "0%", top: "50%" };
      case "right":
        return { left: "100%", top: "50%" };
    }
  };

  // Scale the layout size based on player count
  const playerCount = players.length;
  const layoutWidth = Math.min(800, Math.max(420, 320 + playerCount * 45));
  const layoutHeight = Math.min(400, Math.max(260, 220 + playerCount * 20));

  return (
    <div className="poker-table" role="region" aria-label="Poker table">
      <div
        className="poker-table__layout"
        style={{ width: `${layoutWidth}px`, height: `${layoutHeight}px` }}
      >
        {/* Players positioned in slots around the table */}
        {players.map((player, index) => {
          const pos = getPlayerPosition(index, players.length);
          return (
            <div
              key={player.id}
              className="poker-table__player"
              style={{ left: pos.left, top: pos.top }}
            >
              <div className="poker-table__player-info">
                <span className="poker-table__player-name">
                  {player.displayName}
                </span>
                {player.isAdmin && (
                  <span className="poker-table__admin-badge" aria-label="Admin">
                    ★
                  </span>
                )}
                {isAdmin && !player.isAdmin && (
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
              <PlayerCard
                gameState={gameState}
                hasVoted={hasVoted(player.id)}
                voteValue={getVoteValue(player.id)}
                wasChanged={votesChanged.has(player.id)}
                playerName={player.displayName}
                isWinner={
                  gameState === "revealed" && hasVoted(player.id)
                    ? isWinnerCard(getVoteValue(player.id)!)
                    : false
                }
                isSpecial={
                  gameState === "revealed" && hasVoted(player.id)
                    ? isSpecialCard(getVoteValue(player.id)!)
                    : false
                }
                distanceRatio={
                  gameState === "revealed" && hasVoted(player.id)
                    ? getDistanceRatio(getVoteValue(player.id)!)
                    : 0
                }
              />
            </div>
          );
        })}

        {/* Table surface with controls in the center */}
        <div
          className="poker-table__surface"
          style={{
            width: `${Math.min(layoutWidth * 0.55, 500)}px`,
            height: `${Math.min(layoutHeight * 0.5, 180)}px`,
          }}
        >
          {isAdmin && (
            <div className="poker-table__controls">
              {gameState === "waiting" && (
                <button
                  className="poker-table__action-btn"
                  onClick={onStartNewVoting}
                  aria-label="Start Voting"
                >
                  Start Voting
                </button>
              )}
              {gameState === "voting" && (
                <button
                  className="poker-table__action-btn"
                  onClick={onRevealCards}
                  aria-label="Reveal Cards"
                >
                  Reveal Cards
                </button>
              )}
              {gameState === "revealed" && (
                <button
                  className="poker-table__action-btn"
                  onClick={onStartNewVoting}
                  aria-label="Start New Voting"
                >
                  Start New Voting
                </button>
              )}
            </div>
          )}
          {!isAdmin && gameState === "waiting" && (
            <div className="poker-table__status">
              Waiting for voting to begin...
            </div>
          )}
          {!isAdmin && gameState === "voting" && (
            <div className="poker-table__status">Pick your estimate</div>
          )}
        </div>
      </div>
    </div>
  );
}
