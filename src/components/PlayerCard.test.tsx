import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PlayerCard } from "./PlayerCard";
import type { PlayerCardProps } from "./PlayerCard";

function renderCard(overrides: Partial<PlayerCardProps> = {}) {
  const defaultProps: PlayerCardProps = {
    gameState: "voting",
    hasVoted: false,
    voteValue: null,
    wasChanged: false,
    playerName: "Alice",
  };

  const props = { ...defaultProps, ...overrides };
  return render(<PlayerCard {...props} />);
}

describe("PlayerCard", () => {
  describe("during voting state", () => {
    it("shows darkened card with checkmark for players who voted", () => {
      const { container } = renderCard({ gameState: "voting", hasVoted: true });

      const card = container.querySelector(".player-card");
      expect(card).toHaveClass("player-card--voted");
      expect(screen.getByText("✓")).toBeInTheDocument();
    });

    it("shows unvoted placeholder for players who have not voted", () => {
      const { container } = renderCard({
        gameState: "voting",
        hasVoted: false,
      });

      const card = container.querySelector(".player-card");
      expect(card).toHaveClass("player-card--unvoted");
      expect(
        container.querySelector(".player-card__placeholder"),
      ).toBeInTheDocument();
    });

    it("has correct aria-label when player has voted", () => {
      renderCard({ gameState: "voting", hasVoted: true, playerName: "Bob" });

      expect(screen.getByLabelText("Bob has voted")).toBeInTheDocument();
    });

    it("has correct aria-label when player has not voted", () => {
      renderCard({ gameState: "voting", hasVoted: false, playerName: "Bob" });

      expect(screen.getByLabelText("Bob has not voted")).toBeInTheDocument();
    });

    it("does not apply flipped class during voting", () => {
      const { container } = renderCard({ gameState: "voting", hasVoted: true });

      const card = container.querySelector(".player-card");
      expect(card).not.toHaveClass("player-card--flipped");
    });
  });

  describe("during revealed state", () => {
    it("shows face-up card with vote value when player voted", () => {
      const { container } = renderCard({
        gameState: "revealed",
        hasVoted: true,
        voteValue: 8,
      });

      const card = container.querySelector(".player-card");
      expect(card).toHaveClass("player-card--revealed");
      expect(card).toHaveClass("player-card--flipped");
      expect(screen.getByText("8")).toBeInTheDocument();
    });

    it("shows placeholder when player did not vote", () => {
      const { container } = renderCard({
        gameState: "revealed",
        hasVoted: false,
        voteValue: null,
      });

      const card = container.querySelector(".player-card");
      expect(card).toHaveClass("player-card--revealed");
      expect(card).not.toHaveClass("player-card--flipped");
      expect(
        container.querySelector(".player-card__placeholder"),
      ).toBeInTheDocument();
    });

    it("shows special card values correctly", () => {
      renderCard({
        gameState: "revealed",
        hasVoted: true,
        voteValue: "☕",
      });

      expect(screen.getByText("☕")).toBeInTheDocument();
    });

    it("has correct aria-label with vote value", () => {
      renderCard({
        gameState: "revealed",
        hasVoted: true,
        voteValue: 13,
        playerName: "Carol",
      });

      expect(screen.getByLabelText("Carol voted 13")).toBeInTheDocument();
    });

    it("has correct aria-label when no vote", () => {
      renderCard({
        gameState: "revealed",
        hasVoted: false,
        voteValue: null,
        playerName: "Carol",
      });

      expect(screen.getByLabelText("Carol voted no vote")).toBeInTheDocument();
    });

    it("applies flipped class only when player has voted", () => {
      const { container: votedContainer } = renderCard({
        gameState: "revealed",
        hasVoted: true,
        voteValue: 5,
      });
      expect(votedContainer.querySelector(".player-card")).toHaveClass(
        "player-card--flipped",
      );

      const { container: unvotedContainer } = renderCard({
        gameState: "revealed",
        hasVoted: false,
        voteValue: null,
      });
      expect(unvotedContainer.querySelector(".player-card")).not.toHaveClass(
        "player-card--flipped",
      );
    });
  });

  describe("flip animation structure", () => {
    it("renders inner container with front and back faces", () => {
      const { container } = renderCard({ gameState: "voting", hasVoted: true });

      expect(
        container.querySelector(".player-card__inner"),
      ).toBeInTheDocument();
      expect(
        container.querySelector(".player-card__front"),
      ).toBeInTheDocument();
      expect(
        container.querySelector(".player-card__back-face"),
      ).toBeInTheDocument();
    });

    it("front face shows checkmark for voted cards", () => {
      const { container } = renderCard({ gameState: "voting", hasVoted: true });

      const front = container.querySelector(".player-card__front");
      expect(front).toHaveTextContent("✓");
    });

    it("back face shows vote value", () => {
      const { container } = renderCard({
        gameState: "revealed",
        hasVoted: true,
        voteValue: 21,
      });

      const backFace = container.querySelector(".player-card__back-face");
      expect(backFace).toHaveTextContent("21");
    });
  });

  describe("wasChanged indicator", () => {
    it("shows changed indicator when wasChanged is true in revealed state", () => {
      renderCard({
        gameState: "revealed",
        hasVoted: true,
        voteValue: 5,
        wasChanged: true,
      });

      expect(screen.getByLabelText("Vote was changed")).toBeInTheDocument();
    });

    it("does not show changed indicator when wasChanged is false", () => {
      renderCard({
        gameState: "revealed",
        hasVoted: true,
        voteValue: 5,
        wasChanged: false,
      });

      expect(
        screen.queryByLabelText("Vote was changed"),
      ).not.toBeInTheDocument();
    });

    it("does not show changed indicator during voting state even if wasChanged is true", () => {
      renderCard({
        gameState: "voting",
        hasVoted: true,
        wasChanged: true,
      });

      expect(
        screen.queryByLabelText("Vote was changed"),
      ).not.toBeInTheDocument();
    });
  });
});
