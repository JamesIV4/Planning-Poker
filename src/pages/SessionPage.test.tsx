import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionPage } from "./SessionPage";
import { usePokerStore } from "../store/usePokerStore";

// Mock the useSessionConnection hook
vi.mock("../networking/useSessionConnection", () => ({
  useSessionConnection: () => ({
    connectionStatus: "connected" as const,
    sendAction: vi.fn(),
    sendVoteOptimistic: vi.fn(),
    kickPlayer: vi.fn(),
    rejoin: vi.fn(),
  }),
}));

// Mock sessionPersistence to prevent localStorage interference in tests
vi.mock("../utils/sessionPersistence", () => ({
  loadSession: () => null,
  saveSession: () => {},
  clearSession: () => {},
}));

function renderSessionPage(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}`]}>
      <Routes>
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SessionPage", () => {
  beforeEach(() => {
    usePokerStore.setState({
      session: null,
      currentPlayer: null,
      gameState: "waiting",
    });
  });

  describe("Join Dialog", () => {
    it("shows join dialog when player has not joined", () => {
      renderSessionPage("test-session");

      expect(
        screen.getByRole("heading", { name: "Join Session" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Display Name")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Join Session" }),
      ).toBeInTheDocument();
    });

    it("shows error when submitting empty display name", () => {
      renderSessionPage("test-session");

      fireEvent.click(screen.getByRole("button", { name: "Join Session" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Display name is required.",
      );
    });

    it("shows error when display name exceeds 50 characters", () => {
      renderSessionPage("test-session");

      const input = screen.getByLabelText("Display Name");
      fireEvent.change(input, { target: { value: "a".repeat(51) } });
      fireEvent.click(screen.getByRole("button", { name: "Join Session" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Display name must be 50 characters or fewer.",
      );
    });

    it("shows duplicate name error when name is already taken", () => {
      usePokerStore.setState({
        session: {
          id: "test-session",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [
            { id: "admin-1", displayName: "Admin", isAdmin: true },
            { id: "player-1", displayName: "Alice", isAdmin: false },
          ],
          currentRound: null,
          createdAt: Date.now(),
        },
        currentPlayer: null,
        gameState: "waiting",
      });

      renderSessionPage("test-session");

      const input = screen.getByLabelText("Display Name");
      fireEvent.change(input, { target: { value: "alice" } });
      fireEvent.click(screen.getByRole("button", { name: "Join Session" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "This name is already taken. Please choose a different name.",
      );
    });

    it("joins session successfully with valid display name", () => {
      usePokerStore.setState({
        session: {
          id: "test-session",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [{ id: "admin-1", displayName: "Admin", isAdmin: true }],
          currentRound: null,
          createdAt: Date.now(),
        },
        currentPlayer: null,
        gameState: "waiting",
      });

      renderSessionPage("test-session");

      const input = screen.getByLabelText("Display Name");
      fireEvent.change(input, { target: { value: "Bob" } });
      fireEvent.click(screen.getByRole("button", { name: "Join Session" }));

      // After joining, the game view should be shown
      expect(screen.getByTestId("game-view")).toBeInTheDocument();
    });

    it("trims whitespace from display name", () => {
      usePokerStore.setState({
        session: {
          id: "test-session",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [{ id: "admin-1", displayName: "Admin", isAdmin: true }],
          currentRound: null,
          createdAt: Date.now(),
        },
        currentPlayer: null,
        gameState: "waiting",
      });

      renderSessionPage("test-session");

      const input = screen.getByLabelText("Display Name");
      fireEvent.change(input, { target: { value: "  Charlie  " } });
      fireEvent.click(screen.getByRole("button", { name: "Join Session" }));

      const state = usePokerStore.getState();
      expect(state.currentPlayer?.displayName).toBe("Charlie");
    });
  });

  describe("Game View", () => {
    it("shows game view when user is admin of this session", () => {
      usePokerStore.setState({
        session: {
          id: "test-session",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [{ id: "admin-1", displayName: "Admin", isAdmin: true }],
          currentRound: null,
          createdAt: Date.now(),
        },
        currentPlayer: { id: "admin-1", displayName: "Admin", isAdmin: true },
        gameState: "waiting",
      });

      renderSessionPage("test-session");

      expect(screen.getByTestId("game-view")).toBeInTheDocument();
      // Should render the PokerTable with the admin player
      expect(screen.getByText("Admin")).toBeInTheDocument();
    });

    it("shows game view when player has already joined", () => {
      usePokerStore.setState({
        session: {
          id: "test-session",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [
            { id: "admin-1", displayName: "Admin", isAdmin: true },
            { id: "player-1", displayName: "Bob", isAdmin: false },
          ],
          currentRound: null,
          createdAt: Date.now(),
        },
        currentPlayer: { id: "player-1", displayName: "Bob", isAdmin: false },
        gameState: "waiting",
      });

      renderSessionPage("test-session");

      expect(screen.getByTestId("game-view")).toBeInTheDocument();
    });

    it("renders PokerTable with players", () => {
      usePokerStore.setState({
        session: {
          id: "test-session",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [
            { id: "admin-1", displayName: "Admin", isAdmin: true },
            { id: "player-1", displayName: "Alice", isAdmin: false },
          ],
          currentRound: {
            id: "round-1",
            state: "voting",
            votes: [],
            startedAt: Date.now(),
            revealedAt: null,
          },
          createdAt: Date.now(),
        },
        currentPlayer: { id: "admin-1", displayName: "Admin", isAdmin: true },
        gameState: "voting",
      });

      renderSessionPage("test-session");

      expect(screen.getByText("Admin")).toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByLabelText("Poker table")).toBeInTheDocument();
    });

    it("renders CardSelectionPanel during voting state", () => {
      usePokerStore.setState({
        session: {
          id: "test-session",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [{ id: "admin-1", displayName: "Admin", isAdmin: true }],
          currentRound: {
            id: "round-1",
            state: "voting",
            votes: [],
            startedAt: Date.now(),
            revealedAt: null,
          },
          createdAt: Date.now(),
        },
        currentPlayer: { id: "admin-1", displayName: "Admin", isAdmin: true },
        gameState: "voting",
      });

      renderSessionPage("test-session");

      expect(screen.getByLabelText("Card selection")).toBeInTheDocument();
    });

    it("renders ResultsDisplay in revealed state with votes", () => {
      usePokerStore.setState({
        session: {
          id: "test-session",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [
            { id: "admin-1", displayName: "Admin", isAdmin: true },
            { id: "player-1", displayName: "Alice", isAdmin: false },
          ],
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "admin-1",
                card: 5,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "player-1",
                card: 8,
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
          createdAt: Date.now(),
        },
        currentPlayer: { id: "admin-1", displayName: "Admin", isAdmin: true },
        gameState: "revealed",
      });

      renderSessionPage("test-session");

      expect(screen.getByLabelText("Voting results")).toBeInTheDocument();
    });

    it("shows Reveal Cards button for admin during voting", () => {
      usePokerStore.setState({
        session: {
          id: "test-session",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [{ id: "admin-1", displayName: "Admin", isAdmin: true }],
          currentRound: {
            id: "round-1",
            state: "voting",
            votes: [],
            startedAt: Date.now(),
            revealedAt: null,
          },
          createdAt: Date.now(),
        },
        currentPlayer: { id: "admin-1", displayName: "Admin", isAdmin: true },
        gameState: "voting",
      });

      renderSessionPage("test-session");

      expect(screen.getByLabelText("Reveal Cards")).toBeInTheDocument();
    });

    it("shows Start New Voting button for admin during revealed state", () => {
      usePokerStore.setState({
        session: {
          id: "test-session",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [{ id: "admin-1", displayName: "Admin", isAdmin: true }],
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "admin-1",
                card: 5,
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
          createdAt: Date.now(),
        },
        currentPlayer: { id: "admin-1", displayName: "Admin", isAdmin: true },
        gameState: "revealed",
      });

      renderSessionPage("test-session");

      expect(screen.getByLabelText("Start New Voting")).toBeInTheDocument();
    });

    it("renders ConnectionStatus component", () => {
      usePokerStore.setState({
        session: {
          id: "test-session",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [{ id: "admin-1", displayName: "Admin", isAdmin: true }],
          currentRound: null,
          createdAt: Date.now(),
        },
        currentPlayer: { id: "admin-1", displayName: "Admin", isAdmin: true },
        gameState: "waiting",
      });

      renderSessionPage("test-session");

      // Connected status renders a status indicator
      expect(screen.getByLabelText("Connected")).toBeInTheDocument();
    });
  });
});
