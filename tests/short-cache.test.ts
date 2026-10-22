import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedFor, invalidateShortCache } from "../lib/short-cache";

beforeEach(() => {
  vi.stubEnv("SHORT_CACHE_FORCE", "1");
  vi.useFakeTimers();
  invalidateShortCache("");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("short cache", () => {
  it("concurrent callers of the same key share one lookup", async () => {
    const load = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); return "row"; });
    const results = Promise.all(Array.from({ length: 11 }, () => cachedFor("k1", 3000, load)));
    await vi.advanceTimersByTimeAsync(60);
    expect(await results).toEqual(Array(11).fill("row"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reuses the answer for the TTL, then looks again", async () => {
    const load = vi.fn(async () => "v");
    await cachedFor("k2", 3000, load);
    await cachedFor("k2", 3000, load);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3100);
    await cachedFor("k2", 3000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never remembers a missing row or a failure", async () => {
    const missing = vi.fn(async () => null);
    await cachedFor("k3", 3000, missing);
    await cachedFor("k3", 3000, missing);
    expect(missing).toHaveBeenCalledTimes(2);

    const failing = vi.fn(async () => { throw new Error("db down"); });
    await expect(cachedFor("k4", 3000, failing)).rejects.toThrow("db down");
    await expect(cachedFor("k4", 3000, failing)).rejects.toThrow("db down");
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("a change made here drops the key at once", async () => {
    let value = "old";
    const load = vi.fn(async () => value);
    expect(await cachedFor("sub:t1", 3000, load)).toBe("old");
    value = "new";
    expect(await cachedFor("sub:t1", 3000, load)).toBe("old");
    invalidateShortCache("sub:t1");
    expect(await cachedFor("sub:t1", 3000, load)).toBe("new");
  });

  it("is off under tests unless forced, so one test process can play every role", async () => {
    vi.unstubAllEnvs();
    const load = vi.fn(async () => "x");
    await cachedFor("k5", 3000, load);
    await cachedFor("k5", 3000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
