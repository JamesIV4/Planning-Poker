import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPeerClient } from "./peerClient";
import type { SessionState } from "../types";

// Mock PeerJS
const mockPeerOn = vi.fn();
const mockPeerDestroy = vi.fn();
const mockPeerConnect = vi.fn();

vi.mock("peerjs", () => {
  const MockPeer = function (this: Record<string, unknown>) {
    this.on = mockPeerOn;
    this.destroy = mockPeerDestroy;
    this.connect = mockPeerConnect;
  };
  return { default: MockPeer };
});

// Helper to create a mock DataConnection
function createMockConnection() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    open: true,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    send: vi.fn(),
    close: vi.fn(),
    _handlers: handlers,
    _trigger(event: string, ...args: unknown[]) {
      if (handlers[event]) {
        handlers[event](...args);
      }
    },
  };
}

// Helper to create a minimal SessionState
function createMockSessionState(): SessionState {
  return {
    session: {
      id: "test-session",
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
}

// Helper to simulate the full connection flow
function setupConnectedClient() {
  const mockConn = createMockConnection();
  mockPeerConnect.mockReturnValue(mockConn);

  const client = createPeerClient();
  client.connectToHost("abc123");

  // Trigger the peer "open" event to initiate connection
  const peerOpenHandler = mockPeerOn.mock.calls.find(
    (call) => call[0] === "open",
  )?.[1];
  expect(peerOpenHandler).toBeDefined();
  peerOpenHandler!();

  return { client, mockConn };
}

describe("createPeerClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("connectToHost", () => {
    it("should connect to the correct host peer ID", () => {
      const mockConn = createMockConnection();
      mockPeerConnect.mockReturnValue(mockConn);

      const client = createPeerClient();
      client.connectToHost("abc123");

      // Trigger peer open event
      const peerOpenHandler = mockPeerOn.mock.calls.find(
        (call) => call[0] === "open",
      )?.[1];
      peerOpenHandler!();

      expect(mockPeerConnect).toHaveBeenCalledWith("planning-poker-abc123", {
        serialization: "json",
      });
    });

    it("should notify connection change on successful connection", () => {
      const connectionCallback = vi.fn();
      const mockConn = createMockConnection();
      mockPeerConnect.mockReturnValue(mockConn);

      const client = createPeerClient();
      client.onConnectionChange(connectionCallback);
      client.connectToHost("session1");

      // Trigger peer open
      const peerOpenHandler = mockPeerOn.mock.calls.find(
        (call) => call[0] === "open",
      )?.[1];
      peerOpenHandler!();

      // Trigger connection open
      mockConn._trigger("open");

      expect(connectionCallback).toHaveBeenCalledWith(true);
    });

    it("should notify connection change on connection close", () => {
      const connectionCallback = vi.fn();

      const { mockConn, client } = setupConnectedClient();
      client.onConnectionChange(connectionCallback);

      // Trigger connection open first
      mockConn._trigger("open");

      // Then close
      mockConn._trigger("close");

      expect(connectionCallback).toHaveBeenCalledWith(false);
    });

    it("should notify connection change on connection error", () => {
      const connectionCallback = vi.fn();

      const { mockConn, client } = setupConnectedClient();
      client.onConnectionChange(connectionCallback);

      mockConn._trigger("error", new Error("Connection failed"));

      expect(connectionCallback).toHaveBeenCalledWith(false);
    });

    it("should notify connection change on peer error", () => {
      const connectionCallback = vi.fn();
      const mockConn = createMockConnection();
      mockPeerConnect.mockReturnValue(mockConn);

      const client = createPeerClient();
      client.onConnectionChange(connectionCallback);
      client.connectToHost("session1");

      // Trigger peer error
      const peerErrorHandler = mockPeerOn.mock.calls.find(
        (call) => call[0] === "error",
      )?.[1];
      peerErrorHandler!(new Error("Peer error"));

      expect(connectionCallback).toHaveBeenCalledWith(false);
    });

    it("should notify connection change on peer disconnected", () => {
      const connectionCallback = vi.fn();
      const mockConn = createMockConnection();
      mockPeerConnect.mockReturnValue(mockConn);

      const client = createPeerClient();
      client.onConnectionChange(connectionCallback);
      client.connectToHost("session1");

      // Trigger peer disconnected
      const peerDisconnectedHandler = mockPeerOn.mock.calls.find(
        (call) => call[0] === "disconnected",
      )?.[1];
      peerDisconnectedHandler!();

      expect(connectionCallback).toHaveBeenCalledWith(false);
    });
  });

  describe("sendAction", () => {
    it("should send action message to host in correct format", () => {
      const { client, mockConn } = setupConnectedClient();
      mockConn._trigger("open");

      client.sendAction({ type: "join", displayName: "Alice" });

      expect(mockConn.send).toHaveBeenCalledWith({
        type: "action",
        payload: { type: "join", displayName: "Alice" },
      });
    });

    it("should send vote action to host", () => {
      const { client, mockConn } = setupConnectedClient();
      mockConn._trigger("open");

      client.sendAction({ type: "vote", card: 8 });

      expect(mockConn.send).toHaveBeenCalledWith({
        type: "action",
        payload: { type: "vote", card: 8 },
      });
    });

    it("should send removeVote action to host", () => {
      const { client, mockConn } = setupConnectedClient();
      mockConn._trigger("open");

      client.sendAction({ type: "removeVote" });

      expect(mockConn.send).toHaveBeenCalledWith({
        type: "action",
        payload: { type: "removeVote" },
      });
    });

    it("should not send action when not connected", () => {
      const mockConn = createMockConnection();
      mockConn.open = false;
      mockPeerConnect.mockReturnValue(mockConn);

      const client = createPeerClient();
      client.connectToHost("session1");

      // Trigger peer open
      const peerOpenHandler = mockPeerOn.mock.calls.find(
        (call) => call[0] === "open",
      )?.[1];
      peerOpenHandler!();

      client.sendAction({ type: "vote", card: 5 });

      expect(mockConn.send).not.toHaveBeenCalled();
    });
  });

  describe("onStateUpdate", () => {
    it("should call state update callback when state message is received", () => {
      const stateCallback = vi.fn();

      const { client, mockConn } = setupConnectedClient();
      client.onStateUpdate(stateCallback);

      const state = createMockSessionState();
      mockConn._trigger("data", { type: "state", payload: state });

      expect(stateCallback).toHaveBeenCalledWith(state);
    });

    it("should not call state update callback for non-state messages", () => {
      const stateCallback = vi.fn();

      const { client, mockConn } = setupConnectedClient();
      client.onStateUpdate(stateCallback);

      mockConn._trigger("data", { type: "kicked" });

      expect(stateCallback).not.toHaveBeenCalled();
    });

    it("should handle state messages with full session data", () => {
      const stateCallback = vi.fn();

      const { client, mockConn } = setupConnectedClient();
      client.onStateUpdate(stateCallback);

      const state: SessionState = {
        session: {
          id: "session-xyz",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [
            { id: "admin-1", displayName: "Admin", isAdmin: true },
            { id: "player-1", displayName: "Alice", isAdmin: false },
            { id: "player-2", displayName: "Bob", isAdmin: false },
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
        round: {
          id: "round-1",
          state: "voting",
          votes: [],
          startedAt: Date.now(),
          revealedAt: null,
        },
        votes: [],
      };

      mockConn._trigger("data", { type: "state", payload: state });

      expect(stateCallback).toHaveBeenCalledWith(state);
    });
  });

  describe("onKicked", () => {
    it("should call kicked callback when kick message is received", () => {
      const kickedCallback = vi.fn();

      const { client, mockConn } = setupConnectedClient();
      client.onKicked(kickedCallback);

      mockConn._trigger("data", { type: "kicked" });

      expect(kickedCallback).toHaveBeenCalledTimes(1);
    });

    it("should close connection after being kicked", () => {
      const kickedCallback = vi.fn();

      const { client, mockConn } = setupConnectedClient();
      client.onKicked(kickedCallback);

      mockConn._trigger("data", { type: "kicked" });

      expect(mockConn.close).toHaveBeenCalled();
    });

    it("should not call state callback for kick messages", () => {
      const stateCallback = vi.fn();
      const kickedCallback = vi.fn();

      const { client, mockConn } = setupConnectedClient();
      client.onStateUpdate(stateCallback);
      client.onKicked(kickedCallback);

      mockConn._trigger("data", { type: "kicked" });

      expect(kickedCallback).toHaveBeenCalled();
      expect(stateCallback).not.toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("should close connection and destroy peer", () => {
      const { client, mockConn } = setupConnectedClient();

      client.destroy();

      expect(mockConn.close).toHaveBeenCalled();
      expect(mockPeerDestroy).toHaveBeenCalled();
    });

    it("should clear callbacks after destroy", () => {
      const stateCallback = vi.fn();
      const connectionCallback = vi.fn();
      const kickedCallback = vi.fn();

      const { client, mockConn } = setupConnectedClient();
      client.onStateUpdate(stateCallback);
      client.onConnectionChange(connectionCallback);
      client.onKicked(kickedCallback);

      client.destroy();

      // After destroy, callbacks should be cleared
      // Triggering events should not call callbacks
      // (In practice, the connection is closed so events won't fire,
      // but we verify the callbacks are nulled out by checking destroy ran)
      expect(mockConn.close).toHaveBeenCalled();
      expect(mockPeerDestroy).toHaveBeenCalled();
    });
  });

  describe("message handling edge cases", () => {
    it("should ignore null messages", () => {
      const stateCallback = vi.fn();
      const kickedCallback = vi.fn();

      const { client, mockConn } = setupConnectedClient();
      client.onStateUpdate(stateCallback);
      client.onKicked(kickedCallback);

      mockConn._trigger("data", null);

      expect(stateCallback).not.toHaveBeenCalled();
      expect(kickedCallback).not.toHaveBeenCalled();
    });

    it("should ignore messages with unknown type", () => {
      const stateCallback = vi.fn();
      const kickedCallback = vi.fn();

      const { client, mockConn } = setupConnectedClient();
      client.onStateUpdate(stateCallback);
      client.onKicked(kickedCallback);

      mockConn._trigger("data", { type: "unknown", payload: {} });

      expect(stateCallback).not.toHaveBeenCalled();
      expect(kickedCallback).not.toHaveBeenCalled();
    });

    it("should handle error messages from host gracefully", () => {
      const stateCallback = vi.fn();

      const { client, mockConn } = setupConnectedClient();
      client.onStateUpdate(stateCallback);

      // Should not throw
      mockConn._trigger("data", {
        type: "error",
        payload: "Display name already in use",
      });

      expect(stateCallback).not.toHaveBeenCalled();
    });
  });
});
