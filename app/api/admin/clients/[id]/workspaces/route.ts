import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { getSubscriptionForTenant, logAdminAction } from "../../../../../../lib/subscriptions";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { jsonError, jsonOk } from "../../../../_utils/json";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { EXTRA_PROJECT_PRICE_SAR, extraProjectsMonthlyCharge, projectQuota, workspacesEligiblePlans } from "../../../../../../lib/workspaces/feature";
import { getWorkspaceAddon, setWorkspaceAddon } from "../../../../../../lib/workspaces/addon-store";
import { getGroupContext } from "../../../../../../lib/workspaces/store";

export const runtime = "nodejs";

async function describe(tenantId: string, plan: string) {
  const addon = await getWorkspaceAddon(tenantId);
  const quota = projectQuota(plan, addon.extraProjects);
  const group = await getGroupContext(tenantId);
  return {
    plan,
    planSupportsProjects: workspacesEligiblePlans().includes(plan),
    enabled: addon.enabled,
    extraProjects: addon.extraProjects,
    includedByPlan: quota.included,
    maxProjects: quota.maxProjects,
    projectsUsed: group ? group.projects.filter((project) => !project.archived).length : 1,
    unitPrice: EXTRA_PROJECT_PRICE_SAR,
    monthlyAddition: extraProjectsMonthlyCharge(addon.extraProjects)
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id: tenantId } = await params;
  const subscription = await getSubscriptionForTenant(tenantId);
  if (!subscription) return jsonError("العميل غير موجود", 404);
  return jsonOk(await describe(tenantId, subscription.plan));
}

/** `{ enabled: boolean, extraProjects: number }`: whether this account may use projects, and how many extra ones it bought. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id: tenantId } = await params;
  const body = (await request.json().catch(() => null)) as { enabled?: unknown; extraProjects?: unknown } | null;
  if (!body || typeof body.enabled !== "boolean") return jsonError("بيانات غير صالحة", 400);
  const extra = Number(body.extraProjects ?? 0);
  if (!Number.isInteger(extra) || extra < 0 || extra > 50) return jsonError("عدد المشاريع الإضافية بين 0 و50", 400);

  const subscription = await getSubscriptionForTenant(tenantId);
  if (!subscription) return jsonError("العميل غير موجود", 404);
  if ((body.enabled || extra > 0) && !workspacesEligiblePlans().includes(subscription.plan)) return jsonError("باقة العميل لا تدعم المشاريع (من باقة المؤسسات الصغيرة فما فوق)", 400);

  await setWorkspaceAddon(tenantId, { enabled: body.enabled, extraProjects: extra }, admin.name);
  await logAdminAction(tenantId, subscription.companyName, `مساحات العمل: ${body.enabled ? "مفعّلة" : "غير مفعّلة"}، مشاريع إضافية مشتراة: ${extra}، بواسطة ${admin.name}`);
  await recordAdminAction(admin, "update-workspaces-addon", { type: "tenant", id: tenantId }, JSON.stringify({ enabled: body.enabled, extraProjects: extra }));
  return jsonOk(await describe(tenantId, subscription.plan));
}
