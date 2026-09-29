import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-supervisor-team-visibility.db");
const tenantId = "tenant-supervisor-team";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("getVisibleAssigneeNames", () => {
  it("gives the account owner full visibility (undefined = no scoping)", async () => {
    const { getVisibleAssigneeNames } = await import("../lib/permissions-server");
    const result = await getVisibleAssigneeNames({ email: "owner@test.sa", tenantId, role: "مالك الحساب" });
    expect(result).toBeUndefined();
  });

  it("scopes a regular employee to only their own name", async () => {
    const { getVisibleAssigneeNames } = await import("../lib/permissions-server");
    const result = await getVisibleAssigneeNames({ email: "agent@test.sa", tenantId, role: "موظف دعم" }, { name: "موظف واحد" });
    expect(result).toEqual(["موظف واحد"]);
  });

  it("scopes a supervisor to their own name plus every member of a team they lead", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { getVisibleAssigneeNames } = await import("../lib/permissions-server");
    await ensureSchema();

    await prisma.employee.create({ data: { id: "emp-lead", name: "المشرف سالم", role: "مشرف", status: "متصل", permissions: "", email: "lead@test.sa", initial: "س", tenantId } });
    await prisma.employee.create({ data: { id: "emp-a", name: "موظف أ", role: "موظف دعم", status: "متصل", permissions: "", email: "a@test.sa", initial: "أ", tenantId } });
    await prisma.employee.create({ data: { id: "emp-b", name: "موظف ب", role: "موظف دعم", status: "متصل", permissions: "", email: "b@test.sa", initial: "ب", tenantId } });
    await prisma.team.create({ data: { id: "team-1", tenantId, name: "فريق الدعم", lead: "المشرف سالم", routing: "تلقائي بالتساوي" } });
    await prisma.teamMember.create({ data: { teamId: "team-1", employeeId: "emp-a" } });
    await prisma.teamMember.create({ data: { teamId: "team-1", employeeId: "emp-b" } });

    const result = await getVisibleAssigneeNames({ email: "lead@test.sa", tenantId, role: "مشرف" }, { name: "المشرف سالم" });
    expect(result).toEqual(expect.arrayContaining(["المشرف سالم", "موظف أ", "موظف ب"]));
    expect(result).toHaveLength(3);
  });

  it("does not leak members of a team led by someone else", async () => {
    const { prisma } = await import("../lib/prisma");
    const { getVisibleAssigneeNames } = await import("../lib/permissions-server");

    await prisma.employee.create({ data: { id: "emp-other-lead", name: "مشرف آخر", role: "مشرف", status: "متصل", permissions: "", email: "other-lead@test.sa", initial: "م", tenantId } });

    const result = await getVisibleAssigneeNames({ email: "other-lead@test.sa", tenantId, role: "مشرف" }, { name: "مشرف آخر" });
    expect(result).toEqual(["مشرف آخر"]);
  });
});
