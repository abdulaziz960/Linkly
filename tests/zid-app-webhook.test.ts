import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-zid-app-webhook.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("ZID_APP_WEBHOOK_SECRET", "right-secret-value");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

const payload = (event: string, storeId = 507530) => ({ app_id: 1292, store_id: storeId, store_uuid: "d78468cd", store_url: "https://shop.sa/", plan_name: "النمو", status: "active", end_date: "2026-12-22T08:05:29.000000Z", amount_paid: 79.01, merchant_email: "m@x.sa", event_name: event, plan_type: "Paid", plan_id: 904 });
const send = (body: unknown, secret: string | null = "right-secret-value") => new NextRequest("http://localhost/api/zid/app-webhook", { method: "POST", headers: { "Content-Type": "application/json", ...(secret ? { "x-linkly-zid-secret": secret } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) });

async function connectedWorkspace() {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  const { saveStoreTokens } = await import("../lib/store-connections");
  await ensureSchema();
  const now = new Date().toISOString();
  await prisma.subscription.create({ data: { id: "sub-zid", tenantId: "t-zid", companyName: "متجر زد", ownerName: "م", ownerEmail: "z@x.test", plan: "test", status: "نشط", employeeLimit: 3, amount: 0, billingCycle: "شهري", renewalAt: "", createdAt: now, updatedAt: now } });
  await saveStoreTokens({ tenantId: "t-zid", store: "zid", accessToken: "a", refreshToken: "r", expiresAt: "", merchantId: "507530", merchantName: "متجر" });
}

describe("Zid App Market events about this app", () => {
  it("rejects a delivery without the right secret header", async () => {
    const { POST } = await import("../app/api/zid/app-webhook/route");
    expect((await POST(send(payload("app.market.subscription.active"), null))).status).toBe(401);
    expect((await POST(send(payload("app.market.subscription.active"), "wrong"))).status).toBe(401);
    vi.stubEnv("ZID_APP_WEBHOOK_SECRET", "");
    expect((await POST(send(payload("app.market.subscription.active")))).status).toBe(401);
    vi.stubEnv("ZID_APP_WEBHOOK_SECRET", "right-secret-value");
  });

  it("answers 200 to an event or body it does not act on, and 400 to broken json", async () => {
    const { POST } = await import("../app/api/zid/app-webhook/route");
    expect(await (await POST(send(payload("app.market.something.else")))).json()).toMatchObject({ ok: true, detail: "ignored" });
    expect(await (await POST(send({ event_name: "app.market.subscription.active" }))).json()).toMatchObject({ detail: "ignored" });
    expect((await POST(send("not json"))).status).toBe(400);
  });

  it("records a subscription event on the connected client, and disconnects the store on uninstall", async () => {
    const { POST } = await import("../app/api/zid/app-webhook/route");
    const { prisma } = await import("../lib/prisma");
    const { getStoreConnection } = await import("../lib/store-connections");
    await connectedWorkspace();

    expect(await (await POST(send(payload("app.market.subscription.active")))).json()).toMatchObject({ detail: "recorded" });
    const logs = await prisma.adminLog.findMany({ where: { clientId: "t-zid" } });
    expect(logs.map((log) => log.message).join("\n")).toContain("تفعيل اشتراك التطبيق");
    expect((await getStoreConnection("t-zid", "zid")).status).toBe("connected");

    expect(await (await POST(send(payload("app.market.application.uninstall")))).json()).toMatchObject({ detail: "disconnected" });
    expect((await getStoreConnection("t-zid", "zid")).status).toBe("disconnected");
    // The plan on the Linkly subscription is never touched by these events.
    expect((await prisma.subscription.findUniqueOrThrow({ where: { tenantId: "t-zid" } })).plan).toBe("test");
  });

  it("keeps a trace, and answers 200, for a store that never connected", async () => {
    const { POST } = await import("../app/api/zid/app-webhook/route");
    expect(await (await POST(send(payload("app.market.application.install", 999)))).json()).toMatchObject({ ok: true, detail: "store-not-connected" });
  });
});
