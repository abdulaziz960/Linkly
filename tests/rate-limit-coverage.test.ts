import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-rate-limit-coverage.db");
const tenantId = "tenant-rate-limit-coverage";

const owner = { id: "user-rate-limit-owner", name: "Owner", email: "owner@rate-limit-coverage.example", role: "مالك الحساب", tenantId };

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => owner)
}));

vi.mock("../lib/permissions-server", () => ({
  userHasViewPermission: vi.fn(async () => true)
}));

vi.mock("../lib/email", () => ({
  sendActivationEmail: vi.fn(async () => ({ sent: true, message: "sent" }))
}));

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();

  await prisma.employee.create({
    data: {
      id: "emp-rate-limit-target",
      name: "Target Employee",
      email: "target@rate-limit-coverage.example",
      role: "موظف دعم",
      status: "غير متصل",
      permissions: "محادثات فقط",
      initial: "T",
      tenantId,
      userId: "user-rate-limit-target"
    }
  });
  await prisma.userAccount.create({
    data: {
      id: "user-rate-limit-target",
      name: "Target Employee",
      email: "target@rate-limit-coverage.example",
      passwordHash: "",
      role: "موظف دعم",
      tenantId,
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

describe("resend-invite is rate-limited per target employee", () => {
  it("allows a few resends then rejects further attempts against the same employee", async () => {
    const { POST } = await import("../app/api/employees/[id]/resend-invite/route");
    const call = () => POST(new NextRequest("http://localhost/api/employees/emp-rate-limit-target/resend-invite", { method: "POST" }), {
      params: Promise.resolve({ id: "emp-rate-limit-target" })
    });

    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(429);
  });
});

describe("support ticket creation is rate-limited per account", () => {
  it("allows up to the limit then rejects further ticket creation", async () => {
    const { POST } = await import("../app/api/support/tickets/route");
    const call = () => POST(new NextRequest("http://localhost/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "مشكلة", description: "وصف المشكلة" })
    }));

    let lastStatus = 0;
    for (let i = 0; i < 10; i++) {
      lastStatus = (await call()).status;
    }
    expect(lastStatus).toBe(200);
    expect((await call()).status).toBe(429);
  });
});
