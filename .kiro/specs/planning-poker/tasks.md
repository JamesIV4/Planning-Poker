# Implementation Plan: Planning Poker

## Overview

A real-time collaborative estimation tool built as a React SPA with Vite + TypeScript, using Zustand for state management and PeerJS for WebRTC peer-to-peer synchronization in a star topology. Deployed to GitHub Pages with HashRouter and dark-mode-only styling.

## Tasks

- [x] 1. Project scaffolding and configuration
  - [x] 1.1 Initialize Vite + React + TypeScript project
    - Run `npm create vite@latest` with React + TypeScript template
    - Configure `vite.config.ts` with base path for GitHub Pages
    - Set up `tsconfig.json` with strict mode
    - _Requirements: 11.1_

  - [x] 1.2 Install dependencies
    - Install runtime deps: `react-router-dom`, `zustand`, `peerjs`, `nanoid`
    - Install dev deps: `vitest`, `fast-check`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
    - Configure Vitest in `vite.config.ts`
    - _Requirements: 11.1_

  - [x] 1.3 Set up project structure and global styles
    - Create directory structure: `src/components/`, `src/pages/`, `src/store/`, `src/networking/`, `src/types/`, `src/utils/`
    - Create global CSS with dark-mode-only theme variables (background, surface, text, accent colors)
    - Set up CSS reset and base typography
    - _Requirements: 11.1_

- [x] 2. Data models and type definitions
  - [x] 2.1 Define core TypeScript types and interfaces
    - Create `src/types/index.ts` with: `CardValue`, `NumericCard`, `SpecialCard`, `GameState`, `Player`, `Vote`, `Round`, `Session`, `SessionState`
    - Define `PlayerAction` union type (`join`, `vote`, `removeVote`)
    - Define `StateMessage` and `ActionMessage` protocol types
    - Define the `CARD_VALUES` constant array: `[0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, "?", "☕"]`
    - _Requirements: 4.1, 4.7, 10.4_

  - [x] 2.2 Implement validation utility functions
    - Create `src/utils/validation.ts`
    - Implement `isValidSessionName(name: string): boolean` — non-empty, max 100 chars
    - Implement `isValidDisplayName(name: string): boolean` — non-empty, max 50 chars
    - Implement `isValidCardValue(value: unknown): value is CardValue` — checks membership in valid set
    - Implement `isValidPlayerAction(msg: unknown): msg is PlayerAction` — validates message structure
    - Implement `sanitize(input: string): string` — strips HTML/script tags to prevent XSS
    - _Requirements: 1.3, 2.3, 4.7, 10.2, 10.3, 10.4_

  - [ ]\* 2.3 Write property tests for validation functions
    - **Property 1: Input validation accepts only valid names**
    - **Property 5: Card value validation rejects invalid values**
    - **Property 13: Message structure validation**
    - **Property 16: XSS sanitization**
    - **Validates: Requirements 1.3, 2.3, 4.7, 10.2, 10.3, 10.4**

- [x] 3. Zustand store implementation
  - [x] 3.1 Create the core planning poker store
    - Create `src/store/usePokerStore.ts`
    - Implement session state: `session`, `currentPlayer`, `gameState`
    - Implement `createSession(name: string)` — generates session ID with nanoid, creates session with admin player
    - Implement `joinSession(sessionId: string, displayName: string)` — adds player with unique ID
    - Implement `addPlayer(player: Player)` and `removePlayer(playerId: string)` — removePlayer also discards the player's vote
    - Implement `kickPlayer(playerId: string)` — removes player from session and discards their vote (admin action)
    - _Requirements: 1.1, 1.2, 1.5, 2.4, 2.6, 9.1, 9.2, 10.1, 12.4_

  - [x] 3.2 Implement voting actions in the store
    - Implement `castVote(playerId: string, card: CardValue)` — records vote with timestamp, replaces existing vote
    - Implement `removeVote(playerId: string)` — removes player's vote
    - Implement `revealCards()` — transitions state to "revealed", sets `revealedAt`
    - Implement `startNewVoting()` — transitions to "voting", clears all votes, resets `wasChanged` flags
    - Implement `editVoteAfterReveal(playerId: string, card: CardValue)` — sets `wasChanged: true`
    - Enforce valid state transitions: waiting → voting → revealed → voting
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.2, 4.3, 4.4, 5.5_

  - [x] 3.3 Implement computed values (selectors)
    - Implement `getVoteDistribution()` — returns Map<CardValue, number> of vote counts
    - Implement `getAverageScore()` — arithmetic mean of numeric cards only, excluding ? and ☕
    - Implement `getAgreementRatio()` — proportion of voters who selected the most common card value
    - Implement `applyAuthoritativeState(state: SessionState)` — replaces local state with received state
    - _Requirements: 7.1, 7.3, 7.5, 8.2_

  - [x] 3.4 Write property tests for store logic
    - **Property 2: Game state transitions follow valid sequence**
    - **Property 3: At most one vote per player per round**
    - **Property 4: New round clears all previous votes**
    - **Property 6: Average score excludes non-numeric cards**
    - **Property 7: Agreement ratio computation**
    - **Property 8: Vote distribution sum equals total voters**
    - **Property 10: Player IDs are unique**
    - **Property 11: Post-reveal vote change sets wasChanged flag**
    - **Property 15: State replacement on authoritative update**
    - **Property 17: Session creator is always admin**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 4.3, 4.4, 7.1, 7.3, 7.5, 8.2, 1.5, 2.6, 5.5**

- [x] 4. Checkpoint - Core logic verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. PeerJS networking layer
  - [x] 5.1 Implement the PeerJS host (admin side)
    - Create `src/networking/peerHost.ts`
    - Implement `createHost(sessionId: string)` — registers peer with ID `planning-poker-{sessionId}`
    - Implement `broadcastState(state: SessionState)` — sends state to all connected data channels
    - Implement `onPlayerAction(callback)` — routes incoming player actions to store
    - Implement `onPlayerConnected(callback)` and `onPlayerDisconnected(callback)`
    - On player disconnect: remove player from session state and discard their vote, broadcast updated state
    - Implement `kickPlayer(playerId: string)` — send kick message to player, close their data channel, remove from session
    - Validate incoming messages with `isValidPlayerAction` before processing
    - Reject duplicate display names on join action
    - Send full state to newly connected players
    - Implement `destroy()` for cleanup
    - _Requirements: 1.4, 2.4, 2.5, 3.4, 4.6, 4.7, 8.1, 8.4, 8.5, 9.1, 9.2, 10.3, 10.4, 12.3, 12.4, 12.5_

  - [x] 5.2 Implement the PeerJS client (player side)
    - Create `src/networking/peerClient.ts`
    - Implement `connectToHost(sessionId: string)` — connects to peer ID `planning-poker-{sessionId}`
    - Implement `sendAction(action: PlayerAction)` — sends action message to host
    - Implement `onStateUpdate(callback)` — receives and applies state updates
    - Implement `onConnectionChange(callback)` — tracks connection status
    - Implement `onKicked(callback)` — handle kick message from host, display "You were removed from the session"
    - Implement `destroy()` for cleanup
    - _Requirements: 2.2, 4.6, 8.2, 8.3, 9.4, 12.6, 12.7_

  - [ ]\* 5.3 Write property tests for networking utilities
    - **Property 9: Duplicate display name rejection**
    - **Validates: Requirements 2.5**

- [x] 6. Router and pages setup
  - [x] 6.1 Configure HashRouter and route definitions
    - Create `src/App.tsx` with HashRouter wrapping route definitions
    - Define routes: `/` → `CreateSessionPage`, `/session/:sessionId` → `SessionPage`
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 6.2 Implement CreateSessionPage
    - Create `src/pages/CreateSessionPage.tsx`
    - Render form with session name input and "Create Session" button
    - Validate session name on submit (non-empty, max 100 chars)
    - On submit: call `createSession`, initialize PeerJS host, navigate to `/session/:sessionId`
    - Display generated shareable link after creation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 6.3 Implement SessionPage with join dialog
    - Create `src/pages/SessionPage.tsx`
    - If player hasn't joined: show join dialog with display name input
    - Validate display name (non-empty, max 50 chars)
    - On join: connect PeerJS client to host, send join action
    - Handle duplicate name error from host — show validation message
    - If session not found (host peer unavailable): show error with link to create new session
    - Once joined: render the main game view (PokerTable, CardSelection, Results)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 11.3, 11.4_

- [x] 7. Checkpoint - Routing and pages verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. UI Components - Poker Table
  - [x] 8.1 Implement PokerTable component layout
    - Create `src/components/PokerTable.tsx`
    - Render dynamically expanding grid/flex layout based on player count
    - Display player name labels with connection status indicators
    - Place admin control button in center of table
    - Show "Reveal Cards" button during voting state (admin only)
    - Show "Start New Voting" button during revealed state (admin only)
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 6.7, 6.8_

  - [x] 8.2 Implement PlayerCard component with states
    - Create `src/components/PlayerCard.tsx`
    - During voting: show face-down card with darkened appearance for players who voted
    - During voting: show unvoted placeholder for players who haven't voted
    - During revealed: show face-up card with the vote value
    - _Requirements: 6.2, 6.3, 6.5_

  - [x] 8.3 Implement card flip animation
    - Add CSS transform-based flip animation using `rotateY(180deg)` transition
    - Trigger flip when game state transitions from "voting" to "revealed"
    - Use `transform-style: preserve-3d` and `backface-visibility: hidden`
    - Ensure GPU-accelerated rendering with `will-change: transform`
    - _Requirements: 6.4_

- [ ] 9. UI Components - Card Selection Panel
  - [x] 9.1 Implement CardSelectionPanel component
    - Create `src/components/CardSelectionPanel.tsx`
    - Render all 13 card values: 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, ?, ☕
    - Highlight the currently selected card with visual distinction
    - On card click: call `castVote` action and send vote to host via PeerJS
    - Apply optimistic update locally before admin broadcast
    - Show panel during "voting" state
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 8.3_

  - [x] 9.2 Implement post-reveal editing behavior
    - Hide card selection panel by default in "revealed" state
    - When `isEditing` is true: show panel with only cards that received votes (non-zero distribution)
    - When player deselects their current vote while editing: show all cards again
    - On vote change after reveal: set `wasChanged: true` on the vote
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

  - [ ]\* 9.3 Write property test for post-reveal card filtering
    - **Property 12: Zero-vote cards hidden during post-reveal editing**
    - **Validates: Requirements 5.3, 5.4**

- [x] 10. UI Components - Edit Vote UX
  - [x] 10.1 Implement edit vote pencil icon and popover
    - Add pencil icon button next to current player's name on the poker table (visible in "revealed" state)
    - On click: toggle `isEditing` state to show/hide CardSelectionPanel
    - Add hover popover with text "Edit vote" on the pencil icon
    - _Requirements: 5.1, 5.2, 5.7_

  - [x] 10.2 Implement wasChanged indicator on cards
    - When a vote has `wasChanged: true`: display small grey pencil icon on bottom-right corner of that player's card
    - Add hover popover with text "Vote was changed" on the grey pencil icon
    - _Requirements: 5.6, 5.8_

  - [x] 10.3 Implement admin kick player UI
    - Display a kick (✕) icon next to each non-admin player's name on the poker table (visible to admin only)
    - Add hover popover with text "Remove player" on the kick icon
    - On click: call `kickPlayer(playerId)` which triggers host to send kick message and close connection
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 11. UI Components - Results Display
  - [x] 11.1 Implement ResultsDisplay component
    - Create `src/components/ResultsDisplay.tsx`
    - Render bar chart showing vote count for each card value that received votes
    - Highlight the card value with the highest vote count
    - Display computed average score (excluding ? and ☕)
    - Render agreement ratio as a donut/circular chart
    - Recalculate and update all statistics immediately when votes change after reveal
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 12. Connection management and error handling
  - [x] 12.1 Implement connection status UI
    - Create `src/components/ConnectionStatus.tsx`
    - Display "Host disconnected" message when admin leaves
    - Display "You were removed from the session" message when player is kicked (with option to rejoin)
    - Display error message when PeerJS signaling server is unavailable
    - _Requirements: 9.4, 9.5, 12.6_

  - [x] 12.2 Wire up player disconnect and kick handling
    - On player disconnect: remove player from session entirely (including their vote), broadcast updated state
    - On kick action from admin: send kick message, close data channel, remove player, broadcast
    - On player side receiving kick: show "You were removed from the session" message with option to rejoin
    - Clean up PeerJS connections on component unmount
    - _Requirements: 9.1, 9.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [ ] 13. Integration and wiring
  - [x] 13.1 Wire store to networking layer
    - In admin mode: subscribe to store changes and call `broadcastState` on every update
    - In player mode: apply received state updates to store via `applyAuthoritativeState`
    - Connect `onPlayerAction` handler to store mutation methods
    - Implement optimistic vote updates on player side
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 13.2 Wire all components together in SessionPage
    - Compose PokerTable, CardSelectionPanel, ResultsDisplay, and ConnectionStatus in SessionPage
    - Pass store state and actions as props to components
    - Manage `isEditing` state for post-reveal vote editing flow
    - Ensure admin controls (reveal/new voting) trigger store actions and broadcast
    - _Requirements: 3.1, 3.2, 3.4, 6.6, 6.7, 6.8_

  - [ ]\* 13.3 Write integration tests for session lifecycle
    - Test create session → join → vote → reveal → new round flow
    - Test post-reveal vote editing updates results
    - Test connection status display on disconnect
    - _Requirements: 1.1, 2.2, 3.1, 3.2, 4.2, 7.6_

- [x] 14. GitHub Pages deployment configuration
  - [x] 14.1 Configure deployment
    - Add `base` path in `vite.config.ts` for GitHub Pages (e.g., `/<repo-name>/`)
    - Create GitHub Actions workflow file `.github/workflows/deploy.yml` for automated deployment
    - Add `homepage` field to `package.json`
    - Ensure HashRouter handles all routes correctly on static hosting
    - _Requirements: 11.1_

- [x] 15. Final checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The star topology means all networking complexity is concentrated in tasks 5.1 and 5.2
- Card flip animation uses pure CSS transforms for GPU acceleration — no animation library needed
