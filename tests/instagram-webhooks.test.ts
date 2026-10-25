import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-instagram-webhooks.db");

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

const ok = () => new Response(JSON.stringify({ success: true }), { status: 200 });
const denied = (message: string) => new Response(JSON.stringify({ error: { message } }), { status: 400 });

describe("subscribing an Instagram account to the app's webhooks", () => {
  it("posts to the account's subscribed_apps edge on graph.instagram.com with its own token", async () => {
    const { subscribeInstagramWebhooks } = await import("../lib/instagram-webhooks");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL, init?: RequestInit) => { calls.push(`${init?.method} ${url.origin}${url.pathname}?${url.searchParams.get("subscribed_fields")}&t=${url.searchParams.get("access_token")}`); return ok(); }));
    const result = await subscribeInstagramWebhooks("1784140000", "igtoken");
    expect(result).toEqual({ ok: true, fields: "messages,messaging_postbacks,comments" });
    expect(calls).toEqual(["POST https://graph.instagram.com/v22.0/1784140000/subscribed_apps?messages,messaging_postbacks,comments&t=igtoken"]);
  });

  it("falls back to fewer fields when the dashboard has not enabled them all, and reports the reason when none works", async () => {
    const { subscribeInstagramWebhooks } = await import("../lib/instagram-webhooks");
    let attempt = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++attempt < 4 ? denied("field not enabled") : ok())));
    // messages alone is the last resort, and the result says so (comments are then not subscribed)
    expect(await subscribeInstagramWebhooks("1", "t")).toEqual({ ok: true, fields: "messages" });

    vi.stubGlobal("fetch", vi.fn(async () => denied("App is not live")));
    expect(await subscribeInstagramWebhooks("1", "t")).toEqual({ ok: false, error: "App is not live" });
    expect(await subscribeInstagramWebhooks("", "t")).toMatchObject({ ok: false });
  });

  it("re-subscribes every connected account and counts the failures", async () => {
    const { prisma } = await import("../lib/prisma");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { resubscribeAllInstagramAccounts } = await import("../lib/instagram-webhooks");
    const now = new Date().toISOString();
    const base = { provider: "instagram", businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "", appId: "", configId: "", verifyToken: "", webhookUrl: "", updatedAt: now };
    await prisma.integrationSetting.create({ data: { ...base, id: "ig-1", tenantId: "t-ig-1", status: "connected", wabaId: "111", accessToken: encryptSecret("tok-1") } });
    await prisma.integrationSetting.create({ data: { ...base, id: "ig-2", tenantId: "t-ig-2", status: "connected", wabaId: "222", accessToken: encryptSecret("tok-2") } });
    await prisma.integrationSetting.create({ data: { ...base, id: "ig-3", tenantId: "t-ig-3", status: "pending", wabaId: "", accessToken: "" } });
    vi.stubGlobal("fetch", vi.fn(async (url: URL, init?: RequestInit) => {
      if (url.pathname.includes("/222/")) return denied("expired token");
      if (init?.method === "POST") return ok();
      return new Response(JSON.stringify({ data: [{ subscribed_fields: ["messages", "comments"] }] }), { status: 200 });
    }));
    const result = await resubscribeAllInstagramAccounts();
    expect(result.checked).toBe(2);
    expect(result.subscribed).toBe(1);
    expect(result.failed).toEqual([{ tenantId: "t-ig-2", error: "expired token" }]);
    expect(result.accounts).toEqual([{ tenantId: "t-ig-1", subscribedNow: "messages,messaging_postbacks,comments", current: ["messages", "comments"], commentsOn: true }]);
  });
});
