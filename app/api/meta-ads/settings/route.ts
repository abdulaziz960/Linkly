import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { cleanMetaSettingsInput, disconnectMetaAds, getMetaAdsSettings, META_STAGES, recentMetaEvents, saveMetaAdsSettings, type MetaSettingsInput } from "../../../../lib/meta-events";
import { jsonError, jsonOk } from "../../_utils/json";
import { adEventsBlockedMessage } from "../../../../lib/plan-access-server";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const [settings, events] = await Promise.all([getMetaAdsSettings(user.tenantId), recentMetaEvents(user.tenantId)]);
  return jsonOk({ settings, statuses: META_STAGES, events });
}

export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("إعدادات إعلانات ميتا متاحة لمالك الحساب فقط", 403);

  {
    const existing = await getMetaAdsSettings(user.tenantId);
    const blocked = await adEventsBlockedMessage(user.tenantId, "meta", existing.enabled || Boolean(existing.datasetId));
    if (blocked) return jsonError(blocked, 403);
  }
  const cleaned = cleanMetaSettingsInput(((await request.json().catch(() => null)) ?? {}) as MetaSettingsInput);
  if (!cleaned.ok) return jsonError(cleaned.error, 400);
  return jsonOk({ settings: await saveMetaAdsSettings(user.tenantId, cleaned.data) });
}

export async function DELETE(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("متاح لمالك الحساب فقط", 403);
  await disconnectMetaAds(user.tenantId);
  return jsonOk({ settings: await getMetaAdsSettings(user.tenantId) });
}
