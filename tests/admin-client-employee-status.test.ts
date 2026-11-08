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
