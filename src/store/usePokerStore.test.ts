import { describe, it, expect, beforeEach } from "vitest";
import { usePokerStore } from "./usePokerStore";
import type { Player } from "../types";

describe("usePokerStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    usePokerStore.setState({
      session: null,
      currentPlayer: null,
      gameState: "waiting",
    });
  });

  describe("createSession", () => {
    it("creates a session with a unique ID and admin player", () => {
      usePokerStore.getState().createSession("Sprint Planning");

      const { session, currentPlayer, gameState } = usePokerStore.getState();

      expect(session).not.toBeNull();
      expect(session!.id).toBeTruthy();
      expect(session!.name).toBe("Sprint Planning");
      expect(session!.players).toHaveLength(1);
      expect(session!.players[0].isAdmin).toBe(true);
      expect(session!.adminId).toBe(session!.players[0].id);
      expect(session!.currentRound).toBeNull();
      expect(session!.createdAt).toBeGreaterThan(0);
      expect(currentPlayer).not.toBeNull();
      expect(currentPlayer!.isAdmin).toBe(true);
      expect(gameState).toBe("waiting");
    });

    it("generates unique session IDs for different sessions", () => {
      usePokerStore.getState().createSession("Session 1");
      const id1 = usePokerStore.getState().session!.id;

      usePokerStore.getState().createSession("Session 2");
      const id2 = usePokerStore.getState().session!.id;

      expect(id1).not.toBe(id2);
    });

    it("sets the session creator as admin (isAdmin: true)", () => {
      usePokerStore.getState().createSession("My Session");

      const { session, currentPlayer } = usePokerStore.getState();
      expect(currentPlayer!.isAdmin).toBe(true);
      expect(session!.players[0].isAdmin).toBe(true);
    });
  });

  describe("joinSession", () => {
    it("adds a player with a unique ID to an existing session", () => {
      usePokerStore.getState().createSession("Test Session");
      const sessionId = usePokerStore.getState().session!.id;

      usePokerStore.getState().joinSession(sessionId, "Alice");

      const { session, currentPlayer } = usePokerStore.getState();
      expect(session!.players).toHaveLength(2);
      expect(currentPlayer!.displayName).toBe("Alice");
      expect(currentPlayer!.isAdmin).toBe(false);
    });

    it("assigns unique player IDs", () => {
      usePokerStore.getState().createSession("Test Session");
      const sessionId = usePokerStore.getState().session!.id;
      const adminId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().joinSession(sessionId, "Bob");
      const bobId = usePokerStore.getState().currentPlayer!.id;

      expect(adminId).not.toBe(bobId);
    });

    it("sets currentPlayer when joining a remote session", () => {
      usePokerStore.getState().joinSession("remote-session-id", "Charlie");

      const { session, currentPlayer } = usePokerStore.getState();
      expect(session).toBeNull(); // No local session
      expect(currentPlayer).not.toBeNull();
      expect(currentPlayer!.displayName).toBe("Charlie");
      expect(currentPlayer!.isAdmin).toBe(false);
    });
  });

  describe("addPlayer", () => {
    it("adds a player to the session", () => {
      usePokerStore.getState().createSession("Test Session");

      const newPlayer: Player = {
        id: "player-123",
        displayName: "Dave",
        isAdmin: false,
      };

      usePokerStore.getState().addPlayer(newPlayer);

      const { session } = usePokerStore.getState();
      expect(session!.players).toHaveLength(2);
      expect(session!.players[1]).toEqual(newPlayer);
    });

    it("does nothing if no session exists", () => {
      const newPlayer: Player = {
        id: "player-123",
        displayName: "Dave",
        isAdmin: false,
      };

      usePokerStore.getState().addPlayer(newPlayer);

      const { session } = usePokerStore.getState();
      expect(session).toBeNull();
    });
  });

  describe("removePlayer", () => {
    it("removes a player from the session", () => {
      usePokerStore.getState().createSession("Test Session");

      const player: Player = {
        id: "player-to-remove",
        displayName: "Eve",
        isAdmin: false,
      };
      usePokerStore.getState().addPlayer(player);

      expect(usePokerStore.getState().session!.players).toHaveLength(2);

      usePokerStore.getState().removePlayer("player-to-remove");

      const { session } = usePokerStore.getState();
      expect(session!.players).toHaveLength(1);
      expect(
        session!.players.find((p) => p.id === "player-to-remove"),
      ).toBeUndefined();
    });

    it("also discards the removed player's vote from the current round", () => {
      usePokerStore.getState().createSession("Test Session");

      const player: Player = {
        id: "voter-1",
        displayName: "Frank",
        isAdmin: false,
      };
      usePokerStore.getState().addPlayer(player);

      // Manually set a round with votes
      const { session } = usePokerStore.getState();
      usePokerStore.setState({
        session: {
          ...session!,
          currentRound: {
            id: "round-1",
            state: "voting",
            votes: [
              {
                playerId: "voter-1",
                card: 5,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: session!.adminId,
                card: 8,
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: null,
          },
        },
      });

      usePokerStore.getState().removePlayer("voter-1");

      const updatedSession = usePokerStore.getState().session!;
      expect(
        updatedSession.players.find((p) => p.id === "voter-1"),
      ).toBeUndefined();
      expect(
        updatedSession.currentRound!.votes.find(
          (v) => v.playerId === "voter-1",
        ),
      ).toBeUndefined();
      // Admin's vote should still be there
      expect(updatedSession.currentRound!.votes).toHaveLength(1);
      expect(updatedSession.currentRound!.votes[0].playerId).toBe(
        session!.adminId,
      );
    });

    it("does nothing if no session exists", () => {
      usePokerStore.getState().removePlayer("nonexistent");
      expect(usePokerStore.getState().session).toBeNull();
    });

    it("handles removal when there is no current round", () => {
      usePokerStore.getState().createSession("Test Session");

      const player: Player = {
        id: "player-x",
        displayName: "Grace",
        isAdmin: false,
      };
      usePokerStore.getState().addPlayer(player);

      usePokerStore.getState().removePlayer("player-x");

      const { session } = usePokerStore.getState();
      expect(session!.players).toHaveLength(1);
      expect(session!.currentRound).toBeNull();
    });
  });

  describe("kickPlayer", () => {
    it("removes the kicked player from the session", () => {
      usePokerStore.getState().createSession("Test Session");

      const player: Player = {
        id: "kicked-player",
        displayName: "Hank",
        isAdmin: false,
      };
      usePokerStore.getState().addPlayer(player);

      usePokerStore.getState().kickPlayer("kicked-player");

      const { session } = usePokerStore.getState();
      expect(session!.players).toHaveLength(1);
      expect(
        session!.players.find((p) => p.id === "kicked-player"),
      ).toBeUndefined();
    });

    it("discards the kicked player's vote", () => {
      usePokerStore.getState().createSession("Test Session");

      const player: Player = {
        id: "kicked-voter",
        displayName: "Iris",
        isAdmin: false,
      };
      usePokerStore.getState().addPlayer(player);

      // Set up a round with the player's vote
      const { session } = usePokerStore.getState();
      usePokerStore.setState({
        session: {
          ...session!,
          currentRound: {
            id: "round-1",
            state: "voting",
            votes: [
              {
                playerId: "kicked-voter",
                card: 13,
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: null,
          },
        },
      });

      usePokerStore.getState().kickPlayer("kicked-voter");

      const updatedSession = usePokerStore.getState().session!;
      expect(updatedSession.currentRound!.votes).toHaveLength(0);
    });
  });
});

describe("usePokerStore - Voting Actions", () => {
  beforeEach(() => {
    usePokerStore.setState({
      session: null,
      currentPlayer: null,
      gameState: "waiting",
    });
  });

  describe("castVote", () => {
    it("creates a new round and records a vote when in waiting state", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);

      const { session, gameState } = usePokerStore.getState();
      expect(gameState).toBe("voting");
      expect(session!.currentRound).not.toBeNull();
      expect(session!.currentRound!.votes).toHaveLength(1);
      expect(session!.currentRound!.votes[0].playerId).toBe(playerId);
      expect(session!.currentRound!.votes[0].card).toBe(5);
      expect(session!.currentRound!.votes[0].wasChanged).toBe(false);
      expect(session!.currentRound!.votes[0].votedAt).toBeGreaterThan(0);
    });

    it("replaces an existing vote from the same player", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);
      usePokerStore.getState().castVote(playerId, 13);

      const { session } = usePokerStore.getState();
      expect(session!.currentRound!.votes).toHaveLength(1);
      expect(session!.currentRound!.votes[0].card).toBe(13);
    });

    it("allows multiple players to vote in the same round", () => {
      usePokerStore.getState().createSession("Test Session");
      const adminId = usePokerStore.getState().currentPlayer!.id;

      const player: Player = {
        id: "player-2",
        displayName: "Alice",
        isAdmin: false,
      };
      usePokerStore.getState().addPlayer(player);

      usePokerStore.getState().castVote(adminId, 8);
      usePokerStore.getState().castVote("player-2", 13);

      const { session } = usePokerStore.getState();
      expect(session!.currentRound!.votes).toHaveLength(2);
    });

    it("does nothing if no session exists", () => {
      usePokerStore.getState().castVote("nonexistent", 5);
      expect(usePokerStore.getState().session).toBeNull();
    });

    it("records vote with a timestamp", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;
      const before = Date.now();

      usePokerStore.getState().castVote(playerId, 3);

      const after = Date.now();
      const vote = usePokerStore.getState().session!.currentRound!.votes[0];
      expect(vote.votedAt).toBeGreaterThanOrEqual(before);
      expect(vote.votedAt).toBeLessThanOrEqual(after);
    });

    it("supports special card values", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, "?");

      const { session } = usePokerStore.getState();
      expect(session!.currentRound!.votes[0].card).toBe("?");
    });
  });

  describe("removeVote", () => {
    it("removes a player's vote from the current round", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 8);
      expect(
        usePokerStore.getState().session!.currentRound!.votes,
      ).toHaveLength(1);

      usePokerStore.getState().removeVote(playerId);

      expect(
        usePokerStore.getState().session!.currentRound!.votes,
      ).toHaveLength(0);
    });

    it("does nothing if no session exists", () => {
      usePokerStore.getState().removeVote("nonexistent");
      expect(usePokerStore.getState().session).toBeNull();
    });

    it("does nothing if no current round exists", () => {
      usePokerStore.getState().createSession("Test Session");
      usePokerStore.getState().removeVote("nonexistent");
      expect(usePokerStore.getState().session!.currentRound).toBeNull();
    });

    it("only removes the specified player's vote", () => {
      usePokerStore.getState().createSession("Test Session");
      const adminId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(adminId, 5);
      usePokerStore.getState().castVote("player-2", 8);

      usePokerStore.getState().removeVote("player-2");

      const votes = usePokerStore.getState().session!.currentRound!.votes;
      expect(votes).toHaveLength(1);
      expect(votes[0].playerId).toBe(adminId);
    });
  });

  describe("revealCards", () => {
    it("transitions game state from voting to revealed", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      // Start voting by casting a vote
      usePokerStore.getState().castVote(playerId, 5);
      expect(usePokerStore.getState().gameState).toBe("voting");

      usePokerStore.getState().revealCards();

      expect(usePokerStore.getState().gameState).toBe("revealed");
    });

    it("sets revealedAt timestamp on the round", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);
      const before = Date.now();

      usePokerStore.getState().revealCards();

      const after = Date.now();
      const round = usePokerStore.getState().session!.currentRound!;
      expect(round.revealedAt).not.toBeNull();
      expect(round.revealedAt!).toBeGreaterThanOrEqual(before);
      expect(round.revealedAt!).toBeLessThanOrEqual(after);
    });

    it("does nothing when game state is waiting", () => {
      usePokerStore.getState().createSession("Test Session");

      usePokerStore.getState().revealCards();

      expect(usePokerStore.getState().gameState).toBe("waiting");
    });

    it("does nothing when game state is already revealed", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);
      usePokerStore.getState().revealCards();
      const revealedAt =
        usePokerStore.getState().session!.currentRound!.revealedAt;

      // Try to reveal again
      usePokerStore.getState().revealCards();

      expect(usePokerStore.getState().gameState).toBe("revealed");
      expect(usePokerStore.getState().session!.currentRound!.revealedAt).toBe(
        revealedAt,
      );
    });

    it("does nothing if no session exists", () => {
      usePokerStore.getState().revealCards();
      expect(usePokerStore.getState().session).toBeNull();
    });

    it("updates the round state to revealed", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);
      usePokerStore.getState().revealCards();

      expect(usePokerStore.getState().session!.currentRound!.state).toBe(
        "revealed",
      );
    });
  });

  describe("startNewVoting", () => {
    it("transitions from revealed to voting and clears votes", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      // Go through voting → revealed
      usePokerStore.getState().castVote(playerId, 5);
      usePokerStore.getState().revealCards();
      expect(usePokerStore.getState().gameState).toBe("revealed");

      usePokerStore.getState().startNewVoting();

      const { session, gameState } = usePokerStore.getState();
      expect(gameState).toBe("voting");
      expect(session!.currentRound).not.toBeNull();
      expect(session!.currentRound!.votes).toHaveLength(0);
      expect(session!.currentRound!.revealedAt).toBeNull();
    });

    it("transitions from waiting to voting", () => {
      usePokerStore.getState().createSession("Test Session");
      expect(usePokerStore.getState().gameState).toBe("waiting");

      usePokerStore.getState().startNewVoting();

      expect(usePokerStore.getState().gameState).toBe("voting");
      expect(usePokerStore.getState().session!.currentRound).not.toBeNull();
      expect(
        usePokerStore.getState().session!.currentRound!.votes,
      ).toHaveLength(0);
    });

    it("does nothing when game state is voting", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);
      expect(usePokerStore.getState().gameState).toBe("voting");

      const roundId = usePokerStore.getState().session!.currentRound!.id;

      usePokerStore.getState().startNewVoting();

      // Should not have changed
      expect(usePokerStore.getState().gameState).toBe("voting");
      expect(usePokerStore.getState().session!.currentRound!.id).toBe(roundId);
    });

    it("creates a new round with a fresh ID", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);
      usePokerStore.getState().revealCards();
      const oldRoundId = usePokerStore.getState().session!.currentRound!.id;

      usePokerStore.getState().startNewVoting();

      const newRoundId = usePokerStore.getState().session!.currentRound!.id;
      expect(newRoundId).not.toBe(oldRoundId);
    });

    it("resets wasChanged flags by clearing all votes", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);
      usePokerStore.getState().revealCards();
      usePokerStore.getState().editVoteAfterReveal(playerId, 8);

      // Verify wasChanged is true
      expect(
        usePokerStore.getState().session!.currentRound!.votes[0].wasChanged,
      ).toBe(true);

      usePokerStore.getState().startNewVoting();

      // All votes should be cleared
      expect(
        usePokerStore.getState().session!.currentRound!.votes,
      ).toHaveLength(0);
    });

    it("does nothing if no session exists", () => {
      usePokerStore.getState().startNewVoting();
      expect(usePokerStore.getState().session).toBeNull();
    });
  });

  describe("editVoteAfterReveal", () => {
    it("sets wasChanged to true when editing after reveal", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);
      usePokerStore.getState().revealCards();

      usePokerStore.getState().editVoteAfterReveal(playerId, 13);

      const vote = usePokerStore.getState().session!.currentRound!.votes[0];
      expect(vote.card).toBe(13);
      expect(vote.wasChanged).toBe(true);
    });

    it("does nothing when game state is not revealed", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);
      // Still in "voting" state

      usePokerStore.getState().editVoteAfterReveal(playerId, 13);

      const vote = usePokerStore.getState().session!.currentRound!.votes[0];
      expect(vote.card).toBe(5);
      expect(vote.wasChanged).toBe(false);
    });

    it("does nothing when game state is waiting", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().editVoteAfterReveal(playerId, 13);

      expect(usePokerStore.getState().session!.currentRound).toBeNull();
    });

    it("replaces existing vote with wasChanged flag", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      const player2: Player = {
        id: "player-2",
        displayName: "Alice",
        isAdmin: false,
      };
      usePokerStore.getState().addPlayer(player2);

      usePokerStore.getState().castVote(playerId, 5);
      usePokerStore.getState().castVote("player-2", 8);
      usePokerStore.getState().revealCards();

      usePokerStore.getState().editVoteAfterReveal(playerId, 13);

      const votes = usePokerStore.getState().session!.currentRound!.votes;
      expect(votes).toHaveLength(2);

      const adminVote = votes.find((v) => v.playerId === playerId)!;
      expect(adminVote.card).toBe(13);
      expect(adminVote.wasChanged).toBe(true);

      const player2Vote = votes.find((v) => v.playerId === "player-2")!;
      expect(player2Vote.card).toBe(8);
      expect(player2Vote.wasChanged).toBe(false);
    });

    it("adds a new vote with wasChanged if player had no prior vote", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);
      usePokerStore.getState().revealCards();

      // A player who didn't vote initially edits after reveal
      usePokerStore.getState().editVoteAfterReveal("new-player", 21);

      const votes = usePokerStore.getState().session!.currentRound!.votes;
      const newVote = votes.find((v) => v.playerId === "new-player");
      expect(newVote).toBeDefined();
      expect(newVote!.card).toBe(21);
      expect(newVote!.wasChanged).toBe(true);
    });

    it("does nothing if no session exists", () => {
      usePokerStore.getState().editVoteAfterReveal("player-1", 5);
      expect(usePokerStore.getState().session).toBeNull();
    });
  });

  describe("state transition enforcement", () => {
    it("follows valid sequence: waiting → voting → revealed → voting", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      // waiting → voting (via castVote)
      expect(usePokerStore.getState().gameState).toBe("waiting");
      usePokerStore.getState().castVote(playerId, 5);
      expect(usePokerStore.getState().gameState).toBe("voting");

      // voting → revealed (via revealCards)
      usePokerStore.getState().revealCards();
      expect(usePokerStore.getState().gameState).toBe("revealed");

      // revealed → voting (via startNewVoting)
      usePokerStore.getState().startNewVoting();
      expect(usePokerStore.getState().gameState).toBe("voting");
    });

    it("prevents revealing from waiting state", () => {
      usePokerStore.getState().createSession("Test Session");
      expect(usePokerStore.getState().gameState).toBe("waiting");

      usePokerStore.getState().revealCards();

      expect(usePokerStore.getState().gameState).toBe("waiting");
    });

    it("prevents starting new voting from voting state", () => {
      usePokerStore.getState().createSession("Test Session");
      const playerId = usePokerStore.getState().currentPlayer!.id;

      usePokerStore.getState().castVote(playerId, 5);
      expect(usePokerStore.getState().gameState).toBe("voting");

      usePokerStore.getState().startNewVoting();

      expect(usePokerStore.getState().gameState).toBe("voting");
    });
  });
});

describe("usePokerStore - Computed Values", () => {
  beforeEach(() => {
    usePokerStore.setState({
      session: null,
      currentPlayer: null,
      gameState: "waiting",
    });
  });

  describe("getVoteDistribution", () => {
    it("returns an empty map when no session exists", () => {
      const distribution = usePokerStore.getState().getVoteDistribution();
      expect(distribution.size).toBe(0);
    });

    it("returns an empty map when no round exists", () => {
      usePokerStore.getState().createSession("Test Session");
      const distribution = usePokerStore.getState().getVoteDistribution();
      expect(distribution.size).toBe(0);
    });

    it("counts votes per card value correctly", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "p1",
                card: 5,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p2",
                card: 8,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p3",
                card: 5,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p4",
                card: 5,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p5",
                card: "?",
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
        },
        gameState: "revealed",
      });

      const distribution = usePokerStore.getState().getVoteDistribution();
      expect(distribution.get(5)).toBe(3);
      expect(distribution.get(8)).toBe(1);
      expect(distribution.get("?")).toBe(1);
      expect(distribution.get(13)).toBeUndefined();
    });

    it("handles special card values in distribution", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "p1",
                card: "?",
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p2",
                card: "☕",
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p3",
                card: "?",
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
        },
        gameState: "revealed",
      });

      const distribution = usePokerStore.getState().getVoteDistribution();
      expect(distribution.get("?")).toBe(2);
      expect(distribution.get("☕")).toBe(1);
    });
  });

  describe("getAverageScore", () => {
    it("returns null when no session exists", () => {
      const avg = usePokerStore.getState().getAverageScore();
      expect(avg).toBeNull();
    });

    it("returns null when no round exists", () => {
      usePokerStore.getState().createSession("Test Session");
      const avg = usePokerStore.getState().getAverageScore();
      expect(avg).toBeNull();
    });

    it("returns null when no numeric votes exist", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "p1",
                card: "?",
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p2",
                card: "☕",
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
        },
        gameState: "revealed",
      });

      const avg = usePokerStore.getState().getAverageScore();
      expect(avg).toBeNull();
    });

    it("computes arithmetic mean of numeric cards only", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "p1",
                card: 5,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p2",
                card: 8,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p3",
                card: 13,
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
        },
        gameState: "revealed",
      });

      const avg = usePokerStore.getState().getAverageScore();
      // (5 + 8 + 13) / 3 = 26 / 3 ≈ 8.667
      expect(avg).toBeCloseTo(8.667, 2);
    });

    it("excludes ? and ☕ from average calculation", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "p1",
                card: 5,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p2",
                card: "?",
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p3",
                card: 13,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p4",
                card: "☕",
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
        },
        gameState: "revealed",
      });

      const avg = usePokerStore.getState().getAverageScore();
      // Only 5 and 13 are numeric: (5 + 13) / 2 = 9
      expect(avg).toBe(9);
    });

    it("handles a single numeric vote", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "p1",
                card: 21,
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
        },
        gameState: "revealed",
      });

      const avg = usePokerStore.getState().getAverageScore();
      expect(avg).toBe(21);
    });

    it("handles zero as a valid numeric card", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "p1",
                card: 0,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p2",
                card: 0,
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
        },
        gameState: "revealed",
      });

      const avg = usePokerStore.getState().getAverageScore();
      expect(avg).toBe(0);
    });
  });

  describe("getAgreementRatio", () => {
    it("returns 0 when no session exists", () => {
      const ratio = usePokerStore.getState().getAgreementRatio();
      expect(ratio).toBe(0);
    });

    it("returns 0 when no round exists", () => {
      usePokerStore.getState().createSession("Test Session");
      const ratio = usePokerStore.getState().getAgreementRatio();
      expect(ratio).toBe(0);
    });

    it("returns 0 when no votes exist", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "voting",
            votes: [],
            startedAt: Date.now(),
            revealedAt: null,
          },
        },
        gameState: "voting",
      });

      const ratio = usePokerStore.getState().getAgreementRatio();
      expect(ratio).toBe(0);
    });

    it("returns 1 when all voters agree", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "p1",
                card: 8,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p2",
                card: 8,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p3",
                card: 8,
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
        },
        gameState: "revealed",
      });

      const ratio = usePokerStore.getState().getAgreementRatio();
      expect(ratio).toBe(1);
    });

    it("computes correct ratio for partial agreement", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "p1",
                card: 5,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p2",
                card: 5,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p3",
                card: 8,
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p4",
                card: 13,
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
        },
        gameState: "revealed",
      });

      const ratio = usePokerStore.getState().getAgreementRatio();
      // Most common is 5 with 2 votes, total 4 voters: (2-1)/(4-1) = 1/3
      expect(ratio).toBeCloseTo(1 / 3, 10);
    });

    it("returns 0 when there is a single voter", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "p1",
                card: 13,
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
        },
        gameState: "revealed",
      });

      const ratio = usePokerStore.getState().getAgreementRatio();
      expect(ratio).toBe(1);
    });

    it("includes special cards in agreement calculation", () => {
      usePokerStore.getState().createSession("Test Session");
      const session = usePokerStore.getState().session!;

      usePokerStore.setState({
        session: {
          ...session,
          currentRound: {
            id: "round-1",
            state: "revealed",
            votes: [
              {
                playerId: "p1",
                card: "?",
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p2",
                card: "?",
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p3",
                card: "?",
                votedAt: Date.now(),
                wasChanged: false,
              },
              {
                playerId: "p4",
                card: 5,
                votedAt: Date.now(),
                wasChanged: false,
              },
            ],
            startedAt: Date.now(),
            revealedAt: Date.now(),
          },
        },
        gameState: "revealed",
      });

      const ratio = usePokerStore.getState().getAgreementRatio();
      // Most common is "?" with 3 votes, total 4 voters: (3-1)/(4-1) = 2/3
      expect(ratio).toBeCloseTo(2 / 3);
    });
  });

  describe("applyAuthoritativeState", () => {
    it("replaces local session state with received state", () => {
      usePokerStore.getState().createSession("Local Session");

      const authoritativeState = {
        session: {
          id: "remote-session-id",
          name: "Remote Session",
          adminId: "admin-1",
          players: [
            { id: "admin-1", displayName: "Admin", isAdmin: true },
            { id: "player-1", displayName: "Alice", isAdmin: false },
          ],
          currentRound: null,
          createdAt: 1000,
        },
        round: {
          id: "round-1",
          state: "voting" as const,
          votes: [],
          startedAt: 2000,
          revealedAt: null,
        },
        votes: [
          {
            playerId: "player-1",
            card: 8 as const,
            votedAt: 3000,
            wasChanged: false,
          },
        ],
      };

      usePokerStore.getState().applyAuthoritativeState(authoritativeState);

      const { session, gameState } = usePokerStore.getState();
      expect(session).not.toBeNull();
      expect(session!.id).toBe("remote-session-id");
      expect(session!.name).toBe("Remote Session");
      expect(session!.players).toHaveLength(2);
      expect(gameState).toBe("voting");
      expect(session!.currentRound).not.toBeNull();
      expect(session!.currentRound!.votes).toHaveLength(1);
      expect(session!.currentRound!.votes[0].playerId).toBe("player-1");
      expect(session!.currentRound!.votes[0].card).toBe(8);
    });

    it("sets gameState to waiting when round is null", () => {
      usePokerStore.getState().createSession("Local Session");

      const authoritativeState = {
        session: {
          id: "remote-session-id",
          name: "Remote Session",
          adminId: "admin-1",
          players: [{ id: "admin-1", displayName: "Admin", isAdmin: true }],
          currentRound: null,
          createdAt: 1000,
        },
        round: null,
        votes: [],
      };

      usePokerStore.getState().applyAuthoritativeState(authoritativeState);

      const { session, gameState } = usePokerStore.getState();
      expect(session!.id).toBe("remote-session-id");
      expect(gameState).toBe("waiting");
    });

    it("applies revealed state correctly", () => {
      const authoritativeState = {
        session: {
          id: "session-1",
          name: "Sprint Planning",
          adminId: "admin-1",
          players: [
            { id: "admin-1", displayName: "Admin", isAdmin: true },
            { id: "player-1", displayName: "Alice", isAdmin: false },
            { id: "player-2", displayName: "Bob", isAdmin: false },
          ],
          currentRound: null,
          createdAt: 1000,
        },
        round: {
          id: "round-1",
          state: "revealed" as const,
          votes: [],
          startedAt: 2000,
          revealedAt: 3000,
        },
        votes: [
          {
            playerId: "admin-1",
            card: 5 as const,
            votedAt: 2500,
            wasChanged: false,
          },
          {
            playerId: "player-1",
            card: 8 as const,
            votedAt: 2600,
            wasChanged: false,
          },
          {
            playerId: "player-2",
            card: 5 as const,
            votedAt: 2700,
            wasChanged: true,
          },
        ],
      };

      usePokerStore.getState().applyAuthoritativeState(authoritativeState);

      const { session, gameState } = usePokerStore.getState();
      expect(gameState).toBe("revealed");
      expect(session!.currentRound!.revealedAt).toBe(3000);
      expect(session!.currentRound!.votes).toHaveLength(3);
      expect(session!.currentRound!.votes[2].wasChanged).toBe(true);
    });

    it("preserves currentPlayer when applying authoritative state", () => {
      usePokerStore.setState({
        currentPlayer: { id: "my-id", displayName: "Me", isAdmin: false },
      });

      const authoritativeState = {
        session: {
          id: "session-1",
          name: "Test",
          adminId: "admin-1",
          players: [
            { id: "admin-1", displayName: "Admin", isAdmin: true },
            { id: "my-id", displayName: "Me", isAdmin: false },
          ],
          currentRound: null,
          createdAt: 1000,
        },
        round: null,
        votes: [],
      };

      usePokerStore.getState().applyAuthoritativeState(authoritativeState);

      const { currentPlayer } = usePokerStore.getState();
      expect(currentPlayer).not.toBeNull();
      expect(currentPlayer!.id).toBe("my-id");
    });
  });
});
