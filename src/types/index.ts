// Card value types
export type NumericCard = 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34 | 55 | 89;
export type SpecialCard = "?" | "☕";
export type CardValue = NumericCard | SpecialCard;

// Game state
export type GameState = "waiting" | "voting" | "revealed";

// Core data models
export interface Player {
  id: string;
  displayName: string;
  isAdmin: boolean;
}

export interface Vote {
  playerId: string;
  card: CardValue;
  votedAt: number;
  wasChanged: boolean;
}

export interface Round {
  id: string;
  state: GameState;
  votes: Vote[];
  startedAt: number;
  revealedAt: number | null;
}

export interface Session {
  id: string;
  name: string;
  adminId: string;
  players: Player[];
  currentRound: Round | null;
  createdAt: number;
}

export interface SessionState {
  session: Session;
  round: Round | null;
  votes: Vote[];
}

// Player actions (sent from player → admin)
export type PlayerAction =
  | { type: "join"; displayName: string }
  | { type: "vote"; card: CardValue }
  | { type: "removeVote" };

// Message protocol (admin → players)
export interface StateMessage {
  type: "state";
  payload: SessionState;
}

export interface KickMessage {
  type: "kicked";
}

export interface SessionEndedMessage {
  type: "sessionEnded";
}

// Message protocol (player → admin)
export interface ActionMessage {
  type: "action";
  payload: PlayerAction;
}

// Card values constant
export const CARD_VALUES: CardValue[] = [
  0,
  1,
  2,
  3,
  5,
  8,
  13,
  21,
  34,
  55,
  89,
  "?",
  "☕",
];
