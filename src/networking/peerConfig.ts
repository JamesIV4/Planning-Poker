/**
 * Shared PeerJS configuration for both host and client.
 *
 * TURN credentials are fetched dynamically from Metered's REST API at runtime.
 * The API key is injected at build time via VITE_METERED_API_KEY.
 *
 * For local development, create a .env.local file:
 *   VITE_METERED_API_KEY=your-api-key
 */

const METERED_API_KEY = import.meta.env.VITE_METERED_API_KEY ?? "";

const BASE_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

/**
 * Fetch TURN server credentials from Metered's REST API.
 * Returns the full iceServers array (STUN + TURN).
 */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (!METERED_API_KEY) {
    console.warn(
      "[PeerConfig] ⚠ No VITE_METERED_API_KEY found. Cross-network connections will fail.",
    );
    return BASE_ICE_SERVERS;
  }

  try {
    const response = await fetch(
      `https://planning-poker.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`,
      { signal: AbortSignal.timeout(5000) },
    );

    if (!response.ok) {
      console.error(
        "[PeerConfig] Failed to fetch TURN credentials:",
        response.status,
      );
      return BASE_ICE_SERVERS;
    }

    const turnServers: RTCIceServer[] = await response.json();
    console.log(
      "[PeerConfig] TURN credentials fetched ✓",
      turnServers.length,
      "servers",
    );
    return [...BASE_ICE_SERVERS, ...turnServers];
  } catch (err) {
    console.error("[PeerConfig] Error fetching TURN credentials:", err);
    return BASE_ICE_SERVERS;
  }
}

// Synchronous fallback (STUN only) — used if async fetch hasn't completed
export const PEER_CONFIG_BASE = {
  debug: 3,
  serialization: "json" as const,
  config: {
    iceServers: BASE_ICE_SERVERS,
    sdpSemantics: "unified-plan",
    iceCandidatePoolSize: 10,
  },
};

/**
 * Get the full PeerJS config with TURN servers.
 * Call this before creating a peer connection.
 */
export async function getPeerConfig() {
  const iceServers = await fetchIceServers();
  return {
    debug: 3,
    serialization: "json" as const,
    config: {
      iceServers,
      sdpSemantics: "unified-plan",
      iceCandidatePoolSize: 10,
    },
  };
}

// Legacy synchronous export (for any code that hasn't been updated to async)
export const PEER_CONFIG = PEER_CONFIG_BASE;
