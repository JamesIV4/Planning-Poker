import { describe, it, expect } from "vitest";
import {
  isValidSessionName,
  isValidDisplayName,
  isValidCardValue,
  isValidPlayerAction,
  sanitize,
} from "./validation";

describe("isValidSessionName", () => {
  it("accepts a valid session name", () => {
    expect(isValidSessionName("Sprint 42 Planning")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidSessionName("")).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    expect(isValidSessionName("   ")).toBe(false);
  });

  it("accepts a name at exactly 100 characters", () => {
    expect(isValidSessionName("a".repeat(100))).toBe(true);
  });

  it("rejects a name over 100 characters", () => {
    expect(isValidSessionName("a".repeat(101))).toBe(false);
  });
});

describe("isValidDisplayName", () => {
  it("accepts a valid display name", () => {
    expect(isValidDisplayName("Alice")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidDisplayName("")).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    expect(isValidDisplayName("  ")).toBe(false);
  });

  it("accepts a name at exactly 50 characters", () => {
    expect(isValidDisplayName("a".repeat(50))).toBe(true);
  });

  it("rejects a name over 50 characters", () => {
    expect(isValidDisplayName("a".repeat(51))).toBe(false);
  });
});

describe("isValidCardValue", () => {
  it("accepts all numeric card values", () => {
    for (const val of [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]) {
      expect(isValidCardValue(val)).toBe(true);
    }
  });

  it("accepts special card values", () => {
    expect(isValidCardValue("?")).toBe(true);
    expect(isValidCardValue("☕")).toBe(true);
  });

  it("rejects invalid numbers", () => {
    expect(isValidCardValue(4)).toBe(false);
    expect(isValidCardValue(100)).toBe(false);
    expect(isValidCardValue(-1)).toBe(false);
  });

  it("rejects non-card strings", () => {
    expect(isValidCardValue("hello")).toBe(false);
    expect(isValidCardValue("")).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isValidCardValue(null)).toBe(false);
    expect(isValidCardValue(undefined)).toBe(false);
  });

  it("rejects objects and arrays", () => {
    expect(isValidCardValue({})).toBe(false);
    expect(isValidCardValue([])).toBe(false);
  });
});

describe("isValidPlayerAction", () => {
  it("accepts a valid join action", () => {
    expect(isValidPlayerAction({ type: "join", displayName: "Alice" })).toBe(
      true,
    );
  });

  it("rejects a join action with empty displayName", () => {
    expect(isValidPlayerAction({ type: "join", displayName: "" })).toBe(false);
  });

  it("rejects a join action with whitespace-only displayName", () => {
    expect(isValidPlayerAction({ type: "join", displayName: "   " })).toBe(
      false,
    );
  });

  it("rejects a join action without displayName", () => {
    expect(isValidPlayerAction({ type: "join" })).toBe(false);
  });

  it("accepts a valid vote action", () => {
    expect(isValidPlayerAction({ type: "vote", card: 8 })).toBe(true);
    expect(isValidPlayerAction({ type: "vote", card: "?" })).toBe(true);
    expect(isValidPlayerAction({ type: "vote", card: "☕" })).toBe(true);
  });

  it("rejects a vote action with invalid card", () => {
    expect(isValidPlayerAction({ type: "vote", card: 4 })).toBe(false);
    expect(isValidPlayerAction({ type: "vote", card: "invalid" })).toBe(false);
  });

  it("rejects a vote action without card", () => {
    expect(isValidPlayerAction({ type: "vote" })).toBe(false);
  });

  it("accepts a valid removeVote action", () => {
    expect(isValidPlayerAction({ type: "removeVote" })).toBe(true);
  });

  it("rejects unknown action types", () => {
    expect(isValidPlayerAction({ type: "unknown" })).toBe(false);
    expect(isValidPlayerAction({ type: "kick" })).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidPlayerAction(null)).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidPlayerAction("string")).toBe(false);
    expect(isValidPlayerAction(42)).toBe(false);
    expect(isValidPlayerAction(undefined)).toBe(false);
  });

  it("rejects objects without type field", () => {
    expect(isValidPlayerAction({ displayName: "Alice" })).toBe(false);
  });
});

describe("sanitize", () => {
  it("returns plain text unchanged", () => {
    expect(sanitize("Hello World")).toBe("Hello World");
  });

  it("strips HTML tags", () => {
    expect(sanitize("<b>bold</b>")).toBe("bold");
    expect(sanitize("<div>content</div>")).toBe("content");
  });

  it("strips script tags and their content markers", () => {
    expect(sanitize("<script>alert('xss')</script>")).toBe("alert('xss')");
  });

  it("strips nested tags", () => {
    expect(sanitize("<div><span>text</span></div>")).toBe("text");
  });

  it("strips self-closing tags", () => {
    expect(sanitize("before<br/>after")).toBe("beforeafter");
  });

  it("handles empty string", () => {
    expect(sanitize("")).toBe("");
  });

  it("strips event handler attributes in tags", () => {
    expect(sanitize('<img onerror="alert(1)" src="x">')).toBe("");
  });
});
