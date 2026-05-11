import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { PEER_CONFIG } from "./peerConfig";
import type {
  PlayerAction,
  SessionState,
  ActionMessage,
  StateMessage,
} from "../types";

/**
 * PeerJS Client — manages the player side of the star topology.
 * The player connects to the admin's named peer and sends actions / receives state.
 */

export interface PeerClient {
  connectToHost(sessionId: string): void;
  sendAction(action: PlayerAction): void;
  onStateUpdate(callback: (state: SessionState) => void): void;
  onConnectionChange(callback: (connected: boolean) => void): void;
  onKicked(callback: () => void): void;
  onSessionEnded(callback: () => void): void;
  destroy(): void;
}

type StateUpdateCallback = (state: SessionState) => void;
type ConnectionChangeCallback = (connected: boolean) => void;
type KickedCallback = () => void;
type SessionEndedCallback = () => void;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Creates a PeerJS client instance for a player.
 * Connects to the admin host, sends actions, and receives state updates.
 * Retries connection up to 3 times if the host peer is not yet available.
 */
export function createPeerClient(): PeerClient {
  let peer: Peer | null = null;
  let connection: DataConnection | null = null;
  let stateUpdateCallback: StateUpdateCallback | null = null;
  let connectionChangeCallback: ConnectionChangeCallback | null = null;
  let kickedCallback: KickedCallback | null = null;
  let sessionEndedCallback: SessionEndedCallback | null = null;
  let retryCount = 0;
  let currentHostPeerId: string | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function connectToHost(sessionId: string): void {
    currentHostPeerId = `planning-poker-${sessionId}`;
    retryCount = 0;

    console.log(
      "[PeerClient] Creating peer and connecting to host:",
      currentHostPeerId,
    );

    peer = new Peer(PEER_CONFIG);

    peer.on("open", (id) => {
      console.log(
        "[PeerClient] Peer registered with ID:",
        id,
        "— now connecting to host:",
        currentHostPeerId,
      );
      // Once our peer is registered on the signaling server, connect to the host
      openConnection();
    });

    peer.on("error", (err) => {
      const errorType = (err as { type?: string }).type;

      // "peer-unavailable" means the host peer ID wasn't found on the signaling server.
      // This can happen if the host is still registering. Retry a few times.
      if (errorType === "peer-unavailable" && retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(
          `[PeerClient] Host not found (peer-unavailable), retrying (${retryCount}/${MAX_RETRIES})...`,
        );
        retryTimer = setTimeout(() => openConnection(), RETRY_DELAY_MS);
      } else {
        console.error("[PeerClient] Peer error (type=" + errorType + "):", err);
        if (connectionChangeCallback) {
          connectionChangeCallback(false);
        }
      }
    });

    peer.on("disconnected", () => {
      console.warn("[PeerClient] Peer disconnected from signaling server");
      if (connectionChangeCallback) {
        connectionChangeCallback(false);
      }
    });
  }

  function openConnection(): void {
    if (!peer || peer.destroyed || !currentHostPeerId) {
      console.error(
        "[PeerClient] Cannot open connection: peer=" +
          !!peer +
          " destroyed=" +
          peer?.destroyed +
          " hostId=" +
          currentHostPeerId,
      );
      return;
    }

    console.log("[PeerClient] Attempting connection to:", currentHostPeerId);
    connection = peer.connect(currentHostPeerId, { serialization: "json" });

    // Monitor the underlying RTCPeerConnection state for debugging
    const peerConnection = (
      connection as unknown as { peerConnection?: RTCPeerConnection }
    ).peerConnection;
    if (peerConnection) {
      console.log(
        "[PeerClient] RTCPeerConnection state:",
        peerConnection.iceConnectionState,
      );
      peerConnection.oniceconnectionstatechange = () => {
        console.log(
          "[PeerClient] ICE state:",
          peerConnection.iceConnectionState,
        );
      };
      peerConnection.onconnectionstatechange = () => {
        console.log(
          "[PeerClient] Connection state:",
          peerConnection.connectionState,
        );
      };
    } else {
      console.log(
        "[PeerClient] No peerConnection available yet (will be created during negotiation)",
      );
    }

    // Timeout: if connection doesn't open within 10 seconds, report failure
    const connectionTimeout = setTimeout(() => {
      if (connection && !connection.open) {
        // Try to get ICE state at timeout for debugging
        const pc = (
          connection as unknown as { peerConnection?: RTCPeerConnection }
        ).peerConnection;
        console.error(
          "[PeerClient] Connection timed out after 10s — ICE state:",
          pc?.iceConnectionState,
          "Connection state:",
          pc?.connectionState,
        );
        if (connectionChangeCallback) {
          connectionChangeCallback(false);
        }
      }
    }, 10000);

    connection.on("open", () => {
      clearTimeout(connectionTimeout);
      console.log("[PeerClient] ✓ Connection OPEN to host");
      retryCount = 0; // Reset on success
      if (connectionChangeCallback) {
        connectionChangeCallback(true);
      }
    });

    connection.on("data", (rawData: unknown) => {
      handleMessage(rawData);
    });

    connection.on("close", () => {
      console.log("[PeerClient] Connection CLOSED");
      if (connectionChangeCallback) {
        connectionChangeCallback(false);
      }
    });

    connection.on("error", (err) => {
      console.error("[PeerClient] Connection error:", err);
      if (connectionChangeCallback) {
        connectionChangeCallback(false);
      }
    });
  }

  function handleMessage(rawData: unknown): void {
    const message = rawData as Record<string, unknown>;

    if (!message || typeof message !== "object") {
      console.warn("[PeerClient] Received non-object message:", rawData);
      return;
    }

    switch (message.type) {
      case "state": {
        const stateMessage = message as unknown as StateMessage;
        if (stateMessage.payload && stateUpdateCallback) {
          console.log(
            "[PeerClient] Received state message, session players:",
            (stateMessage.payload as SessionState).session?.players?.length ??
              0,
          );
          stateUpdateCallback(stateMessage.payload);
        }
        break;
      }
      case "kicked": {
        if (kickedCallback) {
          kickedCallback();
        }
        // Close the connection after being kicked
        if (connection) {
          connection.close();
        }
        break;
      }
      case "sessionEnded": {
        console.log("[PeerClient] Session ended by host");
        if (sessionEndedCallback) {
          sessionEndedCallback();
        }
        if (connection) {
          connection.close();
        }
        break;
      }
      case "error": {
        console.warn("[PeerClient] Error from host:", message.payload);
        break;
      }
      default:
        break;
    }
  }

  function sendAction(action: PlayerAction): void {
    if (!connection || !connection.open) {
      console.warn("[PeerClient] Cannot send action: not connected");
      return;
    }

    const message: ActionMessage = { type: "action", payload: action };
    connection.send(message);
  }

  function onStateUpdate(callback: StateUpdateCallback): void {
    stateUpdateCallback = callback;
  }

  function onConnectionChange(callback: ConnectionChangeCallback): void {
    connectionChangeCallback = callback;
  }

  function onKicked(callback: KickedCallback): void {
    kickedCallback = callback;
  }

  function onSessionEnded(callback: SessionEndedCallback): void {
    sessionEndedCallback = callback;
  }

  function destroy(): void {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    if (connection) {
      connection.close();
      connection = null;
    }

    if (peer) {
      peer.destroy();
      peer = null;
    }

    stateUpdateCallback = null;
    connectionChangeCallback = null;
    kickedCallback = null;
    sessionEndedCallback = null;
    currentHostPeerId = null;
  }

  return {
    connectToHost,
    sendAction,
    onStateUpdate,
    onConnectionChange,
    onKicked,
    onSessionEnded,
    destroy,
  };
}
