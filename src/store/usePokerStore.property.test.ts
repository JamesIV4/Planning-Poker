import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { usePokerStore } from "./usePokerStore";
import type {
  CardValue,
  GameState,
  NumericCard,
  Player,
  SessionState,
  Vote,
} from "../types";

// --- Arbitraries ---

const numericCards: NumericCard[] = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const specialCards = ["?", "☕"] as const;

const arbNumericCard = fc.constantFrom(...numericCards);
const arbSpecialCard = fc.constantFrom(...specialCards);
const arbCardValue: fc.Arbitrary<CardValue> = fc.oneof(
  arbNumericCard,
  arbSpecialCard,
);

const arbPlayerName = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

type AdminAction = "startNewVoting" | "revealCards";
const arbAdminAction: fc.Arbitrary<AdminAction> = fc.constantFrom(
  "startNewVoting",
  "revealCards",
);

// --- Helpers ---

function resetStore() {
  usePokerStore.setState({
    session: null,
    currentPlayer: null,
    gameState: "waiting",
  });
}

function setupSessionWithPlayers(playerCount: number): string[] {
  usePokerStore.getState().createSession("Test Session");
  const adminId = usePokerStore.getState().currentPlayer!.id;
  const playerIds = [adminId];

  for (let i = 0; i < playerCount - 1; i++) {
    const player: Player = {
      id: `player-${i}-${Date.now()}-${Math.random()}`,
      displayName: `Player ${i}`,
      isAdmin: false,
    };
    usePokerStore.getState().addPlayer(player);
    playerIds.push(player.id);
  }

  return playerIds;
}

// --- Property Tests ---

describe("Property Tests: usePokerStore", () => {
  beforeEach(() => {
    resetStore();
  });

  /**
   * **Property 2: Game state transitions follow valid sequence**
   * For any sequence of admin actions, game state only transitions along
   * waiting → voting → revealed → voting
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  describe("Property 2: Game state transitions follow valid sequence", () => {
    it("game state only transitions along valid paths for any sequence of admin actions", () => {
      fc.assert(
        fc.property(
          fc.array(arbAdminAction, { minLength: 1, maxLength: 20 }),
          (actions) => {
            resetStore();
            usePokerStore.getState().createSession("Test");
            const playerId = usePokerStore.getState().currentPlayer!.id;

            // Cast a vote to enable transitions from waiting
            usePokerStore.getState().castVote(playerId, 5);

            const validTransitions: Record<GameState, GameState[]> = {
              waiting: ["voting"],
              voting: ["revealed"],
              revealed: ["voting"],
            };

            for (const action of actions) {
              const prevState = usePokerStore.getState().gameState;

              if (action === "startNewVoting") {
                usePokerStore.getState().startNewVoting();
              } else {
                usePokerStore.getState().revealCards();
              }

              const newState = usePokerStore.getState().gameState;

              // State either stayed the same (invalid transition rejected) or moved to a valid next state
              if (newState !== prevState) {
                expect(validTransitions[prevState]).toContain(newState);
              }

              // After startNewVoting succeeds, cast a vote so revealCards can work next time
              if (newState === "voting" && prevState !== "voting") {
                usePokerStore.getState().castVote(playerId, 5);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Property 3: At most one vote per player per round**
   * For any sequence of votes, each player has at most one vote per round.
   *
   * **Validates: Requirements 4.3, 4.4**
   */
  describe("Property 3: At most one vote per player per round", () => {
    it("each player has at most one vote regardless of how many times they vote", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 6 }),
          fc.array(
            fc.record({
              playerIndex: fc.integer({ min: 0, max: 5 }),
              card: arbCardValue,
            }),
            { minLength: 1, maxLength: 30 },
          ),
          (playerCount, voteActions) => {
            resetStore();
            const playerIds = setupSessionWithPlayers(playerCount);

            // Start voting
            usePokerStore.getState().castVote(playerIds[0], 5);

            for (const { playerIndex, card } of voteActions) {
              const pid = playerIds[playerIndex % playerIds.length];
              usePokerStore.getState().castVote(pid, card);
            }

            const votes = usePokerStore.getState().session!.currentRound!.votes;
            const playerIdSet = new Set(votes.map((v) => v.playerId));

            // Each player appears at most once
            expect(playerIdSet.size).toBe(votes.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Property 4: New round clears all previous votes**
   * Starting a new voting round results in zero votes.
   *
   * **Validates: Requirements 3.5**
   */
  describe("Property 4: New round clears all previous votes", () => {
    it("starting a new round always results in zero votes", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }),
          fc.array(arbCardValue, { minLength: 1, maxLength: 10 }),
          (playerCount, cards) => {
            resetStore();
            const playerIds = setupSessionWithPlayers(playerCount);

            // Cast votes
            for (let i = 0; i < cards.length; i++) {
              const pid = playerIds[i % playerIds.length];
              usePokerStore.getState().castVote(pid, cards[i]);
            }

            // Reveal
            usePokerStore.getState().revealCards();
            expect(usePokerStore.getState().gameState).toBe("revealed");

            // Start new voting
            usePokerStore.getState().startNewVoting();

            const round = usePokerStore.getState().session!.currentRound!;
            expect(round.votes).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Property 6: Average score excludes non-numeric cards**
   * Average only includes numeric cards (0-89), excludes ? and ☕.
   *
   * **Validates: Requirements 7.3**
   */
  describe("Property 6: Average score excludes non-numeric cards", () => {
    it("average equals arithmetic mean of only numeric card values", () => {
      fc.assert(
        fc.property(
          fc.array(arbCardValue, { minLength: 1, maxLength: 10 }),
          (cards) => {
            resetStore();
            usePokerStore.getState().createSession("Test");
            const session = usePokerStore.getState().session!;

            const votes: Vote[] = cards.map((card, i) => ({
              playerId: `p${i}`,
              card,
              votedAt: Date.now(),
              wasChanged: false,
            }));

            usePokerStore.setState({
              session: {
                ...session,
                currentRound: {
                  id: "round-1",
                  state: "revealed",
                  votes,
                  startedAt: Date.now(),
                  revealedAt: Date.now(),
                },
              },
              gameState: "revealed",
            });

            const avg = usePokerStore.getState().getAverageScore();

            const numericVotes = cards.filter((c) =>
              numericCards.includes(c as NumericCard),
            );
            if (numericVotes.length === 0) {
              expect(avg).toBeNull();
            } else {
              const expectedAvg =
                (numericVotes as number[]).reduce((sum, c) => sum + c, 0) /
                numericVotes.length;
              expect(avg).toBeCloseTo(expectedAvg, 10);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Property 7: Agreement ratio computation**
   * Agreement ratio = count of most common card / total voters, always between 0 and 1.
   *
   * **Validates: Requirements 7.5**
   */
  describe("Property 7: Agreement ratio computation", () => {
    it("agreement ratio is always between 0 and 1 and uses (maxCount-1)/(total-1) formula", () => {
      fc.assert(
        fc.property(
          fc.array(arbCardValue, { minLength: 1, maxLength: 15 }),
          (cards) => {
            resetStore();
            usePokerStore.getState().createSession("Test");
            const session = usePokerStore.getState().session!;

            const votes: Vote[] = cards.map((card, i) => ({
              playerId: `p${i}`,
              card,
              votedAt: Date.now(),
              wasChanged: false,
            }));

            usePokerStore.setState({
              session: {
                ...session,
                currentRound: {
                  id: "round-1",
                  state: "revealed",
                  votes,
                  startedAt: Date.now(),
                  revealedAt: Date.now(),
                },
              },
              gameState: "revealed",
            });

            const ratio = usePokerStore.getState().getAgreementRatio();

            // Always between 0 and 1
            expect(ratio).toBeGreaterThanOrEqual(0);
            expect(ratio).toBeLessThanOrEqual(1);

            // Compute expected: single voter = 1, otherwise (maxCount - 1) / (total - 1)
            const counts = new Map<CardValue, number>();
            for (const card of cards) {
              counts.set(card, (counts.get(card) ?? 0) + 1);
            }
            const maxCount = Math.max(...counts.values());
            const expectedRatio =
              cards.length === 1 ? 1 : (maxCount - 1) / (cards.length - 1);

            expect(ratio).toBeCloseTo(expectedRatio, 10);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Property 8: Vote distribution sum equals total voters**
   * Sum of vote distribution values = total number of voters.
   *
   * **Validates: Requirements 7.1, 7.5**
   */
  describe("Property 8: Vote distribution sum equals total voters", () => {
    it("sum of distribution values equals total number of votes", () => {
      fc.assert(
        fc.property(
          fc.array(arbCardValue, { minLength: 1, maxLength: 15 }),
          (cards) => {
            resetStore();
            usePokerStore.getState().createSession("Test");
            const session = usePokerStore.getState().session!;

            const votes: Vote[] = cards.map((card, i) => ({
              playerId: `p${i}`,
              card,
              votedAt: Date.now(),
              wasChanged: false,
            }));

            usePokerStore.setState({
              session: {
                ...session,
                currentRound: {
                  id: "round-1",
                  state: "revealed",
                  votes,
                  startedAt: Date.now(),
                  revealedAt: Date.now(),
                },
              },
              gameState: "revealed",
            });

            const distribution = usePokerStore.getState().getVoteDistribution();
            let sum = 0;
            for (const count of distribution.values()) {
              sum += count;
            }

            expect(sum).toBe(cards.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Property 10: Player IDs are unique**
   * All player IDs are distinct.
   *
   * **Validates: Requirements 2.6**
   */
  describe("Property 10: Player IDs are unique", () => {
    it("all player IDs in a session are distinct", () => {
      fc.assert(
        fc.property(
          fc.array(arbPlayerName, { minLength: 1, maxLength: 10 }),
          (names) => {
            resetStore();
            usePokerStore.getState().createSession("Test");
            const sessionId = usePokerStore.getState().session!.id;

            for (const name of names) {
              usePokerStore.getState().joinSession(sessionId, name);
            }

            const players = usePokerStore.getState().session!.players;
            const ids = players.map((p) => p.id);
            const uniqueIds = new Set(ids);

            expect(uniqueIds.size).toBe(ids.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Property 11: Post-reveal vote change sets wasChanged flag**
   * editVoteAfterReveal always sets wasChanged to true.
   *
   * **Validates: Requirements 5.5**
   */
  describe("Property 11: Post-reveal vote change sets wasChanged flag", () => {
    it("editVoteAfterReveal always sets wasChanged to true", () => {
      fc.assert(
        fc.property(arbCardValue, arbCardValue, (initialCard, newCard) => {
          resetStore();
          usePokerStore.getState().createSession("Test");
          const playerId = usePokerStore.getState().currentPlayer!.id;

          // Cast initial vote and reveal
          usePokerStore.getState().castVote(playerId, initialCard);
          usePokerStore.getState().revealCards();

          // Edit vote after reveal
          usePokerStore.getState().editVoteAfterReveal(playerId, newCard);

          const vote = usePokerStore
            .getState()
            .session!.currentRound!.votes.find((v) => v.playerId === playerId);

          expect(vote).toBeDefined();
          expect(vote!.wasChanged).toBe(true);
          expect(vote!.card).toBe(newCard);
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Property 15: State replacement on authoritative update**
   * applyAuthoritativeState replaces local state completely.
   *
   * **Validates: Requirements 8.2**
   */
  describe("Property 15: State replacement on authoritative update", () => {
    it("applyAuthoritativeState replaces local state with received state", () => {
      fc.assert(
        fc.property(
          arbPlayerName,
          fc.array(arbCardValue, { minLength: 0, maxLength: 5 }),
          (sessionName, cards) => {
            resetStore();
            // Set up some local state first
            usePokerStore.getState().createSession("Local Session");

            // Create an authoritative state to apply
            const players: Player[] = [
              { id: "admin-remote", displayName: sessionName, isAdmin: true },
              {
                id: "player-remote",
                displayName: "Remote Player",
                isAdmin: false,
              },
            ];

            const votes: Vote[] = cards.map((card, i) => ({
              playerId: i === 0 ? "admin-remote" : "player-remote",
              card,
              votedAt: Date.now(),
              wasChanged: false,
            }));

            const authState: SessionState = {
              session: {
                id: "remote-session-id",
                name: sessionName,
                adminId: "admin-remote",
                players,
                currentRound:
                  cards.length > 0
                    ? {
                        id: "remote-round",
                        state: "voting",
                        votes,
                        startedAt: Date.now(),
                        revealedAt: null,
                      }
                    : null,
                createdAt: Date.now(),
              },
              round:
                cards.length > 0
                  ? {
                      id: "remote-round",
                      state: "voting",
                      votes,
                      startedAt: Date.now(),
                      revealedAt: null,
                    }
                  : null,
              votes,
            };

            usePokerStore.getState().applyAuthoritativeState(authState);

            const state = usePokerStore.getState();
            expect(state.session!.id).toBe("remote-session-id");
            expect(state.session!.name).toBe(sessionName);
            expect(state.session!.adminId).toBe("admin-remote");

            if (cards.length > 0) {
              expect(state.gameState).toBe("voting");
              expect(state.session!.currentRound).not.toBeNull();
              expect(state.session!.currentRound!.votes).toHaveLength(
                votes.length,
              );
            } else {
              expect(state.gameState).toBe("waiting");
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Property 17: Session creator is always admin**
   * Session creator has isAdmin: true and is the only admin.
   *
   * **Validates: Requirements 1.5**
   */
  describe("Property 17: Session creator is always admin", () => {
    it("session creator is always the only admin", () => {
      fc.assert(
        fc.property(
          arbPlayerName,
          fc.array(arbPlayerName, { minLength: 0, maxLength: 8 }),
          (creatorName, joinerNames) => {
            resetStore();
            usePokerStore.getState().createSession(creatorName);
            const sessionId = usePokerStore.getState().session!.id;
            const creatorId = usePokerStore.getState().currentPlayer!.id;

            for (const name of joinerNames) {
              usePokerStore.getState().joinSession(sessionId, name);
            }

            const players = usePokerStore.getState().session!.players;

            // Exactly one admin
            const admins = players.filter((p) => p.isAdmin);
            expect(admins).toHaveLength(1);

            // The admin is the creator
            expect(admins[0].id).toBe(creatorId);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
