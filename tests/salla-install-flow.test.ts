import { createHmac } from "node:crypto";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-salla-install-flow.db");
vi.setConfig({ testTimeout: 120_000 });

const secret = "salla-webhook-test-secret";
const merchant = { id: 9101, name: "متجر الورد" };
const owner = { email: "owner@salla-flow.test", name: "Rose Owner" };
const sentEmails: Array<{ to: string; subject: string; text: string }> = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
  vi.stubEnv("SALLA_WEBHOOK_SECRET", secret);
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    const target = String(url);
    if (target.includes("oauth2/user/info")) return json({ data: { name: owner.name, email: owner.email, merchant } });
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

/** Salla's webhook as it really arrives: a signed POST to the route. */
async function post(payload: unknown, signed = true) {
  const { POST } = await import("../app/api/salla/webhook/route");
  const raw = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signed) headers["x-salla-signature"] = createHmac("sha256", secret).update(raw).digest("hex");
  return POST(new Request("http://localhost/api/salla/webhook", { method: "POST", headers, body: raw }) as never);
}

describe("Installing Linkly from Salla, end to end", () => {
  it("rejects an install whose signature is wrong and creates nothing", async () => {
    const response = await post({ event: "app.store.authorize", merchant: merchant.id, data: { access_token: "forged", refresh_token: "forged" } }, false);
    expect(response.status).toBe(401);
    const { findTenantByMerchant } = await import("../lib/store-connections");
    expect(await findTenantByMerchant("salla", String(merchant.id), { includeDisconnected: true })).toBeNull();
    expect(sentEmails).toHaveLength(0);
  });

  it("install -> tokens kept encrypted and usable -> account -> emails -> uninstall", async () => {
    const accessToken = "salla-access-token-123";
    const refreshToken = "salla-refresh-token-456";
    const expires = Math.floor(Date.now() / 1000) + 14 * 86_400;

    // 1. Salla sends app.store.authorize
    const response = await post({ event: "app.store.authorize", merchant: merchant.id, data: { access_token: accessToken, refresh_token: refreshToken, expires, scope: "offline_access orders.read_write" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, detail: "created" });

    const { findTenantByMerchant, getStoreConnection, readStoreTokens } = await import("../lib/store-connections");
    const tenantId = (await findTenantByMerchant("salla", String(merchant.id)))!;
    expect(tenantId).toBeTruthy();

    // 2. The tokens are stored encrypted (never the plain text) and read back for calling Salla's API.
    const { prisma } = await import("../lib/prisma");
    const [row] = await prisma.$queryRaw<Array<{ access_token_enc: string; refresh_token_enc: string; expires_at: string }>>`SELECT access_token_enc, refresh_token_enc, expires_at FROM store_connections WHERE tenant_id = ${tenantId} AND store = 'salla'`;
    expect(row.access_token_enc).not.toContain(accessToken);
    expect(row.refresh_token_enc).not.toContain(refreshToken);
    expect(row.access_token_enc.length).toBeGreaterThan(20);
    expect(await readStoreTokens(tenantId, "salla")).toMatchObject({ accessToken, refreshToken, merchantId: String(merchant.id) });
    expect((await getStoreConnection(tenantId, "salla")).status).toBe("connected");
    expect(row.expires_at.slice(0, 10)).toBe(new Date(expires * 1000).toISOString().slice(0, 10));

    // 3. The merchant's workspace and owner account were created without anyone adding them by hand.
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId } });
    expect(subscription).toMatchObject({ ownerEmail: owner.email, status: "تجربة", companyName: merchant.name });
    const account = await prisma.userAccount.findUniqueOrThrow({ where: { email: owner.email } });
    expect(account.tenantId).toBe(tenantId);
    expect(account.passwordHash).toBe("");

    // 4. Two emails reach the owner: the activation link, then the welcome with the next steps.
    expect(sentEmails.map((mail) => mail.to)).toEqual([owner.email, owner.email]);
    expect(sentEmails[0].subject).toBe("تفعيل حسابك في Linkly");
    expect(sentEmails[0].text).toContain("/activate?token=");
    expect(sentEmails[1].subject).toBe("تم تفعيل Linkly على متجرك في سلة");
    expect(sentEmails[1].text).toContain(merchant.name);
    expect(sentEmails[1].text).toContain("3 أيام");
    expect(sentEmails[1].text).not.toContain("/activate?token=");

    // 5. Salla retries the same event (it does): no second workspace and no second welcome.
    const retry = await post({ event: "app.store.authorize", merchant: merchant.id, data: { access_token: accessToken, refresh_token: refreshToken, expires } });
    expect(await retry.json()).toMatchObject({ detail: "reinstalled" });
    expect(await prisma.subscription.count({ where: { ownerEmail: owner.email } })).toBe(1);
    expect(sentEmails).toHaveLength(2);

    // 6. The merchant uninstalls: the connection is cut, the tokens are wiped and the subscription stops.
    const uninstall = await post({ event: "app.uninstalled", merchant: merchant.id, data: {} });
    expect(uninstall.status).toBe(200);
    expect((await getStoreConnection(tenantId, "salla")).status).toBe("disconnected");
    const [wiped] = await prisma.$queryRaw<Array<{ access_token_enc: string; refresh_token_enc: string }>>`SELECT access_token_enc, refresh_token_enc FROM store_connections WHERE tenant_id = ${tenantId} AND store = 'salla'`;
    expect(wiped).toEqual({ access_token_enc: "", refresh_token_enc: "" });
    expect(await readStoreTokens(tenantId, "salla")).toBeNull();
    expect((await prisma.subscription.findUniqueOrThrow({ where: { tenantId } })).status).toBe("متوقف");
  });
});
