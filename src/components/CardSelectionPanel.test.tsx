import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CardSelectionPanel } from "./CardSelectionPanel";
import type { CardSelectionProps } from "./CardSelectionPanel";
import { CARD_VALUES } from "../types";
import type { CardValue } from "../types";

function renderPanel(overrides: Partial<CardSelectionProps> = {}) {
  const defaultProps: CardSelectionProps = {
    cards: CARD_VALUES,
    selectedCard: null,
    gameState: "voting",
    isEditing: false,
    voteDistribution: null,
    onSelectCard: vi.fn(),
    onDeselectCard: vi.fn(),
  };

  const props = { ...defaultProps, ...overrides };
  return { ...render(<CardSelectionPanel {...props} />), props };
}

describe("CardSelectionPanel", () => {
  describe("visibility", () => {
    it("renders during voting state", () => {
      renderPanel({ gameState: "voting" });
      expect(
        screen.getByRole("group", { name: "Card selection" }),
      ).toBeInTheDocument();
    });

    it("renders during waiting state", () => {
      renderPanel({ gameState: "waiting" });
      expect(
        screen.getByRole("group", { name: "Card selection" }),
      ).toBeInTheDocument();
    });

    it("does not render during revealed state when not editing", () => {
      renderPanel({ gameState: "revealed", isEditing: false });
      expect(
        screen.queryByRole("group", { name: "Card selection" }),
      ).not.toBeInTheDocument();
    });

    it("renders during revealed state when editing", () => {
      renderPanel({ gameState: "revealed", isEditing: true });
      expect(
        screen.getByRole("group", { name: "Card selection" }),
      ).toBeInTheDocument();
    });
  });

  describe("card rendering", () => {
    it("renders all 13 card values during voting", () => {
      renderPanel({ gameState: "voting" });
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(13);
    });

    it("renders correct card values", () => {
      renderPanel({ gameState: "voting" });
      expect(screen.getByText("0")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
      expect(screen.getByText("13")).toBeInTheDocument();
      expect(screen.getByText("21")).toBeInTheDocument();
      expect(screen.getByText("34")).toBeInTheDocument();
      expect(screen.getByText("55")).toBeInTheDocument();
      expect(screen.getByText("89")).toBeInTheDocument();
      expect(screen.getByText("?")).toBeInTheDocument();
      expect(screen.getByText("☕")).toBeInTheDocument();
    });

    it("each card has an accessible label", () => {
      renderPanel({ gameState: "voting" });
      expect(screen.getByLabelText("Select card 5")).toBeInTheDocument();
      expect(screen.getByLabelText("Select card ?")).toBeInTheDocument();
      expect(screen.getByLabelText("Select card ☕")).toBeInTheDocument();
    });
  });

  describe("card selection", () => {
    it("highlights the currently selected card", () => {
      renderPanel({ gameState: "voting", selectedCard: 8 });
      const selectedButton = screen.getByLabelText("Select card 8");
      expect(selectedButton).toHaveClass(
        "card-selection-panel__card--selected",
      );
      expect(selectedButton).toHaveAttribute("aria-pressed", "true");
    });

    it("non-selected cards are not highlighted", () => {
      renderPanel({ gameState: "voting", selectedCard: 8 });
      const otherButton = screen.getByLabelText("Select card 5");
      expect(otherButton).not.toHaveClass(
        "card-selection-panel__card--selected",
      );
      expect(otherButton).toHaveAttribute("aria-pressed", "false");
    });

    it("calls onSelectCard when clicking an unselected card", () => {
      const onSelectCard = vi.fn();
      renderPanel({ gameState: "voting", selectedCard: null, onSelectCard });

      fireEvent.click(screen.getByLabelText("Select card 13"));
      expect(onSelectCard).toHaveBeenCalledWith(13);
    });

    it("calls onDeselectCard when clicking the already-selected card", () => {
      const onDeselectCard = vi.fn();
      renderPanel({ gameState: "voting", selectedCard: 5, onDeselectCard });

      fireEvent.click(screen.getByLabelText("Select card 5"));
      expect(onDeselectCard).toHaveBeenCalled();
    });

    it("calls onSelectCard when switching from one card to another", () => {
      const onSelectCard = vi.fn();
      renderPanel({ gameState: "voting", selectedCard: 3, onSelectCard });

      fireEvent.click(screen.getByLabelText("Select card 21"));
      expect(onSelectCard).toHaveBeenCalledWith(21);
    });

    it("handles special card selection", () => {
      const onSelectCard = vi.fn();
      renderPanel({ gameState: "voting", selectedCard: null, onSelectCard });

      fireEvent.click(screen.getByLabelText("Select card ?"));
      expect(onSelectCard).toHaveBeenCalledWith("?");
    });

    it("handles coffee card selection", () => {
      const onSelectCard = vi.fn();
      renderPanel({ gameState: "voting", selectedCard: null, onSelectCard });

      fireEvent.click(screen.getByLabelText("Select card ☕"));
      expect(onSelectCard).toHaveBeenCalledWith("☕");
    });
  });

  describe("post-reveal editing behavior", () => {
    it("shows only cards with votes when editing after reveal", () => {
      const distribution = new Map<CardValue, number>([
        [3, 2],
        [5, 1],
        [8, 3],
      ]);

      renderPanel({
        gameState: "revealed",
        isEditing: true,
        selectedCard: 5,
        voteDistribution: distribution,
      });

      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(3);
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
      expect(screen.queryByText("13")).not.toBeInTheDocument();
    });

    it("shows all cards when player has deselected (selectedCard is null) while editing", () => {
      const distribution = new Map<CardValue, number>([
        [3, 2],
        [5, 1],
      ]);

      renderPanel({
        gameState: "revealed",
        isEditing: true,
        selectedCard: null,
        voteDistribution: distribution,
      });

      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(13);
    });

    it("shows all cards when editing without vote distribution", () => {
      renderPanel({
        gameState: "revealed",
        isEditing: true,
        selectedCard: 5,
        voteDistribution: null,
      });

      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(13);
    });

    it("calls onSelectCard when clicking a different card while editing after reveal", () => {
      const onSelectCard = vi.fn();
      const distribution = new Map<CardValue, number>([
        [5, 2],
        [8, 1],
        [13, 1],
      ]);

      renderPanel({
        gameState: "revealed",
        isEditing: true,
        selectedCard: 5,
        voteDistribution: distribution,
        onSelectCard,
      });

      fireEvent.click(screen.getByLabelText("Select card 8"));
      expect(onSelectCard).toHaveBeenCalledWith(8);
    });

    it("calls onDeselectCard when clicking the currently selected card while editing", () => {
      const onDeselectCard = vi.fn();
      const distribution = new Map<CardValue, number>([
        [5, 2],
        [8, 1],
      ]);

      renderPanel({
        gameState: "revealed",
        isEditing: true,
        selectedCard: 5,
        voteDistribution: distribution,
        onDeselectCard,
      });

      fireEvent.click(screen.getByLabelText("Select card 5"));
      expect(onDeselectCard).toHaveBeenCalled();
    });

    it("filters out zero-vote cards correctly with mixed distribution", () => {
      const distribution = new Map<CardValue, number>([
        [0, 1],
        [1, 0],
        [3, 2],
        [5, 0],
        [8, 1],
        ["?", 1],
        ["☕", 0],
      ]);

      renderPanel({
        gameState: "revealed",
        isEditing: true,
        selectedCard: 3,
        voteDistribution: distribution,
      });

      // Only cards with count > 0 should be shown: 0, 3, 8, ?
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(4);
      expect(screen.getByText("0")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
      expect(screen.getByText("?")).toBeInTheDocument();
      expect(screen.queryByText("1")).not.toBeInTheDocument();
      expect(screen.queryByText("5")).not.toBeInTheDocument();
      expect(screen.queryByText("☕")).not.toBeInTheDocument();
    });
  });
});
