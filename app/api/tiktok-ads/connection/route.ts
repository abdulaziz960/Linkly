import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getAppOrigin } from "../../../../lib/app-url";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { disconnectTikTokLeads, getTikTokLeadConnection, selectTikTokAdvertiser, tiktokAdsConfigured } from "../../../../lib/tiktok-leads";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const connection = await getTikTokLeadConnection(user.tenantId);
  const selectedId = Object.keys(connection?.subscriptions ?? {})[0] ?? "";
  return jsonOk({
    configured: tiktokAdsConfigured(),
    authorized: Boolean(connection),
    // Receiving leads only once an ad account is chosen.
    connected: Boolean(selectedId),
    advertisers: connection?.advertisers ?? [],
    selectedId
  });
}

/** Chooses the ad account that sends this workspace its leads. */
export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("اختيار الحساب الإعلاني متاح لمالك الحساب فقط", 403);
  const body = await request.json().catch(() => null) as { advertiserId?: unknown } | null;
  const advertiserId = typeof body?.advertiserId === "string" ? body.advertiserId.trim() : "";
  if (!advertiserId) return jsonError("اختر الحساب الإعلاني", 400);
  const result = await selectTikTokAdvertiser(user.tenantId, getAppOrigin(request), advertiserId);
  if (!result.ok) {
    console.error("TikTok Ads lead subscription failed", result.error);
    return jsonError("تعذّر الاشتراك في وصول العملاء من هذا الحساب. تأكد أنك مدير (Admin) له في تيك توك وأعد المحاولة.", 400);
  }
  return jsonOk({ connected: true, selectedId: advertiserId });
}

export async function DELETE(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("فك الربط متاح لمالك الحساب فقط", 403);
  await disconnectTikTokLeads(user.tenantId);
  return jsonOk({ connected: false });
}
