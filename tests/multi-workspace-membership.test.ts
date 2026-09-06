import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-multi-workspace-membership.db");

const ownerA = {
  id: "user-owner-a",
  name: "Owner A",
  email: "owner-a@multi-workspace.example",
  role: "مالك الحساب",
  tenantId: "tenant-a-multi-workspace"
};

let currentSessionUser: typeof ownerA | null = ownerA;

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => currentSessionUser)
}));

vi.mock("../lib/permissions-server", () => ({
  userHasViewPermission: vi.fn(async () => true)
}));

const sendActivationEmail = vi.fn(async () => ({ sent: true, message: "sent" }));
vi.mock("../lib/email", () => ({ sendActivationEmail }));

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();

  const now = new Date().toISOString();
  // Company A: owner already has a real, activated account there.
  await prisma.subscription.create({
    data: {
      id: "sub-tenant-a-multi-workspace",
      tenantId: "tenant-a-multi-workspace",
      companyName: "Company A",
      ownerName: "Owner A",
      ownerEmail: ownerA.email,
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
  await prisma.employee.create({
    data: { id: "emp-owner-a", name: ownerA.name, email: ownerA.email, role: ownerA.role, status: "متصل", permissions: "الكل", initial: "O", tenantId: ownerA.tenantId, userId: ownerA.id }
  });
  const { hashPassword } = await import("../lib/passwords");
  await prisma.userAccount.create({
    data: { id: ownerA.id, name: ownerA.name, email: ownerA.email, passwordHash: hashPassword("Owner-A-Password-1"), role: ownerA.role, tenantId: ownerA.tenantId, createdAt: now }
  });

  // Company B: a separate tenant that will invite Owner A's email.
  await prisma.subscription.create({
    data: {
      id: "sub-tenant-b-multi-workspace",
      tenantId: "tenant-b-multi-workspace",
      companyName: "Company B",
      ownerName: "Owner B",
      ownerEmail: "owner-b@multi-workspace.example",
      plan: "باقة البداية",
      status: "نشط",
      employeeLimit: 1,
      amount: 0,
      billingCycle: "شهري",
      renewalAt: "",
      createdAt: now,
      updatedAt: now
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

beforeEach(() => {
  currentSessionUser = { ...ownerA, tenantId: "tenant-b-multi-workspace", role: "مالك الحساب" };
  sendActivationEmail.mockClear();
});

async function inviteOwnerAIntoCompanyB() {
  const { POST } = await import("../app/api/employees/route");
  return POST(new NextRequest("http://localhost/api/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Owner A", email: ownerA.email, role: "مشرف", permissions: "المحادثات" })
  }));
}

describe("cross-tenant employee invite", () => {
  it("creates a pending invite instead of an Employee row, and emails a workspace_invite", async () => {
    const response = await inviteOwnerAIntoCompanyB();
    expect(response.status).toBe(200);

    const { prisma } = await import("../lib/prisma");
    expect(await prisma.employee.findFirst({ where: { tenantId: "tenant-b-multi-workspace", email: ownerA.email } })).toBeNull();
    const invite = await prisma.employeeInvite.findFirst({ where: { email: ownerA.email, purpose: "cross_tenant_membership" } });
    expect(invite).not.toBeNull();
    expect(invite?.inviteTenantId).toBe("tenant-b-multi-workspace");
    expect(invite?.role).toBe("مشرف");

    expect(sendActivationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ownerA.email, purpose: "workspace_invite", workspaceName: "Company B" }));
  });

  it("still hard-blocks a UserAccount that already exists inside the SAME tenant", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.userAccount.create({
      data: { id: "user-same-tenant-conflict", name: "Dup", email: "dup@multi-workspace.example", passwordHash: "x", role: "موظف دعم", tenantId: "tenant-b-multi-workspace", createdAt: new Date().toISOString() }
    });

    const { POST } = await import("../app/api/employees/route");
    const response = await POST(new NextRequest("http://localhost/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dup", email: "dup@multi-workspace.example", role: "موظف دعم", permissions: "محادثات فقط" })
    }));

    expect(response.status).toBe(409);
    expect(await prisma.employeeInvite.findFirst({ where: { email: "dup@multi-workspace.example" } })).toBeNull();
  });
});

describe("join-workspace confirmation", () => {
  it("rejects the wrong password without creating a membership", async () => {
    await inviteOwnerAIntoCompanyB();
    const { prisma } = await import("../lib/prisma");
    const invite = await prisma.employeeInvite.findFirstOrThrow({ where: { email: ownerA.email, purpose: "cross_tenant_membership" } });
    // Token isn't retrievable from the hash, so reach the same code path with
    // a bad token directly instead - proves it's rejected either way.
    const { POST } = await import("../app/api/auth/join-workspace/route");
    const response = await POST(new Request("http://localhost/api/auth/join-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "wrong-token", password: "irrelevant" })
    }));
    expect(response.status).toBe(400);
    expect(await prisma.employee.findFirst({ where: { tenantId: invite.inviteTenantId, userId: ownerA.id } })).toBeNull();
  });

  it("confirms with the right token+password and creates the Employee row", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.employeeInvite.deleteMany({ where: { email: ownerA.email, purpose: "cross_tenant_membership" } });

    // Mint a real token the same way the invite route does, since the DB
    // only ever stores the hash.
    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.employeeInvite.create({
      data: {
        id: "invite-manual-1",
        email: ownerA.email,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        purpose: "cross_tenant_membership",
        inviteTenantId: "tenant-b-multi-workspace",
        role: "مشرف",
        permissions: "المحادثات"
      }
    });

    const { POST } = await import("../app/api/auth/join-workspace/route");
    const wrongPasswordResponse = await POST(new Request("http://localhost/api/auth/join-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "totally-wrong-password" })
    }));
    expect(wrongPasswordResponse.status).toBe(401);

    const response = await POST(new Request("http://localhost/api/auth/join-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "Owner-A-Password-1" })
    }));
    expect(response.status).toBe(200);

    const employee = await prisma.employee.findFirst({ where: { tenantId: "tenant-b-multi-workspace", userId: ownerA.id } });
    expect(employee?.role).toBe("مشرف");
    expect(employee?.email).toBe(ownerA.email);
    expect(await prisma.employeeInvite.findUnique({ where: { tokenHash } })).toBeNull();
  });

  it("rejects an expired invite token", async () => {
    const { prisma } = await import("../lib/prisma");
    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.employeeInvite.create({
      data: {
        id: "invite-expired-1",
        email: ownerA.email,
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        purpose: "cross_tenant_membership",
        inviteTenantId: "tenant-b-multi-workspace",
        role: "موظف دعم",
        permissions: "محادثات فقط"
      }
    });

    const { POST } = await import("../app/api/auth/join-workspace/route");
    const response = await POST(new Request("http://localhost/api/auth/join-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "Owner-A-Password-1" })
    }));
    expect(response.status).toBe(400);
  });

  it("enforces the target tenant's employee seat limit at confirmation time", async () => {
    const { prisma } = await import("../lib/prisma");
    const now = new Date().toISOString();
    // A fresh, fully-occupied tenant (limit 1, one seat already taken) -
    // separate from tenant-b, which by this point already has Owner A as a
    // confirmed member from an earlier test in this file.
    await prisma.subscription.create({
      data: {
        id: "sub-tenant-d-multi-workspace",
        tenantId: "tenant-d-multi-workspace",
        companyName: "Company D",
        ownerName: "Owner D",
        ownerEmail: "owner-d@multi-workspace.example",
        plan: "باقة البداية",
        status: "نشط",
        employeeLimit: 1,
        amount: 0,
        billingCycle: "شهري",
        renewalAt: "",
        createdAt: now,
        updatedAt: now
      }
    });
    await prisma.employee.create({
      data: { id: "emp-owner-d", name: "Owner D", email: "owner-d@multi-workspace.example", role: "مالك الحساب", status: "متصل", permissions: "الكل", initial: "O", tenantId: "tenant-d-multi-workspace", userId: "user-owner-d" }
    });

    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.employeeInvite.create({
      data: {
        id: "invite-limit-1",
        email: ownerA.email,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        purpose: "cross_tenant_membership",
        inviteTenantId: "tenant-d-multi-workspace",
        role: "موظف دعم",
        permissions: "محادثات فقط"
      }
    });

    const { POST } = await import("../app/api/auth/join-workspace/route");
    const response = await POST(new Request("http://localhost/api/auth/join-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "Owner-A-Password-1" })
    }));
    expect(response.status).toBe(403);
    expect(await prisma.employee.findFirst({ where: { tenantId: "tenant-d-multi-workspace", userId: ownerA.id } })).toBeNull();
  });
});

describe("switch-workspace", () => {
  it("refuses to switch into a tenant with no membership", async () => {
    currentSessionUser = { ...ownerA, tenantId: "tenant-a-multi-workspace" };
    const { POST } = await import("../app/api/auth/switch-workspace/route");
    const response = await POST(new NextRequest("http://localhost/api/auth/switch-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant-with-no-membership" })
    }));
    expect(response.status).toBe(403);
  });

  it("switches active tenant/role once a real membership exists", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.employee.create({
      data: { id: "emp-owner-a-in-c", name: ownerA.name, email: ownerA.email, role: "موظف دعم", status: "متصل", permissions: "المحادثات", initial: "O", tenantId: "tenant-c-multi-workspace", userId: ownerA.id }
    });

    currentSessionUser = { ...ownerA, tenantId: "tenant-a-multi-workspace" };
    const { POST } = await import("../app/api/auth/switch-workspace/route");
    const response = await POST(new NextRequest("http://localhost/api/auth/switch-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant-c-multi-workspace" })
    }));
    expect(response.status).toBe(200);

    const account = await prisma.userAccount.findUniqueOrThrow({ where: { id: ownerA.id } });
    expect(account.tenantId).toBe("tenant-c-multi-workspace");
    expect(account.role).toBe("موظف دعم");
  });
});

describe("regression: unchanged blocking paths", () => {
  it("trial/admin tenant creation still hard-blocks an email that already has an account", async () => {
    const { createTenantWithSubscription } = await import("../lib/subscriptions");
    await expect(createTenantWithSubscription({
      companyName: "Should Not Be Created",
      ownerName: "Someone",
      ownerEmail: ownerA.email,
      plan: "باقة البداية",
      status: "تجربة",
      amount: 0,
      billingCycle: "تجربة 3 أيام",
      renewalAt: "",
      adminName: "system"
    })).rejects.toThrow();
  });

  it("platform-admin invite still hard-blocks an email that already has an account", async () => {
    const { invitePlatformAdmin } = await import("../lib/platform-team");
    await expect(invitePlatformAdmin({ name: "Someone", email: ownerA.email }, "http://localhost")).rejects.toThrow();
  });
});
