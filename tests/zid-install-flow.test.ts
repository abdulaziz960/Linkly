import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-zid-install-flow.db");
vi.setConfig({ testTimeout: 120_000 });

const store = { id: "7701", title: "متجر الورد" };
const owner = { email: "owner@zid-flow.test", name: "Rose Owner" };
const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
const subscribed: string[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
  vi.stubEnv("ZID_CLIENT_ID", "zid-client");
  vi.stubEnv("ZID_CLIENT_SECRET", "zid-secret");
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    const target = String(url);
    if (target.includes("oauth.zid.sa/oauth/token")) return json({ access_token: "manager-token", authorization: "app-token", refresh_token: "refresh-1", expires_in: 3600 });
    if (target.includes("/managers/account/profile")) return json({ user: { name: owner.name, email: owner.email, store } });
    if (target.includes("/managers/webhooks")) {
      subscribed.push(JSON.parse(String(init?.body)).event);
      return json({ status: "ok" });
    }
    if (target.includes("api.resend.com")) {
      const body = JSON.parse(String(init?.body));
      sentEmails.push({ to: body.to, subject: body.subject, text: body.text });
      return json({ id: `email-${sentEmails.length}` });
    }
    return json({});
  }));
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("Installing Linkly from Zid, end to end", () => {
  it("install with no session -> workspace, tokens, webhooks, emails -> reinstall -> uninstall", async () => {
    const { exchangeZidCode, ZID_EVENTS } = await import("../lib/zid");
    const { installFromZid } = await import("../lib/zid-install");
    const { findTenantByMerchant, getStoreConnection, readStoreTokens } = await import("../lib/store-connections");
    const { prisma } = await import("../lib/prisma");

    const tokens = await exchangeZidCode("auth-code", "https://linklysa.io/api/zid/callback");
    if ("error" in tokens) throw new Error(tokens.error);

    // 1. Install: a workspace and owner account are created, the store is connected, our events are subscribed.
    expect(await installFromZid(tokens, "https://linklysa.io")).toBe("created");
    const tenantId = (await findTenantByMerchant("zid", store.id))!;
    expect(tenantId).toBeTruthy();
    expect((await getStoreConnection(tenantId, "zid")).status).toBe("connected");
    expect(await readStoreTokens(tenantId, "zid")).toMatchObject({ merchantId: store.id, refreshToken: "refresh-1" });
    expect(await prisma.subscription.findUniqueOrThrow({ where: { tenantId } })).toMatchObject({ ownerEmail: owner.email, status: "تجربة", companyName: store.title });
    expect((await prisma.userAccount.findUniqueOrThrow({ where: { email: owner.email } })).tenantId).toBe(tenantId);
    expect([...subscribed].sort()).toEqual([...ZID_EVENTS].sort());

    // 2. Activation link, then the welcome that names Zid.
    expect(sentEmails.map((mail) => mail.to)).toEqual([owner.email, owner.email]);
    expect(sentEmails[0].text).toContain("/activate?token=");
    expect(sentEmails[1].subject).toBe("تم تفعيل Linkly على متجرك في زد");
    expect(sentEmails[1].text).toContain(store.title);
    expect(sentEmails[1].text).not.toContain("سلة");

    // 3. Installing again (same store) reuses the workspace: no second account, no second welcome.
    expect(await installFromZid(tokens, "https://linklysa.io")).toBe("reinstalled");
    expect(await prisma.subscription.count({ where: { ownerEmail: owner.email } })).toBe(1);
    expect(sentEmails).toHaveLength(2);

    // 4. An unsigned uninstall is refused; the signed one disconnects the store and wipes the tokens.
    const { POST } = await import("../app/api/zid/webhook/route");
    const { zidWebhookUrl, ZID_UNINSTALL_EVENT } = await import("../lib/zid");
    const forged = await POST(new NextRequest(`http://localhost/api/zid/webhook?t=${tenantId}&e=${ZID_UNINSTALL_EVENT}&s=bad`, { method: "POST", body: "{}" }));
    expect(forged.status).toBe(401);
    expect((await getStoreConnection(tenantId, "zid")).status).toBe("connected");

    const response = await POST(new NextRequest(zidWebhookUrl("http://localhost", tenantId, ZID_UNINSTALL_EVENT), { method: "POST", body: "{}" }));
    expect(response.status).toBe(200);
    expect((await getStoreConnection(tenantId, "zid")).status).toBe("disconnected");
    expect(await readStoreTokens(tenantId, "zid")).toBeNull();
  });

  it("an owner whose email already has a Linkly account is not attached without signing in", async () => {
    const { installFromZid } = await import("../lib/zid-install");
    const { findTenantByMerchant } = await import("../lib/store-connections");
    // the first test already created this owner's account
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).includes("/managers/account/profile")) return json({ user: { name: owner.name, email: owner.email, store: { id: "7702", title: "متجر آخر" } } });
      return json({});
    }));
    const outcome = await installFromZid({ token: JSON.stringify({ m: "m", a: "a" }), refreshToken: "", expiresAt: "" }, "https://linklysa.io");
    expect(outcome).toBe("existing_account");
    expect(await findTenantByMerchant("zid", "7702", { includeDisconnected: true })).toBeNull();
  });
});
