import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { cleanSnapSettingsInput, getSnapAdsSettings, recentSnapEvents, saveSnapAdsSettings, SNAP_STAGES, type SnapSettingsInput } from "../../../../lib/snap-events";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const [settings, events] = await Promise.all([getSnapAdsSettings(user.tenantId), recentSnapEvents(user.tenantId)]);
  return jsonOk({ settings, statuses: SNAP_STAGES, events });
}

export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("إعدادات إعلانات سناب متاحة لمالك الحساب فقط", 403);

  const cleaned = cleanSnapSettingsInput(((await request.json().catch(() => null)) ?? {}) as SnapSettingsInput);
  if (!cleaned.ok) return jsonError(cleaned.error, 400);
  return jsonOk({ settings: await saveSnapAdsSettings(user.tenantId, cleaned.data) });
}
