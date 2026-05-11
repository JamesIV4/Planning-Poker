import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPeerHost } from "./peerHost";
import type { SessionState } from "../types";

// Mock PeerJS
const mockPeerOn = vi.fn();
const mockPeerDestroy = vi.fn();

vi.mock("peerjs", () => {
  const MockPeer = function (this: Record<string, unknown>) {
    this.on = mockPeerOn;
    this.destroy = mockPeerDestroy;
  };
  return { default: MockPeer };
});

// Helper to create a mock DataConnection
function createMockConnection(peerId: string) {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    peer: peerId,
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
      players: [{ id: "admin-1", displayName: "Admin", isAdmin: true }],
      currentRound: null,
      createdAt: Date.now(),
    },
    round: null,
    votes: [],
  };
}

describe("createPeerHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a host and register with correct peer ID", () => {
    const host = createPeerHost();
    host.createHost("abc123");

    // Verify that the peer was created (connection handler registered)
    expect(mockPeerOn).toHaveBeenCalledWith("connection", expect.any(Function));
  });

  it("should broadcast state to all connected players", () => {
    const host = createPeerHost();
    host.createHost("session1");

    // Simulate a connection
    const connectionHandler = mockPeerOn.mock.calls.find(
      (call) => call[0] === "connection",
    )?.[1];
    expect(connectionHandler).toBeDefined();

    const mockConn = createMockConnection("player-1");
    connectionHandler!(mockConn);

    // Simulate the player joining
    mockConn._trigger("data", {
      type: "action",
      payload: { type: "join", displayName: "Alice" },
    });

    const state = createMockSessionState();
    host.broadcastState(state);

    expect(mockConn.send).toHaveBeenCalledWith({
      type: "state",
      payload: state,
    });
  });

  it("should call onPlayerAction callback with valid actions", () => {
    const host = createPeerHost();
    const actionCallback = vi.fn();
    host.onPlayerAction(actionCallback);
    host.createHost("session1");

    const connectionHandler = mockPeerOn.mock.calls.find(
      (call) => call[0] === "connection",
    )?.[1];

    const mockConn = createMockConnection("player-1");
    connectionHandler!(mockConn);

    // Send join action
    mockConn._trigger("data", {
      type: "action",
      payload: { type: "join", displayName: "Alice" },
    });

    expect(actionCallback).toHaveBeenCalledWith("player-1", {
      type: "join",
      displayName: "Alice",
    });
  });

  it("should reject invalid player actions", () => {
    const host = createPeerHost();
    const actionCallback = vi.fn();
    host.onPlayerAction(actionCallback);
    host.createHost("session1");

    const connectionHandler = mockPeerOn.mock.calls.find(
      (call) => call[0] === "connection",
    )?.[1];

    const mockConn = createMockConnection("player-1");
    connectionHandler!(mockConn);

    // Send invalid action (missing required fields)
    mockConn._trigger("data", {
      type: "action",
      payload: { type: "invalid" },
    });

    expect(actionCallback).not.toHaveBeenCalled();
  });

  it("should handle duplicate display names as reconnection (case-insensitive)", () => {
    const host = createPeerHost();
    const actionCallback = vi.fn();
    host.onPlayerAction(actionCallback);
    host.createHost("session1");

    const connectionHandler = mockPeerOn.mock.calls.find(
      (call) => call[0] === "connection",
    )?.[1];

    // First player joins
    const mockConn1 = createMockConnection("player-1");
    connectionHandler!(mockConn1);
    mockConn1._trigger("data", {
      type: "action",
      payload: { type: "join", displayName: "Alice" },
    });

    // Second player joins with same name (different case) — treated as reconnection
    const mockConn2 = createMockConnection("player-2");
    connectionHandler!(mockConn2);
    mockConn2._trigger("data", {
      type: "action",
      payload: { type: "join", displayName: "ALICE" },
    });

    // Both joins should succeed (reconnection replaces old connection)
    expect(actionCallback).toHaveBeenCalledTimes(2);
    expect(actionCallback).toHaveBeenCalledWith("player-1", {
      type: "join",
      displayName: "Alice",
    });
    expect(actionCallback).toHaveBeenCalledWith("player-2", {
      type: "join",
      displayName: "ALICE",
    });

    // Old connection should be closed
    expect(mockConn1.close).toHaveBeenCalled();
  });

  it("should call onPlayerConnected callback on join", () => {
    const host = createPeerHost();
    const connectedCallback = vi.fn();
    host.onPlayerConnected(connectedCallback);
    host.createHost("session1");

    const connectionHandler = mockPeerOn.mock.calls.find(
      (call) => call[0] === "connection",
    )?.[1];

    const mockConn = createMockConnection("player-1");
    connectionHandler!(mockConn);
    mockConn._trigger("data", {
      type: "action",
      payload: { type: "join", displayName: "Alice" },
    });

    expect(connectedCallback).toHaveBeenCalledWith("player-1");
  });

  it("should call onPlayerDisconnected callback on close", () => {
    const host = createPeerHost();
    const disconnectedCallback = vi.fn();
    host.onPlayerDisconnected(disconnectedCallback);
    host.createHost("session1");

    const connectionHandler = mockPeerOn.mock.calls.find(
      (call) => call[0] === "connection",
    )?.[1];

    const mockConn = createMockConnection("player-1");
    connectionHandler!(mockConn);

    // Player joins first
    mockConn._trigger("data", {
      type: "action",
      payload: { type: "join", displayName: "Alice" },
    });

    // Then disconnects
    mockConn._trigger("close");

    expect(disconnectedCallback).toHaveBeenCalledWith("player-1");
  });

  it("should send full state to newly connected players", () => {
    const host = createPeerHost();
    host.createHost("session1");

    // Set the latest state by broadcasting
    const state = createMockSessionState();
    host.broadcastState(state);

    const connectionHandler = mockPeerOn.mock.calls.find(
      (call) => call[0] === "connection",
    )?.[1];

    const mockConn = createMockConnection("player-2");
    connectionHandler!(mockConn);

    // Player joins
    mockConn._trigger("data", {
      type: "action",
      payload: { type: "join", displayName: "Bob" },
    });

    // Should receive the current state
    expect(mockConn.send).toHaveBeenCalledWith({
      type: "state",
      payload: state,
    });
  });

  it("should kick a player by sending kick message and closing connection", () => {
    const host = createPeerHost();
    host.createHost("session1");

    const connectionHandler = mockPeerOn.mock.calls.find(
      (call) => call[0] === "connection",
    )?.[1];

    const mockConn = createMockConnection("player-1");
    connectionHandler!(mockConn);

    // Player joins
    mockConn._trigger("data", {
      type: "action",
      payload: { type: "join", displayName: "Alice" },
    });

    // Admin kicks the player
    host.kickPlayer("player-1");

    expect(mockConn.send).toHaveBeenCalledWith({ type: "kicked" });
    expect(mockConn.close).toHaveBeenCalled();
  });

  it("should clean up all connections on destroy", () => {
    const host = createPeerHost();
    host.createHost("session1");

    const connectionHandler = mockPeerOn.mock.calls.find(
      (call) => call[0] === "connection",
    )?.[1];

    const mockConn = createMockConnection("player-1");
    connectionHandler!(mockConn);
    mockConn._trigger("data", {
      type: "action",
      payload: { type: "join", displayName: "Alice" },
    });

    host.destroy();

    expect(mockConn.close).toHaveBeenCalled();
    expect(mockPeerDestroy).toHaveBeenCalled();
  });

  it("should not route actions from unregistered connections", () => {
    const host = createPeerHost();
    const actionCallback = vi.fn();
    host.onPlayerAction(actionCallback);
    host.createHost("session1");

    const connectionHandler = mockPeerOn.mock.calls.find(
      (call) => call[0] === "connection",
    )?.[1];

    const mockConn = createMockConnection("player-1");
    connectionHandler!(mockConn);

    // Send a vote action without joining first
    mockConn._trigger("data", {
      type: "action",
      payload: { type: "vote", card: 5 },
    });

    // Should not be routed since player hasn't joined
    expect(actionCallback).not.toHaveBeenCalled();
  });

  it("should sanitize display names on join", () => {
    const host = createPeerHost();
    const actionCallback = vi.fn();
    host.onPlayerAction(actionCallback);
    host.createHost("session1");

    const connectionHandler = mockPeerOn.mock.calls.find(
      (call) => call[0] === "connection",
    )?.[1];

    const mockConn = createMockConnection("player-1");
    connectionHandler!(mockConn);

    // Send join with HTML in name
    mockConn._trigger("data", {
      type: "action",
      payload: {
        type: "join",
        displayName: "<script>alert('xss')</script>Alice",
      },
    });

    expect(actionCallback).toHaveBeenCalledWith("player-1", {
      type: "join",
      displayName: "alert('xss')Alice",
    });
  });
});
