import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ResultsDisplay } from "./ResultsDisplay";
import type { ResultsDisplayProps } from "./ResultsDisplay";
import type { CardValue } from "../types";

function renderResults(overrides: Partial<ResultsDisplayProps> = {}) {
  const defaultProps: ResultsDisplayProps = {
    voteDistribution: new Map<CardValue, number>([
      [5, 3],
      [8, 2],
      [13, 1],
    ]),
    averageScore: 7.5,
    agreementRatio: 0.5,
    totalVoters: 6,
  };

  const props = { ...defaultProps, ...overrides };
  return { ...render(<ResultsDisplay {...props} />), props };
}

describe("ResultsDisplay", () => {
  describe("visibility", () => {
    it("does not render when totalVoters is 0", () => {
      renderResults({ totalVoters: 0 });
      expect(screen.queryByLabelText("Voting results")).not.toBeInTheDocument();
    });

    it("does not render when voteDistribution is empty", () => {
      renderResults({ voteDistribution: new Map() });
      expect(screen.queryByLabelText("Voting results")).not.toBeInTheDocument();
    });

    it("renders when there are votes", () => {
      renderResults();
      expect(screen.getByLabelText("Voting results")).toBeInTheDocument();
    });
  });

  describe("card display", () => {
    it("renders a card for each value with votes", () => {
      const distribution = new Map<CardValue, number>([
        [3, 2],
        [5, 4],
        [8, 1],
      ]);
      renderResults({ voteDistribution: distribution, totalVoters: 7 });

      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
    });

    it("displays vote counts", () => {
      const distribution = new Map<CardValue, number>([
        [5, 3],
        [8, 2],
      ]);
      renderResults({ voteDistribution: distribution, totalVoters: 5 });

      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("highlights the card with the highest vote count", () => {
      const distribution = new Map<CardValue, number>([
        [3, 1],
        [5, 4],
        [8, 2],
      ]);
      renderResults({ voteDistribution: distribution, totalVoters: 7 });

      const highlightedBar = screen.getByLabelText("5: 4 votes");
      expect(highlightedBar).toHaveClass("results-display__bar--highlight");
    });

    it("renders special card values", () => {
      const distribution = new Map<CardValue, number>([
        [5, 2],
        ["?", 1],
        ["☕", 1],
      ]);
      renderResults({ voteDistribution: distribution, totalVoters: 4 });

      expect(screen.getByText("?")).toBeInTheDocument();
      expect(screen.getByText("☕")).toBeInTheDocument();
    });
  });

  describe("stats", () => {
    it("displays the average score", () => {
      renderResults({ averageScore: 7.5 });
      expect(screen.getByText("7.5")).toBeInTheDocument();
    });

    it("displays N/A when averageScore is null", () => {
      renderResults({ averageScore: null });
      expect(screen.getByText("N/A")).toBeInTheDocument();
    });

    it("displays the agreement ratio as percentage", () => {
      renderResults({ agreementRatio: 0.75 });
      expect(screen.getByText("75%")).toBeInTheDocument();
    });
  });

  describe("reactivity", () => {
    it("updates when vote distribution changes", () => {
      const distribution1 = new Map<CardValue, number>([
        [5, 3],
        [8, 2],
      ]);
      const { rerender } = render(
        <ResultsDisplay
          voteDistribution={distribution1}
          averageScore={6.2}
          agreementRatio={0.6}
          totalVoters={5}
        />,
      );

      expect(screen.getByLabelText("5: 3 votes")).toBeInTheDocument();

      const distribution2 = new Map<CardValue, number>([
        [5, 2],
        [8, 3],
      ]);
      rerender(
        <ResultsDisplay
          voteDistribution={distribution2}
          averageScore={6.8}
          agreementRatio={0.6}
          totalVoters={5}
        />,
      );

      expect(screen.getByLabelText("8: 3 votes")).toBeInTheDocument();
    });
  });
});
