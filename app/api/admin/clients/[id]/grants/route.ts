import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { prisma } from "../../../../../../lib/prisma";
import { getSubscriptionForTenant, logAdminAction } from "../../../../../../lib/subscriptions";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { getTenantGrants, setTenantGrants } from "../../../../../../lib/plan-grants";
import { encodeGrantKeys } from "../../../../../../lib/plan-access";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id: tenantId } = await params;
  return jsonOk({ granted: encodeGrantKeys(await getTenantGrants(tenantId)) });
}

/**
 * Replaces everything unlocked for this client beyond their plan:
 * `{ keys: ["catalog", "feature:escalation", "channel:youtube", "limit:branches", ...] }`.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId } = await params;
  const body = (await request.json().catch(() => null)) as { keys?: unknown } | null;
  if (!body || !Array.isArray(body.keys)) return jsonError("بيانات غير صالحة", 400);

  const subscription = await getSubscriptionForTenant(tenantId);
  if (!subscription) return jsonError("العميل غير موجود", 404);
  const plan = await prisma.plan.findUnique({ where: { name: subscription.plan }, select: { allowedChannels: true } });

  const granted = await setTenantGrants(tenantId, body.keys.filter((key): key is string => typeof key === "string"), admin.name, subscription.plan, plan?.allowedChannels ?? null);
  const keys = encodeGrantKeys(granted);
  await logAdminAction(tenantId, subscription.companyName, `تحديث المزايا المفتوحة استثنائيًا خارج الباقة (${keys.length}) بواسطة ${admin.name}`);
  await recordAdminAction(admin, "update-feature-grants", { type: "tenant", id: tenantId }, JSON.stringify({ keys }));
  return jsonOk({ granted: keys });
}
