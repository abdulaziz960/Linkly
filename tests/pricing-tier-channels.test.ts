import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-pricing-tier-channels.db");

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

describe("2026 pricing tier restructure", () => {
  it("creates the 5 new tiers on a fresh database", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();

    const newTiers = await prisma.plan.findMany({
      where: { name: { in: ["باقة الأفراد", "الباقة العادية", "باقة المؤسسات الصغيرة", "باقة المؤسسات الكبيرة", "باقة الشركات"] } },
      orderBy: { sortOrder: "asc" }
    });
    expect(newTiers).toHaveLength(5);
    expect(newTiers.every((plan) => plan.active === 1)).toBe(true);
    expect(newTiers.map((plan) => plan.employeeLimit)).toEqual([1, 3, 6, 8, 100]);
    expect(newTiers.map((plan) => plan.monthlyPrice)).toEqual([199, 279, 615, 849, 1499]);
    expect(newTiers.map((plan) => plan.allowedChannels)).toEqual([
      "whatsapp",
      "whatsapp,instagram",
      "whatsapp,instagram",
      "whatsapp,instagram,tiktok",
      "*"
    ]);
    // AI Copilot only kicks in from the small-enterprises tier up.
    expect(newTiers.map((plan) => plan.aiDailyLimit)).toEqual([0, 0, 50, 100, 300]);
    // Marketing message quota per plan - -1 (enterprise) means unlimited.
    expect(newTiers.map((plan) => plan.messageQuota)).toEqual([1000, 3000, 5000, 7000, -1]);

    // Nothing to migrate on a fresh install - the 3 original plan names
    // were never created here in the first place (see the separate
    // "pre-existing production-like data" test for the deactivation path).
    const originalPlans = await prisma.plan.findMany({ where: { name: { in: ["باقة البداية", "باقة النمو", "باقة الأعمال"] } } });
    expect(originalPlans).toHaveLength(0);
  });

  it("is idempotent - re-running ensureSchema() never duplicates anything", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    await ensureSchema();

    const individualsPlans = await prisma.plan.findMany({ where: { name: "باقة الأفراد" } });
    expect(individualsPlans).toHaveLength(1);
  });
});

describe("getAllowedChannelsForTenant / isChannelAllowedForTenant", () => {
  it("restricts a tenant on the individuals plan to whatsapp only", async () => {
    const { prisma } = await import("../lib/prisma");
    const now = new Date().toISOString();
    await prisma.subscription.create({
      data: {
        id: "sub-tenant-channels-individuals", tenantId: "tenant-channels-individuals", companyName: "Test", ownerName: "Test",
        ownerEmail: "individuals@channels-test.example", plan: "باقة الأفراد", status: "نشط", employeeLimit: 1,
        amount: 199, billingCycle: "شهري", renewalAt: "", createdAt: now, updatedAt: now
      }
    });

    const { isChannelAllowedForTenant, getAllowedChannelsForTenant } = await import("../lib/plan-channel-access");
    expect(await isChannelAllowedForTenant("tenant-channels-individuals", "whatsapp")).toBe(true);
    expect(await isChannelAllowedForTenant("tenant-channels-individuals", "instagram")).toBe(false);
    expect(await isChannelAllowedForTenant("tenant-channels-individuals", "tiktok")).toBe(false);
    expect(await getAllowedChannelsForTenant("tenant-channels-individuals")).toEqual(["whatsapp"]);
  });

  it("allows every channel for a tenant on the enterprise plan", async () => {
    const { prisma } = await import("../lib/prisma");
    const now = new Date().toISOString();
    await prisma.subscription.create({
      data: {
        id: "sub-tenant-channels-enterprise", tenantId: "tenant-channels-enterprise", companyName: "Test", ownerName: "Test",
        ownerEmail: "enterprise@channels-test.example", plan: "باقة الشركات", status: "نشط", employeeLimit: 100,
        amount: 1499, billingCycle: "شهري", renewalAt: "", createdAt: now, updatedAt: now
      }
    });

    const { isChannelAllowedForTenant } = await import("../lib/plan-channel-access");
    expect(await isChannelAllowedForTenant("tenant-channels-enterprise", "snapchat")).toBe(true);
    expect(await isChannelAllowedForTenant("tenant-channels-enterprise", "linkedin")).toBe(true);
  });

  it("fails open (unrestricted) for a tenant with no subscription row or an unknown plan name", async () => {
    const { isChannelAllowedForTenant } = await import("../lib/plan-channel-access");
    expect(await isChannelAllowedForTenant("tenant-does-not-exist", "snapchat")).toBe(true);

    const { prisma } = await import("../lib/prisma");
    const now = new Date().toISOString();
    await prisma.subscription.create({
      data: {
        id: "sub-tenant-channels-legacy", tenantId: "tenant-channels-legacy", companyName: "Test", ownerName: "Test",
        ownerEmail: "legacy@channels-test.example", plan: "خطة قديمة محذوفة", status: "نشط", employeeLimit: 5,
        amount: 0, billingCycle: "شهري", renewalAt: "", createdAt: now, updatedAt: now
      }
    });
    expect(await isChannelAllowedForTenant("tenant-channels-legacy", "tiktok")).toBe(true);
  });

  it("keeps a subscriber on an original (now-deactivated) plan fully unrestricted", async () => {
    const { prisma } = await import("../lib/prisma");
    const now = new Date().toISOString();
    await prisma.subscription.create({
      data: {
        id: "sub-tenant-channels-grandfathered", tenantId: "tenant-channels-grandfathered", companyName: "Test", ownerName: "Test",
        ownerEmail: "grandfathered@channels-test.example", plan: "باقة النمو", status: "نشط", employeeLimit: 3,
        amount: 499, billingCycle: "شهري", renewalAt: "", createdAt: now, updatedAt: now
      }
    });

    const { isChannelAllowedForTenant } = await import("../lib/plan-channel-access");
    expect(await isChannelAllowedForTenant("tenant-channels-grandfathered", "tiktok")).toBe(true);
    expect(await isChannelAllowedForTenant("tenant-channels-grandfathered", "snapchat")).toBe(true);
  });
});

describe("channel connect route enforcement", () => {
  const user = { id: "user-plan-gate", name: "Owner", email: "owner@plan-gate.example", role: "مالك الحساب", tenantId: "tenant-plan-gate" };

  it("blocks connecting a channel outside the tenant's plan and allows one inside it", async () => {
    const { prisma } = await import("../lib/prisma");
    const now = new Date().toISOString();
    await prisma.subscription.create({
      data: {
        id: "sub-tenant-plan-gate", tenantId: "tenant-plan-gate", companyName: "Test", ownerName: "Test",
        ownerEmail: "plan-gate@channels-test.example", plan: "باقة الأفراد", status: "نشط", employeeLimit: 1,
        amount: 199, billingCycle: "شهري", renewalAt: "", createdAt: now, updatedAt: now
      }
    });

    vi.doMock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));
    vi.doMock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => true) }));
    vi.resetModules();

    const { NextRequest } = await import("next/server");
    const { GET } = await import("../app/api/meta/connect/route");

    // Instagram isn't in the individuals plan's channel list.
    const blocked = await GET(new NextRequest("http://localhost/api/meta/connect?channel=instagram"));
    expect(blocked.status).toBe(200); // popup-close HTML, not a hard error status
    expect(await blocked.text()).toContain("غير متاحة بباقتك الحالية");

    // WhatsApp is in the individuals plan's channel list - proceeds to redirect toward Facebook.
    const allowed = await GET(new NextRequest("http://localhost/api/meta/connect?channel=whatsapp"));
    expect(allowed.status).toBe(307);
    expect(allowed.headers.get("location")).toContain("facebook.com");

    vi.doUnmock("../lib/auth");
    vi.doUnmock("../lib/permissions-server");
    vi.resetModules();
  });
});
