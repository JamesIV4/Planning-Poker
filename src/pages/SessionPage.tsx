import { useState, useEffect, useRef } from "react";
import type { FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePokerStore } from "../store/usePokerStore";
import { useSessionConnection } from "../networking/useSessionConnection";
import { isValidDisplayName } from "../utils/validation";
import { loadSession, clearSession } from "../utils/sessionPersistence";
import {
  createSimulatedPlayer,
  getRandomVote,
  isLocalhost,
} from "../utils/simulatedVoters";
import { CARD_VALUES } from "../types";
import type { CardValue, Player } from "../types";
import { PokerTable } from "../components/PokerTable";
import { CardSelectionPanel } from "../components/CardSelectionPanel";
import { ConnectionStatus } from "../components/ConnectionStatus";

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const currentPlayer = usePokerStore((state) => state.currentPlayer);
  const session = usePokerStore((state) => state.session);
  const gameState = usePokerStore((state) => state.gameState);

  // Restore session from localStorage on mount if store is empty
  useEffect(() => {
    if (currentPlayer) {
      // Already have state, no need to restore
      setIsInitializing(false);
      return;
    }

    if (!sessionId) {
      setIsInitializing(false);
      return;
    }

    const persisted = loadSession(sessionId);
    if (persisted) {
      usePokerStore.setState({
        session: persisted.session,
        currentPlayer: persisted.currentPlayer,
        gameState: persisted.gameState,
      });
    }

    setIsInitializing(false);
  }, [sessionId, currentPlayer]);

  // Determine if the user is the admin (created this session)
  const isAdmin = !!(currentPlayer?.isAdmin && session?.id === sessionId);

  // User has joined if they have a currentPlayer set
  const hasJoined = !!currentPlayer;

  // Wire up networking
  const {
    connectionStatus,
    sendAction,
    sendVoteOptimistic,
    kickPlayer,
    rejoin,
  } = useSessionConnection({
    sessionId: sessionId ?? "",
    isAdmin,
    hasJoined,
  });

  // Reset isEditing when a new voting round starts
  useEffect(() => {
    if (gameState === "voting") {
      setIsEditing(false);
    }
  }, [gameState]);

  // Simulated voters (localhost only)
  const simulatedPlayersRef = useRef<Player[]>([]);
  const showSimControls = isLocalhost() && isAdmin;

  // When a voting round starts, simulated voters cast random votes after a short delay
  useEffect(() => {
    if (gameState !== "voting" || simulatedPlayersRef.current.length === 0)
      return;

    const timers = simulatedPlayersRef.current.map(
      (player, i) =>
        setTimeout(
          () => {
            const store = usePokerStore.getState();
            if (store.gameState === "voting") {
              store.castVote(player.id, getRandomVote());
            }
          },
          500 + i * 300,
        ), // Stagger votes for realism
    );

    return () => timers.forEach(clearTimeout);
  }, [gameState]);

  const handleAddSimPlayer = () => {
    const player = createSimulatedPlayer();
    simulatedPlayersRef.current = [...simulatedPlayersRef.current, player];
    usePokerStore.getState().addPlayer(player);
  };

  const handleRemoveSimPlayers = () => {
    const store = usePokerStore.getState();
    for (const player of simulatedPlayersRef.current) {
      store.removePlayer(player.id);
    }
    simulatedPlayersRef.current = [];
  };

  function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = displayName.trim();

    if (!isValidDisplayName(trimmed)) {
      if (trimmed.length === 0) {
        setError("Display name is required.");
      } else {
        setError("Display name must be 50 characters or fewer.");
      }
      return;
    }

    // For local sessions (admin is in this browser), check for duplicates
    if (session && session.id === sessionId) {
      const isDuplicate = session.players.some(
        (p) => p.displayName.toLowerCase() === trimmed.toLowerCase(),
      );

      if (isDuplicate) {
        setError("This name is already taken. Please choose a different name.");
        return;
      }
    }

    // Join the session — set player identity in the store.
    // The networking hook will connect to the host via PeerJS and
    // the host will send back the full session state.
    const joinSession = usePokerStore.getState().joinSession;
    joinSession(sessionId!, trimmed);
  }

  // Show game view if user is admin or has joined
  if (isAdmin || hasJoined) {
    const players = session?.players ?? [];
    const votes = session?.currentRound?.votes ?? [];
    const currentPlayerId = currentPlayer?.id ?? "";

    // Build votesChanged set (player IDs with wasChanged: true)
    const votesChanged = new Set<string>(
      votes.filter((v) => v.wasChanged).map((v) => v.playerId),
    );

    // Get current player's selected card
    const currentPlayerVote = votes.find((v) => v.playerId === currentPlayerId);
    const selectedCard: CardValue | null = currentPlayerVote?.card ?? null;

    // Computed values from store
    const store = usePokerStore.getState();
    const voteDistribution = store.getVoteDistribution();
    const averageScore = store.getAverageScore();
    const agreementRatio = store.getAgreementRatio();

    // Handle card selection
    const handleSelectCard = (card: CardValue) => {
      if (!currentPlayerId) return;

      if (isAdmin) {
        // Admin applies directly to store (broadcast handled by subscription)
        if (gameState === "revealed") {
          store.editVoteAfterReveal(currentPlayerId, card);
        } else {
          store.castVote(currentPlayerId, card);
        }
      } else {
        // Player: optimistic update + send to host
        if (gameState === "revealed") {
          // For post-reveal editing, send action to host
          sendAction({ type: "vote", card });
        } else {
          sendVoteOptimistic(card);
        }
      }

      // Exit edit mode after selecting a card
      if (isEditing) {
        setIsEditing(false);
      }
    };

    // Handle card deselection
    const handleDeselectCard = () => {
      if (!currentPlayerId) return;

      if (isAdmin) {
        store.removeVote(currentPlayerId);
      } else {
        sendAction({ type: "removeVote" });
      }

      // When deselecting while editing, exit editing mode
      if (isEditing) {
        setIsEditing(false);
      }
    };

    // Handle reveal cards (admin only)
    const handleRevealCards = () => {
      store.revealCards();
    };

    // Handle start new voting (admin only)
    const handleStartNewVoting = () => {
      store.startNewVoting();
    };

    // Handle edit vote toggle
    const handleEditVote = () => {
      setIsEditing((prev) => !prev);
    };

    // Copy session link to clipboard
    const handleCopyLink = () => {
      const link = `${window.location.origin}${window.location.pathname}#/session/${sessionId}`;
      navigator.clipboard.writeText(link).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };

    // End session and navigate home
    const handleEndSession = () => {
      clearSession();
      usePokerStore.setState({
        session: null,
        currentPlayer: null,
        gameState: "waiting",
      });
      navigate("/");
    };

    return (
      <div className="session-page session-page--game">
        <header className="session-header">
          <h1 className="session-header__name">{session?.name}</h1>
          <div className="session-header__actions">
            <button
              className="session-header__copy-btn"
              onClick={handleCopyLink}
              type="button"
              aria-label="Copy session link"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
            {isAdmin && (
              <button
                className="session-header__end-btn"
                onClick={handleEndSession}
                type="button"
                aria-label="End session"
              >
                End Session
              </button>
            )}
            {showSimControls && (
              <>
                {simulatedPlayersRef.current.length > 0 && (
                  <button
                    className="session-header__sim-btn session-header__sim-btn--remove"
                    onClick={handleRemoveSimPlayers}
                    type="button"
                    aria-label="Remove all simulated voters"
                  >
                    Clear Bots
                  </button>
                )}
                <button
                  className="session-header__sim-btn"
                  onClick={handleAddSimPlayer}
                  type="button"
                  aria-label="Add simulated voter"
                >
                  + Bot
                </button>
              </>
            )}
          </div>
        </header>

        <div className="game-view" data-testid="game-view">
          <ConnectionStatus status={connectionStatus} onRejoin={rejoin} />

          <PokerTable
            players={players}
            votes={votes}
            gameState={gameState}
            isAdmin={isAdmin}
            isEditing={isEditing}
            currentPlayerId={currentPlayerId}
            votesChanged={votesChanged}
            onRevealCards={handleRevealCards}
            onStartNewVoting={handleStartNewVoting}
            onEditVote={handleEditVote}
            onKickPlayer={kickPlayer}
          />

          <CardSelectionPanel
            cards={CARD_VALUES}
            selectedCard={selectedCard}
            gameState={gameState}
            isEditing={isEditing}
            voteDistribution={
              gameState === "revealed" ? voteDistribution : null
            }
            averageScore={averageScore}
            agreementRatio={agreementRatio}
            onSelectCard={handleSelectCard}
            onDeselectCard={handleDeselectCard}
          />
        </div>
      </div>
    );
  }

  // Don't show anything until initialization is complete
  if (isInitializing) {
    return null;
  }

  // Show join dialog
  return (
    <div className="session-page">
      <div className="session-card">
        <h1>Join Session</h1>
        <p className="subtitle">
          Enter your name to join the planning poker session.
        </p>

        <form onSubmit={handleJoin} className="join-session-form">
          <label htmlFor="display-name">Display Name</label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Jane Smith"
            maxLength={50}
            autoFocus
          />
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary">
            Join Session
          </button>
        </form>
      </div>
    </div>
  );
}
