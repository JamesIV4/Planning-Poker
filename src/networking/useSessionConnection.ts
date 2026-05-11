import { useEffect, useRef, useCallback, useState } from "react";
import { usePokerStore } from "../store/usePokerStore";
import { createPeerHost } from "./peerHost";
import type { PeerHost } from "./peerHost";
import { createPeerClient } from "./peerClient";
import type { PeerClient } from "./peerClient";
import type { CardValue, PlayerAction, SessionState } from "../types";

export type ConnectionStatusType =
  | "connected"
  | "disconnected"
  | "kicked"
  | "error";

export interface UseSessionConnectionOptions {
  sessionId: string;
  isAdmin: boolean;
  hasJoined: boolean;
}

export interface UseSessionConnectionResult {
  connectionStatus: ConnectionStatusType;
  sendAction: (action: PlayerAction) => void;
  sendVoteOptimistic: (card: CardValue) => void;
  kickPlayer: (playerId: string) => void;
  rejoin: () => void;
}

export function useSessionConnection({
  sessionId,
  isAdmin,
  hasJoined,
}: UseSessionConnectionOptions): UseSessionConnectionResult {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatusType>(isAdmin ? "connected" : "disconnected");

  const hostRef = useRef<PeerHost | null>(null);
  const clientRef = useRef<PeerClient | null>(null);

  // Initialize admin host.
  // We use a ref to track initialization so React Strict Mode's double-invoke
  // doesn't destroy and recreate the PeerJS connection (which causes signaling issues).
  const hostInitializedRef = useRef(false);
  const hostSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    // If session ID changed, destroy old host first
    if (hostInitializedRef.current && hostSessionIdRef.current !== sessionId) {
      console.log(
        "[useSessionConnection] Session ID changed, destroying old host",
      );
      if (hostRef.current) {
        hostRef.current.destroy();
        hostRef.current = null;
      }
      hostInitializedRef.current = false;
    }

    if (!hostInitializedRef.current) {
      hostInitializedRef.current = true;
      hostSessionIdRef.current = sessionId;

      console.log(
        "[useSessionConnection] Initializing admin host for session:",
        sessionId,
      );

      const host = createPeerHost();
      hostRef.current = host;

      host.onPlayerAction((playerId: string, action: PlayerAction) => {
        const store = usePokerStore.getState();
        switch (action.type) {
          case "join":
            store.addPlayer({
              id: playerId,
              displayName: action.displayName,
              isAdmin: false,
            });
            break;
          case "vote":
            store.castVote(playerId, action.card);
            break;
          case "removeVote":
            store.removeVote(playerId);
            break;
        }
      });

      host.onPlayerDisconnected((playerId: string) => {
        console.log("[useSessionConnection] Player disconnected:", playerId);
        const store = usePokerStore.getState();
        const playerExists = store.session?.players.some(
          (p) => p.id === playerId,
        );
        if (playerExists) {
          store.removePlayer(playerId);
          const freshState = buildFreshState();
          if (freshState && hostRef.current) {
            hostRef.current.broadcastState(freshState);
          }
        }
      });

      host.onPlayerConnected((_playerId: string) => {
        // State will be sent after join action is processed
      });

      host.createHost(sessionId);
      setConnectionStatus("connected");
    }

    // Always (re-)subscribe to store changes for broadcasting.
    // This ensures the subscription survives React Strict Mode's
    // effect cleanup/re-run cycle.
    const unsubscribe = usePokerStore.subscribe(() => {
      const freshState = buildFreshState();
      if (freshState && hostRef.current) {
        hostRef.current.broadcastState(freshState);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isAdmin, sessionId]);

  // Cleanup host on true unmount (page navigation away)
  useEffect(() => {
    return () => {
      if (hostRef.current && !isAdmin) {
        // Only destroy if we're navigating away from being admin
        hostRef.current.destroy();
        hostRef.current = null;
        hostInitializedRef.current = false;
      }
    };
  }, []);

  // Clean disconnect on page unload (ensures host detects client leaving promptly)
  useEffect(() => {
    const handleUnload = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (clientRef.current) {
        clientRef.current.destroy();
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  // Initialize player client
  const clientInitializedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Reconnect helper with exponential backoff (500ms, 1s, 2s, 4s, 8s)
  const attemptReconnect = useCallback((sid: string, attempt: number) => {
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      console.log(
        "[useSessionConnection] Max reconnect attempts reached, giving up",
      );
      return;
    }

    const delay = Math.min(500 * Math.pow(2, attempt), 8000);
    console.log(
      `[useSessionConnection] Scheduling reconnect attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`,
    );

    reconnectTimerRef.current = setTimeout(() => {
      const currentPlayer = usePokerStore.getState().currentPlayer;
      if (!currentPlayer) return;

      console.log(`[useSessionConnection] Reconnect attempt ${attempt + 1}...`);

      if (clientRef.current) {
        clientRef.current.destroy();
        clientRef.current = null;
      }
      clientInitializedRef.current = false;

      const newClient = createPeerClient();
      clientRef.current = newClient;
      clientInitializedRef.current = true;

      newClient.onStateUpdate((state: SessionState) => {
        console.log(
          "[useSessionConnection] Received state update (reconnect), players:",
          state.session?.players?.length ?? 0,
        );
        usePokerStore.getState().applyAuthoritativeState(state);
      });

      newClient.onConnectionChange((reconnected: boolean) => {
        if (reconnected) {
          console.log("[useSessionConnection] Reconnected successfully");
          setConnectionStatus("connected");
          const player = usePokerStore.getState().currentPlayer;
          if (player) {
            newClient.sendAction({
              type: "join",
              displayName: player.displayName,
            });
          }
        } else {
          // Try again with next attempt
          attemptReconnect(sid, attempt + 1);
        }
      });

      newClient.onKicked(() => {
        setConnectionStatus("kicked");
      });

      newClient.connectToHost(sid);
    }, delay);
  }, []);

  useEffect(() => {
    if (isAdmin || !hasJoined) return;
    if (clientInitializedRef.current) return;
    clientInitializedRef.current = true;

    console.log(
      "[useSessionConnection] Initializing player client for session:",
      sessionId,
    );

    const client = createPeerClient();
    clientRef.current = client;

    client.onStateUpdate((state: SessionState) => {
      console.log(
        "[useSessionConnection] Received state update from host, players:",
        state.session?.players?.length ?? 0,
        "gameState:",
        state.round?.state ?? "waiting",
      );
      usePokerStore.getState().applyAuthoritativeState(state);
    });

    client.onConnectionChange((connected: boolean) => {
      console.log("[useSessionConnection] Connection changed:", connected);
      if (connected) {
        setConnectionStatus("connected");
        const player = usePokerStore.getState().currentPlayer;
        if (player) {
          console.log(
            "[useSessionConnection] Sending join action for:",
            player.displayName,
          );
          client.sendAction({ type: "join", displayName: player.displayName });
        }
      } else {
        setConnectionStatus((prev) => {
          if (prev === "kicked") return "kicked";
          // Start silent reconnection immediately
          attemptReconnect(sessionId, 0);
          // Keep status as "connected" briefly — the banner delay in
          // ConnectionStatus handles the 1s grace period
          return "disconnected";
        });
      }
    });

    client.onKicked(() => {
      console.log("[useSessionConnection] Player was kicked");
      setConnectionStatus("kicked");
    });

    console.log("[useSessionConnection] Calling connectToHost:", sessionId);
    client.connectToHost(sessionId);

    return () => {
      // Same pattern: don't destroy in Strict Mode re-invoke
    };
  }, [isAdmin, sessionId, hasJoined]);

  // Send action (player side)
  const sendAction = useCallback((action: PlayerAction) => {
    if (clientRef.current) {
      clientRef.current.sendAction(action);
    }
  }, []);

  // Optimistic vote update (player side)
  const sendVoteOptimistic = useCallback((card: CardValue) => {
    const store = usePokerStore.getState();
    const currentPlayer = store.currentPlayer;
    if (!currentPlayer) return;
    store.castVote(currentPlayer.id, card);
    if (clientRef.current) {
      clientRef.current.sendAction({ type: "vote", card });
    }
  }, []);

  // Kick player (admin side)
  const kickPlayer = useCallback((playerId: string) => {
    if (!hostRef.current) return;
    hostRef.current.kickPlayer(playerId);
    usePokerStore.getState().kickPlayer(playerId);
  }, []);

  // Rejoin after being kicked (player side)
  const rejoin = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.destroy();
      clientRef.current = null;
    }
    clientInitializedRef.current = false;
    setConnectionStatus("disconnected");

    const client = createPeerClient();
    clientRef.current = client;
    clientInitializedRef.current = true;

    client.onStateUpdate((state: SessionState) => {
      usePokerStore.getState().applyAuthoritativeState(state);
    });

    client.onConnectionChange((connected: boolean) => {
      if (connected) {
        setConnectionStatus("connected");
        const player = usePokerStore.getState().currentPlayer;
        if (player) {
          client.sendAction({ type: "join", displayName: player.displayName });
        }
      } else {
        setConnectionStatus((prev) =>
          prev === "kicked" ? "kicked" : "disconnected",
        );
      }
    });

    client.onKicked(() => {
      setConnectionStatus("kicked");
    });

    client.connectToHost(sessionId);
  }, [sessionId]);

  return {
    connectionStatus,
    sendAction,
    sendVoteOptimistic,
    kickPlayer,
    rejoin,
  };
}

function buildFreshState(): SessionState | null {
  const { session } = usePokerStore.getState();
  if (!session) return null;
  return {
    session,
    round: session.currentRound,
    votes: session.currentRound?.votes ?? [],
  };
}
