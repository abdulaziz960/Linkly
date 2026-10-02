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
    // Other plans and unknown plans stay fully open.
    expect(lockedViewsForPlan("الباقة العادية")).toEqual([]);
    expect(lockedViewsForPlan("خطة مخصصة")).toEqual([]);
    expect(lockedViewsForPlan(null)).toEqual([]);
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
    expect(regular.lockedViews).toEqual([]);
    expect(regular.botNodeTypes).toBe("*");
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
    // Other plans are unrestricted.
    expect(validateBotNodesForPlan("الباقة العادية", [{ type: "رد AI تلقائي" }], []).ok).toBe(true);
  });

  it("excludes SLA escalation on the individuals plan only", async () => {
    const { isEscalationAllowedForPlan } = await import("../lib/plan-access");
    expect(isEscalationAllowedForPlan("باقة الأفراد")).toBe(false);
    expect(isEscalationAllowedForPlan("الباقة العادية")).toBe(true);
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

    expect(upgradeTargetForView("campaigns")).toBe("الباقة العادية");
    expect(upgradeTargetForView("ai")).toBe("باقة المؤسسات الصغيرة");
    expect(upgradeTargetForView("developers")).toBe("باقة المؤسسات الكبيرة");
    expect(upgradeMessageForChannel("instagram")).toContain("باقتك لا تدعم الربط مع منصة");
  });
});
