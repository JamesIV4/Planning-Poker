import type { CardValue } from "../types";
import "./ResultsDisplay.css";

export interface ResultsDisplayProps {
  voteDistribution: Map<CardValue, number>;
  averageScore: number | null;
  agreementRatio: number;
  totalVoters: number;
}

export function ResultsDisplay({
  voteDistribution,
  averageScore,
  agreementRatio,
  totalVoters,
}: ResultsDisplayProps) {
  // Don't render if there are no votes
  if (totalVoters === 0 || voteDistribution.size === 0) {
    return null;
  }

  // Get entries sorted by count descending (only cards with votes)
  const entries = Array.from(voteDistribution.entries())
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  // Find the maximum vote count for highlighting
  const maxCount = Math.max(...entries.map(([, count]) => count));

  // SVG donut chart calculations
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const filledLength = circumference * agreementRatio;
  const emptyLength = circumference - filledLength;

  return (
    <div className="results-display" aria-label="Voting results">
      {/* Cards with vote counts shown as bars above them */}
      <div
        className="results-display__cards"
        role="img"
        aria-label="Vote distribution chart"
      >
        {entries.map(([card, count]) => {
          const isHighlight = count === maxCount;
          const barHeight =
            maxCount > 0 ? Math.max((count / maxCount) * 30, 4) : 4;

          return (
            <div key={String(card)} className="results-display__card-column">
              <div className="results-display__bar-wrapper">
                <span className="results-display__vote-count">{count}</span>
                <div
                  className={`results-display__bar${isHighlight ? " results-display__bar--highlight" : ""}`}
                  style={{ height: `${barHeight}px` }}
                  aria-label={`${String(card)}: ${count} vote${count !== 1 ? "s" : ""}`}
                />
              </div>
              <div
                className={`results-display__card${isHighlight ? " results-display__card--highlight" : ""}`}
              >
                {String(card)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats to the right */}
      <div className="results-display__stats">
        <div className="results-display__average">
          <span className="results-display__stat-label">Average</span>
          <span className="results-display__stat-value">
            {averageScore !== null ? averageScore.toFixed(1) : "N/A"}
          </span>
        </div>

        <div className="results-display__agreement">
          <span className="results-display__stat-label">Agreement</span>
          <div
            className="results-display__donut"
            role="img"
            aria-label={`Agreement ratio: ${Math.round(agreementRatio * 100)}%`}
          >
            <svg viewBox="0 0 52 52" width="52" height="52">
              <circle
                className="results-display__donut-ring"
                cx="26"
                cy="26"
                r={radius}
              />
              <circle
                className="results-display__donut-fill"
                cx="26"
                cy="26"
                r={radius}
                strokeDasharray={`${filledLength} ${emptyLength}`}
              />
            </svg>
            <span className="results-display__donut-text">
              {Math.round(agreementRatio * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
