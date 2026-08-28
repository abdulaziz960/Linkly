import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-tenant-isolation-routes.db");
vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "user-tenant-a",
    name: "Tenant A Owner",
    email: "owner@tenant-a.example",
    role: "مالك الحساب",
    tenantId: "tenant-a"
  }))
}));

vi.mock("../lib/permissions-server", () => ({
  userHasViewPermission: vi.fn(async () => true)
}));

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");

  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();

  await prisma.customer.create({ data: { id: "cust-a", name: "Tenant A Customer", phone: "0500000001", initial: "A", tenantId: "tenant-a" } });
  await prisma.customer.create({ data: { id: "cust-b", name: "Tenant B Customer", phone: "0500000002", initial: "B", tenantId: "tenant-b" } });
  await prisma.team.create({ data: { id: "team-a", tenantId: "tenant-a", name: "Support", lead: "", routing: "يدوي" } });
  await prisma.employee.create({
    data: { id: "emp-a", name: "A Employee", role: "موظف دعم", status: "متصل", permissions: "محادثات", email: "emp-a@example.test", initial: "A", tenantId: "tenant-a" }
  });
  await prisma.employee.create({
    data: { id: "emp-b", name: "B Employee", role: "موظف دعم", status: "متصل", permissions: "محادثات", email: "emp-b@example.test", initial: "B", tenantId: "tenant-b" }
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

describe("tenant-scoped route writes", () => {
  it("does not let tenant A update tenant B customers", async () => {
    const { PATCH } = await import("../app/api/customers/[id]/route");
    const response = await PATCH(new NextRequest("http://localhost/api/customers/cust-b", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hacked", phone: "0599999999" })
    }), { params: Promise.resolve({ id: "cust-b" }) });

    expect(response.status).toBe(404);
    const { prisma } = await import("../lib/prisma");
    const customer = await prisma.customer.findUnique({ where: { id: "cust-b" } });
    expect(customer?.name).toBe("Tenant B Customer");
    expect(customer?.tenantId).toBe("tenant-b");
  });

  it("does not let tenant A delete tenant B customers", async () => {
    const { DELETE } = await import("../app/api/customers/[id]/route");
    const response = await DELETE(new NextRequest("http://localhost/api/customers/cust-b", { method: "DELETE" }), {
      params: Promise.resolve({ id: "cust-b" })
    });

    expect(response.status).toBe(404);
    const { prisma } = await import("../lib/prisma");
    expect(await prisma.customer.findUnique({ where: { id: "cust-b" } })).not.toBeNull();
  });

  it("does not attach another tenant's employee to tenant A teams", async () => {
    const { PATCH } = await import("../app/api/teams/[id]/route");
    const response = await PATCH(new NextRequest("http://localhost/api/teams/team-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Support", routing: "يدوي", memberIds: ["emp-a", "emp-b"] })
    }), { params: Promise.resolve({ id: "team-a" }) });

    expect(response.status).toBe(200);
    const { prisma } = await import("../lib/prisma");
    const members = await prisma.teamMember.findMany({ where: { teamId: "team-a" }, orderBy: { employeeId: "asc" } });
    expect(members.map((member) => member.employeeId)).toEqual(["emp-a"]);
  });
});
