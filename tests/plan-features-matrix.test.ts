import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-plan-features-matrix.db");

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

async function tenantOn(plan: string, tenantId: string) {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  const now = new Date(Date.now() + 86_400_000).toISOString();
  await prisma.subscription.create({ data: { id: `sub-${tenantId}`, tenantId, companyName: tenantId, ownerName: "O", ownerEmail: `${tenantId}@x.sa`, plan, status: "نشط", renewalAt: now, createdAt: now, updatedAt: now } });
}

describe("the comparison table matches what is enforced", () => {
  it("every section row agrees with the plan's real access", async () => {
    const { COMPARISON_ROWS } = await import("../lib/plan-comparison");
    const { PLAN_ORDER, isViewLockedForPlan } = await import("../lib/plan-access");
    for (const row of COMPARISON_ROWS.filter((item) => item.view && item.cells)) {
      PLAN_ORDER.forEach((plan, index) => {
        const included = row.cells![index] !== false;
        expect(included, `${row.en} on ${plan}`).toBe(!isViewLockedForPlan(plan, row.view!));
      });
    }
  });

  it("puts the catalog on large+ and branches on small+, as proposed", async () => {
    const { isViewLockedForPlan } = await import("../lib/plan-access");
    expect(isViewLockedForPlan("باقة المؤسسات الصغيرة", "catalog")).toBe(true);
    expect(isViewLockedForPlan("باقة المؤسسات الكبيرة", "catalog")).toBe(false);
    expect(isViewLockedForPlan("الباقة العادية", "branches")).toBe(true);
    expect(isViewLockedForPlan("باقة المؤسسات الصغيرة", "branches")).toBe(false);
    expect(isViewLockedForPlan("الباقة العادية", "templates")).toBe(false);
  });

  it("builds the live rows from the plan numbers", async () => {
    const { liveCell } = await import("../lib/plan-comparison");
    const individuals = { name: "باقة الأفراد", monthlyPrice: 199, employeeLimit: 1, allowedChannels: "whatsapp", messageQuota: 1000, aiDailyLimit: 0 };
    const small = { name: "باقة المؤسسات الصغيرة", monthlyPrice: 599, employeeLimit: 6, allowedChannels: "whatsapp,instagram", messageQuota: 5000, aiDailyLimit: 50 };
    expect(liveCell("users", small)).toMatchObject({ ar: "6 مستخدم" });
    expect(liveCell("ai", individuals)).toBe(false);
    expect(liveCell("ai", small)).toMatchObject({ ar: "50 طلب يوميًا" });
    expect(liveCell("campaigns", individuals)).toBe(false);
    expect(liveCell("campaigns", small)).not.toBe(false);
    expect(liveCell("channels", individuals)).toMatchObject({ en: "WhatsApp" });
  });
});

describe("plan limits are enforced on the server", () => {
  it("caps teams on the regular plan and leaves higher plans unlimited", async () => {
    await tenantOn("الباقة العادية", "tenant-limit-regular");
    await tenantOn("باقة المؤسسات الصغيرة", "tenant-limit-small");
    const { prisma } = await import("../lib/prisma");
    const { assertWithinPlanLimit, PlanLimitError } = await import("../lib/plan-access-server");
    for (const tenantId of ["tenant-limit-regular", "tenant-limit-small"]) {
      for (let i = 0; i < 2; i += 1) {
        await prisma.team.create({ data: { id: `team-${tenantId}-${i}`, tenantId, name: `T${i}`, lead: "", routing: "يدوي" } as never });
      }
    }
    await expect(assertWithinPlanLimit("tenant-limit-regular", "teams")).rejects.toBeInstanceOf(PlanLimitError);
    await expect(assertWithinPlanLimit("tenant-limit-small", "teams")).resolves.toBeUndefined();
  });

  it("stops new products at the plan cap while a feed keeps updating the ones it has", async () => {
    await tenantOn("باقة المؤسسات الكبيرة", "tenant-limit-large");
    const { prisma } = await import("../lib/prisma");
    const { importFeedRecords } = await import("../lib/product-feed");
    const { assertWithinPlanLimit, PlanLimitError } = await import("../lib/plan-access-server");
    const now = new Date().toISOString();
    await prisma.product.createMany({ data: Array.from({ length: 300 }, (_, i) => ({ id: `p-${i}`, tenantId: "tenant-limit-large", externalId: `x-${i}`, source: "feed", name: `P${i}`, price: 1, createdAt: now, updatedAt: now })) });
    await expect(assertWithinPlanLimit("tenant-limit-large", "products")).rejects.toBeInstanceOf(PlanLimitError);

    const result = await importFeedRecords("tenant-limit-large", [{ id: "x-1", name: "P1 renamed", price: "5" }, { id: "brand-new", name: "New one", price: "5" }]);
    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(await prisma.product.count({ where: { tenantId: "tenant-limit-large" } })).toBe(300);
  });

  it("blocks recurring campaigns and advanced segments below the small plan", async () => {
    const { isRecurringCampaignAllowed, isAdvancedSegmentAllowed } = await import("../lib/plan-access");
    expect(isRecurringCampaignAllowed("الباقة العادية")).toBe(false);
    expect(isRecurringCampaignAllowed("باقة المؤسسات الصغيرة")).toBe(true);
    expect(isAdvancedSegmentAllowed("الباقة العادية")).toBe(false);
    expect(isAdvancedSegmentAllowed("باقة الشركات")).toBe(true);
  });
});
