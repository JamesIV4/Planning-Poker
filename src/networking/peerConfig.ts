/**
 * Shared PeerJS configuration for both host and client.
 *
 * TURN credentials are injected at build time via environment variables:
 *   VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL
 *
 * For local development, create a .env.local file:
 *   VITE_TURN_USERNAME=your-username
 *   VITE_TURN_CREDENTIAL=your-credential
 *
 * For production (GitHub Pages), these are set as repository secrets
 * and injected during the GitHub Actions build step.
 *
 * To get credentials:
 * 1. Sign up at https://www.metered.ca/stun-turn (free tier, no credit card)
 * 2. Create credentials via their REST API or dashboard
 * 3. Store as VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL
 */

const isLocalDev =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME ?? "";
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL ?? "";

const turnServers: RTCIceServer[] =
  TURN_USERNAME && TURN_CREDENTIAL
    ? [
        {
          urls: "turn:global.relay.metered.ca:80",
          username: TURN_USERNAME,
          credential: TURN_CREDENTIAL,
        },
        {
          urls: "turn:global.relay.metered.ca:80?transport=tcp",
          username: TURN_USERNAME,
          credential: TURN_CREDENTIAL,
        },
        {
          urls: "turn:global.relay.metered.ca:443",
          username: TURN_USERNAME,
          credential: TURN_CREDENTIAL,
        },
        {
          urls: "turns:global.relay.metered.ca:443?transport=tcp",
          username: TURN_USERNAME,
          credential: TURN_CREDENTIAL,
        },
      ]
    : [];

export const PEER_CONFIG = {
  debug: isLocalDev ? 2 : 1,
  serialization: "json" as const,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      ...turnServers,
    ],
    sdpSemantics: "unified-plan",
    iceCandidatePoolSize: 10,
  },
};
