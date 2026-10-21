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

  it("puts the catalog on large+ and branches on regular+, as set", async () => {
    const { isViewLockedForPlan } = await import("../lib/plan-access");
    expect(isViewLockedForPlan("باقة المؤسسات الصغيرة", "catalog")).toBe(true);
    expect(isViewLockedForPlan("باقة المؤسسات الكبيرة", "catalog")).toBe(false);
    expect(isViewLockedForPlan("باقة الأفراد", "branches")).toBe(true);
    expect(isViewLockedForPlan("الباقة العادية", "branches")).toBe(false);
    expect(isViewLockedForPlan("الباقة العادية", "templates")).toBe(false);
  });

  it("keeps ad events and store links in line with the comparison rows", async () => {
    const { COMPARISON_ROWS } = await import("../lib/plan-comparison");
    const { PLAN_ORDER, isAdEventsAllowed, isStoreIntegrationAllowed } = await import("../lib/plan-access");
    const eventsRow = COMPARISON_ROWS.find((row) => row.en.startsWith("Conversion events"))!;
    const storeRows = ["Salla integration", "Zid integration", "Shopify integration"].map((name) => COMPARISON_ROWS.find((row) => row.en.startsWith(name))!);
    PLAN_ORDER.forEach((plan, index) => {
      expect(eventsRow.cells![index] !== false, `events ${plan}`).toBe(isAdEventsAllowed(plan, "meta"));
      for (const row of storeRows) expect(row.cells![index] !== false, `${row.en} ${plan}`).toBe(isStoreIntegrationAllowed(plan));
    });
    expect(isAdEventsAllowed("باقة المؤسسات الصغيرة", "snapchat")).toBe(false);
    expect(isAdEventsAllowed("باقة المؤسسات الكبيرة", "tiktok")).toBe(true);
    expect(isAdEventsAllowed("الباقة العادية", "meta")).toBe(false);
    expect(isAdEventsAllowed("خطة مخصصة غير معروفة", "meta")).toBe(true);
  });

  it("the server blocks ad events and store links by plan, and keeps an existing setup working", async () => {
    const { adEventsBlockedMessage, storeIntegrationBlockedMessage } = await import("../lib/plan-access-server");
    await tenantOn("باقة المؤسسات الصغيرة", "t-ev-small");
    await tenantOn("باقة المؤسسات الكبيرة", "t-ev-large");
    expect(await adEventsBlockedMessage("t-ev-small", "meta")).toBeNull();
    expect(await adEventsBlockedMessage("t-ev-small", "snapchat")).toContain("سناب شات");
    expect(await adEventsBlockedMessage("t-ev-small", "snapchat", true)).toBeNull();
    expect(await adEventsBlockedMessage("t-ev-large", "tiktok")).toBeNull();
    expect(await storeIntegrationBlockedMessage("t-ev-small")).toContain("باقة المؤسسات الكبيرة");
    expect(await storeIntegrationBlockedMessage("t-ev-large")).toBeNull();
  });

  it("a grant opens ad events and stores for one workspace", async () => {
    const { isAdEventsAllowed, isStoreIntegrationAllowed, NO_GRANTS } = await import("../lib/plan-access");
    const grants = { ...NO_GRANTS, features: ["adEvents" as const, "storeIntegrations" as const] };
    expect(isAdEventsAllowed("الباقة العادية", "tiktok", grants)).toBe(true);
    expect(isStoreIntegrationAllowed("الباقة العادية", grants)).toBe(true);
  });

  it("builds the live rows from the plan numbers", async () => {
    const { liveCell } = await import("../lib/plan-comparison");
    const individuals = { name: "باقة الأفراد", monthlyPrice: 199, employeeLimit: 1, allowedChannels: "whatsapp", messageQuota: 1000, aiDailyLimit: 0 };
    const small = { name: "باقة المؤسسات الصغيرة", monthlyPrice: 599, employeeLimit: 6, allowedChannels: "whatsapp,instagram", messageQuota: 5000, aiDailyLimit: 50 };
    expect(liveCell("users", small)).toMatchObject({ ar: "6 مستخدمين", en: "6 users" });
    const regular = { name: "الباقة العادية", monthlyPrice: 349, employeeLimit: 3, allowedChannels: "whatsapp,instagram", messageQuota: 3000, aiDailyLimit: 0 };
    expect(liveCell("ai", individuals)).toBe(false);
    // The regular plan has the AI assistant, but only with the customer's own key.
    expect(liveCell("ai", regular)).toMatchObject({ ar: "بربط مفتاحك الخاص" });
    expect(liveCell("ai", small)).toMatchObject({ ar: "50 طلب يوميًا", en: "50 requests/day" });
    expect(liveCell("campaigns", individuals)).toBe(false);
    expect(liveCell("campaigns", small)).not.toBe(false);
    const { channelCell } = await import("../lib/plan-comparison");
    expect(channelCell("whatsapp", individuals)).toBe(true);
    expect(channelCell("instagram", individuals)).toBe(false);
    expect(channelCell("instagram", small)).toBe(true);
    expect(channelCell("x", { ...small, allowedChannels: "*" })).toBe(true);
  });

  it("shows a channel that can't be connected yet as coming soon, never as a check mark", async () => {
    const { channelCell, CHANNEL_CAPABILITY } = await import("../lib/plan-comparison");
    const large = { name: "باقة المؤسسات الكبيرة", monthlyPrice: 899, employeeLimit: 8, allowedChannels: "whatsapp,tiktok", messageQuota: 1200, aiDailyLimit: 100 };
    expect(channelCell("tiktok", large)).toMatchObject({ ar: "قريبًا", en: "Coming soon" });
    expect(channelCell("tiktok", { ...large, allowedChannels: "whatsapp" })).toBe(false);
    expect(CHANNEL_CAPABILITY.sms?.ar).toBe("إرسال فقط");
  });

  it("the quote-based plan reads the same in its card and in the table", async () => {
    const { liveCell, COMPARISON_ROWS } = await import("../lib/plan-comparison");
    const { getPlanDisplayItems, BY_AGREEMENT } = await import("../lib/plan-features");
    const custom = { name: "باقة الشركات", monthlyPrice: 1599, employeeLimit: 100, allowedChannels: "*", messageQuota: -1, aiDailyLimit: 300 };
    // Unlimited (-1) marketing messages are included, not "not included".
    expect(liveCell("campaigns", custom)).toMatchObject({ ar: "رسائل غير محدودة" });
    expect(getPlanDisplayItems(custom, "ar").some((item) => item.includes("بلا حدود") && item.includes("رسائل تسويقية"))).toBe(true);
    // Users and AI are set per customer: no plan-row default (100 users, 300/day) is shown as a promise.
    expect(liveCell("users", custom)).toEqual(BY_AGREEMENT);
    expect(liveCell("ai", custom)).toEqual(BY_AGREEMENT);
    expect(getPlanDisplayItems(custom, "ar")[0]).toContain("حسب الاتفاق");
    for (const name of ["Knowledge base", "Send the customer their nearest branch", "Product catalog and buying on WhatsApp"]) {
      expect(COMPARISON_ROWS.find((row) => row.en === name)?.cells?.[4], name).toEqual(BY_AGREEMENT);
    }
  });

  it("writes user counts with the right plural", async () => {
    const { usersLabel } = await import("../lib/plan-features");
    expect(usersLabel(1, "ar", true)).toBe("حتى مستخدم واحد");
    expect(usersLabel(2, "ar")).toBe("مستخدمان");
    expect(usersLabel(3, "ar", true)).toBe("حتى 3 مستخدمين");
    expect(usersLabel(10, "ar")).toBe("10 مستخدمين");
    expect(usersLabel(11, "ar")).toBe("11 مستخدم");
    expect(usersLabel(1, "en", true)).toBe("Up to 1 user");
    expect(usersLabel(8, "en")).toBe("8 users");
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

describe("branch caps per plan", () => {
  it("allows 30 / 65 / 100 branches and unlimited on enterprise", async () => {
    const { planLimit, upgradeTargetForView, limitReachedMessage } = await import("../lib/plan-access");
    expect(planLimit("باقة الأفراد", "branches")).toBe(0);
    expect(planLimit("الباقة العادية", "branches")).toBe(30);
    expect(planLimit("باقة المؤسسات الصغيرة", "branches")).toBe(65);
    expect(planLimit("باقة المؤسسات الكبيرة", "branches")).toBe(100);
    expect(planLimit("باقة الشركات", "branches")).toBeNull();
    expect(upgradeTargetForView("branches")).toBe("الباقة العادية");
    expect(limitReachedMessage("branches", 30)).toContain("باقة المؤسسات الصغيرة");
  });

  it("stops the 31st branch on the regular plan", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    const now = new Date(Date.now() + 86_400_000).toISOString();
    await prisma.subscription.create({ data: { id: "sub-branch-cap", tenantId: "tenant-branch-cap", companyName: "B", ownerName: "O", ownerEmail: "b@x.sa", plan: "الباقة العادية", status: "نشط", renewalAt: now, createdAt: now, updatedAt: now } });
    const { assertWithinPlanLimit, PlanLimitError } = await import("../lib/plan-access-server");
    await prisma.branch.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ id: `b-${i}`, tenantId: "tenant-branch-cap", name: `B${i}`, latitude: 24.7, longitude: 46.6, createdAt: now, updatedAt: now })) });
    await expect(assertWithinPlanLimit("tenant-branch-cap", "branches")).rejects.toBeInstanceOf(PlanLimitError);
  });
});

describe("upgrade popup blurbs", () => {
  it("every section a plan can lock, and every channel in the catalog, has a note explaining it", async () => {
    const { VIEW_BLURBS, CHANNEL_BLURBS, BOT_STEP_BLURBS } = await import("../lib/feature-blurbs");
    const { lockedViewsForPlan, RESTRICTED_PLANS } = await import("../lib/plan-access");
    const { CHANNEL_CATALOG } = await import("../lib/channel-catalog");
    const lockable = new Set(Object.keys(RESTRICTED_PLANS).flatMap((plan) => lockedViewsForPlan(plan)));
    // These sections are always reachable to anyone who can see them; the rest need a blurb.
    for (const view of lockable) {
      if (["inbox", "contacts", "tags", "quickReplies", "bot", "settings", "employees"].includes(view)) continue;
      expect(VIEW_BLURBS[view], `blurb for ${view}`).toBeDefined();
    }
    for (const { key } of CHANNEL_CATALOG) {
      if (key === "whatsapp") continue;
      expect(CHANNEL_BLURBS[key], `blurb for channel ${key}`).toBeDefined();
    }
    for (const type of ["رد AI تلقائي", "رد من قاعدة المعرفة", "عرض الكتالوج", "أقرب فرع", "إرسال قائمة طويلة", "تحويل لفريق"]) {
      const blurb = BOT_STEP_BLURBS[type];
      expect(blurb.ar.points.length).toBeGreaterThan(0);
      expect(blurb.en.text.length).toBeGreaterThan(10);
    }
  });
});
