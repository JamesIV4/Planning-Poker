import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CreateSessionPage } from "./CreateSessionPage";
import { usePokerStore } from "../store/usePokerStore";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateSessionPage />
    </MemoryRouter>,
  );
}

describe("CreateSessionPage", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    usePokerStore.setState({
      session: null,
      currentPlayer: null,
      gameState: "waiting",
    });
  });

  it("renders the form with session name input and submit button", () => {
    renderPage();

    expect(screen.getByLabelText("Session Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Your Name")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Session" }),
    ).toBeInTheDocument();
  });

  it("shows error when submitting empty session name", () => {
    renderPage();

    const nameInput = screen.getByLabelText("Your Name");
    fireEvent.change(nameInput, { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Session" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Session name is required.",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows error when session name exceeds 100 characters", () => {
    renderPage();

    const input = screen.getByLabelText("Session Name");
    const nameInput = screen.getByLabelText("Your Name");
    fireEvent.change(input, { target: { value: "a".repeat(101) } });
    fireEvent.change(nameInput, { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Session" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Session name must be 100 characters or fewer.",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows error when display name is empty", () => {
    renderPage();

    const input = screen.getByLabelText("Session Name");
    fireEvent.change(input, { target: { value: "Sprint 42" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Session" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your name is required.",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("creates session and navigates on valid submit", () => {
    renderPage();

    const input = screen.getByLabelText("Session Name");
    const nameInput = screen.getByLabelText("Your Name");
    fireEvent.change(input, { target: { value: "Sprint 42" } });
    fireEvent.change(nameInput, { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Session" }));

    const session = usePokerStore.getState().session;
    expect(session).not.toBeNull();
    expect(session!.name).toBe("Sprint 42");
    expect(usePokerStore.getState().currentPlayer!.displayName).toBe("Alice");
    expect(mockNavigate).toHaveBeenCalledWith(`/session/${session!.id}`);
  });

  it("trims whitespace from session name before creating", () => {
    renderPage();

    const input = screen.getByLabelText("Session Name");
    const nameInput = screen.getByLabelText("Your Name");
    fireEvent.change(input, { target: { value: "  My Session  " } });
    fireEvent.change(nameInput, { target: { value: "Bob" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Session" }));

    const session = usePokerStore.getState().session;
    expect(session).not.toBeNull();
    expect(session!.name).toBe("My Session");
  });
});
