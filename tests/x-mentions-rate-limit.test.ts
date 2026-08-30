import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-x-mentions-rate-limit.db");
const TENANT_ID = "tenant-x-rate-limit-test";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function seedXIntegration() {
  const { getIntegrationSettings } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  const settings = await getIntegrationSettings("x", TENANT_ID);
  await prisma.integrationSetting.update({
    where: { id: settings.id },
    data: { wabaId: "own-account-id", status: "connected", accessToken: "test-access-token" }
  });
  return settings.id;
}

describe("X mentions sync respects rate limits instead of silently returning empty", () => {
  it("stores the reset time from a 429 and skips the next call until then", async () => {
    const id = await seedXIntegration();
    const resetInSeconds = Math.floor(Date.now() / 1000) + 120;

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ title: "Too Many Requests" }), {
      status: 429,
      headers: { "x-rate-limit-reset": String(resetInSeconds) }
    })));

    const { syncXMentionsForTenant } = await import("../lib/x-public-sync");
    await expect(syncXMentionsForTenant(TENANT_ID)).rejects.toThrow();

    const { prisma } = await import("../lib/prisma");
    const row = await prisma.integrationSetting.findUnique({ where: { id }, select: { xMentionsRateLimitedUntil: true } });
    expect(row?.xMentionsRateLimitedUntil).toBeTruthy();
    expect(new Date(row!.xMentionsRateLimitedUntil).getTime()).toBeCloseTo(resetInSeconds * 1000, -3);

    // A second call within the window must not hit the network at all.
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const skipped = await syncXMentionsForTenant(TENANT_ID);
    expect(skipped).toMatchObject({ ok: false, skipped: true, rateLimited: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clears a stale rate-limit marker once a call succeeds again", async () => {
    const { prisma } = await import("../lib/prisma");
    const { getIntegrationSettings } = await import("../lib/database");
    const settings = await getIntegrationSettings("x", TENANT_ID);
    await prisma.integrationSetting.update({
      where: { id: settings.id },
      // Window already elapsed, so the call should go through and clear this.
      data: { xMentionsRateLimitedUntil: new Date(Date.now() - 60000).toISOString(), accessToken: "test-access-token" }
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));

    const { syncXMentionsForTenant } = await import("../lib/x-public-sync");
    const result = await syncXMentionsForTenant(TENANT_ID);
    expect(result.ok).toBe(true);

    const row = await prisma.integrationSetting.findUnique({ where: { id: settings.id }, select: { xMentionsRateLimitedUntil: true } });
    expect(row?.xMentionsRateLimitedUntil).toBe("");
  });
});
