import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { usePokerStore } from "../store/usePokerStore";
import { isValidSessionName, isValidDisplayName } from "../utils/validation";

export function CreateSessionPage() {
  const [sessionName, setSessionName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const createSession = usePokerStore((state) => state.createSession);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedSession = sessionName.trim();
    const trimmedName = displayName.trim();

    if (!isValidSessionName(trimmedSession)) {
      if (trimmedSession.length === 0) {
        setError("Session name is required.");
      } else {
        setError("Session name must be 100 characters or fewer.");
      }
      return;
    }

    if (!isValidDisplayName(trimmedName)) {
      if (trimmedName.length === 0) {
        setError("Your name is required.");
      } else {
        setError("Your name must be 50 characters or fewer.");
      }
      return;
    }

    createSession(trimmedSession, trimmedName);

    const session = usePokerStore.getState().session;
    if (session) {
      navigate(`/session/${session.id}`);
    }
  }

  return (
    <div className="create-session-page">
      <div className="create-session-card">
        <h1>Planning Poker</h1>
        <p className="subtitle">
          Create a session to start estimating with your team.
        </p>

        <form onSubmit={handleSubmit} className="create-session-form">
          <label htmlFor="session-name">Session Name</label>
          <input
            id="session-name"
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="e.g. Sprint 42 Planning"
            maxLength={100}
            autoFocus
          />
          <label htmlFor="display-name">Your Name</label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Jane Smith"
            maxLength={50}
          />
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary">
            Create Session
          </button>
        </form>
      </div>
    </div>
  );
}
