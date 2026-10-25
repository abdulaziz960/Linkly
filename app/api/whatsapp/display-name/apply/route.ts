import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { getIntegrationSettings } from "../../../../../lib/database";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { consumeRateLimit } from "../../../../../lib/rate-limit";
import { logAdminAction, getTenantCompanyName } from "../../../../../lib/subscriptions";
import { fetchDisplayName, syncStoredDisplayName } from "../../../../../lib/whatsapp-display-name";
import { reRegisterWhatsAppNumber } from "../../../../../lib/whatsapp-registration";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/**
 * Puts an approved display name into use. Meta approves the name but only applies it once the number is registered again
 * ("Register your number to start using it"), so this registers it. { pin?: "123456" } is the two-step PIN when Meta asks.
 */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("تفعيل اسم العرض متاح لمالك الحساب فقط", 403);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const limit = await consumeRateLimit("whatsapp-display-name-apply", user.tenantId, 4, 60 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى لاحقًا", 429);

  const settings = await getIntegrationSettings("whatsapp", user.tenantId);
  if (!settings.phoneNumberId?.trim() || !settings.accessToken?.trim()) return jsonError("اربط واتساب أولًا", 400);
  const body = (await request.json().catch(() => null)) as { pin?: unknown } | null;
  const pin = typeof body?.pin === "string" && /^\d{6}$/.test(body.pin) ? body.pin : undefined;

  const result = await reRegisterWhatsAppNumber({ tenantId: user.tenantId, phoneNumberId: settings.phoneNumberId.trim(), accessToken: settings.accessToken.trim(), pin });
  if (result.status !== "registered") return jsonError(result.message, result.status === "needs_pin" ? 409 : 502);

  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم تفعيل اسم العرض المعتمد لواتساب (تسجيل الرقم من جديد) بواسطة ${user.name}.`, "معلومة", "القنوات");
  const info = await fetchDisplayName(settings.phoneNumberId.trim(), settings.accessToken.trim());
  if (info.ok && info.info.status === "approved") await syncStoredDisplayName(user.tenantId, info.info.verifiedName).catch(() => null);
  return jsonOk(info.ok ? info.info : null);
}
