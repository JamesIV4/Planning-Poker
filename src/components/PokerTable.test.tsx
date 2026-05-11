import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PokerTable } from "./PokerTable";
import type { PokerTableProps } from "./PokerTable";
import type { Player, Vote, CardValue } from "../types";

function createPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i}`,
    displayName: `Player ${i}`,
    isAdmin: i === 0,
  }));
}

function createVotes(playerIds: string[], card: CardValue = 5): Vote[] {
  return playerIds.map((playerId) => ({
    playerId,
    card,
    votedAt: Date.now(),
    wasChanged: false,
  }));
}

function renderTable(overrides: Partial<PokerTableProps> = {}) {
  const defaultProps: PokerTableProps = {
    players: createPlayers(3),
    votes: [],
    gameState: "voting",
    isAdmin: true,
    isEditing: false,
    isEditingParticipants: false,
    currentPlayerId: "player-0",
    votesChanged: new Set(),
    onRevealCards: vi.fn(),
    onStartNewVoting: vi.fn(),
    onEditVote: vi.fn(),
    onKickPlayer: vi.fn(),
  };

  const props = { ...defaultProps, ...overrides };
  return { ...render(<PokerTable {...props} />), props };
}

describe("PokerTable", () => {
  it("renders all player names", () => {
    renderTable();

    expect(screen.getByText("Player 0")).toBeInTheDocument();
    expect(screen.getByText("Player 1")).toBeInTheDocument();
    expect(screen.getByText("Player 2")).toBeInTheDocument();
  });

  it("renders dynamically based on player count", () => {
    const { rerender } = render(
      <PokerTable
        players={createPlayers(2)}
        votes={[]}
        gameState="voting"
        isAdmin={true}
        isEditing={false}
        currentPlayerId="player-0"
        votesChanged={new Set()}
        onRevealCards={vi.fn()}
        onStartNewVoting={vi.fn()}
        onEditVote={vi.fn()}
        onKickPlayer={vi.fn()}
      />,
    );

    expect(screen.getByText("Player 0")).toBeInTheDocument();
    expect(screen.getByText("Player 1")).toBeInTheDocument();

    rerender(
      <PokerTable
        players={createPlayers(5)}
        votes={[]}
        gameState="voting"
        isAdmin={true}
        isEditing={false}
        currentPlayerId="player-0"
        votesChanged={new Set()}
        onRevealCards={vi.fn()}
        onStartNewVoting={vi.fn()}
        onEditVote={vi.fn()}
        onKickPlayer={vi.fn()}
      />,
    );

    expect(screen.getByText("Player 4")).toBeInTheDocument();
  });

  it("shows admin badge for admin player", () => {
    renderTable();

    expect(screen.getByLabelText("Admin")).toBeInTheDocument();
  });

  it("shows 'Reveal Cards' button during voting state for admin", () => {
    renderTable({ gameState: "voting", isAdmin: true });

    expect(
      screen.getByRole("button", { name: "Reveal Cards" }),
    ).toBeInTheDocument();
  });

  it("does not show 'Reveal Cards' button for non-admin", () => {
    renderTable({ gameState: "voting", isAdmin: false });

    expect(
      screen.queryByRole("button", { name: "Reveal Cards" }),
    ).not.toBeInTheDocument();
  });

  it("shows 'Start New Voting' button during revealed state for admin", () => {
    renderTable({ gameState: "revealed", isAdmin: true });

    expect(
      screen.getByRole("button", { name: "Start New Voting" }),
    ).toBeInTheDocument();
  });

  it("does not show 'Start New Voting' button for non-admin", () => {
    renderTable({ gameState: "revealed", isAdmin: false });

    expect(
      screen.queryByRole("button", { name: "Start New Voting" }),
    ).not.toBeInTheDocument();
  });

  it("does not show admin control buttons during waiting state", () => {
    renderTable({ gameState: "waiting", isAdmin: true });

    expect(
      screen.queryByRole("button", { name: "Reveal Cards" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start New Voting" }),
    ).not.toBeInTheDocument();
  });

  it("calls onRevealCards when Reveal Cards button is clicked", () => {
    const onRevealCards = vi.fn();
    renderTable({ gameState: "voting", isAdmin: true, onRevealCards });

    fireEvent.click(screen.getByRole("button", { name: "Reveal Cards" }));

    expect(onRevealCards).toHaveBeenCalledTimes(1);
  });

  it("calls onStartNewVoting when Start New Voting button is clicked", () => {
    const onStartNewVoting = vi.fn();
    renderTable({ gameState: "revealed", isAdmin: true, onStartNewVoting });

    fireEvent.click(screen.getByRole("button", { name: "Start New Voting" }));

    expect(onStartNewVoting).toHaveBeenCalledTimes(1);
  });

  it("shows darkened card for players who have voted during voting state", () => {
    const players = createPlayers(3);
    const votes = createVotes(["player-1"]);

    renderTable({ players, votes, gameState: "voting" });

    expect(screen.getByLabelText("Player 1 has voted")).toBeInTheDocument();
  });

  it("shows unvoted placeholder for players who have not voted", () => {
    const players = createPlayers(3);

    renderTable({ players, votes: [], gameState: "voting" });

    expect(screen.getByLabelText("Player 1 has not voted")).toBeInTheDocument();
  });

  it("shows card values when game state is revealed", () => {
    const players = createPlayers(3);
    const votes = createVotes(["player-0", "player-1"], 8);

    renderTable({ players, votes, gameState: "revealed" });

    const valueElements = screen.getAllByText("8");
    expect(valueElements.length).toBe(2);
  });

  it("shows kick button for non-admin players when user is admin and editing participants", () => {
    renderTable({ isAdmin: true, isEditingParticipants: true });

    expect(screen.getByLabelText("Remove Player 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove Player 2")).toBeInTheDocument();
  });

  it("does not show kick button for admin player", () => {
    renderTable({ isAdmin: true, isEditingParticipants: true });

    expect(screen.queryByLabelText("Remove Player 0")).not.toBeInTheDocument();
  });

  it("does not show kick buttons when not editing participants", () => {
    renderTable({ isAdmin: true, isEditingParticipants: false });

    expect(screen.queryByLabelText("Remove Player 1")).not.toBeInTheDocument();
  });

  it("calls onKickPlayer with correct player ID when kick button is clicked", () => {
    const onKickPlayer = vi.fn();
    renderTable({ isAdmin: true, isEditingParticipants: true, onKickPlayer });

    fireEvent.click(screen.getByLabelText("Remove Player 1"));

    expect(onKickPlayer).toHaveBeenCalledWith("player-1");
  });

  it("shows edit vote button for current player in revealed state", () => {
    renderTable({ gameState: "revealed", currentPlayerId: "player-0" });

    expect(
      screen.getByRole("button", { name: "Edit vote" }),
    ).toBeInTheDocument();
  });

  it("does not show edit vote button during voting state", () => {
    renderTable({ gameState: "voting", currentPlayerId: "player-0" });

    expect(
      screen.queryByRole("button", { name: "Edit vote" }),
    ).not.toBeInTheDocument();
  });

  it("calls onEditVote when edit button is clicked", () => {
    const onEditVote = vi.fn();
    renderTable({
      gameState: "revealed",
      currentPlayerId: "player-0",
      isEditing: false,
      onEditVote,
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit vote" }));

    expect(onEditVote).toHaveBeenCalledTimes(1);
  });

  it("shows changed indicator for players whose vote was modified", () => {
    const players = createPlayers(3);
    const votes = createVotes(["player-1"], 8);
    const votesChanged = new Set(["player-1"]);

    renderTable({ players, votes, gameState: "revealed", votesChanged });

    expect(screen.getByLabelText("Vote was changed")).toBeInTheDocument();
  });

  it("does not show changed indicator when votesChanged is empty", () => {
    const players = createPlayers(3);
    const votes = createVotes(["player-1"], 8);

    renderTable({
      players,
      votes,
      gameState: "revealed",
      votesChanged: new Set(),
    });

    expect(screen.queryByLabelText("Vote was changed")).not.toBeInTheDocument();
  });
});
