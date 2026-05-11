import type { CardValue, GameState } from "../types";
import "./CardSelectionPanel.css";

export interface CardSelectionProps {
  cards: CardValue[];
  selectedCard: CardValue | null;
  gameState: GameState;
  isEditing: boolean;
  voteDistribution: Map<CardValue, number> | null;
  averageScore?: number | null;
  agreementRatio?: number;
  onSelectCard: (card: CardValue) => void;
  onDeselectCard: () => void;
}

export function CardSelectionPanel({
  cards,
  selectedCard,
  gameState,
  isEditing,
  voteDistribution,
  averageScore,
  agreementRatio,
  onSelectCard,
  onDeselectCard,
}: CardSelectionProps) {
  // Panel is always visible except during initial "waiting" state with no session
  const isVisible =
    gameState === "waiting" ||
    gameState === "voting" ||
    gameState === "revealed";

  if (!isVisible) {
    return null;
  }

  // Cards are clickable during voting, or during revealed when editing
  const isClickable =
    gameState === "voting" || (gameState === "revealed" && isEditing);

  // Show results bars when in revealed state and we have distribution data
  const showBars =
    gameState === "revealed" && voteDistribution && voteDistribution.size > 0;
  const maxCount = showBars
    ? Math.max(...Array.from(voteDistribution!.values()))
    : 0;

  // Show stats when revealed
  const showStats =
    gameState === "revealed" && voteDistribution && voteDistribution.size > 0;

  // SVG donut chart
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const ratio = agreementRatio ?? 0;
  const filledLength = circumference * ratio;
  const emptyLength = circumference - filledLength;

  const handleCardClick = (card: CardValue) => {
    if (!isClickable) return;
    if (card === selectedCard) {
      onDeselectCard();
    } else {
      onSelectCard(card);
    }
  };

  return (
    <div
      className="card-selection-panel"
      role="group"
      aria-label="Card selection"
    >
      {isEditing && gameState === "revealed" && (
        <div className="card-selection-panel__editing-label">
          Editing your vote...
        </div>
      )}
      <div className="card-selection-panel__content">
        <div className="card-selection-panel__cards">
          {cards.map((card) => {
            const isSelected = card === selectedCard;
            const count = voteDistribution?.get(card) ?? 0;
            const isHighlight = showBars && count === maxCount && count > 0;
            const barHeight =
              showBars && maxCount > 0 ? (count / maxCount) * 100 : 0;
            const hasNoVotes = showBars && count === 0;

            // Hide no-vote cards in revealed state unless editing
            if (hasNoVotes && !isEditing) {
              return null;
            }

            return (
              <div key={String(card)} className="card-selection-panel__column">
                <div
                  className="card-selection-panel__bar-wrapper"
                  style={{ visibility: showBars ? "visible" : "hidden" }}
                >
                  <span className="card-selection-panel__vote-count">
                    {count > 0 ? count : ""}
                  </span>
                  <div className="card-selection-panel__bar-track">
                    <div
                      className={`card-selection-panel__bar-fill${isHighlight ? " card-selection-panel__bar-fill--highlight" : ""}`}
                      style={{ height: `${barHeight}%` }}
                      aria-label={
                        count > 0
                          ? `${String(card)}: ${count} vote${count !== 1 ? "s" : ""}`
                          : undefined
                      }
                    />
                  </div>
                </div>
                <button
                  className={[
                    "card-selection-panel__card",
                    isSelected ? "card-selection-panel__card--selected" : "",
                    isHighlight ? "card-selection-panel__card--highlight" : "",
                    showBars && !isEditing && !isHighlight
                      ? "card-selection-panel__card--dim"
                      : "",
                    !isClickable && gameState === "waiting"
                      ? "card-selection-panel__card--disabled"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handleCardClick(card)}
                  aria-label={`Select card ${card}`}
                  aria-pressed={isSelected}
                  type="button"
                  disabled={!isClickable}
                >
                  {card}
                </button>
              </div>
            );
          })}
        </div>

        {showStats && (
          <div className="card-selection-panel__stats">
            <div className="card-selection-panel__stat">
              <span className="card-selection-panel__stat-label">Average</span>
              <span className="card-selection-panel__stat-value">
                {averageScore !== null && averageScore !== undefined
                  ? averageScore.toFixed(1)
                  : "N/A"}
              </span>
            </div>
            <div className="card-selection-panel__stat">
              <span className="card-selection-panel__stat-label">
                Agreement
              </span>
              <div
                className="card-selection-panel__donut"
                role="img"
                aria-label={`Agreement ratio: ${Math.round(ratio * 100)}%`}
              >
                <svg viewBox="0 0 52 52" width="44" height="44">
                  <circle
                    className="card-selection-panel__donut-ring"
                    cx="26"
                    cy="26"
                    r={radius}
                  />
                  <circle
                    className="card-selection-panel__donut-fill"
                    cx="26"
                    cy="26"
                    r={radius}
                    strokeDasharray={`${filledLength} ${emptyLength}`}
                  />
                </svg>
                <span className="card-selection-panel__donut-text">
                  {Math.round(ratio * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
