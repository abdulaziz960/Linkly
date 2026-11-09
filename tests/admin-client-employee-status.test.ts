import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-admin-employee-status.db");
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

const call = (body: unknown) => new NextRequest("http://localhost/api/admin/clients/t-emp/employees/e1/status", { method: "PATCH", headers: { "Content-Type": "application/json", origin: "http://localhost" }, body: JSON.stringify(body) });
const ctx = (employeeId = "e1", id = "t-emp") => ({ params: Promise.resolve({ id, employeeId }) });

describe("enabling and disabling a client's employee from the admin panel", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset().mockResolvedValue({ id: "a1", name: "فريق الدعم" });
  });

  async function seed() {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    const now = new Date().toISOString();
    await prisma.subscription.create({ data: { id: "sub-emp", tenantId: "t-emp", companyName: "شركة", ownerName: "م", ownerEmail: "owner@emp.test", plan: "test", status: "نشط", employeeLimit: 5, amount: 0, billingCycle: "شهري", renewalAt: "", createdAt: now, updatedAt: now } });
    await prisma.employee.create({ data: { id: "e1", tenantId: "t-emp", name: "موظف", initial: "م", email: "staff@emp.test", role: "موظف دعم", permissions: "", status: "متصل" } });
    await prisma.userAccount.create({ data: { id: "u1", name: "موظف", email: "staff@emp.test", passwordHash: "x", role: "موظف دعم", tenantId: "t-emp", createdAt: now, disabled: 1, failedLoginAttempts: 4, lockedAt: now } });
  }

  it("re-enables a disabled employee and clears the failed-login lock; disabling kills open sessions", async () => {
    const { prisma } = await import("../lib/prisma");
    const { PATCH } = await import("../app/api/admin/clients/[id]/employees/[employeeId]/status/route");
    await seed();

    const enabled = await PATCH(call({ disabled: false }), ctx());
    expect(enabled.status).toBe(200);
    let account = await prisma.userAccount.findUniqueOrThrow({ where: { email: "staff@emp.test" } });
    expect(account.disabled).toBe(0);
    expect(account.failedLoginAttempts).toBe(0);
    expect(account.lockedAt).toBe("");

    const before = account.sessionVersion;
    expect((await PATCH(call({ disabled: true }), ctx())).status).toBe(200);
    account = await prisma.userAccount.findUniqueOrThrow({ where: { email: "staff@emp.test" } });
    expect(account.disabled).toBe(1);
    expect(account.sessionVersion).toBe(before + 1);
  });

  it("is admin-only, rejects a bad body, and refuses an unknown client or employee", async () => {
    const { PATCH } = await import("../app/api/admin/clients/[id]/employees/[employeeId]/status/route");
    requirePlatformAdmin.mockResolvedValue(null);
    expect((await PATCH(call({ disabled: false }), ctx())).status).toBe(403);
    expect(requirePlatformAdmin).toHaveBeenCalledWith("clients");
    requirePlatformAdmin.mockResolvedValue({ id: "a1", name: "x" });
    expect((await PATCH(call({ disabled: "no" }), ctx())).status).toBe(400);
    expect((await PATCH(call({ disabled: false }), ctx("e1", "missing"))).status).toBe(404);
    expect((await PATCH(call({ disabled: false }), ctx("nope"))).status).toBe(404);
  });
});

describe("removing a client's employee from the admin panel", () => {
  const del = (body: unknown, employeeId: string) => new NextRequest(`http://localhost/api/admin/clients/t-emp/employees/${employeeId}`, { method: "DELETE", headers: { "Content-Type": "application/json", origin: "http://localhost" }, body: JSON.stringify(body) });

  beforeEach(() => {
    requirePlatformAdmin.mockReset().mockResolvedValue({ id: "a1", name: "فريق الدعم" });
  });

  it("needs a target for open conversations, moves them, frees the seat and locks the login", async () => {
    const { prisma } = await import("../lib/prisma");
    const { DELETE } = await import("../app/api/admin/clients/[id]/employees/[employeeId]/route");
    const now = new Date().toISOString();
    await prisma.employee.create({ data: { id: "e2", tenantId: "t-emp", name: "زميل", initial: "ز", email: "mate@emp.test", role: "موظف دعم", permissions: "", status: "متصل" } });
    await prisma.employee.create({ data: { id: "e3", tenantId: "t-emp", name: "المغادر", initial: "م", email: "leaver@emp.test", role: "موظف دعم", permissions: "", status: "متصل" } });
    await prisma.userAccount.create({ data: { id: "u3", name: "المغادر", email: "leaver@emp.test", passwordHash: "x", role: "موظف دعم", tenantId: "t-emp", createdAt: now } });
    await prisma.userAccount.create({ data: { id: "u2", name: "زميل", email: "mate@emp.test", passwordHash: "x", role: "موظف دعم", tenantId: "t-emp", createdAt: now } });
    await prisma.customer.create({ data: { id: "c-emp", tenantId: "t-emp", name: "عميل", phone: "0500000000", initial: "ع" } });
    await prisma.conversation.create({ data: { id: "conv-emp", tenantId: "t-emp", customerId: "c-emp", channel: "whatsapp", lastMessage: "x", status: "assigned", assignee: "المغادر", unread: 0, windowExpired: 0, lastActivityAt: now } });

    const blocked = await DELETE(del({}, "e3"), { params: Promise.resolve({ id: "t-emp", employeeId: "e3" }) });
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).openConversations).toBe(1);

    const ok = await DELETE(del({ reassignTo: "e2" }, "e3"), { params: Promise.resolve({ id: "t-emp", employeeId: "e3" }) });
    expect(ok.status).toBe(200);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: "e3" } })).status).toBe("مُزال");
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: "conv-emp" } })).assignee).toBe("زميل");
    expect((await prisma.userAccount.findUniqueOrThrow({ where: { email: "leaver@emp.test" } })).disabled).toBe(1);
  });

  it("never removes the owner, and is admin-only", async () => {
    const { prisma } = await import("../lib/prisma");
    const { DELETE } = await import("../app/api/admin/clients/[id]/employees/[employeeId]/route");
    await prisma.employee.create({ data: { id: "e-owner", tenantId: "t-emp", name: "المالك", initial: "م", email: "owner@emp.test", role: "مالك الحساب", permissions: "الكل", status: "متصل" } });
    expect((await DELETE(del({}, "e-owner"), { params: Promise.resolve({ id: "t-emp", employeeId: "e-owner" }) })).status).toBe(403);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: "e-owner" } })).status).toBe("متصل");
    requirePlatformAdmin.mockResolvedValue(null);
    expect((await DELETE(del({}, "e2"), { params: Promise.resolve({ id: "t-emp", employeeId: "e2" }) })).status).toBe(403);
  });
});

describe("deleting a removed employee for good from the admin panel", () => {
  const del = (employeeId: string) => new NextRequest(`http://localhost/api/admin/clients/t-emp/employees/${employeeId}/permanent`, { method: "DELETE", headers: { origin: "http://localhost" } });
  const ctx = (employeeId: string, id = "t-emp") => ({ params: Promise.resolve({ id, employeeId }) });

  beforeEach(() => {
    requirePlatformAdmin.mockReset().mockResolvedValue({ id: "a1", name: "فريق الدعم" });
  });

  it("only deletes someone already removed, then frees the email by deleting the login too", async () => {
    const { prisma } = await import("../lib/prisma");
    const { DELETE } = await import("../app/api/admin/clients/[id]/employees/[employeeId]/permanent/route");
    // e3 was removed in the previous block (status مُزال); e2 is still active.
    expect((await DELETE(del("e2"), ctx("e2"))).status).toBe(409);
    expect(await prisma.employee.findUnique({ where: { id: "e2" } })).not.toBeNull();

    const ok = await DELETE(del("e3"), ctx("e3"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toMatchObject({ deleted: true, accountDeleted: true });
    expect(await prisma.employee.findUnique({ where: { id: "e3" } })).toBeNull();
    expect(await prisma.userAccount.findUnique({ where: { email: "leaver@emp.test" } })).toBeNull();
    // Their old conversation keeps working: it only stores the assignee's name.
    expect(await prisma.conversation.findUnique({ where: { id: "conv-emp" } })).not.toBeNull();
  });

  it("keeps the login when the person still belongs to another workspace, refuses the owner, and is admin-only", async () => {
    const { prisma } = await import("../lib/prisma");
    const { DELETE } = await import("../app/api/admin/clients/[id]/employees/[employeeId]/permanent/route");
    const now = new Date().toISOString();
    await prisma.userAccount.create({ data: { id: "u-multi", name: "متعدد", email: "multi@emp.test", passwordHash: "x", role: "موظف دعم", tenantId: "t-other", createdAt: now } });
    await prisma.employee.create({ data: { id: "e-multi", tenantId: "t-emp", name: "متعدد", initial: "م", email: "multi@emp.test", role: "موظف دعم", permissions: "", status: "مُزال", userId: "u-multi" } });
    await prisma.employee.create({ data: { id: "e-multi-other", tenantId: "t-other", name: "متعدد", initial: "م", email: "multi@emp.test", role: "موظف دعم", permissions: "", status: "متصل", userId: "u-multi" } });
    const kept = await DELETE(del("e-multi"), ctx("e-multi"));
    expect((await kept.json()).data.accountDeleted).toBe(false);
    expect(await prisma.userAccount.findUnique({ where: { email: "multi@emp.test" } })).not.toBeNull();
    expect(await prisma.employee.findUnique({ where: { id: "e-multi-other" } })).not.toBeNull();

    expect((await DELETE(del("e-owner"), ctx("e-owner"))).status).toBe(403);
    requirePlatformAdmin.mockResolvedValue(null);
    expect((await DELETE(del("e2"), ctx("e2"))).status).toBe(403);
  });
});
