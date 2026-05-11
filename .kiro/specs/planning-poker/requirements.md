# Requirements Document

## Introduction

Planning Poker is a real-time collaborative estimation tool for Agile teams. It enables a session admin to create a voting session, share a link with team members, and facilitate rounds of Fibonacci-based story point estimation using peer-to-peer WebRTC communication. The application is a React SPA deployed to GitHub Pages with dark-mode-only styling, using PeerJS for signaling and direct data channels for real-time state synchronization in a star topology.

## Glossary

- **Admin**: The player who creates a session and acts as the host peer (source of truth)
- **Player**: Any participant in a planning poker session, including the admin
- **Session**: A planning poker game instance identified by a unique ID
- **Round**: A single estimation cycle within a session (waiting → voting → revealed)
- **GameState**: The current phase of a round: "waiting", "voting", or "revealed"
- **CardValue**: A valid estimation value from the Fibonacci set (0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89) or special cards (?, ☕)
- **Host_Peer**: The admin's PeerJS instance that accepts connections and broadcasts state
- **Data_Channel**: A WebRTC peer-to-peer communication channel between admin and a player
- **Star_Topology**: Network layout where all players connect only to the admin, never to each other
- **Vote_Distribution**: A mapping of each CardValue to the number of players who selected it
- **Agreement_Ratio**: The proportion of voters who selected the most common card value
- **Card_Selection_Panel**: The UI row of clickable estimation cards for casting votes
- **Poker_Table**: The visual layout showing all players and their face-down or face-up cards
- **Session_State**: The full authoritative state payload broadcast from admin to players

## Requirements

### Requirement 1: Session Creation

**User Story:** As a team facilitator, I want to create a planning poker session, so that I can initiate an estimation meeting for my team.

#### Acceptance Criteria

1. WHEN an admin enters a valid session name and submits the form, THE Session_Manager SHALL create a new session with a unique ID and register the admin as the host peer
2. WHEN a session is created, THE Session_Manager SHALL generate a shareable link containing the session ID
3. THE Session_Manager SHALL validate that the session name is a non-empty string with a maximum length of 100 characters
4. WHEN a session is created, THE Host_Peer SHALL register with the PeerJS signaling server using the peer ID format "planning-poker-{sessionId}"
5. WHEN a session is created, THE Session_Manager SHALL assign the creator as the admin with `isAdmin: true`

### Requirement 2: Session Joining

**User Story:** As a team member, I want to join an existing planning poker session via a shared link, so that I can participate in the estimation.

#### Acceptance Criteria

1. WHEN a player opens a shared session link, THE Application SHALL display a join dialog requesting a display name
2. WHEN a player submits a valid display name, THE Data_Channel SHALL connect to the host peer and send a join action
3. THE Session_Manager SHALL validate that the display name is a non-empty string with a maximum length of 50 characters
4. WHEN a player successfully joins, THE Host_Peer SHALL add the player to the session state and broadcast the updated state to all connected players
5. IF a player submits a display name already in use in the session, THEN THE Host_Peer SHALL reject the join action and return a duplicate name error
6. WHEN a player joins, THE Application SHALL assign a unique player ID to that player

### Requirement 3: Game State Transitions

**User Story:** As an admin, I want to control the flow of estimation rounds, so that I can guide the team through the voting process.

#### Acceptance Criteria

1. WHEN the admin starts a new voting round, THE Store SHALL transition the game state from "waiting" or "revealed" to "voting"
2. WHEN the admin reveals cards, THE Store SHALL transition the game state from "voting" to "revealed"
3. THE Store SHALL enforce that game state transitions follow only the valid sequence: waiting → voting → revealed → voting
4. WHEN the game state changes, THE Host_Peer SHALL broadcast the updated state to all connected players
5. WHEN a new voting round starts, THE Store SHALL clear all votes from the previous round and reset the `wasChanged` flag on all votes

### Requirement 4: Vote Casting

**User Story:** As a player, I want to select an estimation card to cast my vote, so that I can contribute my estimate to the team discussion.

#### Acceptance Criteria

1. WHILE the game state is "voting", THE Card_Selection_Panel SHALL display all available card values: 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, ?, ☕
2. WHEN a player selects a card, THE Store SHALL record the vote with the player ID, card value, and timestamp
3. WHEN a player selects a different card during the voting phase, THE Store SHALL replace the previous vote with the new selection
4. THE Store SHALL maintain at most one vote per player per round
5. WHEN a player casts a vote, THE Card_Selection_Panel SHALL highlight the currently selected card
6. WHEN a player casts a vote, THE Data_Channel SHALL send the vote action to the host peer
7. WHEN the host peer receives a vote action, THE Host_Peer SHALL validate that the card value is a valid CardValue before recording it

### Requirement 5: Vote Editing After Reveal

**User Story:** As a player, I want to change my vote after cards are revealed, so that I can adjust my estimate based on team discussion.

#### Acceptance Criteria

1. WHILE the game state is "revealed", THE Poker_Table SHALL display a pencil icon next to each player's own name as an "Edit Vote" button
2. WHEN a player clicks the pencil "Edit Vote" icon, THE Card_Selection_Panel SHALL reappear for that player
3. WHILE editing after reveal, THE Card_Selection_Panel SHALL hide cards that received zero votes in the current distribution
4. WHEN a player deselects their current vote while editing after reveal, THE Card_Selection_Panel SHALL show all card values again
5. WHEN a player changes their vote after reveal, THE Store SHALL set the `wasChanged` flag to true on that vote
6. WHILE a vote has `wasChanged` set to true, THE Poker_Table SHALL display a small grey pencil icon on the bottom-right corner of that player's card
7. WHEN a user hovers over the "Edit Vote" pencil icon next to a player name, THE Application SHALL display a popover with the text "Edit vote"
8. WHEN a user hovers over the grey pencil icon on a card, THE Application SHALL display a popover with the text "Vote was changed"

### Requirement 6: Poker Table Display

**User Story:** As a participant, I want to see all players and their voting status on a visual table, so that I can track the progress of the estimation round.

#### Acceptance Criteria

1. THE Poker_Table SHALL render a dynamically expanding layout based on the number of connected players
2. WHILE the game state is "voting", THE Poker_Table SHALL display face-down cards for players who have voted with a darkened appearance
3. WHILE the game state is "voting", THE Poker_Table SHALL display unvoted placeholder cards for players who have not yet voted
4. WHEN the admin reveals cards, THE Poker_Table SHALL animate a card flip to show each player's selected value
5. WHILE the game state is "revealed", THE Poker_Table SHALL display all cards face-up with their values visible
6. THE Poker_Table SHALL display the admin control button in the center of the table layout
7. WHILE the game state is "voting", THE admin control button SHALL display "Reveal Cards"
8. WHILE the game state is "revealed", THE admin control button SHALL display "Start New Voting"

### Requirement 7: Results Display

**User Story:** As a team member, I want to see vote statistics after cards are revealed, so that I can understand the team's estimation consensus.

#### Acceptance Criteria

1. WHEN cards are revealed, THE Results_Display SHALL render a bar chart showing the vote count for each card value that received votes
2. WHEN cards are revealed, THE Results_Display SHALL highlight the card value with the highest vote count
3. WHEN cards are revealed, THE Results_Display SHALL compute and display the average score excluding votes of ? and ☕
4. WHEN cards are revealed, THE Results_Display SHALL compute and display the agreement ratio as a donut chart
5. THE Results_Display SHALL compute the agreement ratio as the proportion of voters who selected the most common numeric card value
6. WHEN a player changes their vote after reveal, THE Results_Display SHALL immediately recalculate and update all statistics

### Requirement 8: Real-Time Synchronization

**User Story:** As a participant, I want to see real-time updates from other players, so that the estimation session feels collaborative and responsive.

#### Acceptance Criteria

1. WHEN the admin's session state changes, THE Host_Peer SHALL broadcast the full session state to all connected players via data channels
2. WHEN a player receives a state update, THE Store SHALL replace the local state with the received authoritative state
3. WHEN a player casts a vote, THE Store SHALL apply the vote optimistically to the local state before receiving the admin broadcast
4. THE Application SHALL use a star topology where all players connect only to the admin peer
5. WHEN a player connects to the host, THE Host_Peer SHALL send the current full session state to that player

### Requirement 9: Connection Management and Player Removal

**User Story:** As a participant, I want disconnected players to be removed from the session, so that the table accurately reflects who is actively participating.

#### Acceptance Criteria

1. WHEN a player's data channel disconnects (e.g., closes browser), THE Host_Peer SHALL remove the player from the session state entirely, including their vote
2. WHEN a player is removed due to disconnect, THE Host_Peer SHALL broadcast the updated state to all remaining players
3. WHEN a removed player reopens the shared link, THE Application SHALL treat them as a new participant requiring a display name
4. WHEN the admin disconnects, THE Application SHALL display a "Host disconnected" message to all players
5. IF the PeerJS signaling server is unavailable, THEN THE Application SHALL display an error message indicating the connection service is temporarily unavailable

### Requirement 12: Admin Kick Player

**User Story:** As an admin, I want to remove a disruptive or inactive player from the session, so that I can maintain a productive estimation meeting.

#### Acceptance Criteria

1. WHILE the admin is viewing the Poker_Table, THE Application SHALL display a kick (✕) icon next to each non-admin player's name
2. WHEN a user hovers over the kick icon, THE Application SHALL display a popover with the text "Remove player"
3. WHEN the admin clicks the kick icon for a player, THE Host_Peer SHALL send a kick notification to that player's data channel and then close the connection
4. WHEN the admin kicks a player, THE Store SHALL remove the player from the session state and discard their vote
5. WHEN a player is kicked, THE Host_Peer SHALL broadcast the updated state to all remaining players
6. WHEN a player receives a kick notification, THE Application SHALL display a "You were removed from the session" message
7. AFTER being kicked, THE player SHALL be able to rejoin the session via the shared link by entering a display name again

### Requirement 10: Input Validation and Security

**User Story:** As a system operator, I want all user inputs validated and sanitized, so that the application remains secure and stable.

#### Acceptance Criteria

1. THE Session_Manager SHALL generate session IDs using a cryptographically sufficient random generator (nanoid)
2. THE Application SHALL sanitize display names and session names to prevent cross-site scripting
3. WHEN the host peer receives a player action, THE Host_Peer SHALL validate the message structure and reject malformed messages
4. WHEN the host peer receives a vote action with an invalid card value, THE Host_Peer SHALL reject the vote and discard the message
5. THE Application SHALL not store or transmit any sensitive personal data beyond display names and card values

### Requirement 11: Routing and Navigation

**User Story:** As a user, I want to navigate the application via URLs, so that I can bookmark and share session links.

#### Acceptance Criteria

1. THE Application SHALL use HashRouter for all client-side routing to ensure compatibility with GitHub Pages static hosting
2. WHEN a user navigates to the root path "/", THE Application SHALL display the session creation page
3. WHEN a user navigates to "/session/:sessionId", THE Application SHALL display the session page for that session ID
4. IF a user navigates to a session that does not exist, THEN THE Application SHALL display an error message and offer a link to create a new session
