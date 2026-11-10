import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-admin-client-delete.db");
const requirePlatformAdmin = vi.fn();
vi.mock("../lib/admin-auth", () => ({ requirePlatformAdmin: (...a: unknown[]) => requirePlatformAdmin(...a) }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

const del = (id: string, body: unknown) => new NextRequest(`http://localhost/api/admin/clients/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json", origin: "http://localhost" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedClient(tenantId: string, company: string) {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  const now = new Date().toISOString();
  await prisma.subscription.create({ data: { id: `sub-${tenantId}`, tenantId, companyName: company, ownerName: "م", ownerEmail: `${tenantId}@x.test`, plan: "test", status: "تجربة", employeeLimit: 3, amount: 0, billingCycle: "تجربة", renewalAt: "", createdAt: now, updatedAt: now } });
  await prisma.employee.create({ data: { id: `emp-${tenantId}`, tenantId, name: "المالك", initial: "م", email: `${tenantId}@x.test`, role: "مالك الحساب", permissions: "", status: "متصل" } });
  await prisma.userAccount.create({ data: { id: `user-${tenantId}`, name: "المالك", email: `${tenantId}@x.test`, passwordHash: "x", role: "مالك الحساب", tenantId, createdAt: now } });
  await prisma.customer.create({ data: { id: `cust-${tenantId}`, tenantId, name: "عميل", phone: tenantId, initial: "ع" } });
  await prisma.conversation.create({ data: { id: `conv-${tenantId}`, tenantId, customerId: `cust-${tenantId}`, lastMessage: "x", status: "unassigned", assignee: "" } });
  // A table that is created on demand and unknown to the main delete: its rows must go too.
  await prisma.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS crm_units (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT, name TEXT)");
  await prisma.$executeRawUnsafe("INSERT INTO crm_units (id, tenant_id, project_id, name) VALUES ($1, $2, 'p', 'وحدة')", `unit-${tenantId}`, tenantId);
}

describe("deleting a client for good from the admin panel", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset().mockResolvedValue({ id: "a1", name: "فريق الدعم", tenantId: "platform" });
  });

  it("wipes the client and every table keyed by it, leaves other clients alone, and needs the exact company name", async () => {
    const { prisma } = await import("../lib/prisma");
    const { DELETE } = await import("../app/api/admin/clients/[id]/route");
    await seedClient("t-gone", "شركة المحذوفة");
    await seedClient("t-stays", "شركة الباقية");

    expect((await DELETE(del("t-gone", { confirmCompanyName: "اسم خطأ" }), ctx("t-gone"))).status).toBe(400);
    expect(await prisma.subscription.count({ where: { tenantId: "t-gone" } })).toBe(1);

    const response = await DELETE(del("t-gone", { confirmCompanyName: "شركة المحذوفة" }), ctx("t-gone"));
    expect(response.status).toBe(200);
    expect(await prisma.subscription.count({ where: { tenantId: "t-gone" } })).toBe(0);
    expect(await prisma.userAccount.count({ where: { email: "t-gone@x.test" } })).toBe(0);
    expect(await prisma.conversation.count({ where: { tenantId: "t-gone" } })).toBe(0);
    const units = await prisma.$queryRawUnsafe<Array<{ tenant_id: string }>>("SELECT tenant_id FROM crm_units");
    expect(units.map((row) => row.tenant_id)).toEqual(["t-stays"]);

    expect(await prisma.subscription.count({ where: { tenantId: "t-stays" } })).toBe(1);
    expect(await prisma.userAccount.count({ where: { email: "t-stays@x.test" } })).toBe(1);
    expect(await prisma.conversation.count({ where: { tenantId: "t-stays" } })).toBe(1);
  });

  it("refuses a client that already paid, the account you work from, an unknown client, and non-admins", async () => {
    const { prisma } = await import("../lib/prisma");
    const { PAYMENT_STATUS } = await import("../lib/payment-status");
    const { DELETE } = await import("../app/api/admin/clients/[id]/route");
    await seedClient("t-paid", "شركة دفعت");
    await prisma.subscriptionPayment.create({ data: { id: "pay-1", tenantId: "t-paid", amount: 100, status: PAYMENT_STATUS.completed, createdAt: new Date().toISOString() } });
    expect((await DELETE(del("t-paid", { confirmCompanyName: "شركة دفعت" }), ctx("t-paid"))).status).toBe(409);
    expect(await prisma.subscription.count({ where: { tenantId: "t-paid" } })).toBe(1);

    await seedClient("platform", "شركة المنصة");
    expect((await DELETE(del("platform", { confirmCompanyName: "شركة المنصة" }), ctx("platform"))).status).toBe(400);
    expect((await DELETE(del("nobody", { confirmCompanyName: "x" }), ctx("nobody"))).status).toBe(404);

    requirePlatformAdmin.mockResolvedValue(null);
    expect((await DELETE(del("t-paid", { confirmCompanyName: "شركة دفعت" }), ctx("t-paid"))).status).toBe(403);
    expect(requirePlatformAdmin).toHaveBeenCalledWith("clients");
  });
});
