import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-tenant-grants.db");
const tenantId = "tenant-grants";
const otherTenant = "tenant-grants-other";

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

async function subscribe(id: string, plan: string) {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  const now = new Date(Date.now() + 86_400_000).toISOString();
  await prisma.subscription.create({ data: { id: `sub-${id}`, tenantId: id, companyName: id, ownerName: "O", ownerEmail: `${id}@x.sa`, plan, status: "نشط", renewalAt: now, createdAt: now, updatedAt: now } });
}

describe("pages unlocked for one workspace", () => {
  it("only accepts pages the plan really locks, and ignores junk", async () => {
    await subscribe(tenantId, "الباقة العادية");
    await subscribe(otherTenant, "الباقة العادية");
    const { setTenantGrants, listTenantGrants } = await import("../lib/plan-grants");
    const saved = await setTenantGrants(tenantId, ["catalog", "inbox", "not-a-page", "catalog", "knowledgeBase"], "admin", "الباقة العادية");
    expect(saved.views.sort()).toEqual(["catalog", "knowledgeBase"]);
    expect((await listTenantGrants(tenantId)).sort()).toEqual(["catalog", "knowledgeBase"]);
    expect(await listTenantGrants(otherTenant)).toEqual([]);
  });

  it("opens the page, its cap and its bot step for that workspace only", async () => {
    const { isViewLockedForTenant, getPlanAccessForTenant, assertWithinPlanLimit, PlanLimitError } = await import("../lib/plan-access-server");
    const { userHasViewPermission } = await import("../lib/permissions-server");
    const { validateBotNodesForPlan } = await import("../lib/plan-access");
    const { getTenantGrants } = await import("../lib/plan-grants");

    expect(await isViewLockedForTenant(tenantId, "catalog")).toBe(false);
    expect(await isViewLockedForTenant(otherTenant, "catalog")).toBe(true);
    expect(await userHasViewPermission({ email: "o@x.sa", tenantId, role: "مالك الحساب" }, "catalog")).toBe(true);
    expect(await userHasViewPermission({ email: "o@x.sa", tenantId: otherTenant, role: "مالك الحساب" }, "catalog")).toBe(false);
    // Still locked: a page that wasn't granted.
    expect(await isViewLockedForTenant(tenantId, "automations")).toBe(true);

    const access = await getPlanAccessForTenant(tenantId);
    expect(access.lockedViews).not.toContain("catalog");
    expect(access.lockedViews).toContain("automations");
    expect(access.botNodeTypes).toContain("عرض الكتالوج");
    expect((await getPlanAccessForTenant(otherTenant)).botNodeTypes).not.toContain("عرض الكتالوج");

    // The regular plan allows 0 products; the unlocked catalog lifts that cap, but only for this workspace.
    await expect(assertWithinPlanLimit(tenantId, "products")).resolves.toBeUndefined();
    await expect(assertWithinPlanLimit(otherTenant, "products")).rejects.toBeInstanceOf(PlanLimitError);

    const granted = await getTenantGrants(tenantId);
    expect(validateBotNodesForPlan("الباقة العادية", [{ type: "عرض الكتالوج" }], [], granted).ok).toBe(true);
    expect(validateBotNodesForPlan("الباقة العادية", [{ type: "عرض الكتالوج" }], []).ok).toBe(false);
  });

  it("locks the page again when the grant is removed", async () => {
    const { setTenantGrants } = await import("../lib/plan-grants");
    const { isViewLockedForTenant } = await import("../lib/plan-access-server");
    await setTenantGrants(tenantId, [], "admin", "الباقة العادية");
    expect(await isViewLockedForTenant(tenantId, "catalog")).toBe(true);
  });

  it("is a platform-admin-only API", async () => {
    vi.resetModules();
    vi.doMock("../lib/admin-auth", () => ({ requirePlatformAdmin: async () => null }));
    const { PUT } = await import("../app/api/admin/clients/[id]/grants/route");
    const response = await PUT(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ keys: ["catalog"] }) }) as never, { params: Promise.resolve({ id: tenantId }) });
    expect(response.status).toBe(403);
    vi.doUnmock("../lib/admin-auth");
  });
});

describe("features, channels and caps unlocked for one workspace", () => {
  it("only grants what the plan lacks, and ignores the rest", async () => {
    await subscribe("tenant-grants-feat", "الباقة العادية");
    const { setTenantGrants, getTenantGrants } = await import("../lib/plan-grants");
    const regularChannels = "whatsapp,instagram,telegram,email";
    const saved = await setTenantGrants("tenant-grants-feat", ["feature:recurringCampaigns", "feature:escalation", "feature:unlimitedBot", "channel:youtube", "channel:whatsapp", "limit:branches", "limit:products", "feature:nope"], "admin", "الباقة العادية", regularChannels);
    // Regular already has escalation (30 min) -> not grantable; whatsapp is already in the plan; products cap (0) is page-bound but still a capped thing.
    expect(saved.features.sort()).toEqual(["recurringCampaigns", "unlimitedBot"]);
    expect(saved.channels).toEqual(["youtube"]);
    expect(saved.limits.sort()).toEqual(["branches", "products"]);
    expect((await getTenantGrants("tenant-grants-feat")).features.sort()).toEqual(["recurringCampaigns", "unlimitedBot"]);
  });

  it("applies each kind of grant where it matters", async () => {
    const { getTenantGrants } = await import("../lib/plan-grants");
    const { getPlanAccessForTenant, assertWithinPlanLimit } = await import("../lib/plan-access-server");
    const { isChannelAllowedForTenant } = await import("../lib/plan-channel-access");
    const { isRecurringCampaignAllowed, isEscalationAllowedForPlan, isAdvancedSegmentAllowed } = await import("../lib/plan-access");
    const grants = await getTenantGrants("tenant-grants-feat");

    expect(isRecurringCampaignAllowed("الباقة العادية", grants)).toBe(true);
    expect(isRecurringCampaignAllowed("الباقة العادية")).toBe(false);
    expect(isAdvancedSegmentAllowed("الباقة العادية", grants)).toBe(false);
    expect(isEscalationAllowedForPlan("باقة الأفراد", { ...grants, features: ["escalation"] })).toBe(true);

    expect(await isChannelAllowedForTenant("tenant-grants-feat", "youtube")).toBe(true);
    expect(await isChannelAllowedForTenant("tenant-grants-feat", "linkedin")).toBe(false);
    expect(await isChannelAllowedForTenant("tenant-grants", "youtube")).toBe(false);

    const access = await getPlanAccessForTenant("tenant-grants-feat");
    expect(access.allowedChannels).toContain("youtube");
    expect(access.botNodeTypes).toBe("*");
    expect(access.botMaxSteps).toBeNull();
    await expect(assertWithinPlanLimit("tenant-grants-feat", "branches")).resolves.toBeUndefined();
  });

  it("builds the list of what can be unlocked for each plan", async () => {
    const { grantableForPlan } = await import("../lib/plan-access");
    const individuals = grantableForPlan("باقة الأفراد", "whatsapp");
    expect(individuals.views).toContain("campaigns");
    expect(individuals.channels).toContain("instagram");
    expect(individuals.channels).not.toContain("whatsapp");
    expect(individuals.features).toContain("escalation");
    const enterprise = grantableForPlan("باقة الشركات", "*");
    expect(enterprise.views).toEqual([]);
    expect(enterprise.features).toEqual([]);
    expect(enterprise.channels).toEqual([]);
    expect(enterprise.limits).toEqual([]);
    expect(grantableForPlan("الباقة العادية", "whatsapp,instagram,telegram,email").limits).toContain("teams");
  });
});
