/**
 * Shared PeerJS configuration for both host and client.
 * Includes ICE servers with STUN and a public TURN relay for NAT traversal.
 */
export const PEER_CONFIG = {
  debug: 3, // 0=none, 1=errors, 2=warnings, 3=all (verbose)
  serialization: "json" as const,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
    sdpSemantics: "unified-plan",
  },
};
