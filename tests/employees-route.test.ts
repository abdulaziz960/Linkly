import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-employees-route.db");

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "user-owner-email-conflict",
    name: "Tenant Owner",
    email: "owner@email-conflict.example",
    role: "مالك الحساب",
    tenantId: "tenant-email-conflict"
  }))
}));

vi.mock("../lib/permissions-server", () => ({
  userHasViewPermission: vi.fn(async () => true)
}));

vi.mock("../lib/email", () => ({
  sendActivationEmail: vi.fn(async () => ({ sent: true }))
}));

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  await prisma.userAccount.create({
    data: {
      id: "user-existing-email-conflict",
      name: "Existing Account",
      email: "existing@email-conflict.example",
      passwordHash: "x",
      role: "موظف دعم",
      tenantId: "tenant-email-conflict",
      createdAt: new Date().toISOString()
    }
  });
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("employee email conflicts", () => {
  it("rejects a UserAccount that already exists inside the same tenant", async () => {
    const { POST } = await import("../app/api/employees/route");
    const response = await POST(new NextRequest("http://localhost/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Should Not Replace Existing Account",
        email: "existing@email-conflict.example",
        role: "موظف دعم",
        permissions: "محادثات فقط"
      })
    }));

    expect(response.status).toBe(409);
    const { prisma } = await import("../lib/prisma");
    expect(await prisma.employee.findFirst({ where: { email: "existing@email-conflict.example" } })).toBeNull();
    const account = await prisma.userAccount.findUnique({ where: { email: "existing@email-conflict.example" } });
    expect(account?.name).toBe("Existing Account");
  });
});

describe("employee disable across a switched workspace", () => {
  it("still locks the account out even if UserAccount.tenantId currently points at a different workspace", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.employee.create({
      data: {
        id: "emp-multi-workspace-disable",
        name: "Multi Workspace Employee",
        role: "موظف دعم",
        status: "متصل",
        permissions: "محادثات فقط",
        email: "multiws@email-conflict.example",
        initial: "م",
        tenantId: "tenant-email-conflict",
        userId: "user-multi-workspace-disable"
      }
    });
    await prisma.userAccount.create({
      data: {
        id: "user-multi-workspace-disable",
        name: "Multi Workspace Employee",
        email: "multiws@email-conflict.example",
        passwordHash: "x",
        role: "موظف دعم",
        // Simulates the account currently being switched into a workspace
        // OTHER than the one disabling it, per switch-workspace's mutable
        // tenantId pointer.
        tenantId: "tenant-other-workspace",
        createdAt: new Date().toISOString()
      }
    });

    const { PATCH } = await import("../app/api/employees/[id]/route");
    const response = await PATCH(
      new NextRequest("http://localhost/api/employees/emp-multi-workspace-disable", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Multi Workspace Employee",
          email: "multiws@email-conflict.example",
          role: "موظف دعم",
          permissions: "محادثات فقط",
          disabled: true
        })
      }),
      { params: Promise.resolve({ id: "emp-multi-workspace-disable" }) }
    );

    expect(response.status).toBe(200);
    const account = await prisma.userAccount.findUnique({ where: { email: "multiws@email-conflict.example" } });
    expect(account?.disabled).toBe(1);
    expect(account?.sessionVersion).toBeGreaterThan(0);
  });
});
