import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { GATEWAY_KEY_PATTERN, getPublicCatalogSettings, saveCatalogSettings } from "../../../../lib/catalog";
import { isPubliclyRoutableUrl } from "../../../../lib/url-safety";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  return jsonOk({ ...(await getPublicCatalogSettings(user.tenantId)), canManagePayment: user.role === "مالك الحساب" });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as {
    paymentEnabled?: unknown;
    gatewaySecretKey?: unknown;
    clearGatewayKey?: unknown;
    feedUrl?: unknown;
    feedIntervalMinutes?: unknown;
  } | null;
  if (!body) return jsonError("طلب غير صالح", 400);

  const touchesPayment = body.paymentEnabled !== undefined || body.gatewaySecretKey !== undefined || body.clearGatewayKey !== undefined;
  // Payment settings decide where customers' money goes - owner only, like
  // the AI provider key (app/api/ai/settings/route.ts).
  if (touchesPayment && user.role !== "مالك الحساب") return jsonError("إعدادات الدفع متاحة لمالك الحساب فقط", 403);

  const patch: Parameters<typeof saveCatalogSettings>[1] = {};

  if (body.paymentEnabled !== undefined) {
    if (typeof body.paymentEnabled !== "boolean") return jsonError("قيمة تفعيل الدفع غير صالحة", 400);
    patch.paymentEnabled = body.paymentEnabled;
  }
  if (body.clearGatewayKey === true) patch.clearGatewayKey = true;
  if (body.gatewaySecretKey !== undefined) {
    if (typeof body.gatewaySecretKey !== "string") return jsonError("مفتاح بوابة الدفع غير صالح", 400);
    const key = body.gatewaySecretKey.trim();
    if (key) {
      if (key.startsWith("enc:") || !GATEWAY_KEY_PATTERN.test(key)) {
        return jsonError("مفتاح بوابة الدفع غير صالح - استخدم المفتاح السري (Secret Key) من ميسر، ويبدأ بـ sk_live_ أو sk_test_", 400);
      }
      patch.gatewaySecretKey = key;
    }
  }
  if (body.feedUrl !== undefined) {
    if (typeof body.feedUrl !== "string") return jsonError("رابط الملف غير صالح", 400);
    const feedUrl = body.feedUrl.trim();
    if (feedUrl) {
      if (feedUrl.length > 2000 || !(await isPubliclyRoutableUrl(feedUrl))) {
        return jsonError("رابط ملف المنتجات غير صالح - يجب أن يكون رابطًا عامًا يبدأ بـ http أو https", 400);
      }
    }
    patch.feedUrl = feedUrl;
  }
  if (body.feedIntervalMinutes !== undefined) {
    const minutes = Number(body.feedIntervalMinutes);
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 10080) return jsonError("مدة المزامنة يجب أن تكون بين 15 دقيقة وأسبوع", 400);
    patch.feedIntervalMinutes = minutes;
  }

  await saveCatalogSettings(user.tenantId, patch);
  if (touchesPayment) {
    // Never log the key itself - only that payment settings changed.
    await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم تعديل إعدادات دفع الكتالوج بواسطة ${user.name}.`, "تنبيه", "الكتالوج");
  }
  return jsonOk({ ...(await getPublicCatalogSettings(user.tenantId)), canManagePayment: user.role === "مالك الحساب" });
}
