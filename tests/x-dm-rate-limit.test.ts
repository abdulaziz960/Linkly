import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-x-dm-rate-limit.db");
const TENANT_ID = "tenant-x-dm-rate-limit-test";

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
  return await getIntegrationSettings("x", TENANT_ID);
}

describe("X DM sync respects rate limits instead of hammering the endpoint every call", () => {
  it("stores the reset time from a 429 and skips the next call until then", async () => {
    const settings = await seedXIntegration();
    const resetInSeconds = Math.floor(Date.now() / 1000) + 120;

    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ title: "Too Many Requests" }), {
      status: 429,
      headers: { "x-rate-limit-reset": String(resetInSeconds) }
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const { syncXTenant } = await import("../lib/x-sync");
    const first = await syncXTenant(settings);
    expect(first.ok).toBe(false);
    expect(first.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const { prisma } = await import("../lib/prisma");
    const row = await prisma.integrationSetting.findUnique({ where: { id: settings.id }, select: { xDmRateLimitedUntil: true } });
    expect(row?.xDmRateLimitedUntil).toBeTruthy();

    // A second call within the window must not hit the network at all -
    // this is what stops "every 30s per open tab plus every minute from the
    // cron" from re-triggering the same 429 indefinitely.
    const secondFetchSpy = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", secondFetchSpy);
    const second = await syncXTenant(settings);
    expect(second.ok).toBe(false);
    expect(second.status).toBe(429);
    expect(secondFetchSpy).not.toHaveBeenCalled();
  });

  it("clears a stale rate-limit marker once a call succeeds again", async () => {
    const settings = await seedXIntegration();
    const { prisma } = await import("../lib/prisma");
    await prisma.integrationSetting.update({
      where: { id: settings.id },
      data: { xDmRateLimitedUntil: new Date(Date.now() - 60000).toISOString(), accessToken: "test-access-token" }
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));

    const { syncXTenant } = await import("../lib/x-sync");
    const result = await syncXTenant(settings);
    expect(result.ok).toBe(true);

    const row = await prisma.integrationSetting.findUnique({ where: { id: settings.id }, select: { xDmRateLimitedUntil: true } });
    expect(row?.xDmRateLimitedUntil).toBe("");
  });
});
