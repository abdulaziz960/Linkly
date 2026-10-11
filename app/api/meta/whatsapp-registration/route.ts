import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings } from "../../../../lib/database";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { ensureWhatsAppNumberRegistered, fetchPhoneStatus, getRegistrationState } from "../../../../lib/whatsapp-registration";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** Is the connected WhatsApp number registered with Meta (Connected), and if not, why. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const settings = await getIntegrationSettings("whatsapp", user.tenantId);
  if (!settings.phoneNumberId || !settings.accessToken) return jsonOk({ status: "unknown", message: "" });

  // Meta is the source of truth: a number fixed from WhatsApp Manager is reported as registered at once.
  if ((await fetchPhoneStatus(settings.phoneNumberId, settings.accessToken)) === "CONNECTED") {
    return jsonOk({ status: "registered", message: "الرقم مسجل ومتصل لدى Meta." });
  }
  const saved = await getRegistrationState(settings.phoneNumberId).catch(() => null);
  return jsonOk(saved ? { status: saved.status === "registered" ? "failed" : saved.status, message: saved.message } : { status: "failed", message: "الرقم غير مسجل لدى Meta بعد." });
}

/** Tries the automatic registration again (the owner's "retry" button). */
export async function POST(request: NextRequest) {
  void request;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("تسجيل رقم واتساب متاح لمالك الحساب فقط", 403);

  const settings = await getIntegrationSettings("whatsapp", user.tenantId);
  if (!settings.phoneNumberId || !settings.accessToken) return jsonError("أكمل ربط حساب واتساب ورقمه أولًا", 400);

  const limit = await consumeRateLimit("whatsapp-register-auto", user.tenantId, 3, 60 * 60 * 1000);
  if (!limit.allowed) return jsonError("بلغت حد محاولات تسجيل الرقم. حاول لاحقًا", 429);

  const state = await ensureWhatsAppNumberRegistered({ tenantId: user.tenantId, phoneNumberId: settings.phoneNumberId, accessToken: settings.accessToken });
  return jsonOk({ status: state.status, message: state.message });
}
