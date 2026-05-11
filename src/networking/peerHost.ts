import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { PEER_CONFIG } from "./peerConfig";
import type {
  PlayerAction,
  SessionState,
  StateMessage,
  KickMessage,
} from "../types";
import {
  isValidPlayerAction,
  isValidDisplayName,
  sanitize,
} from "../utils/validation";

/**
 * PeerJS Host — manages the admin side of the star topology.
 * The admin registers as a named peer and accepts incoming player connections.
 * All state is broadcast from the admin to connected players.
 */

export interface PeerHost {
  createHost(sessionId: string): void;
  broadcastState(state: SessionState): void;
  onPlayerAction(
    callback: (playerId: string, action: PlayerAction) => void,
  ): void;
  onPlayerConnected(callback: (playerId: string) => void): void;
  onPlayerDisconnected(callback: (playerId: string) => void): void;
  kickPlayer(playerId: string): void;
  destroy(): void;
}

type PlayerActionCallback = (playerId: string, action: PlayerAction) => void;
type PlayerConnectionCallback = (playerId: string) => void;

/**
 * Creates a PeerJS host instance for the admin.
 * Manages connections, validates messages, and broadcasts state.
 */
export function createPeerHost(): PeerHost {
  let peer: Peer | null = null;
  const connections = new Map<string, DataConnection>();
  let playerActionCallback: PlayerActionCallback | null = null;
  let playerConnectedCallback: PlayerConnectionCallback | null = null;
  let playerDisconnectedCallback: PlayerConnectionCallback | null = null;

  // Track display names to reject duplicates (case-insensitive)
  const playerDisplayNames = new Map<string, string>(); // playerId -> displayName (lowercased)

  // Track the latest state for sending to newly connected players
  let latestState: SessionState | null = null;

  function createHost(sessionId: string): void {
    // Destroy any existing peer to avoid conflicts on the signaling server
    if (peer) {
      console.log(
        "[PeerHost] Destroying previous peer before creating new one",
      );
      peer.destroy();
      peer = null;
      connections.clear();
      playerDisplayNames.clear();
    }

    const peerId = `planning-poker-${sessionId}`;
    console.log("[PeerHost] Creating host with peer ID:", peerId);
    peer = new Peer(peerId, PEER_CONFIG);

    peer.on("open", (id) => {
      console.log("[PeerHost] ✓ Registered with peer ID:", id);
    });

    peer.on("connection", (conn: DataConnection) => {
      console.log("[PeerHost] Incoming connection from:", conn.peer);
      handleNewConnection(conn);
    });

    peer.on("error", (err) => {
      console.error("[PeerHost] Peer error:", err);
    });

    peer.on("disconnected", () => {
      console.warn(
        "[PeerHost] Disconnected from signaling server, attempting reconnect...",
      );
      if (peer && !peer.destroyed) {
        peer.reconnect();
      }
    });
  }

  function handleNewConnection(conn: DataConnection): void {
    // We don't assign a player ID yet — we wait for the "join" action
    // The connection's peer ID is the PeerJS-assigned ID for the remote peer
    let assignedPlayerId: string | null = null;

    console.log(
      "[PeerHost] Setting up connection handlers for:",
      conn.peer,
      "open:",
      conn.open,
    );

    // In some cases the connection may already be open when the event fires
    if (conn.open) {
      console.log("[PeerHost] ✓ Data channel already OPEN with:", conn.peer);
    }

    conn.on("open", () => {
      console.log("[PeerHost] ✓ Data channel OPEN with:", conn.peer);
      // Connection is open, wait for join action
    });

    conn.on("data", (rawData: unknown) => {
      // Validate the incoming message as an ActionMessage wrapper
      const message = rawData as Record<string, unknown>;

      if (message && message.type === "action" && message.payload) {
        const action = message.payload;

        if (!isValidPlayerAction(action)) {
          // Reject malformed messages silently
          return;
        }

        const validAction = action as PlayerAction;

        if (validAction.type === "join") {
          // Handle join action
          const displayName = sanitize(validAction.displayName.trim());

          // Validate display name
          if (!isValidDisplayName(displayName)) {
            // Send error back
            sendError(conn, "Invalid display name");
            return;
          }

          // Check for duplicate display names (case-insensitive).
          // If the same name is already connected, treat as reconnection:
          // close the old connection and accept the new one.
          const lowerName = displayName.toLowerCase();
          for (const [
            existingId,
            existingName,
          ] of playerDisplayNames.entries()) {
            if (existingName === lowerName) {
              // Reconnection: close old connection, remove old tracking
              const oldConn = connections.get(existingId);
              if (oldConn && oldConn !== conn) {
                oldConn.close();
              }
              connections.delete(existingId);
              playerDisplayNames.delete(existingId);
              break;
            }
          }

          // Generate a player ID from the connection's peer
          assignedPlayerId = conn.peer;
          connections.set(assignedPlayerId, conn);
          playerDisplayNames.set(assignedPlayerId, lowerName);

          // Notify about new player connection
          if (playerConnectedCallback) {
            playerConnectedCallback(assignedPlayerId);
          }

          // Route the join action to the store
          if (playerActionCallback) {
            playerActionCallback(assignedPlayerId, {
              type: "join",
              displayName,
            });
          }

          // Send current state to the newly connected player.
          // The store subscription broadcast should have already sent it
          // (since the connection is registered before addPlayer is called),
          // but we also send explicitly to guarantee the player receives state
          // even if the subscription hasn't fired yet.
          if (latestState && conn.open) {
            sendState(conn, latestState);
          }
        } else {
          // For non-join actions, the player must already be registered
          if (!assignedPlayerId || !connections.has(assignedPlayerId)) {
            return;
          }

          // Route the action to the store
          if (playerActionCallback) {
            playerActionCallback(assignedPlayerId, validAction);
          }
        }
      }
    });

    conn.on("close", () => {
      if (assignedPlayerId) {
        connections.delete(assignedPlayerId);
        playerDisplayNames.delete(assignedPlayerId);

        if (playerDisconnectedCallback) {
          playerDisconnectedCallback(assignedPlayerId);
        }
      }
    });

    conn.on("error", (err) => {
      console.error("[PeerHost] Connection error:", err);
      if (assignedPlayerId) {
        connections.delete(assignedPlayerId);
        playerDisplayNames.delete(assignedPlayerId);

        if (playerDisconnectedCallback) {
          playerDisconnectedCallback(assignedPlayerId);
        }
      }
    });
  }

  function broadcastState(state: SessionState): void {
    latestState = state;
    const message: StateMessage = { type: "state", payload: state };

    for (const conn of connections.values()) {
      if (conn.open) {
        conn.send(message);
      }
    }
  }

  function onPlayerAction(callback: PlayerActionCallback): void {
    playerActionCallback = callback;
  }

  function onPlayerConnected(callback: PlayerConnectionCallback): void {
    playerConnectedCallback = callback;
  }

  function onPlayerDisconnected(callback: PlayerConnectionCallback): void {
    playerDisconnectedCallback = callback;
  }

  function kickPlayer(playerId: string): void {
    const conn = connections.get(playerId);
    if (conn) {
      // Send kick notification
      const kickMessage: KickMessage = { type: "kicked" };
      conn.send(kickMessage);

      // Close the data channel
      conn.close();

      // Remove from tracking
      connections.delete(playerId);
      playerDisplayNames.delete(playerId);
    }
  }

  function destroy(): void {
    // Close all connections
    for (const conn of connections.values()) {
      conn.close();
    }
    connections.clear();
    playerDisplayNames.clear();
    latestState = null;

    // Destroy the peer instance
    if (peer) {
      peer.destroy();
      peer = null;
    }

    // Clear callbacks
    playerActionCallback = null;
    playerConnectedCallback = null;
    playerDisconnectedCallback = null;
  }

  // Helper: send state to a single connection
  function sendState(conn: DataConnection, state: SessionState): void {
    const message: StateMessage = { type: "state", payload: state };
    if (conn.open) {
      conn.send(message);
    }
  }

  // Helper: send error message to a connection
  function sendError(conn: DataConnection, errorMessage: string): void {
    const message = { type: "error", payload: errorMessage };
    if (conn.open) {
      conn.send(message);
    }
  }

  return {
    createHost,
    broadcastState,
    onPlayerAction,
    onPlayerConnected,
    onPlayerDisconnected,
    kickPlayer,
    destroy,
  };
}
