import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings } from "../../../../lib/database";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("تسجيل رقم واتساب متاح لمالك الحساب فقط", 403);

  const body = await request.json().catch(() => null) as { pin?: unknown } | null;
  const pin = body?.pin;
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
    return jsonError("أدخل رمز التحقق بخطوتين المكوّن من 6 أرقام", 400);
  }

  const settings = await getIntegrationSettings("whatsapp", user.tenantId);
  if (!settings.phoneNumberId || !settings.accessToken || !settings.wabaId) {
    return jsonError("أكمل ربط حساب واتساب ورقمه أولًا", 400);
  }

  const limit = await consumeRateLimit("whatsapp-register", user.tenantId, 3, 60 * 60 * 1000);
  if (!limit.allowed) return jsonError("بلغت حد محاولات تسجيل الرقم. حاول لاحقًا", 429);

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${settings.phoneNumberId}/register`, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin })
    });
    const payload = await response.json().catch(() => null) as {
      success?: boolean;
      error?: { code?: number; message?: string; fbtrace_id?: string };
    } | null;

    if (!response.ok || payload?.success !== true) {
      const error = payload?.error;
      if (error?.code === 133015) {
        return jsonError("Meta طلبت الانتظار بضع دقائق قبل محاولة تسجيل الرقم مرة أخرى. لا تكرر المحاولة الآن.", 429);
      }
      const code = error?.code ? ` (رمز ${error.code})` : "";
      const trace = error?.fbtrace_id ? ` رمز التتبع: ${error.fbtrace_id}` : "";
      return jsonError(`تعذر تسجيل رقم واتساب لدى Meta${code}: ${error?.message || "لم تؤكد Meta نجاح التسجيل"}.${trace}`, response.ok ? 502 : response.status);
    }

    try {
      const { recordManualRegistration } = await import("../../../../lib/whatsapp-registration");
      await recordManualRegistration({ tenantId: user.tenantId, phoneNumberId: settings.phoneNumberId, pin });
    } catch (error) {
      console.error("Could not remember the WhatsApp registration", error);
    }

    return jsonOk({ message: "تم تسجيل رقم واتساب لدى Meta. يمكنك الآن تجربة الرد على العميل." });
  } catch (error) {
    console.error("WhatsApp number registration request failed", error);
    return jsonError("تعذر الاتصال بـMeta لتسجيل الرقم. حاول بعد قليل", 502);
  }
}
