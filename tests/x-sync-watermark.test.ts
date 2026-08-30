import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-x-sync-watermark.db");
const TENANT_ID = "tenant-x-sync-watermark-test";

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

describe("X DM sync does not resurrect a conversation the user deleted", () => {
  it("advances a watermark so a later poll of the same last-50 window skips an already-seen event", async () => {
    const settings = await seedXIntegration();
    const dmEvent = {
      id: "1000000000000000001",
      event_type: "MessageCreate",
      text: "مرحبا",
      created_at: "2026-01-05T10:00:00.000Z",
      sender_id: "customer-watermark-1"
    };

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [dmEvent] }), { status: 200 })));

    const { syncXTenant } = await import("../lib/x-sync");
    const first = await syncXTenant(settings);
    expect(first.ok).toBe(true);
    expect(first.syncedDms).toBe(1);

    const { prisma } = await import("../lib/prisma");
    const stored = await prisma.message.findFirst({ where: { text: "مرحبا" } });
    expect(stored).toBeTruthy();

    // Simulate the user deleting the conversation from the dashboard.
    await prisma.message.deleteMany({ where: { conversationId: stored!.conversationId } });
    await prisma.conversation.deleteMany({ where: { id: stored!.conversationId } });

    // X's endpoint has no usable cursor for this app tier, so the exact same
    // last-50 window (including the already-processed event) is fetched
    // again - without a watermark this recreates the deleted conversation.
    const second = await syncXTenant(settings);
    expect(second.ok).toBe(true);
    expect(second.syncedDms).toBe(0);

    const resurrected = await prisma.conversation.findUnique({ where: { id: stored!.conversationId } });
    expect(resurrected).toBeNull();
  });
});
