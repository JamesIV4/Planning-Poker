import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionConnection } from "./useSessionConnection";
import { usePokerStore } from "../store/usePokerStore";
import type { SessionState, CardValue } from "../types";

// Track mock instances for assertions
let mockHostInstance: ReturnType<typeof createMockHost>;
let mockClientInstance: ReturnType<typeof createMockClient>;

function createMockHost() {
  const callbacks: Record<string, (...args: unknown[]) => void> = {};
  return {
    createHost: vi.fn(),
    broadcastState: vi.fn(),
    onPlayerAction: vi.fn((cb: (...args: unknown[]) => void) => {
      callbacks["playerAction"] = cb;
    }),
    onPlayerConnected: vi.fn((cb: (...args: unknown[]) => void) => {
      callbacks["playerConnected"] = cb;
    }),
    onPlayerDisconnected: vi.fn((cb: (...args: unknown[]) => void) => {
      callbacks["playerDisconnected"] = cb;
    }),
    kickPlayer: vi.fn(),
    destroy: vi.fn(),
    _callbacks: callbacks,
    _triggerPlayerAction(playerId: string, action: unknown) {
      callbacks["playerAction"]?.(playerId, action);
    },
    _triggerPlayerDisconnected(playerId: string) {
      callbacks["playerDisconnected"]?.(playerId);
    },
    _triggerPlayerConnected(playerId: string) {
      callbacks["playerConnected"]?.(playerId);
    },
  };
}

function createMockClient() {
  const callbacks: Record<string, (...args: unknown[]) => void> = {};
  return {
    connectToHost: vi.fn(),
    sendAction: vi.fn(),
    onStateUpdate: vi.fn((cb: (...args: unknown[]) => void) => {
      callbacks["stateUpdate"] = cb;
    }),
    onConnectionChange: vi.fn((cb: (...args: unknown[]) => void) => {
      callbacks["connectionChange"] = cb;
    }),
    onKicked: vi.fn((cb: (...args: unknown[]) => void) => {
      callbacks["kicked"] = cb;
    }),
    onSessionEnded: vi.fn((cb: (...args: unknown[]) => void) => {
      callbacks["sessionEnded"] = cb;
    }),
    destroy: vi.fn(),
    _callbacks: callbacks,
    _triggerStateUpdate(state: SessionState) {
      callbacks["stateUpdate"]?.(state);
    },
    _triggerConnectionChange(connected: boolean) {
      callbacks["connectionChange"]?.(connected);
    },
    _triggerKicked() {
      callbacks["kicked"]?.();
    },
  };
}

// Mock the networking modules
vi.mock("./peerHost", () => ({
  createPeerHost: () => {
    mockHostInstance = createMockHost();
    return mockHostInstance;
  },
}));

vi.mock("./peerClient", () => ({
  createPeerClient: () => {
    mockClientInstance = createMockClient();
    return mockClientInstance;
  },
}));

describe("useSessionConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset the store
    usePokerStore.setState({
      session: null,
      currentPlayer: null,
      gameState: "waiting",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("admin (host) mode", () => {
    beforeEach(() => {
      // Set up a session in the store for admin
      usePokerStore.getState().createSession("Test Session");
    });

    it("should create a PeerJS host with the session ID", () => {
      renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: true,
          hasJoined: true,
        }),
      );

      expect(mockHostInstance.createHost).toHaveBeenCalledWith("test-123");
    });

    it("should start with connected status for admin", () => {
      const { result } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: true,
          hasJoined: true,
        }),
      );

      expect(result.current.connectionStatus).toBe("connected");
    });

    it("should remove player and broadcast on disconnect", () => {
      const { result } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: true,
          hasJoined: true,
        }),
      );

      // Add a player to the session first
      act(() => {
        usePokerStore.getState().addPlayer({
          id: "player-1",
          displayName: "Alice",
          isAdmin: false,
        });
      });

      // Simulate player disconnect
      act(() => {
        mockHostInstance._triggerPlayerDisconnected("player-1");
      });

      // Player should be removed from store
      const session = usePokerStore.getState().session;
      expect(session?.players.find((p) => p.id === "player-1")).toBeUndefined();

      // Flush throttled broadcast
      act(() => { vi.advanceTimersByTime(100); });
      // State should be broadcast
      expect(mockHostInstance.broadcastState).toHaveBeenCalled();
      expect(result.current.connectionStatus).toBe("connected");
    });

    it("should handle kick: send kick message, remove player, broadcast", () => {
      const { result } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: true,
          hasJoined: true,
        }),
      );

      // Add a player
      act(() => {
        usePokerStore.getState().addPlayer({
          id: "player-1",
          displayName: "Alice",
          isAdmin: false,
        });
      });

      // Kick the player
      act(() => {
        result.current.kickPlayer("player-1");
      });

      // Host should have sent kick message
      expect(mockHostInstance.kickPlayer).toHaveBeenCalledWith("player-1");

      // Player should be removed from store
      const session = usePokerStore.getState().session;
      expect(session?.players.find((p) => p.id === "player-1")).toBeUndefined();

      // Flush throttled broadcast
      act(() => { vi.advanceTimersByTime(100); });
      // State should be broadcast
      expect(mockHostInstance.broadcastState).toHaveBeenCalled();
    });

    it("should process player join action and broadcast state", () => {
      renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: true,
          hasJoined: true,
        }),
      );

      // Simulate a player join action
      act(() => {
        mockHostInstance._triggerPlayerAction("player-1", {
          type: "join",
          displayName: "Alice",
        });
      });

      // Player should be added to store
      const session = usePokerStore.getState().session;
      expect(session?.players.find((p) => p.id === "player-1")).toBeDefined();

      // Flush throttled broadcast
      act(() => { vi.advanceTimersByTime(100); });
      // State should be broadcast
      expect(mockHostInstance.broadcastState).toHaveBeenCalled();
    });

    it("should process vote action and broadcast state", () => {
      renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: true,
          hasJoined: true,
        }),
      );

      // Add a player first
      act(() => {
        usePokerStore.getState().addPlayer({
          id: "player-1",
          displayName: "Alice",
          isAdmin: false,
        });
      });

      // Simulate a vote action
      act(() => {
        mockHostInstance._triggerPlayerAction("player-1", {
          type: "vote",
          card: 8,
        });
      });

      // Vote should be recorded
      const session = usePokerStore.getState().session;
      const vote = session?.currentRound?.votes.find(
        (v) => v.playerId === "player-1",
      );
      expect(vote?.card).toBe(8);

      // Flush throttled broadcast
      act(() => { vi.advanceTimersByTime(100); });
      // State should be broadcast
      expect(mockHostInstance.broadcastState).toHaveBeenCalled();
    });

    it("should not destroy host on unmount (persists for Strict Mode compatibility)", () => {
      const { unmount } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: true,
          hasJoined: true,
        }),
      );

      unmount();

      // Host is intentionally NOT destroyed on effect cleanup to avoid
      // React Strict Mode double-invoke killing the PeerJS connection
      expect(mockHostInstance.destroy).not.toHaveBeenCalled();
    });

    it("should broadcast state when admin reveals cards (store subscription)", () => {
      renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: true,
          hasJoined: true,
        }),
      );

      // Add a player and cast a vote to set up voting state
      act(() => {
        const store = usePokerStore.getState();
        store.addPlayer({
          id: "player-1",
          displayName: "Alice",
          isAdmin: false,
        });
      });

      // Clear previous broadcast calls from addPlayer
      mockHostInstance.broadcastState.mockClear();

      // Admin starts voting (transitions from waiting)
      act(() => {
        usePokerStore.getState().castVote("player-1", 5);
      });

      // Flush throttled broadcast
      act(() => { vi.advanceTimersByTime(100); });
      // broadcastState should have been called via subscription
      expect(mockHostInstance.broadcastState).toHaveBeenCalled();
      mockHostInstance.broadcastState.mockClear();

      // Admin reveals cards
      act(() => {
        usePokerStore.getState().revealCards();
      });

      // Flush throttled broadcast
      act(() => { vi.advanceTimersByTime(100); });
      // broadcastState should be called via subscription
      expect(mockHostInstance.broadcastState).toHaveBeenCalled();
    });

    it("should broadcast state when admin starts new voting (store subscription)", () => {
      renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: true,
          hasJoined: true,
        }),
      );

      // Set up: start voting, cast vote, reveal
      act(() => {
        const store = usePokerStore.getState();
        store.addPlayer({
          id: "player-1",
          displayName: "Alice",
          isAdmin: false,
        });
        store.castVote("player-1", 8);
        store.revealCards();
      });

      mockHostInstance.broadcastState.mockClear();

      // Admin starts new voting
      act(() => {
        usePokerStore.getState().startNewVoting();
      });

      // Flush throttled broadcast
      act(() => { vi.advanceTimersByTime(100); });
      // broadcastState should be called via subscription
      expect(mockHostInstance.broadcastState).toHaveBeenCalled();
    });
  });

  describe("player (client) mode", () => {
    it("should create a PeerJS client and connect to host", () => {
      renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: false,
          hasJoined: true,
        }),
      );

      expect(mockClientInstance.connectToHost).toHaveBeenCalledWith("test-123");
    });

    it("should start with disconnected status for player", () => {
      const { result } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: false,
          hasJoined: true,
        }),
      );

      expect(result.current.connectionStatus).toBe("disconnected");
    });

    it("should update status to connected when connection opens", () => {
      const { result } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: false,
          hasJoined: true,
        }),
      );

      act(() => {
        mockClientInstance._triggerConnectionChange(true);
      });

      expect(result.current.connectionStatus).toBe("connected");
    });

    it("should update status to disconnected when connection closes", () => {
      const { result } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: false,
          hasJoined: true,
        }),
      );

      act(() => {
        mockClientInstance._triggerConnectionChange(true);
      });

      act(() => {
        mockClientInstance._triggerConnectionChange(false);
      });

      expect(result.current.connectionStatus).toBe("disconnected");
    });

    it("should set status to kicked when kick message received", () => {
      const { result } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: false,
          hasJoined: true,
        }),
      );

      act(() => {
        mockClientInstance._triggerConnectionChange(true);
      });

      act(() => {
        mockClientInstance._triggerKicked();
      });

      expect(result.current.connectionStatus).toBe("kicked");
    });

    it("should not override kicked status on subsequent disconnect", () => {
      const { result } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: false,
          hasJoined: true,
        }),
      );

      act(() => {
        mockClientInstance._triggerConnectionChange(true);
      });

      act(() => {
        mockClientInstance._triggerKicked();
      });

      // Connection close after kick should not change status back to disconnected
      act(() => {
        mockClientInstance._triggerConnectionChange(false);
      });

      expect(result.current.connectionStatus).toBe("kicked");
    });

    it("should apply authoritative state on state update", () => {
      renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: false,
          hasJoined: true,
        }),
      );

      const state: SessionState = {
        session: {
          id: "test-123",
          name: "Test Session",
          adminId: "admin-1",
          players: [
            { id: "admin-1", displayName: "Admin", isAdmin: true },
            { id: "player-1", displayName: "Alice", isAdmin: false },
          ],
          currentRound: null,
          createdAt: Date.now(),
        },
        round: null,
        votes: [],
      };

      act(() => {
        mockClientInstance._triggerStateUpdate(state);
      });

      const storeSession = usePokerStore.getState().session;
      expect(storeSession?.id).toBe("test-123");
      expect(storeSession?.players).toHaveLength(2);
    });

    it("should send action via client", () => {
      const { result } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: false,
          hasJoined: true,
        }),
      );

      act(() => {
        result.current.sendAction({ type: "vote", card: 5 });
      });

      expect(mockClientInstance.sendAction).toHaveBeenCalledWith({
        type: "vote",
        card: 5,
      });
    });

    it("should not destroy client on unmount (persists for Strict Mode compatibility)", () => {
      const { unmount } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: false,
          hasJoined: true,
        }),
      );

      unmount();

      // Client is intentionally NOT destroyed on effect cleanup
      expect(mockClientInstance.destroy).not.toHaveBeenCalled();
    });

    it("should allow rejoin after being kicked", () => {
      const { result } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: false,
          hasJoined: true,
        }),
      );

      // Get kicked
      act(() => {
        mockClientInstance._triggerKicked();
      });

      expect(result.current.connectionStatus).toBe("kicked");

      // Rejoin
      act(() => {
        result.current.rejoin();
      });

      // A new client should be created and connected
      expect(mockClientInstance.connectToHost).toHaveBeenCalledWith("test-123");
    });

    it("should apply optimistic vote locally and send to host", () => {
      // Set up a current player in the store
      act(() => {
        usePokerStore.setState({
          currentPlayer: {
            id: "player-1",
            displayName: "Alice",
            isAdmin: false,
          },
          session: {
            id: "test-123",
            name: "Test",
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
          gameState: "voting",
        });
      });

      const { result } = renderHook(() =>
        useSessionConnection({
          sessionId: "test-123",
          isAdmin: false,
          hasJoined: true,
        }),
      );

      // Cast an optimistic vote
      act(() => {
        result.current.sendVoteOptimistic(8 as CardValue);
      });

      // Vote should be applied locally in the store
      const session = usePokerStore.getState().session;
      const vote = session?.currentRound?.votes.find(
        (v) => v.playerId === "player-1",
      );
      expect(vote?.card).toBe(8);

      // Action should also be sent to the host
      expect(mockClientInstance.sendAction).toHaveBeenCalledWith({
        type: "vote",
        card: 8,
      });
    });
  });
});
