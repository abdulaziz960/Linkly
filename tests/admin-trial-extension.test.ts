import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const admin = vi.fn();
vi.mock("../lib/admin-auth", () => ({ requirePlatformAdmin: (...args: unknown[]) => admin(...args) }));
const testDirectory = mkdtempSync(join(tmpdir(), "linkly-trial-extension-"));
const day = 86_400_000;

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", `file:${join(testDirectory, "test.db")}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  admin.mockResolvedValue({ id: "admin", email: "admin@example.test", name: "Admin" });
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  rmSync(testDirectory, { recursive: true });
});

async function extend(id: string, days: unknown, origin = "http://localhost") {
  const { PATCH } = await import("../app/api/admin/clients/[id]/trial/route");
  return PATCH(new NextRequest(`http://localhost/api/admin/clients/${id}/trial`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify({ days })
  }), { params: Promise.resolve({ id }) });
}

async function seed(tenantId: string, expires: number, status = "تجربة") {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  const now = new Date().toISOString();
  return prisma.subscription.create({ data: {
    id: `sub-${tenantId}`, tenantId, companyName: "Trial test", ownerName: "Owner", ownerEmail: `${tenantId}@example.test`,
    status, plan: "Trial plan", billingCycle: status === "تجربة" ? "تجربة 3 أيام" : "شهري",
    amount: 0, renewalAt: new Date(expires).toISOString(), createdAt: now, updatedAt: now
  } });
}

it("extends an ongoing trial from its original end and preserves plan, cycle, status and price", async () => {
  const { getTenantSubscriptionRow } = await import("../lib/tenant-subscription-row");
  const { prisma } = await import("../lib/prisma");
  const expiry = Date.now() + day;
  const original = await seed("ongoing", expiry);
  expect((await getTenantSubscriptionRow("ongoing"))?.renewalAt).toBe(original.renewalAt);
  expect((await extend("ongoing", 7)).status).toBe(200);
  const renewalAt = new Date(expiry + 7 * day).toISOString();
  expect(await getTenantSubscriptionRow("ongoing")).toMatchObject({ renewalAt, status: "تجربة" });
  expect(await prisma.subscription.findUnique({ where: { tenantId: "ongoing" } }))
    .toMatchObject({ renewalAt, status: original.status, billingCycle: original.billingCycle, plan: original.plan, amount: original.amount });
  expect(await prisma.adminActionLog.findFirst({ where: { targetId: "ongoing" } }))
    .toMatchObject({ action: "extend-client-trial", adminUserId: "admin" });
});

it("reopens an expired trial from now and rejects paid, managed and unauthorized extensions", async () => {
  const { computeSubscriptionAccess } = await import("../lib/subscription-access");
  const { markShopifyBilled } = await import("../lib/shopify-billing");
  const original = await seed("expired", Date.now() - 2 * day);
  expect(computeSubscriptionAccess(original, Date.now(), null).expired).toBe(true);
  const before = Date.now();
  const result = await extend("expired", 3);
  expect(result.status).toBe(200);
  const { renewalAt } = (await result.json()).data;
  expect(Date.parse(renewalAt)).toBeGreaterThanOrEqual(before + 3 * day);
  expect(computeSubscriptionAccess({ status: "تجربة", renewalAt }, Date.now(), null).expired).toBe(false);
  await seed("paid", Date.now() + day, "نشط");
  expect((await extend("paid", 1)).status).toBe(409);
  await seed("managed", Date.now() + day);
  await markShopifyBilled("managed", "test-shop.myshopify.com");
  expect((await extend("managed", 1)).status).toBe(409);
  expect((await extend("expired", 0)).status).toBe(400);
  expect((await extend("expired", 1, "https://invalid.example")).status).toBe(403);
  admin.mockResolvedValueOnce(null);
  expect((await extend("expired", 1)).status).toBe(403);
});
