import { useState, useEffect, useLayoutEffect, useRef } from "react";
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
import {
  fireConsensusConfetti,
  hasUnanimousNumericVote,
} from "../utils/consensusConfetti";
import { CARD_VALUES } from "../types";
import type { CardValue, Player } from "../types";
import { PokerTable } from "../components/PokerTable";
import { CardSelectionPanel } from "../components/CardSelectionPanel";
import { VotingPanelPopup } from "../components/VotingPanelPopup";
import { ConnectionStatus } from "../components/ConnectionStatus";

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingParticipants, setIsEditingParticipants] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Admin voting panel lives in a separate popup window. `wantVotingPopup`
  // tracks whether it should be open, `votingPopupAttempt` remounts the popup
  // to force a fresh open attempt (used by the retry button), and
  // `votingPopupBlocked` drives the "allow popups" hint.
  const [wantVotingPopup, setWantVotingPopup] = useState(true);
  const [votingPopupAttempt, setVotingPopupAttempt] = useState(0);
  const [votingPopupBlocked, setVotingPopupBlocked] = useState(false);

  // The blocked hint is positioned dynamically so its arrow points at the
  // "Show Voting Panel" button, clamped to the viewport so it never runs off
  // the edge of the screen.
  const votingButtonRef = useRef<HTMLButtonElement>(null);
  const [hintPos, setHintPos] = useState<{
    left: number;
    top: number;
    arrowLeft: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!votingPopupBlocked) return;

    const HINT_WIDTH = 320;
    const HALF_ARROW = 7;
    const EDGE_MARGIN = 8;
    // Arrow's default distance from the hint's left edge (arrow center).
    const ARROW_INSET = 28 + HALF_ARROW;

    const reposition = () => {
      const button = votingButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const buttonCenter = rect.left + rect.width / 2;

      // Prefer aligning the arrow under the button, then clamp the hint so it
      // stays on screen. The arrow is then re-aligned to the (clamped) hint.
      const maxLeft = window.innerWidth - HINT_WIDTH - EDGE_MARGIN;
      const left = Math.max(
        EDGE_MARGIN,
        Math.min(buttonCenter - ARROW_INSET, maxLeft),
      );
      const arrowLeft = Math.max(
        HALF_ARROW,
        Math.min(buttonCenter - left - HALF_ARROW, HINT_WIDTH - 3 * HALF_ARROW),
      );

      setHintPos({ left, top: rect.bottom + 10, arrowLeft });
    };

    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [votingPopupBlocked]);

  const currentPlayer = usePokerStore((state) => state.currentPlayer);
  const session = usePokerStore((state) => state.session);
  const gameState = usePokerStore((state) => state.gameState);

  // Restore session from localStorage on mount if store is empty
  useEffect(() => {
    if (!currentPlayer && sessionId) {
      const persisted = loadSession(sessionId);
      if (persisted) {
        usePokerStore.setState({
          session: persisted.session,
          currentPlayer: persisted.currentPlayer,
          gameState: persisted.gameState,
        });
      }
    }

    // Mark the one-time mount restore as complete. This flag exists purely to
    // gate the first render until the localStorage restore has run.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    endSession,
    rejoin,
  } = useSessionConnection({
    sessionId: sessionId ?? "",
    isAdmin,
    hasJoined,
  });

  // Reset isEditing when a new voting round starts. Adjusting state during
  // render (rather than in an effect) is React's recommended pattern for
  // resetting state in response to a value change.
  const [prevGameState, setPrevGameState] = useState(gameState);
  if (gameState !== prevGameState) {
    setPrevGameState(gameState);
    if (gameState === "voting") {
      setIsEditing(false);
    }
  }

  // Celebrate a unanimous numeric vote while results are revealed, including
  // when a post-reveal edit brings the table into line. The ref latches so the
  // burst fires once per run of consensus rather than on every vote change,
  // and re-arms if an edit breaks consensus or a new round starts.
  //
  // This lives here rather than in CardSelectionPanel because the admin renders
  // that panel twice (inline results + voting popup), which would double-fire.
  const roundVotes = session?.currentRound?.votes;
  const consensusCelebratedRef = useRef(false);
  useEffect(() => {
    if (gameState !== "revealed") {
      consensusCelebratedRef.current = false;
      return;
    }

    if (!hasUnanimousNumericVote(roundVotes ?? [])) {
      consensusCelebratedRef.current = false;
      return;
    }

    if (consensusCelebratedRef.current) return;
    consensusCelebratedRef.current = true;
    fireConsensusConfetti();
  }, [gameState, roundVotes]);

  // Update page title with session name
  useEffect(() => {
    if (session?.name) {
      document.title = `Planning Poker - ${session.name}`;
    } else {
      document.title = "Planning Poker";
    }
    return () => {
      document.title = "Planning Poker";
    };
  }, [session?.name]);

  // Simulated voters (localhost only). The ref is the source of truth used by
  // the voting effect; simPlayerCount mirrors its length for rendering so we
  // don't read the ref during render.
  const simulatedPlayersRef = useRef<Player[]>([]);
  const [simPlayerCount, setSimPlayerCount] = useState(0);
  const showSimControls = isLocalhost() && isAdmin;

  // Confetti is hard to iterate on when it only appears on a unanimous reveal,
  // so localhost gets a button to fire it on demand. Not gated on isAdmin —
  // it's useful for checking the burst position in a participant tab too.
  const showConfettiDebug = isLocalhost();

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
    setSimPlayerCount(simulatedPlayersRef.current.length);
    usePokerStore.getState().addPlayer(player);
  };

  const handleRemoveSimPlayers = () => {
    const store = usePokerStore.getState();
    for (const player of simulatedPlayersRef.current) {
      store.removePlayer(player.id);
    }
    simulatedPlayersRef.current = [];
    setSimPlayerCount(0);
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

    // Re-open the admin voting panel popup (used after it was blocked or closed)
    const handleShowVotingPanel = () => {
      setVotingPopupBlocked(false);
      setWantVotingPopup(true);
      setVotingPopupAttempt((n) => n + 1);
    };

    // End session and navigate home
    const handleEndSession = () => {
      endSession();
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
                ref={votingButtonRef}
                className={`session-header__voting-btn${votingPopupBlocked ? " session-header__voting-btn--attention" : ""}`}
                onClick={handleShowVotingPanel}
                type="button"
                aria-label="Show voting panel"
              >
                Show Voting Panel
              </button>
            )}
            {isAdmin && players.length > 1 && (
              <button
                className={`session-header__copy-btn${isEditingParticipants ? " session-header__copy-btn--active" : ""}`}
                onClick={() => setIsEditingParticipants((prev) => !prev)}
                type="button"
                aria-label={
                  isEditingParticipants
                    ? "Done editing participants"
                    : "Edit participants"
                }
                aria-pressed={isEditingParticipants}
              >
                {isEditingParticipants ? "Done" : "Edit Participants"}
              </button>
            )}
            {showSimControls && (
              <>
                {simPlayerCount > 0 && (
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
            {showConfettiDebug && (
              <button
                className="session-header__sim-btn"
                onClick={() => fireConsensusConfetti()}
                type="button"
                aria-label="Test confetti effect"
              >
                🎉 Confetti
              </button>
            )}
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
          </div>
        </header>

        {isAdmin && votingPopupBlocked && hintPos && (
          <div
            className="voting-popup-hint"
            role="status"
            style={{ left: hintPos.left, top: hintPos.top }}
          >
            <div
              className="voting-popup-hint__arrow"
              aria-hidden="true"
              style={{ left: hintPos.arrowLeft }}
            />
            <p className="voting-popup-hint__text">
              Your browser blocked the voting panel. To vote, please allow
              popups for this site, then click{" "}
              <strong>Show Voting Panel</strong> to open it.
            </p>
          </div>
        )}

        <div className="game-view" data-testid="game-view">
          <ConnectionStatus status={connectionStatus} onRejoin={rejoin} />

          <PokerTable
            players={players}
            votes={votes}
            gameState={gameState}
            isAdmin={isAdmin}
            isEditing={isEditing}
            isEditingParticipants={isEditingParticipants}
            currentPlayerId={currentPlayerId}
            votesChanged={votesChanged}
            onRevealCards={handleRevealCards}
            onStartNewVoting={handleStartNewVoting}
            onEditVote={handleEditVote}
            onKickPlayer={kickPlayer}
          />

          {(() => {
            const buildPanel = (
              voteDistributionForPanel: typeof voteDistribution | null,
            ) => (
              <CardSelectionPanel
                cards={CARD_VALUES}
                selectedCard={selectedCard}
                gameState={gameState}
                isEditing={isEditing}
                voteDistribution={voteDistributionForPanel}
                averageScore={averageScore}
                agreementRatio={agreementRatio}
                onSelectCard={handleSelectCard}
                onDeselectCard={handleDeselectCard}
              />
            );

            const resultsDistribution =
              gameState === "revealed" ? voteDistribution : null;

            // Non-admins vote and view results inline, as usual.
            if (!isAdmin) {
              return buildPanel(resultsDistribution);
            }

            // Admins cast/edit votes in the always-open popup (buttons only, no
            // results). The main UI keeps the panel inline so its space is
            // always reserved and the table/players don't shift; it's hidden
            // until results are revealed, then shows the results in place.
            return (
              <>
                <div
                  className={`voting-results-slot${
                    gameState === "revealed"
                      ? ""
                      : " voting-results-slot--hidden"
                  }`}
                >
                  {buildPanel(resultsDistribution)}
                </div>
                <VotingPanelPopup
                  key={votingPopupAttempt}
                  isOpen={wantVotingPopup}
                  title={
                    session?.name ? `Voting - ${session.name}` : "Voting Panel"
                  }
                  onBlocked={() => setVotingPopupBlocked(true)}
                  onOpened={() => setVotingPopupBlocked(false)}
                  onClose={() => setWantVotingPopup(false)}
                >
                  {buildPanel(null)}
                </VotingPanelPopup>
              </>
            );
          })()}
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
