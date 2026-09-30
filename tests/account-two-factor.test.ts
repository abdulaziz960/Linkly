import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const session = vi.hoisted(() => ({ current: null as { id: string; email: string; tenantId: string; role: string } | null }));
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => session.current) }));

const testDbPath = join(process.cwd(), "tests", ".tmp-account-two-factor.db");

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();

  const { prisma } = await import("../lib/prisma");
  const { hashPassword } = await import("../lib/passwords");
  await prisma.userAccount.create({
    data: {
      id: "user-two-factor-toggle",
      name: "Toggle User",
      email: "toggle-user@account-two-factor.example",
      passwordHash: hashPassword("Correct-Password-1"),
      role: "مالك الحساب",
      tenantId: "tenant-two-factor-toggle",
      createdAt: new Date().toISOString()
    }
  });
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

function patchRequest(enabled: boolean) {
  return new NextRequest("http://localhost/api/account/two-factor", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled })
  });
}

describe("PATCH /api/account/two-factor", () => {
  it("rejects an unauthenticated request", async () => {
    session.current = null;
    const { PATCH } = await import("../app/api/account/two-factor/route");
    const response = await PATCH(patchRequest(true));
    expect(response.status).toBe(401);
  });

  it("persists the toggle for the authenticated user", async () => {
    session.current = { id: "user-two-factor-toggle", email: "toggle-user@account-two-factor.example", tenantId: "tenant-two-factor-toggle", role: "مالك الحساب" };
    const { PATCH, GET } = await import("../app/api/account/two-factor/route");

    const enableResponse = await PATCH(patchRequest(true));
    expect(enableResponse.status).toBe(200);
    expect((await GET()).status).toBe(200);
    const enabledBody = await (await GET()).json() as { enabled: boolean };
    expect(enabledBody.enabled).toBe(true);

    const { prisma } = await import("../lib/prisma");
    expect((await prisma.userAccount.findUniqueOrThrow({ where: { id: "user-two-factor-toggle" } })).twoFactorEnabled).toBe(1);

    const disableResponse = await PATCH(patchRequest(false));
    expect(disableResponse.status).toBe(200);
    expect((await prisma.userAccount.findUniqueOrThrow({ where: { id: "user-two-factor-toggle" } })).twoFactorEnabled).toBe(0);
  });
});
