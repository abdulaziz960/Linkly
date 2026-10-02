import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-plan-access.db");
const individualsTenant = "tenant-plan-individuals";
const regularTenant = "tenant-plan-regular";

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

async function subscribe(tenantId: string, plan: string) {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  const now = new Date(Date.now() + 86_400_000).toISOString();
  await prisma.subscription.create({
    data: { id: `sub-${tenantId}`, tenantId, companyName: tenantId, ownerName: "Owner", ownerEmail: `${tenantId}@x.sa`, plan, status: "نشط", renewalAt: now, createdAt: now, updatedAt: now }
  });
}

describe("plan access: individuals plan", () => {
  it("opens only the WhatsApp-basics sections and locks the rest", async () => {
    const { lockedViewsForPlan, isViewLockedForPlan } = await import("../lib/plan-access");
    const locked = lockedViewsForPlan("باقة الأفراد");
    for (const view of ["campaigns", "automations", "ai", "knowledgeBase", "catalog", "branches", "pipeline", "segments", "templates", "developers", "integrations", "branding", "teams", "workHours"] as const) {
      expect(locked).toContain(view);
    }
    for (const view of ["inbox", "contacts", "tags", "quickReplies", "bot", "reports", "settings"] as const) {
      expect(isViewLockedForPlan("باقة الأفراد", view)).toBe(false);
    }
    // The enterprise plan and unknown/custom plans stay fully open.
    expect(lockedViewsForPlan("باقة الشركات")).toEqual([]);
    expect(lockedViewsForPlan("خطة مخصصة")).toEqual([]);
    expect(lockedViewsForPlan(null)).toEqual([]);
  });

  it("gives every plan exactly its own sections, each tier a superset of the one below", async () => {
    const { RESTRICTED_PLANS, PLAN_ORDER, isViewLockedForPlan } = await import("../lib/plan-access");
    const tiers = PLAN_ORDER.filter((name) => RESTRICTED_PLANS[name]);
    for (let i = 1; i < tiers.length; i += 1) {
      for (const view of RESTRICTED_PLANS[tiers[i - 1]].views) expect(RESTRICTED_PLANS[tiers[i]].views).toContain(view);
      expect(RESTRICTED_PLANS[tiers[i]].views.length).toBeGreaterThan(RESTRICTED_PLANS[tiers[i - 1]].views.length);
    }
    // Regular: campaigns/templates/teams yes; AI, automations, API no.
    for (const view of ["campaigns", "templates", "teams", "catalog", "branches"] as const) expect(isViewLockedForPlan("الباقة العادية", view)).toBe(false);
    for (const view of ["ai", "knowledgeBase", "automations", "operations", "developers", "integrations", "branding"] as const) expect(isViewLockedForPlan("الباقة العادية", view)).toBe(true);
    // Small enterprises add AI + automations but not the developer API.
    for (const view of ["ai", "knowledgeBase", "automations", "operations"] as const) expect(isViewLockedForPlan("باقة المؤسسات الصغيرة", view)).toBe(false);
    for (const view of ["developers", "integrations", "branding"] as const) expect(isViewLockedForPlan("باقة المؤسسات الصغيرة", view)).toBe(true);
    // Large enterprises add the API; only white-label branding stays enterprise.
    expect(isViewLockedForPlan("باقة المؤسسات الكبيرة", "developers")).toBe(false);
    expect(isViewLockedForPlan("باقة المؤسسات الكبيرة", "branding")).toBe(true);
    expect(isViewLockedForPlan("باقة الشركات", "branding")).toBe(false);
  });

  it("caps every role, the owner included, on the server", async () => {
    await subscribe(individualsTenant, "باقة الأفراد");
    await subscribe(regularTenant, "الباقة العادية");
    const { userHasViewPermission } = await import("../lib/permissions-server");

    const owner = { email: "owner@x.sa", tenantId: individualsTenant, role: "مالك الحساب" };
    expect(await userHasViewPermission(owner, "campaigns")).toBe(false);
    expect(await userHasViewPermission(owner, "catalog")).toBe(false);
    expect(await userHasViewPermission(owner, "tags")).toBe(true);
    expect(await userHasViewPermission(owner, "bot")).toBe(true);

    // The same owner role on the regular plan keeps everything.
    expect(await userHasViewPermission({ ...owner, tenantId: regularTenant }, "campaigns")).toBe(true);
    // A tenant with no subscription row fails open.
    expect(await userHasViewPermission({ ...owner, tenantId: "tenant-no-sub" }, "campaigns")).toBe(true);
  });

  it("builds the dashboard snapshot with locked channels and a simple bot", async () => {
    const { getPlanAccessForTenant } = await import("../lib/plan-access-server");
    const access = await getPlanAccessForTenant(individualsTenant);
    expect(access.allowedChannels).toEqual(["whatsapp"]);
    expect(access.basicReports).toBe(true);
    expect(access.botMaxSteps).toBe(6);
    expect(access.botNodeTypes).not.toContain("رد AI تلقائي");

    const regular = await getPlanAccessForTenant(regularTenant);
    expect(regular.lockedViews).toContain("ai");
    expect(regular.lockedViews).not.toContain("campaigns");
    expect(regular.botNodeTypes).not.toContain("رد AI تلقائي");
    expect(regular.botMaxSteps).toBeNull();
    expect(regular.isTrial).toBe(false);
  });

  it("limits new bot steps but never breaks a flow that already exists", async () => {
    const { validateBotNodesForPlan } = await import("../lib/plan-access");
    const plan = "باقة الأفراد";

    expect(validateBotNodesForPlan(plan, [{ type: "إرسال رسالة" }, { type: "إرسال قائمة قصيرة" }], []).ok).toBe(true);
    expect(validateBotNodesForPlan(plan, [{ type: "رد AI تلقائي" }], []).ok).toBe(false);
    expect(validateBotNodesForPlan(plan, [{ type: "عرض الكتالوج" }], []).ok).toBe(false);
    expect(validateBotNodesForPlan(plan, Array.from({ length: 7 }, () => ({ type: "إرسال رسالة" })), []).ok).toBe(false);

    // A pre-existing richer flow stays valid when edited, but can't gain new locked steps.
    const existing = [{ id: "a", type: "رد AI تلقائي" }, { id: "b", type: "إرسال رسالة" }];
    expect(validateBotNodesForPlan(plan, [{ id: "a", type: "رد AI تلقائي" }, { id: "b", type: "إرسال رسالة" }], existing).ok).toBe(true);
    expect(validateBotNodesForPlan(plan, [...existing, { type: "أقرب فرع" }], existing).ok).toBe(false);
    // The regular plan's bot may use the catalog but not AI; small enterprises may use AI; no step cap on regular.
    expect(validateBotNodesForPlan("الباقة العادية", [{ type: "عرض الكتالوج" }], []).ok).toBe(true);
    expect(validateBotNodesForPlan("الباقة العادية", [{ type: "رد AI تلقائي" }], []).ok).toBe(false);
    expect(validateBotNodesForPlan("الباقة العادية", Array.from({ length: 12 }, () => ({ type: "إرسال رسالة" })), []).ok).toBe(true);
    expect(validateBotNodesForPlan("باقة المؤسسات الصغيرة", [{ type: "رد AI تلقائي" }], []).ok).toBe(true);
    expect(validateBotNodesForPlan("باقة الشركات", [{ type: "رد AI تلقائي" }], []).ok).toBe(true);
  });

  it("excludes SLA escalation on the individuals plan only", async () => {
    const { isEscalationAllowedForPlan } = await import("../lib/plan-access");
    expect(isEscalationAllowedForPlan("باقة الأفراد")).toBe(false);
    expect(isEscalationAllowedForPlan("الباقة العادية")).toBe(true);
    expect(isEscalationAllowedForPlan("باقة المؤسسات الصغيرة")).toBe(true);
    expect(isEscalationAllowedForPlan(null)).toBe(true);
  });

  it("describes the plan without campaigns and points locked items to the right plan", async () => {
    const { getPlanDisplayItems } = await import("../lib/plan-features");
    const { upgradeTargetForView, upgradeMessageForChannel } = await import("../lib/plan-access");
    const items = getPlanDisplayItems({ name: "باقة الأفراد", employeeLimit: 1, allowedChannels: "whatsapp", messageQuota: 1000 }, "ar");
    expect(items.join(" ")).not.toContain("رسالة تسويقية");
    expect(items.join(" ")).not.toContain("حملات");
    expect(items).toContain("رد آلي بسيط جدًا");
    expect(items).toContain("تقرير أساسي");

    // Other plans still advertise their message quota.
    expect(getPlanDisplayItems({ name: "الباقة العادية", employeeLimit: 3, allowedChannels: "whatsapp,instagram", messageQuota: 3000 }, "ar").join(" ")).toContain("رسالة تسويقية");

    // Upgrade prompts always name the cheapest plan that has the feature.
    expect(upgradeTargetForView("campaigns")).toBe("الباقة العادية");
    expect(upgradeTargetForView("automations")).toBe("باقة المؤسسات الصغيرة");
    expect(upgradeTargetForView("ai")).toBe("باقة المؤسسات الصغيرة");
    expect(upgradeTargetForView("developers")).toBe("باقة المؤسسات الكبيرة");
    expect(upgradeTargetForView("branding")).toBe("باقة الشركات");
    const { upgradeTargetForChannel } = await import("../lib/plan-access");
    expect(upgradeTargetForChannel("instagram")).toBe("الباقة العادية");
    expect(upgradeTargetForChannel("tiktok")).toBe("باقة المؤسسات الكبيرة");
    expect(upgradeTargetForChannel("telegram")).toBe("باقة الشركات");
    expect(upgradeMessageForChannel("instagram")).toContain("باقتك لا تدعم الربط مع منصة");
  });
});

describe("trial plan selection", () => {
  it("starts the trial on the plan the visitor picked, never the enterprise one", async () => {
    const { pickTrialPlan } = await import("../lib/trial-plan");
    const plans = [
      { id: "plan-individuals", name: "باقة الأفراد" },
      { id: "plan-regular", name: "الباقة العادية" },
      { id: "plan-small-org", name: "باقة المؤسسات الصغيرة" },
      { id: "plan-enterprise", name: "باقة الشركات" }
    ];
    expect(pickTrialPlan(plans, "plan-regular")?.name).toBe("الباقة العادية");
    expect(pickTrialPlan(plans, "plan-small-org")?.name).toBe("باقة المؤسسات الصغيرة");
    expect(pickTrialPlan(plans, "plan-enterprise")?.name).toBe("باقة الأفراد");
    expect(pickTrialPlan(plans, "not-a-plan")?.name).toBe("باقة الأفراد");
    expect(pickTrialPlan(plans)?.name).toBe("باقة الأفراد");
  });

  it("lets an owner on the free trial switch plan, and only during the trial", async () => {
    vi.resetModules();
    vi.doMock("../lib/permissions-server", () => ({ requireOwner: async () => ({ id: "u1", name: "Owner", email: "o@x.sa", tenantId: "tenant-trial-switch", role: "مالك الحساب" }) }));
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const nowIso = new Date().toISOString();
    await prisma.subscription.create({ data: { id: "sub-trial-switch", tenantId: "tenant-trial-switch", companyName: "T", ownerName: "O", ownerEmail: "t@x.sa", plan: "باقة الأفراد", status: "تجربة", renewalAt: future, createdAt: nowIso, updatedAt: nowIso } });
    const { POST } = await import("../app/api/trial/switch-plan/route");
    const call = (plan: string) => POST(new Request("http://localhost/api/trial/switch-plan", { method: "POST", body: JSON.stringify({ plan }) }) as never);

    expect((await call("الباقة العادية")).status).toBe(200);
    expect((await prisma.subscription.findUnique({ where: { tenantId: "tenant-trial-switch" } }))?.plan).toBe("الباقة العادية");
    expect((await call("باقة الشركات")).status).toBe(400);
    expect((await call("خطة غير موجودة")).status).toBe(400);

    // A paid (non-trial) subscription can't switch for free.
    await prisma.subscription.update({ where: { tenantId: "tenant-trial-switch" }, data: { status: "نشط" } });
    expect((await call("باقة المؤسسات الكبيرة")).status).toBe(400);
    vi.doUnmock("../lib/permissions-server");
  });
});
