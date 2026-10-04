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
    expect(saved.sort()).toEqual(["catalog", "knowledgeBase"]);
    expect((await listTenantGrants(tenantId)).sort()).toEqual(["catalog", "knowledgeBase"]);
    expect(await listTenantGrants(otherTenant)).toEqual([]);
  });

  it("opens the page, its cap and its bot step for that workspace only", async () => {
    const { isViewLockedForTenant, getPlanAccessForTenant, assertWithinPlanLimit, PlanLimitError } = await import("../lib/plan-access-server");
    const { userHasViewPermission } = await import("../lib/permissions-server");
    const { validateBotNodesForPlan } = await import("../lib/plan-access");
    const { listTenantGrants } = await import("../lib/plan-grants");

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

    const granted = await listTenantGrants(tenantId);
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
    const response = await PUT(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ views: ["catalog"] }) }) as never, { params: Promise.resolve({ id: tenantId }) });
    expect(response.status).toBe(403);
    vi.doUnmock("../lib/admin-auth");
  });
});
