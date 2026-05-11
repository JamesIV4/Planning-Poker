# Planning Poker

## [▶ Launch App](https://jamesiv4.github.io/Planning-Poker/)

A real-time planning poker app for agile teams. Create a session, share the link, and estimate together — all peer-to-peer with no backend server required.

---

## Features

- **Instant sessions** — create a room and share the link, no sign-up needed
- **Real-time sync** — peer-to-peer via WebRTC (PeerJS), no server storing your data
- **Animated card reveals** — 3D flip animation with color-coded distance from consensus
- **Vote distribution** — bar chart showing how votes spread across the Fibonacci deck
- **Agreement metrics** — average score and agreement ratio with donut chart
- **Multi-winner support** — ties highlighted in green
- **Auto-reconnect** — clients silently reconnect if the connection drops
- **Responsive layout** — adapts from wide desktop to narrow mobile, with a grid fallback for very small screens
- **Dark mode** — dark-only UI designed for focus
- **Bot simulation** — add simulated voters on localhost for testing

## Tech Stack

- **React 19** + TypeScript
- **Vite** for build and dev server
- **Zustand** for state management
- **PeerJS** for WebRTC peer-to-peer networking
- **React Router** for client-side routing
- **Vitest** + Testing Library for tests

## Development

```bash
npm install
npm run dev
```

## Testing

```bash
npm test
```

## Deployment

Deployed automatically to GitHub Pages on push to `main` via GitHub Actions.
