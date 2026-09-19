import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-login-workspace-choice.db");

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  const { hashPassword } = await import("../lib/passwords");
  await ensureSchema();

  const now = new Date().toISOString();

  async function seedTenant(tenantId: string, companyName: string) {
    await prisma.subscription.create({
      data: {
        id: `sub-${tenantId}`,
        tenantId,
        companyName,
        ownerName: companyName,
        ownerEmail: `${tenantId}@login-workspace-choice.example`,
        plan: "باقة البداية",
        status: "نشط",
        employeeLimit: 5,
        amount: 0,
        billingCycle: "شهري",
        renewalAt: "",
        createdAt: now,
        updatedAt: now
      }
    });
  }

  // Single-workspace account: one Employee row, one company.
  await seedTenant("tenant-solo", "Solo Co");
  await prisma.employee.create({
    data: { id: "emp-solo-owner", name: "Solo Owner", email: "solo-owner@login-workspace-choice.example", role: "مالك الحساب", status: "متصل", permissions: "الكل", initial: "S", tenantId: "tenant-solo", userId: "user-solo-owner" }
  });
  await prisma.userAccount.create({
    data: { id: "user-solo-owner", name: "Solo Owner", email: "solo-owner@login-workspace-choice.example", passwordHash: hashPassword("Solo-Owner-Password-1"), role: "مالك الحساب", tenantId: "tenant-solo", createdAt: now }
  });

  // Multi-workspace account: the same userId holds an Employee row in two tenants.
  await seedTenant("tenant-multi-x", "Multi Co X");
  await seedTenant("tenant-multi-y", "Multi Co Y");
  await prisma.employee.create({
    data: { id: "emp-multi-x", name: "Multi Owner", email: "multi-owner@login-workspace-choice.example", role: "مالك الحساب", status: "متصل", permissions: "الكل", initial: "M", tenantId: "tenant-multi-x", userId: "user-multi-owner" }
  });
  await prisma.employee.create({
    data: { id: "emp-multi-y", name: "Multi Owner", email: "multi-owner@login-workspace-choice.example", role: "موظف دعم", status: "متصل", permissions: "المحادثات", initial: "M", tenantId: "tenant-multi-y", userId: "user-multi-owner" }
  });
  await prisma.userAccount.create({
    data: { id: "user-multi-owner", name: "Multi Owner", email: "multi-owner@login-workspace-choice.example", passwordHash: hashPassword("Multi-Owner-Password-1"), role: "مالك الحساب", tenantId: "tenant-multi-x", createdAt: now }
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

describe("login redirect for multi-workspace accounts", () => {
  it("sends a member of more than one company to /choose-workspace instead of straight into a dashboard", async () => {
    const { POST } = await import("../app/api/auth/login/route");
    const response = await POST(new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "multi-owner@login-workspace-choice.example", password: "Multi-Owner-Password-1" })
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as { redirectTo?: string };
    expect(payload.redirectTo).toBe("/choose-workspace");
  });

  it("sends a single-workspace member straight to their dashboard as before", async () => {
    const { POST } = await import("../app/api/auth/login/route");
    const response = await POST(new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "solo-owner@login-workspace-choice.example", password: "Solo-Owner-Password-1" })
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as { redirectTo?: string };
    // Exact path depends on unrelated onboarding logic - what matters here
    // is that a single-workspace login never gets sent through the picker.
    expect(payload.redirectTo).not.toBe("/choose-workspace");
    expect(payload.redirectTo).toMatch(/^\/dashboard/);
  });
});
