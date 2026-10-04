import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { getSubscriptionForTenant, logAdminAction } from "../../../../../../lib/subscriptions";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { listTenantGrants, setTenantGrants } from "../../../../../../lib/plan-grants";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id: tenantId } = await params;
  return jsonOk({ granted: await listTenantGrants(tenantId) });
}

/** Replaces the pages unlocked for this client beyond their plan: `{ views: ["catalog", ...] }`. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId } = await params;
  const body = (await request.json().catch(() => null)) as { views?: unknown } | null;
  if (!body || !Array.isArray(body.views)) return jsonError("بيانات غير صالحة", 400);

  const subscription = await getSubscriptionForTenant(tenantId);
  if (!subscription) return jsonError("العميل غير موجود", 404);

  const granted = await setTenantGrants(tenantId, body.views.filter((view): view is string => typeof view === "string"), admin.name, subscription.plan);
  await logAdminAction(tenantId, subscription.companyName, `تحديث صفحات مفتوحة استثنائيًا خارج الباقة (${granted.length}) بواسطة ${admin.name}`);
  await recordAdminAction(admin, "update-feature-grants", { type: "tenant", id: tenantId }, JSON.stringify({ views: granted }));
  return jsonOk({ granted });
}
