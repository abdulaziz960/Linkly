import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-employee-removal.db");
let currentUser: Record<string, unknown> | null = null;

vi.mock("../lib/auth", () => ({ authCookieName: "audiencew_session", getCurrentUser: async () => currentUser }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../lib/origin-guard", () => ({ isTrustedOrigin: () => true }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

const tenantId = "tenant-removal";
const owner = { id: "u-owner", name: "المالك", email: "owner@removal.test", role: "مالك الحساب", tenantId, isPlatformAdmin: 0, sessionVersion: 0, disabled: 0, subscriptionExpired: false };

async function person(key: string, role = "موظف دعم", withAccount = true, userTenant = tenantId) {
  const { prisma } = await import("../lib/prisma");
  const email = `${key}@removal.test`;
  const name = `موظف ${key}`;
  if (withAccount) await prisma.userAccount.create({ data: { id: `u-${key}`, name, email, passwordHash: "x", role, tenantId: userTenant, createdAt: new Date().toISOString() } });
  await prisma.employee.create({ data: { id: `emp-${key}`, name, email, role, status: "متصل", permissions: "المحادثات", initial: "م", tenantId, userId: withAccount ? `u-${key}` : "" } });
  return { id: `emp-${key}`, name, email };
}

async function conversation(key: string, assignee: string, status = "assigned") {
  const { prisma } = await import("../lib/prisma");
  await prisma.customer.create({ data: { id: `c-${key}`, name: `عميل ${key}`, phone: `9665${key.length}`, initial: "ع", tenantId } });
  await prisma.conversation.create({ data: { id: `conv-${key}`, customerId: `c-${key}`, channel: "whatsapp", lastMessage: "x", status, assignee, tenantId, lastActivityAt: "2026-11-02T09:00:00.000Z" } });
}

const remove = async (id: string, body: unknown) => {
  const route = await import("../app/api/employees/[id]/route");
  return route.DELETE(new NextRequest(`http://localhost/api/employees/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
};

describe("removing an employee", () => {
  it("moves open conversations to the chosen employee, frees the seat, hides them and locks the login, keeping history", async () => {
    const { ensureSchema, getEmployees } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    await prisma.userAccount.create({ data: { id: owner.id, name: owner.name, email: owner.email, passwordHash: "x", role: owner.role, tenantId, createdAt: new Date().toISOString() } });
    await prisma.employee.create({ data: { id: "emp-owner", name: owner.name, email: owner.email, role: owner.role, status: "متصل", permissions: "الكل", initial: "م", tenantId, userId: owner.id } });
    const leaving = await person("leaving");
    const staying = await person("staying");
    await conversation("open", leaving.name);
    await conversation("done", leaving.name, "closed");
    await prisma.message.create({ data: { id: "m-1", conversationId: "conv-open", direction: "out", text: "رسالة قديمة", time: "09:00", createdAt: "2026-11-02T09:00:00.000Z", author: leaving.name } });
    currentUser = owner;

    // Open conversations need a destination.
    const needsTarget = await remove(leaving.id, {});
    expect(needsTarget.status).toBe(400);
    expect((await needsTarget.json()).openConversations).toBe(1);
    expect((await remove(leaving.id, { reassignTo: leaving.id })).status).toBe(400);

    const done = await remove(leaving.id, { reassignTo: staying.id });
    expect(done.status).toBe(200);
    expect((await done.json()).data).toMatchObject({ removed: true, reassigned: 1 });

    expect((await prisma.conversation.findUnique({ where: { id: "conv-open" } }))?.assignee).toBe(staying.name);
    // A closed conversation and the messages keep the name: history is untouched.
    expect((await prisma.conversation.findUnique({ where: { id: "conv-done" } }))?.assignee).toBe(leaving.name);
    expect((await prisma.message.findUnique({ where: { id: "m-1" } }))?.author).toBe(leaving.name);

    expect((await getEmployees(tenantId)).map((employee) => employee.id)).not.toContain(leaving.id);
    const account = await prisma.userAccount.findUnique({ where: { email: leaving.email } });
    expect(account?.disabled).toBe(1);
    expect(account?.sessionVersion).toBe(1);
    // The seat is free again.
    expect(await prisma.employee.count({ where: { tenantId, status: { not: "مُزال" } } })).toBe(2);
    // Removing twice, or editing a removed employee, is refused.
    expect((await remove(leaving.id, {})).status).toBe(404);
  });

  it("never removes the owner, yourself, a team lead, or lets anyone without the permission do it", async () => {
    const { prisma } = await import("../lib/prisma");
    const lead = await person("lead");
    await prisma.team.create({ data: { id: "team-1", tenantId, name: "الدعم", lead: lead.name, routing: "manual" } });
    const plain = await person("plain");
    currentUser = owner;
    expect((await remove("emp-owner", {})).status).toBe(403);
    const leadResult = await remove(lead.id, {});
    expect(leadResult.status).toBe(409);
    expect((await leadResult.json()).error).toContain("الدعم");
    // A plain employee has no access to manage employees.
    currentUser = { ...owner, id: "u-plain", name: plain.name, email: plain.email, role: "موظف دعم" };
    expect((await remove(lead.id, {})).status).toBe(403);
    currentUser = null;
    expect((await remove(lead.id, {})).status).toBe(401);
  });

  it("only leaves this workspace when the person is also a member of another one", async () => {
    const { prisma } = await import("../lib/prisma");
    const shared = await person("shared");
    const other = "tenant-other";
    await prisma.employee.create({ data: { id: "emp-shared-other", name: shared.name, email: shared.email, role: "مشرف", status: "متصل", permissions: "الكل", initial: "م", tenantId: other, userId: "u-shared" } });
    currentUser = owner;
    expect((await remove(shared.id, {})).status).toBe(200);
    const account = await prisma.userAccount.findUnique({ where: { email: shared.email } });
    expect(account?.disabled).toBe(0);
    expect(account?.tenantId).toBe(other);
    expect(account?.role).toBe("مشرف");
  });
});
