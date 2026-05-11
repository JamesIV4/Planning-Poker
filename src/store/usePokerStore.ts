import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  CardValue,
  GameState,
  NumericCard,
  Player,
  Session,
  SessionState,
} from "../types";
import { saveSession } from "../utils/sessionPersistence";

const NUMERIC_CARDS: NumericCard[] = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

export interface PlanningPokerStore {
  // Session state
  session: Session | null;
  currentPlayer: Player | null;
  gameState: GameState;

  // Session actions
  createSession: (name: string, adminDisplayName?: string) => void;
  joinSession: (sessionId: string, displayName: string) => void;

  // Player management
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
  kickPlayer: (playerId: string) => void;

  // Voting actions
  castVote: (playerId: string, card: CardValue) => void;
  removeVote: (playerId: string) => void;
  revealCards: () => void;
  startNewVoting: () => void;
  editVoteAfterReveal: (playerId: string, card: CardValue) => void;

  // Computed values (selectors)
  getVoteDistribution: () => Map<CardValue, number>;
  getAverageScore: () => number | null;
  getAgreementRatio: () => number;

  // State synchronization
  applyAuthoritativeState: (state: SessionState) => void;
}

export const usePokerStore = create<PlanningPokerStore>((set, get) => ({
  session: null,
  currentPlayer: null,
  gameState: "waiting",

  createSession: (name: string, adminDisplayName?: string) => {
    const sessionId = nanoid(10);
    const adminId = nanoid(10);

    const adminPlayer: Player = {
      id: adminId,
      displayName: adminDisplayName || name,
      isAdmin: true,
    };

    const session: Session = {
      id: sessionId,
      name,
      adminId,
      players: [adminPlayer],
      currentRound: null,
      createdAt: Date.now(),
    };

    set({
      session,
      currentPlayer: adminPlayer,
      gameState: "waiting",
    });
  },

  joinSession: (sessionId: string, displayName: string) => {
    const playerId = nanoid(10);

    const player: Player = {
      id: playerId,
      displayName,
      isAdmin: false,
    };

    const { session } = get();

    if (session && session.id === sessionId) {
      // Local join (same store instance, e.g. for testing)
      set({
        session: {
          ...session,
          players: [...session.players, player],
        },
        currentPlayer: player,
      });
    } else {
      // Joining a remote session — set currentPlayer, session will be populated via state sync
      set({
        currentPlayer: player,
      });
    }
  },

  addPlayer: (player: Player) => {
    const { session } = get();
    if (!session) return;

    // Check if a player with the same display name already exists (reconnection case).
    // If so, update their ID to the new connection's peer ID instead of duplicating.
    const existingIndex = session.players.findIndex(
      (p) =>
        p.displayName.toLowerCase() === player.displayName.toLowerCase() &&
        !p.isAdmin,
    );

    if (existingIndex >= 0) {
      // Reconnection: update the existing player's ID
      const updatedPlayers = session.players.map((p, i) =>
        i === existingIndex ? { ...p, id: player.id } : p,
      );

      // Also update any votes from the old player ID to the new one
      let updatedRound = session.currentRound;
      if (updatedRound) {
        const oldId = session.players[existingIndex].id;
        updatedRound = {
          ...updatedRound,
          votes: updatedRound.votes.map((v) =>
            v.playerId === oldId ? { ...v, playerId: player.id } : v,
          ),
        };
      }

      set({
        session: {
          ...session,
          players: updatedPlayers,
          currentRound: updatedRound,
        },
      });
    } else {
      // New player
      set({
        session: {
          ...session,
          players: [...session.players, player],
        },
      });
    }
  },

  removePlayer: (playerId: string) => {
    const { session } = get();
    if (!session) return;

    const updatedPlayers = session.players.filter((p) => p.id !== playerId);

    // Also discard the player's vote from the current round
    let updatedRound = session.currentRound;
    if (updatedRound) {
      updatedRound = {
        ...updatedRound,
        votes: updatedRound.votes.filter((v) => v.playerId !== playerId),
      };
    }

    set({
      session: {
        ...session,
        players: updatedPlayers,
        currentRound: updatedRound,
      },
    });
  },

  kickPlayer: (playerId: string) => {
    // kickPlayer is functionally the same as removePlayer (admin action)
    // The networking layer handles sending the kick message and closing the data channel
    get().removePlayer(playerId);
  },

  castVote: (playerId: string, card: CardValue) => {
    const { session, gameState } = get();
    if (!session) return;

    // castVote is allowed during "voting" state
    // It also creates a round if one doesn't exist (transitions from waiting to voting)
    let currentRound = session.currentRound;

    if (gameState === "waiting" || !currentRound) {
      // Create a new round and transition to voting
      currentRound = {
        id: nanoid(10),
        state: "voting",
        votes: [],
        startedAt: Date.now(),
        revealedAt: null,
      };
      set({ gameState: "voting" });
    }

    // Replace existing vote from the same player, or add new vote
    const existingVoteIndex = currentRound.votes.findIndex(
      (v) => v.playerId === playerId,
    );
    const newVote = {
      playerId,
      card,
      votedAt: Date.now(),
      wasChanged: false,
    };

    const updatedVotes =
      existingVoteIndex >= 0
        ? currentRound.votes.map((v, i) =>
            i === existingVoteIndex ? newVote : v,
          )
        : [...currentRound.votes, newVote];

    set({
      session: {
        ...session,
        currentRound: {
          ...currentRound,
          state: "voting",
          votes: updatedVotes,
        },
      },
    });
  },

  removeVote: (playerId: string) => {
    const { session } = get();
    if (!session || !session.currentRound) return;

    set({
      session: {
        ...session,
        currentRound: {
          ...session.currentRound,
          votes: session.currentRound.votes.filter(
            (v) => v.playerId !== playerId,
          ),
        },
      },
    });
  },

  revealCards: () => {
    const { session, gameState } = get();
    if (!session || !session.currentRound) return;

    // revealCards only works when gameState is "voting"
    if (gameState !== "voting") return;

    set({
      gameState: "revealed",
      session: {
        ...session,
        currentRound: {
          ...session.currentRound,
          state: "revealed",
          revealedAt: Date.now(),
        },
      },
    });
  },

  startNewVoting: () => {
    const { session, gameState } = get();
    if (!session) return;

    // startNewVoting only works when gameState is "revealed" or "waiting"
    if (gameState !== "revealed" && gameState !== "waiting") return;

    const newRound = {
      id: nanoid(10),
      state: "voting" as GameState,
      votes: [],
      startedAt: Date.now(),
      revealedAt: null,
    };

    set({
      gameState: "voting",
      session: {
        ...session,
        currentRound: newRound,
      },
    });
  },

  editVoteAfterReveal: (playerId: string, card: CardValue) => {
    const { session, gameState } = get();
    if (!session || !session.currentRound) return;

    // editVoteAfterReveal only works when gameState is "revealed"
    if (gameState !== "revealed") return;

    const existingVoteIndex = session.currentRound.votes.findIndex(
      (v) => v.playerId === playerId,
    );

    const editedVote = {
      playerId,
      card,
      votedAt: Date.now(),
      wasChanged: true,
    };

    const updatedVotes =
      existingVoteIndex >= 0
        ? session.currentRound.votes.map((v, i) =>
            i === existingVoteIndex ? editedVote : v,
          )
        : [...session.currentRound.votes, editedVote];

    set({
      session: {
        ...session,
        currentRound: {
          ...session.currentRound,
          votes: updatedVotes,
        },
      },
    });
  },

  getVoteDistribution: () => {
    const { session } = get();
    const distribution = new Map<CardValue, number>();

    if (!session?.currentRound) return distribution;

    for (const vote of session.currentRound.votes) {
      const count = distribution.get(vote.card) ?? 0;
      distribution.set(vote.card, count + 1);
    }

    return distribution;
  },

  getAverageScore: () => {
    const { session } = get();
    if (!session?.currentRound) return null;

    const numericVotes = session.currentRound.votes.filter((v) =>
      NUMERIC_CARDS.includes(v.card as NumericCard),
    );

    if (numericVotes.length === 0) return null;

    const sum = numericVotes.reduce((acc, v) => acc + (v.card as number), 0);
    return sum / numericVotes.length;
  },

  getAgreementRatio: () => {
    const { session } = get();
    if (!session?.currentRound) return 0;

    const votes = session.currentRound.votes;
    if (votes.length === 0) return 0;
    if (votes.length === 1) return 1;

    // Count votes per card value
    const counts = new Map<CardValue, number>();
    for (const vote of votes) {
      const count = counts.get(vote.card) ?? 0;
      counts.set(vote.card, count + 1);
    }

    // Find the maximum count
    let maxCount = 0;
    for (const count of counts.values()) {
      if (count > maxCount) {
        maxCount = count;
      }
    }

    // Use (maxCount - 1) / (totalVoters - 1) so that:
    // - 0% when no two people agree (max is 1)
    // - 100% when everyone picks the same card
    return (maxCount - 1) / (votes.length - 1);
  },

  applyAuthoritativeState: (state: SessionState) => {
    const { currentPlayer } = get();

    // Build the complete session state in a single set call to avoid
    // intermediate states that could cause rendering issues.
    const newSession = state.session
      ? {
          ...state.session,
          currentRound: state.round
            ? { ...state.round, votes: state.votes }
            : state.session.currentRound,
        }
      : null;

    // Reconcile currentPlayer ID with the host-assigned ID.
    // The client generates a temporary ID on join, but the host uses the PeerJS
    // connection peer ID. Match by display name to find our real player entry.
    let reconciledPlayer = currentPlayer;
    if (currentPlayer && newSession?.players) {
      const matchedPlayer = newSession.players.find(
        (p) =>
          p.displayName.toLowerCase() ===
          currentPlayer.displayName.toLowerCase(),
      );
      if (matchedPlayer) {
        reconciledPlayer = matchedPlayer;
      }
    }

    set({
      session: newSession,
      gameState: state.round?.state ?? "waiting",
      currentPlayer: reconciledPlayer,
    });
  },
}));

// Persist session state to localStorage on every change
usePokerStore.subscribe((state) => {
  if (state.session && state.currentPlayer) {
    saveSession({
      session: state.session,
      currentPlayer: state.currentPlayer,
      gameState: state.gameState,
    });
  }
});
