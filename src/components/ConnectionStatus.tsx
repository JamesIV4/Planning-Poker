import { useState, useEffect, useRef } from "react";
import "./ConnectionStatus.css";

export interface ConnectionStatusProps {
  status: "connected" | "disconnected" | "kicked" | "ended" | "error";
  onRejoin?: () => void;
}

const GRACE_PERIOD_MS = 8000;

export function ConnectionStatus({ status, onRejoin }: ConnectionStatusProps) {
  // Seed from the initial status so kicked/ended banners show immediately on
  // first mount (the render-phase adjustment below only reacts to changes).
  const [ready, setReady] = useState(status === "kicked" || status === "ended");
  const wasConnectedRef = useRef(false);

  // Track if we were ever connected
  useEffect(() => {
    if (status === "connected") {
      wasConnectedRef.current = true;
    }
  }, [status]);

  // Adjust `ready` immediately when status changes, during render, which is
  // React's recommended alternative to a status-syncing effect:
  // - connected: reset so the next disconnect gets a fresh grace period
  // - kicked/ended: show the banner immediately (intentional host action)
  // The timed reveal for disconnected/error is handled by the effect below.
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status === "connected") {
      setReady(false);
    } else if (status === "kicked" || status === "ended") {
      setReady(true);
    }
  }

  // Don't show warning banners until the grace period has elapsed.
  // This prevents flickering on page refresh while connections are re-establishing.
  useEffect(() => {
    if (status !== "disconnected" && status !== "error") {
      return;
    }

    // For disconnected/error: wait before showing banner to allow silent reconnection
    const delay = wasConnectedRef.current ? 1000 : GRACE_PERIOD_MS;
    const timer = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === "connected") {
    return null;
  }

  // Don't render warning states until grace period has passed
  if (!ready) {
    return null;
  }

  if (status === "disconnected") {
    return (
      <div
        className="connection-status connection-status--disconnected"
        role="alert"
        aria-live="assertive"
      >
        <div className="connection-status__content">
          <span className="connection-status__icon">⚠</span>
          <div className="connection-status__text">
            <strong>Connection lost</strong>
            <p>Attempting to reconnect to the session host...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "kicked") {
    return (
      <div
        className="connection-status connection-status--kicked"
        role="alert"
        aria-live="assertive"
      >
        <div className="connection-status__content">
          <span className="connection-status__icon">✕</span>
          <div className="connection-status__text">
            <strong>You were removed from the session</strong>
            <p>The host removed you from this session.</p>
          </div>
          {onRejoin && (
            <button
              className="connection-status__rejoin-btn"
              onClick={onRejoin}
              type="button"
            >
              Rejoin
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === "ended") {
    return (
      <div
        className="connection-status connection-status--ended"
        role="alert"
        aria-live="assertive"
      >
        <div className="connection-status__content">
          <span className="connection-status__icon">🏁</span>
          <div className="connection-status__text">
            <strong>Session ended</strong>
            <p>The host has ended this session.</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="connection-status connection-status--error"
        role="alert"
        aria-live="assertive"
      >
        <div className="connection-status__content">
          <span className="connection-status__icon">⚡</span>
          <div className="connection-status__text">
            <strong>Connection service unavailable</strong>
            <p>Unable to reach the signaling server. Please try again later.</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
