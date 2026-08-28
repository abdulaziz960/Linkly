import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { computeAllowedViews, isOwnerEquivalentGrant } from "../lib/permissions";

const testDbPath = join(process.cwd(), "tests", ".tmp-business-logic.db");

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

describe("employee privilege escalation prevention", () => {
  it("never treats a non-owner role/permission combination as owner-equivalent, even when every keyword is present", () => {
    expect(isOwnerEquivalentGrant("موظف دعم", "محادثات")).toBe(false);
    // A permissions string that happens to enumerate every individual
    // keyword must still be caught, since computeAllowedViews would
    // otherwise resolve it to every view without the literal "الكل" flag.
    const everyKeyword = "محادثات عملاء وسوم قوالب ردود رد آلي أتمتة حملات ساعات تقارير فرق موظفين صلاحيات ربط";
    expect(isOwnerEquivalentGrant("موظف دعم", everyKeyword)).toBe(true);
  });

  it("always grants owner-equivalent access to the owner role regardless of permissions text", () => {
    expect(isOwnerEquivalentGrant("مالك الحساب", "")).toBe(true);
    expect(computeAllowedViews("مالك الحساب", "")).toHaveLength(computeAllowedViews("مالك الحساب", "الكل").length);
  });

  it("resolves a plain permissions subset to only the matching views, not everything", () => {
    const views = computeAllowedViews("موظف دعم", "محادثات");
    expect(views).toEqual(["inbox"]);
  });
});

describe("subscription payment gating (no benefits before payment)", () => {
  it("creates no subscription until a staged payment is confirmed", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    await ensureSchema();

    const tenantId = "tenant-test-billing-no-subscription";
    const now = new Date().toISOString();
    await prisma.userAccount.create({
      data: {
        id: `user-${tenantId}`,
        name: "New Tenant Owner",
        email: "new-owner@billing-test.example",
        passwordHash: "x",
        role: "مالك الحساب",
        tenantId,
        createdAt: now
      }
    });
    await prisma.subscriptionPayment.create({
      data: {
        id: `pay-${tenantId}`,
        tenantId,
        amount: 499,
        status: "قيد الانتظار",
        moyasarId: "invoice_not_paid_yet",
        paymentUrl: "https://example.test/pay",
        createdAt: now,
        planName: "باقة النمو",
        planEmployeeLimit: 3
      }
    });

    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toBeNull();

    const result = await applyConfirmedSubscriptionPayment(`pay-${tenantId}`);
    expect(result.activated).toBe(true);
    const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(subscription).toMatchObject({
      companyName: "New Tenant Owner",
      ownerEmail: "new-owner@billing-test.example",
      plan: "باقة النمو",
      employeeLimit: 3,
      status: "نشط",
      amount: 499,
      billingCycle: "شهري"
    });
  });

  it("does not apply the staged plan until the payment is confirmed, then applies it exactly once", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    await ensureSchema();

    const tenantId = "tenant-test-billing-1";
    await prisma.subscription.create({
      data: {
        id: `sub-${tenantId}`,
        tenantId,
        companyName: "Test Co",
        ownerName: "Owner",
        ownerEmail: "owner@billing-test.example",
        plan: "باقة البداية",
        status: "نشط",
        employeeLimit: 1,
        amount: 199,
        billingCycle: "شهري",
        renewalAt: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
    await prisma.subscriptionPayment.create({
      data: {
        id: `pay-${tenantId}`,
        tenantId,
        amount: 199,
        status: "قيد الانتظار",
        moyasarId: "test_invoice",
        paymentUrl: "",
        createdAt: new Date().toISOString(),
        planName: "باقة النمو",
        planEmployeeLimit: 3
      }
    });

    const before = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(before?.plan).toBe("باقة البداية");
    expect(before?.employeeLimit).toBe(1);
    expect(before?.status).toBe("نشط");

    const first = await applyConfirmedSubscriptionPayment(`pay-${tenantId}`);
    expect(first.activated).toBe(true);

    const after = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(after?.plan).toBe("باقة النمو");
    expect(after?.employeeLimit).toBe(3);
    expect(after?.status).toBe("نشط");

    // Redelivering the same webhook/confirmation must be a no-op.
    const second = await applyConfirmedSubscriptionPayment(`pay-${tenantId}`);
    expect(second.activated).toBe(false);
    const payment = await prisma.subscriptionPayment.findUnique({ where: { id: `pay-${tenantId}` } });
    expect(payment?.status).toBe("مكتمل");
  });

  it("leaves the current plan untouched for a plain renewal payment (no staged plan)", async () => {
    const { prisma } = await import("../lib/prisma");
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");

    const tenantId = "tenant-test-billing-2";
    await prisma.subscription.create({
      data: {
        id: `sub-${tenantId}`,
        tenantId,
        companyName: "Test Co 2",
        ownerName: "Owner",
        ownerEmail: "owner2@billing-test.example",
        plan: "باقة النمو",
        status: "نشط",
        employeeLimit: 3,
        amount: 299,
        billingCycle: "شهري",
        renewalAt: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
    await prisma.subscriptionPayment.create({
      data: {
        id: `pay-${tenantId}`,
        tenantId,
        amount: 299,
        status: "قيد الانتظار",
        moyasarId: "test_renewal",
        paymentUrl: "",
        createdAt: new Date().toISOString()
        // planName intentionally left empty - a plain renewal.
      }
    });

    await applyConfirmedSubscriptionPayment(`pay-${tenantId}`);
    const after = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(after?.plan).toBe("باقة النمو");
    expect(after?.employeeLimit).toBe(3);
    expect(after?.status).toBe("نشط");
  });
});

describe("deleteTenant isolation and completeness", () => {
  it("removes every kind of tenant data and never touches another tenant's rows", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { deleteTenant } = await import("../lib/subscriptions");
    await ensureSchema();

    const tenantA = "tenant-test-delete-a";
    const tenantB = "tenant-test-delete-b";
    const now = new Date().toISOString();

    for (const tenantId of [tenantA, tenantB]) {
      await prisma.subscription.create({
        data: {
          id: `sub-${tenantId}`,
          tenantId,
          companyName: `Co ${tenantId}`,
          ownerName: "Owner",
          ownerEmail: `owner-${tenantId}@delete-test.example`,
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
      await prisma.customer.create({ data: { id: `cust-${tenantId}`, name: "Cust", phone: "0500000000", initial: "C", tenantId } });
      await prisma.conversation.create({
        data: { id: `conv-${tenantId}`, customerId: `cust-${tenantId}`, lastMessage: "hi", status: "مفتوحة", assignee: "بدون موظف", tenantId }
      });
      await prisma.message.create({ data: { id: `msg-${tenantId}`, conversationId: `conv-${tenantId}`, direction: "in", text: "hi", time: "10:00" } });
      await prisma.tag.create({ data: { id: `tag-${tenantId}`, name: `tag-${tenantId}`, color: "#000", description: "", tenantId } });
      await prisma.conversationTag.create({ data: { conversationId: `conv-${tenantId}`, tagName: `tag-${tenantId}` } });
      await prisma.campaign.create({ data: { id: `camp-${tenantId}`, tenantId, name: "Camp", progress: "0%", status: "قيد الإرسال", updatedAt: now } });
      await prisma.team.create({ data: { id: `team-${tenantId}`, tenantId, name: "Team", lead: "", routing: "" } });
      await prisma.employee.create({
        data: { id: `emp-${tenantId}`, name: "Owner", role: "مالك الحساب", status: "متصل", permissions: "الكل", email: `owner-${tenantId}@delete-test.example`, initial: "O", tenantId }
      });
      await prisma.teamMember.create({ data: { teamId: `team-${tenantId}`, employeeId: `emp-${tenantId}` } });
      await prisma.userAccount.create({
        data: { id: `user-${tenantId}`, name: "Owner", email: `owner-${tenantId}@delete-test.example`, passwordHash: "x", role: "مالك الحساب", tenantId, createdAt: now }
      });
    }

    await deleteTenant(tenantA);

    // Tenant A is gone everywhere.
    expect(await prisma.subscription.findUnique({ where: { tenantId: tenantA } })).toBeNull();
    expect(await prisma.customer.findUnique({ where: { id: `cust-${tenantA}` } })).toBeNull();
    expect(await prisma.conversation.findUnique({ where: { id: `conv-${tenantA}` } })).toBeNull();
    expect(await prisma.message.findUnique({ where: { id: `msg-${tenantA}` } })).toBeNull();
    expect(await prisma.tag.findUnique({ where: { id: `tag-${tenantA}` } })).toBeNull();
    expect(await prisma.campaign.findUnique({ where: { id: `camp-${tenantA}` } })).toBeNull();
    expect(await prisma.team.findUnique({ where: { id: `team-${tenantA}` } })).toBeNull();
    expect(await prisma.employee.findUnique({ where: { id: `emp-${tenantA}` } })).toBeNull();
    expect(await prisma.userAccount.findUnique({ where: { id: `user-${tenantA}` } })).toBeNull();
    expect(await prisma.teamMember.findMany({ where: { teamId: `team-${tenantA}` } })).toHaveLength(0);

    // Tenant B is completely untouched.
    expect(await prisma.subscription.findUnique({ where: { tenantId: tenantB } })).not.toBeNull();
    expect(await prisma.customer.findUnique({ where: { id: `cust-${tenantB}` } })).not.toBeNull();
    expect(await prisma.conversation.findUnique({ where: { id: `conv-${tenantB}` } })).not.toBeNull();
    expect(await prisma.message.findUnique({ where: { id: `msg-${tenantB}` } })).not.toBeNull();
    expect(await prisma.tag.findUnique({ where: { id: `tag-${tenantB}` } })).not.toBeNull();
    expect(await prisma.campaign.findUnique({ where: { id: `camp-${tenantB}` } })).not.toBeNull();
    expect(await prisma.team.findUnique({ where: { id: `team-${tenantB}` } })).not.toBeNull();
    expect(await prisma.employee.findUnique({ where: { id: `emp-${tenantB}` } })).not.toBeNull();
    expect(await prisma.userAccount.findUnique({ where: { id: `user-${tenantB}` } })).not.toBeNull();
  });
});

describe("password-reset vs employee-activation token purpose", () => {
  it("forgot-password issues an activation token for an account with no password", async () => {
    const { prisma } = await import("../lib/prisma");
    const email = "unactivated-forgot@purpose-test.example";
    await prisma.userAccount.create({
      data: { id: "user-purpose-forgot-1", name: "New", email, passwordHash: "", role: "موظف دعم", tenantId: "tenant-test-purpose", createdAt: new Date().toISOString() }
    });

    const { POST } = await import("../app/api/auth/forgot-password/route");
    const response = await POST(new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    }) as never);

    expect(response.status).toBe(200);
    const payload = await response.json() as { activationUrl?: string };
    const invite = await prisma.employeeInvite.findFirst({ where: { email } });
    expect(invite?.purpose).toBe("employee_activation");

    const token = new URL(payload.activationUrl || "").searchParams.get("token");
    expect(token).toBeTruthy();
    const { POST: activate } = await import("../app/api/auth/activate/route");
    const activationResponse = await activate(new Request("http://localhost/api/auth/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "FirstStrongPassword123" })
    }));
    expect(activationResponse.status).toBe(200);
    expect((await prisma.userAccount.findUnique({ where: { email } }))?.passwordHash).not.toBe("");
  });

  it("forgot-password issues a reset token for an activated account", async () => {
    const { prisma } = await import("../lib/prisma");
    const { hashPassword } = await import("../lib/passwords");
    const email = "activated-forgot@purpose-test.example";
    await prisma.userAccount.create({
      data: { id: "user-purpose-forgot-2", name: "Existing", email, passwordHash: hashPassword("OldPassword123"), role: "موظف دعم", tenantId: "tenant-test-purpose", createdAt: new Date().toISOString() }
    });

    const { POST } = await import("../app/api/auth/forgot-password/route");
    const response = await POST(new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    }) as never);

    expect(response.status).toBe(200);
    const invite = await prisma.employeeInvite.findFirst({ where: { email } });
    expect(invite?.purpose).toBe("password_reset");
  });

  it("rejects a password_reset token against an account that was never activated", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { createHash } = await import("crypto");
    await ensureSchema();

    const email = "never-activated@purpose-test.example";
    await prisma.userAccount.create({
      data: { id: "user-purpose-1", name: "New", email, passwordHash: "", role: "موظف دعم", tenantId: "tenant-test-purpose", createdAt: new Date().toISOString() }
    });
    const token = "purpose-test-token-reset";
    await prisma.employeeInvite.create({
      data: {
        id: "invite-purpose-1",
        email,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        purpose: "password_reset"
      }
    });

    const { POST } = await import("../app/api/auth/activate/route");
    const response = await POST(new Request("http://localhost/api/auth/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "ShouldNotWork123" })
    }));

    expect(response.status).toBe(400);
    const stillEmpty = await prisma.userAccount.findUnique({ where: { email } });
    expect(stillEmpty?.passwordHash).toBe("");
  });

  it("rejects an employee_activation token against an account that is already activated", async () => {
    const { prisma } = await import("../lib/prisma");
    const { createHash } = await import("crypto");

    const email = "already-active@purpose-test.example";
    await prisma.userAccount.create({
      data: { id: "user-purpose-2", name: "Existing", email, passwordHash: "existing-hash", role: "موظف دعم", tenantId: "tenant-test-purpose", createdAt: new Date().toISOString() }
    });
    const token = "purpose-test-token-invite";
    await prisma.employeeInvite.create({
      data: {
        id: "invite-purpose-2",
        email,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        purpose: "employee_activation"
      }
    });

    const { POST } = await import("../app/api/auth/activate/route");
    const response = await POST(new Request("http://localhost/api/auth/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "ShouldNotOverwrite123" })
    }));

    expect(response.status).toBe(400);
    const unchanged = await prisma.userAccount.findUnique({ where: { email } });
    expect(unchanged?.passwordHash).toBe("existing-hash");
  });

  it("accepts a password_reset token against an already-activated account", async () => {
    const { prisma } = await import("../lib/prisma");
    const { createHash } = await import("crypto");

    const email = "reset-me@purpose-test.example";
    await prisma.userAccount.create({
      data: { id: "user-purpose-3", name: "Existing", email, passwordHash: "old-hash", role: "موظف دعم", tenantId: "tenant-test-purpose", createdAt: new Date().toISOString(), sessionVersion: 1 }
    });
    const token = "purpose-test-token-reset-ok";
    await prisma.employeeInvite.create({
      data: {
        id: "invite-purpose-3",
        email,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        purpose: "password_reset"
      }
    });

    const { POST } = await import("../app/api/auth/activate/route");
    const response = await POST(new Request("http://localhost/api/auth/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "BrandNewPassword123" })
    }));

    expect(response.status).toBe(200);
    const updated = await prisma.userAccount.findUnique({ where: { email } });
    expect(updated?.passwordHash).not.toBe("old-hash");
    // Resetting must invalidate any existing sessions.
    expect(updated?.sessionVersion).toBe(2);
  });

  it("enforces the shared strong-password policy", async () => {
    const { getPasswordValidationError } = await import("../lib/passwords");
    expect(getPasswordValidationError("short1")).toContain("12");
    expect(getPasswordValidationError("letters-only-password")).toContain("ورقم");
    expect(getPasswordValidationError("StrongPassword123")).toBeNull();
  });
});
