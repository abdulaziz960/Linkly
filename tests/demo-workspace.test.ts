import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-demo-workspace.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-encryption-key-for-demo-workspace");
  vi.stubEnv("DEMO_ACCESS_KEY", "demo-secret-key-for-tests-12345");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

describe("demo workspaces", () => {
  it("only the right key opens the link", async () => {
    const { isDemoKeyValid } = await import("../lib/demo-workspace");
    expect(isDemoKeyValid("demo-secret-key-for-tests-12345")).toBe(true);
    expect(isDemoKeyValid("wrong")).toBe(false);
    expect(isDemoKeyValid("")).toBe(false);
    expect(isDemoKeyValid(null)).toBe(false);
    vi.stubEnv("DEMO_ACCESS_KEY", "");
    expect(isDemoKeyValid("demo-secret-key-for-tests-12345")).toBe(false);
    vi.stubEnv("DEMO_ACCESS_KEY", "demo-secret-key-for-tests-12345");
  });

  it("creates separate full workspaces, each with its own Salla store, and deletes them after their days", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { prisma } = await import("../lib/prisma");
    const { createDemoWorkspace, deleteExpiredDemoWorkspaces } = await import("../lib/demo-workspace");
    const { isDemoTenant } = await import("../lib/demo-mode");
    const { listSallaOrders, listSallaStatuses, updateSallaOrderStatus, prepareSallaShipment, createSallaShipment, sallaOrdersForCustomer } = await import("../lib/salla");

    const first = await createDemoWorkspace();
    const second = await createDemoWorkspace();
    expect(first.tenantId).not.toBe(second.tenantId);
    expect(await isDemoTenant(first.tenantId)).toBe(true);
    expect(await isDemoTenant("some-real-tenant")).toBe(false);

    // each workspace starts with its own conversations, products and an owner that can sign in by the link only
    for (const workspace of [first, second]) {
      expect(await prisma.conversation.count({ where: { tenantId: workspace.tenantId } })).toBe(5);
      expect(await prisma.product.count({ where: { tenantId: workspace.tenantId } })).toBe(6);
      const subscription = await prisma.subscription.findUnique({ where: { tenantId: workspace.tenantId } });
      expect(subscription?.status).toBe("تجربة");
      expect(Date.parse(subscription!.renewalAt) - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
      expect((await prisma.userAccount.findUnique({ where: { id: workspace.userId } }))?.passwordHash).toBe("");
    }

    // the fake Salla store: the real parsing runs on it, and a change in one workspace never shows in the other
    const statuses = await listSallaStatuses(first.tenantId);
    expect(statuses.map((status) => status.slug)).toContain("shipped");
    const before = await listSallaOrders(first.tenantId);
    expect(before.orders).toHaveLength(4);
    const target = before.orders.find((order) => order.statusSlug === "under_review")!;
    expect((await updateSallaOrderStatus(first.tenantId, target.id, "in_progress")).ok).toBe(true);
    expect((await listSallaOrders(first.tenantId)).orders.find((order) => order.id === target.id)?.statusSlug).toBe("in_progress");
    expect((await listSallaOrders(second.tenantId)).orders.find((order) => order.id === target.id)?.statusSlug).toBe("under_review");
    expect((await sallaOrdersForCustomer(first.tenantId, "966501234567")).orders.length).toBeGreaterThan(0);

    // a shipment can be prepared and created on a demo order
    const prepared = await prepareSallaShipment(first.tenantId, target.id);
    expect(prepared.ok).toBe(true);
    expect(prepared.companies.length).toBeGreaterThan(0);
    expect(prepared.draft?.packages.length).toBeGreaterThan(0);
    const created = await createSallaShipment(first.tenantId, { order_id: target.id, courier_id: prepared.companies[0].id });
    expect(created.ok).toBe(true);
    expect((await listSallaOrders(first.tenantId)).orders.find((order) => order.id === target.id)).toMatchObject({ statusSlug: "shipped", shippingCompany: prepared.companies[0].name });

    // a WhatsApp send from a demo workspace never leaves: answered locally as accepted
    const fetchSpy = vi.fn(async () => { throw new Error("must not reach the network"); });
    vi.stubGlobal("fetch", fetchSpy);
    const { sendWhatsAppTextMessage } = await import("../lib/whatsapp-send");
    const conversation = await prisma.conversation.findFirstOrThrow({ where: { tenantId: first.tenantId }, include: { customer: true } });
    const sent = await sendWhatsAppTextMessage({ tenantId: first.tenantId, conversationId: conversation.id, to: conversation.customer.phone, text: "مرحبًا من الديمو", author: "مراجع ديمو" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sent, JSON.stringify(sent)).toMatchObject({ ok: true });
    vi.unstubAllGlobals();

    // nothing is deleted before the days are over; then the whole workspace goes, the other one stays
    expect(await deleteExpiredDemoWorkspaces()).toBe(0);
    await prisma.$executeRaw`UPDATE demo_workspaces SET expires_at = ${new Date(Date.now() - 1000).toISOString()} WHERE tenant_id = ${first.tenantId}`;
    expect(await deleteExpiredDemoWorkspaces()).toBe(1);
    expect(await prisma.conversation.count({ where: { tenantId: first.tenantId } })).toBe(0);
    expect(await prisma.subscription.findUnique({ where: { tenantId: first.tenantId } })).toBeNull();
    expect(await prisma.userAccount.findUnique({ where: { id: first.userId } })).toBeNull();
    expect(await prisma.conversation.count({ where: { tenantId: second.tenantId } })).toBe(5);
    expect((await listSallaOrders(second.tenantId)).orders).toHaveLength(4);
    const leftover = await prisma.$queryRaw<Array<{ n: number | bigint }>>`SELECT COUNT(*) AS n FROM demo_salla_orders WHERE tenant_id = ${first.tenantId}`;
    expect(Number(leftover[0].n)).toBe(0);
    expect(await isDemoTenant(first.tenantId)).toBe(false);
  });

  it("the /demo link: no key = nothing, right key = a new workspace and a seven-day session", async () => {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../app/demo/route");
    const { prisma } = await import("../lib/prisma");
    const before = await prisma.subscription.count();
    expect((await GET(new NextRequest("http://localhost:3000/demo"))).status).toBe(404);
    expect((await GET(new NextRequest("http://localhost:3000/demo?key=nope"))).status).toBe(404);
    expect(await prisma.subscription.count()).toBe(before);

    const response = await GET(new NextRequest("http://localhost:3000/demo?key=demo-secret-key-for-tests-12345"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/dashboard?view=inbox");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("audiencew_session=");
    expect(cookie).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
    expect(await prisma.subscription.count()).toBe(before + 1);
  });
});
