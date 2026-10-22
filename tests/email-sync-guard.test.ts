import { beforeEach, describe, expect, it, vi } from "vitest";

const syncGmailInbox = vi.fn();
vi.mock("../lib/email-channel", () => ({ syncGmailInbox: (...args: unknown[]) => syncGmailInbox(...args) }));
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u1", tenantId: "t-sync" })) }));

describe("POST /api/email/sync", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
    syncGmailInbox.mockReset();
  });

  it("runs one sync for any number of simultaneous callers, and not again within 20 seconds", async () => {
    let finish: (value: { synced: number }) => void = () => {};
    syncGmailInbox.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { POST } = await import("../app/api/email/sync/route");

    const calls = [POST(), POST(), POST()];
    await vi.advanceTimersByTimeAsync(10);
    finish({ synced: 2 });
    const bodies = await Promise.all((await Promise.all(calls)).map((response) => response.json()));
    expect(bodies).toEqual([{ synced: 2 }, { synced: 2 }, { synced: 2 }]);
    expect(syncGmailInbox).toHaveBeenCalledTimes(1);

    // Right after: nothing new to report, and Gmail is not asked again.
    expect(await (await POST()).json()).toEqual({ synced: 0 });
    expect(syncGmailInbox).toHaveBeenCalledTimes(1);

    // After the gap a new sync runs.
    await vi.advanceTimersByTimeAsync(21_000);
    syncGmailInbox.mockResolvedValue({ synced: 1 });
    expect(await (await POST()).json()).toEqual({ synced: 1 });
    expect(syncGmailInbox).toHaveBeenCalledTimes(2);
  });
});
