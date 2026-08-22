import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("session tokens", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  });
  afterEach(() => vi.useRealTimers());

  it("accepts a signed unexpired token and rejects tampering", async () => {
    const { createSessionToken, verifySessionToken } = await import("../lib/auth");
    const token = createSessionToken("user-123", 60);
    expect(verifySessionToken(token)).toEqual({ userId: "user-123", sessionVersion: 0 });
    expect(verifySessionToken(`${token.slice(0, -1)}0`)).toBeNull();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { createSessionToken, verifySessionToken } = await import("../lib/auth");
    const token = createSessionToken("user-123", 1);
    vi.advanceTimersByTime(1_001);
    expect(verifySessionToken(token)).toBeNull();
  });
});
