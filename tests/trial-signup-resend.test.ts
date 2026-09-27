import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-trial-signup-resend.db");

const sendActivationEmail = vi.fn(async () => ({ sent: true, message: "sent" }));
vi.mock("../lib/email", () => ({ sendActivationEmail }));

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

afterEach(() => {
  sendActivationEmail.mockClear();
});

const signupInput = {
  companyName: "Acme Co",
  ownerName: "Owner Name",
  plan: "باقة البداية",
  status: "تجربة",
  amount: 0,
  billingCycle: "تجربة 3 أيام",
  renewalAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  adminName: "test"
};

describe("createTenantWithSubscription resends instead of blocking an abandoned, never-activated signup", () => {
  it("creates a real tenant + account on the first attempt", async () => {
    const { createTenantWithSubscription } = await import("../lib/subscriptions");
    const { subscription } = await createTenantWithSubscription({ ...signupInput, ownerEmail: "resend-test@example.com" });
    expect(subscription?.companyName).toBe("Acme Co");
    expect(sendActivationEmail).toHaveBeenCalledTimes(1);
  });

  it("resends a fresh activation link for the SAME tenant instead of throwing, when retried before activation", async () => {
    const { createTenantWithSubscription } = await import("../lib/subscriptions");
    const { prisma } = await import("../lib/prisma");

    const firstAccount = await prisma.userAccount.findUniqueOrThrow({ where: { email: "resend-test@example.com" } });
    const firstInvite = await prisma.employeeInvite.findFirstOrThrow({ where: { email: "resend-test@example.com" } });

    const result = await createTenantWithSubscription({ ...signupInput, companyName: "Acme Co Retry", ownerEmail: "resend-test@example.com" });

    // Same tenant/account reused, not a duplicate.
    expect(result.subscription?.tenantId).toBe(firstAccount.tenantId);
    const accountsForEmail = await prisma.userAccount.findMany({ where: { email: "resend-test@example.com" } });
    expect(accountsForEmail).toHaveLength(1);

    // The old invite token was invalidated and replaced.
    const newInvite = await prisma.employeeInvite.findFirstOrThrow({ where: { email: "resend-test@example.com" } });
    expect(newInvite.tokenHash).not.toBe(firstInvite.tokenHash);
    expect(sendActivationEmail).toHaveBeenCalledTimes(1);
  });

  it("still hard-blocks an email that belongs to an already-activated account", async () => {
    const { createTenantWithSubscription } = await import("../lib/subscriptions");
    const { prisma } = await import("../lib/prisma");
    const { hashPassword } = await import("../lib/passwords");

    await prisma.userAccount.update({
      where: { email: "resend-test@example.com" },
      data: { passwordHash: hashPassword("Real-Password-1") }
    });

    await expect(createTenantWithSubscription({ ...signupInput, ownerEmail: "resend-test@example.com" })).rejects.toThrow();
    expect(sendActivationEmail).not.toHaveBeenCalled();
  });
});
