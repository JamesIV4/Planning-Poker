import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionStatus } from "./ConnectionStatus";
import type { ConnectionStatusProps } from "./ConnectionStatus";

function renderStatus(overrides: Partial<ConnectionStatusProps> = {}) {
  const defaultProps: ConnectionStatusProps = {
    status: "connected",
  };
  const props = { ...defaultProps, ...overrides };
  return render(<ConnectionStatus {...props} />);
}

describe("ConnectionStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  describe("connected state", () => {
    it("renders nothing when connected", () => {
      const { container } = renderStatus({ status: "connected" });

      expect(
        container.querySelector(".connection-status"),
      ).not.toBeInTheDocument();
    });
  });

  describe("disconnected state", () => {
    it("displays 'Connection lost' message", () => {
      renderStatus({ status: "disconnected" });
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(screen.getByText("Connection lost")).toBeInTheDocument();
    });

    it("displays explanation text", () => {
      renderStatus({ status: "disconnected" });
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(
        screen.getByText("Attempting to reconnect to the session host..."),
      ).toBeInTheDocument();
    });

    it("uses role=alert for assertive announcement", () => {
      renderStatus({ status: "disconnected" });
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("applies the disconnected CSS class", () => {
      const { container } = renderStatus({ status: "disconnected" });
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(
        container.querySelector(".connection-status--disconnected"),
      ).toBeInTheDocument();
    });

    it("does not show warning before grace period", () => {
      renderStatus({ status: "disconnected" });

      expect(screen.queryByText("Connection lost")).not.toBeInTheDocument();
    });
  });

  describe("kicked state", () => {
    it("displays 'You were removed from the session' message", () => {
      renderStatus({ status: "kicked" });

      expect(
        screen.getByText("You were removed from the session"),
      ).toBeInTheDocument();
    });

    it("displays explanation text", () => {
      renderStatus({ status: "kicked" });

      expect(
        screen.getByText("The host removed you from this session."),
      ).toBeInTheDocument();
    });

    it("shows a Rejoin button when onRejoin is provided", () => {
      const onRejoin = vi.fn();
      renderStatus({ status: "kicked", onRejoin });

      expect(
        screen.getByRole("button", { name: "Rejoin" }),
      ).toBeInTheDocument();
    });

    it("calls onRejoin when Rejoin button is clicked", () => {
      const onRejoin = vi.fn();
      renderStatus({ status: "kicked", onRejoin });

      fireEvent.click(screen.getByRole("button", { name: "Rejoin" }));
      expect(onRejoin).toHaveBeenCalledTimes(1);
    });

    it("does not show Rejoin button when onRejoin is not provided", () => {
      renderStatus({ status: "kicked" });

      expect(
        screen.queryByRole("button", { name: "Rejoin" }),
      ).not.toBeInTheDocument();
    });

    it("uses role=alert for assertive announcement", () => {
      renderStatus({ status: "kicked" });

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("applies the kicked CSS class", () => {
      const { container } = renderStatus({ status: "kicked" });

      expect(
        container.querySelector(".connection-status--kicked"),
      ).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("displays 'Connection service unavailable' message", () => {
      renderStatus({ status: "error" });
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(
        screen.getByText("Connection service unavailable"),
      ).toBeInTheDocument();
    });

    it("displays explanation text about signaling server", () => {
      renderStatus({ status: "error" });
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(
        screen.getByText(
          "Unable to reach the signaling server. Please try again later.",
        ),
      ).toBeInTheDocument();
    });

    it("uses role=alert for assertive announcement", () => {
      renderStatus({ status: "error" });
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("applies the error CSS class", () => {
      const { container } = renderStatus({ status: "error" });
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(
        container.querySelector(".connection-status--error"),
      ).toBeInTheDocument();
    });
  });
});
