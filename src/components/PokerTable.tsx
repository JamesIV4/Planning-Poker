import { useState, useEffect, useRef } from "react";
import type { Player, Vote, GameState, CardValue } from "../types";
import { PlayerCard } from "./PlayerCard";
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

  // Distribute players into slots around the table.
  // In landscape: top/bottom are the long sides, left/right are short.
  // In portrait: left/right are the long sides, top/bottom are short.
  const getSlots = (total: number, maxSide: number, portrait: boolean) => {
    if (total <= 1) return { top: total, right: 0, bottom: 0, left: 0 };
    if (total === 2) {
      return portrait
        ? {
            top: 0,
            right: 0,
            bottom: 0,
            left: 1,
            leftPlayers: 1,
            rightPlayers: 1,
          }
        : { top: 1, right: 0, bottom: 1, left: 0 };
    }
    if (total === 3) {
      return portrait
        ? { top: 1, right: 1, bottom: 1, left: 0 }
        : { top: 1, right: 1, bottom: 1, left: 0 };
    }
    if (total === 4) return { top: 1, right: 1, bottom: 1, left: 1 };

    if (portrait) {
      // Portrait: left/right are the long sides, top/bottom are short.
      // Top/bottom can fit 2-3 cards across the narrow width — use them early.
      const tbByCount = total >= 10 ? 3 : total >= 5 ? 2 : 1;
      const topCount = tbByCount;
      const bottomCount = tbByCount;
      const remaining = total - topCount - bottomCount;
      const leftCount = Math.ceil(remaining / 2);
      const rightCount = Math.floor(remaining / 2);
      return {
        top: topCount,
        right: rightCount,
        bottom: bottomCount,
        left: leftCount,
      };
    } else {
      // Landscape: top/bottom are the long sides, left/right are short
      const sideByCount = total >= 10 ? 3 : total >= 5 ? 2 : 1;
      const sideMax = Math.min(maxSide, sideByCount);
      const leftCount = sideMax;
      const rightCount = sideMax;
      const remaining = total - leftCount - rightCount;
      const topCount = Math.ceil(remaining / 2);
      const bottomCount = Math.floor(remaining / 2);
      return {
        top: topCount,
        right: rightCount,
        bottom: bottomCount,
        left: leftCount,
      };
    }
  };

  const getPlayerPosition = (
    index: number,
    total: number,
    maxSide: number,
    portrait: boolean,
  ) => {
    const slots = getSlots(total, maxSide, portrait);

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
        const usableWidth = 84;
        const offset = (100 - usableWidth) / 2;
        const spacing = usableWidth / (regionCount + 1);
        return {
          left: `${offset + spacing * (posInRegion + 1)}%`,
          top: "0%",
        };
      }
      case "bottom": {
        const usableWidth = 84;
        const offset = (100 - usableWidth) / 2;
        const spacing = usableWidth / (regionCount + 1);
        return {
          left: `${offset + spacing * (posInRegion + 1)}%`,
          top: "100%",
        };
      }
      case "left": {
        const usableHeight = 100;
        const vOffset = 0;
        const spacing = usableHeight / (regionCount + 1);
        return { left: "5%", top: `${vOffset + spacing * (posInRegion + 1)}%` };
      }
      case "right": {
        const usableHeight = 100;
        const vOffset = 0;
        const spacing = usableHeight / (regionCount + 1);
        return {
          left: "95%",
          top: `${vOffset + spacing * (posInRegion + 1)}%`,
        };
      }
    }
  };

  // Scale the layout based on player count
  const playerCount = players.length;

  // Detect available space to decide layout orientation and slot distribution
  const containerRef = useRef<HTMLDivElement>(null);
  const [useCompactLayout, setUseCompactLayout] = useState(false);
  const [availableHeight, setAvailableHeight] = useState(600);
  const [availableWidth, setAvailableWidth] = useState(800);
  const isPortrait = availableWidth < 500;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const containerWidth = entry.contentRect.width;
        const containerHeight = entry.contentRect.height;
        setAvailableHeight(containerHeight);
        setAvailableWidth(containerWidth);

        const portrait = containerWidth < 500;

        // Determine max side slots based on available space
        const currentMaxSide = portrait
          ? containerHeight < 500
            ? 2
            : 3
          : containerHeight < 350
            ? 2
            : 3;
        const currentSlots = getSlots(playerCount, currentMaxSide, portrait);
        const currentMaxRow = Math.max(currentSlots.top, currentSlots.bottom);

        // Switch to compact grid only as a last resort
        const longSideCount = portrait
          ? Math.max(currentSlots.left, currentSlots.right)
          : currentMaxRow;
        const minNeeded = portrait
          ? longSideCount * 100 + 80 // vertical space needed
          : currentMaxRow * 75 + 80; // horizontal space needed
        const available = portrait ? containerHeight : containerWidth;
        setUseCompactLayout(available < minNeeded && playerCount > 5);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [playerCount]);

  // In portrait mode, allow more side slots and fewer top/bottom
  // In landscape, cap at 2 when height is tight (mobile landscape)
  const maxSideSlots = isPortrait
    ? availableHeight < 500
      ? 2
      : 3
    : availableHeight < 350
      ? 2
      : 3;

  const slots = getSlots(playerCount, maxSideSlots, isPortrait);
  const maxRowCount = Math.max(slots.top, slots.bottom);
  const hasSidePlayers = slots.left > 0 || slots.right > 0;

  // In portrait: make the table tall and narrow. In landscape: wide and shorter.
  let layoutWidth: number;
  let layoutHeight: number;

  if (isPortrait) {
    // Portrait: height-dominant layout — use all available space
    layoutWidth = Math.max(280, availableWidth - 20);
    // Use the actual available height, minimal buffer to maximize side card spacing
    layoutHeight = Math.max(300, availableHeight - 10);
  } else {
    // Landscape: width-dominant layout
    const idealSpacing = 130;
    layoutWidth = Math.max(400, maxRowCount * idealSpacing + 140);
    // Leave room for cards extending beyond layout edges (translate -50%)
    layoutHeight = Math.max(200, availableHeight - 80);
  }

  // Scale cards down if the layout is too tight.
  // Check both vertical (for side cards) and overall height (for landscape with stacked rows).
  const sideCount = Math.max(slots.left, slots.right);
  const verticalSpacePerSideCard =
    sideCount > 0 ? layoutHeight / (sideCount + 1) : 999;

  // In landscape, if layout height is short, scale to fit top/bottom rows + table
  // Each row needs ~100px (card + name), two rows + table + gaps need ~350px minimum
  const landscapeHeightScale =
    !isPortrait && layoutHeight < 380 ? Math.max(0.35, layoutHeight / 550) : 1;

  const sideScale =
    verticalSpacePerSideCard < 120
      ? Math.max(0.55, verticalSpacePerSideCard / 140)
      : 1;

  const verticalScale = Math.min(sideScale, landscapeHeightScale);
  const cardWidth = Math.round(60 * verticalScale);
  const cardHeight = Math.round(84 * verticalScale);
  const nameSize = `${Math.max(0.5, 0.75 * verticalScale)}rem`;
  const valueSize = `${Math.max(0.7, 1.25 * verticalScale)}rem`;

  const layoutStyle: React.CSSProperties = {
    width: `min(${layoutWidth}px, 100%)`,
    height: `${layoutHeight}px`,
    "--card-width": `${cardWidth}px`,
    "--card-height": `${cardHeight}px`,
    "--player-name-size": nameSize,
    "--card-value-size": valueSize,
    "--table-surface-width": isPortrait
      ? "55%"
      : hasSidePlayers
        ? "65%"
        : "75%",
    "--table-surface-height": isPortrait ? "65%" : "50%",
  } as React.CSSProperties;

  // Render a player card with all its props (shared between layouts)
  const renderPlayer = (player: Player) => (
    <div key={player.id} className="poker-table__grid-player">
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
      <span className="poker-table__grid-name">{player.displayName}</span>
    </div>
  );

  // Compact grid layout for narrow screens
  if (useCompactLayout) {
    return (
      <div
        className="poker-table poker-table--compact"
        role="region"
        aria-label="Poker table"
        ref={containerRef}
      >
        <div className="poker-table__compact-controls">
          {isAdmin && gameState === "waiting" && (
            <button
              className="poker-table__action-btn"
              onClick={onStartNewVoting}
            >
              Start Voting
            </button>
          )}
          {isAdmin && gameState === "voting" && (
            <button className="poker-table__action-btn" onClick={onRevealCards}>
              Reveal Cards
            </button>
          )}
          {isAdmin && gameState === "revealed" && (
            <button
              className="poker-table__action-btn"
              onClick={onStartNewVoting}
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
        </div>
        <div
          className="poker-table__grid"
          style={
            {
              "--card-width": `${cardWidth}px`,
              "--card-height": `${cardHeight}px`,
              "--card-value-size": valueSize,
            } as React.CSSProperties
          }
        >
          {players.map(renderPlayer)}
        </div>
      </div>
    );
  }

  return (
    <div
      className="poker-table"
      role="region"
      aria-label="Poker table"
      ref={containerRef}
    >
      <div className="poker-table__layout" style={layoutStyle}>
        {/* Players positioned in slots around the table */}
        {players.map((player, index) => {
          const pos = getPlayerPosition(
            index,
            players.length,
            maxSideSlots,
            isPortrait,
          );
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
        <div className="poker-table__surface">
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
