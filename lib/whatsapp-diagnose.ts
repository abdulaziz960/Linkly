import { getIntegrationSettings } from "./database";

/**
 * "Why can't I send?" check for a connected WhatsApp number. Meta's #200
 * ("no permission to send messages on behalf of this WhatsApp Business
 * Account") almost always means the stored access token isn't allowed to act
 * on THE business account/number we have saved - this asks Meta directly and
 * says which part is missing, instead of guessing.
 */

export const TECH_PROVIDER_APP_ID = "1296230909161568";
const GRAPH = "https://graph.facebook.com/v22.0";

export type DiagnoseCheck = { id: string; label: string; status: "ok" | "fail" | "warn"; detail: string };
export type DiagnoseResult = { ok: boolean; checks: DiagnoseCheck[]; advice: string };

type GranularScope = { scope?: string; target_ids?: string[] };

async function graph(path: string, token: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const response = await fetch(`${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(12000) });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, data };
  } catch {
    return { ok: false, data: { error: { message: "NETWORK_ERROR" } } };
  }
}

function metaMessage(data: Record<string, unknown>) {
  const error = data.error as { message?: string; code?: number } | undefined;
  return error ? `${error.code ? `(#${error.code}) ` : ""}${error.message ?? ""}`.trim() : "";
}

export async function diagnoseWhatsApp(tenantId: string): Promise<DiagnoseResult> {
  const settings = await getIntegrationSettings("whatsapp", tenantId);
  const wabaId = settings.wabaId?.trim();
  const phoneNumberId = settings.phoneNumberId?.trim();
  const token = settings.accessToken?.trim();
  const checks: DiagnoseCheck[] = [];

  if (!wabaId || !phoneNumberId || !token) {
    checks.push({ id: "saved", label: "بيانات الربط المحفوظة", status: "fail", detail: "حساب واتساب غير مربوط بالكامل (ينقص رقم الحساب أو الرقم أو المفتاح)." });
    return { ok: false, checks, advice: "اربط واتساب من «الإعدادات والربط» حتى تكتمل البيانات." };
  }
  checks.push({ id: "saved", label: "بيانات الربط المحفوظة", status: "ok", detail: `حساب واتساب للأعمال ${wabaId} · الرقم ${phoneNumberId}` });

  // 1) Is the token valid and what is it allowed to do? (debug_token needs the app's own credentials)
  const appSecret = process.env.WHATSAPP_META_APP_SECRET || "";
  let messagingTargets: string[] | null = null;
  if (appSecret) {
    const debug = await graph(`/debug_token?input_token=${encodeURIComponent(token)}`, `${TECH_PROVIDER_APP_ID}|${appSecret}`);
    const info = (debug.data.data ?? {}) as { is_valid?: boolean; scopes?: string[]; granular_scopes?: GranularScope[]; expires_at?: number; error?: { message?: string } };
    if (!debug.ok || info.is_valid === false) {
      checks.push({ id: "token", label: "صلاحية المفتاح", status: "fail", detail: info.error?.message || metaMessage(debug.data) || "المفتاح غير صالح أو أُلغي." });
    } else {
      const scopes = info.scopes ?? [];
      const hasMessaging = scopes.includes("whatsapp_business_messaging");
      const hasManagement = scopes.includes("whatsapp_business_management");
      checks.push({ id: "token", label: "صلاحية المفتاح", status: "ok", detail: info.expires_at ? `المفتاح صالح (ينتهي ${new Date(info.expires_at * 1000).toLocaleDateString("ar-SA")}).` : "المفتاح صالح." });
      checks.push({
        id: "scopes",
        label: "صلاحيات الرسائل والإدارة",
        status: hasMessaging && hasManagement ? "ok" : "fail",
        detail: hasMessaging && hasManagement ? "يملك whatsapp_business_messaging و whatsapp_business_management." : `ينقص: ${[!hasMessaging && "whatsapp_business_messaging", !hasManagement && "whatsapp_business_management"].filter(Boolean).join("، ")}`
      });
      const messaging = (info.granular_scopes ?? []).find((scope) => scope.scope === "whatsapp_business_messaging");
      messagingTargets = messaging?.target_ids ?? null;
      if (messagingTargets) {
        const covered = messagingTargets.includes(wabaId);
        checks.push({
          id: "target",
          label: "المفتاح مخوَّل على هذا الحساب",
          status: covered ? "ok" : "fail",
          detail: covered ? "المفتاح مخوَّل على حساب واتساب للأعمال المحفوظ." : `المفتاح مخوَّل على حسابات أخرى (${messagingTargets.join("، ") || "لا شيء"}) وليس على ${wabaId}. وهذا هو سبب الخطأ #200 غالبًا: لم تُحدَّد هذه الحساب أثناء الربط.`
        });
      }
    }
  } else {
    checks.push({ id: "token", label: "فحص المفتاح لدى Meta", status: "warn", detail: "تعذر فحص المفتاح من الخادم (إعداد سري التطبيق غير موجود). سيُكمل الفحص بقية الاختبارات." });
  }

  // 2) Does this token see the business account's numbers, and is ours among them?
  const numbers = await graph(`/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, token);
  if (!numbers.ok) {
    checks.push({ id: "numbers", label: "الوصول لأرقام الحساب", status: "fail", detail: metaMessage(numbers.data) || "تعذر قراءة أرقام الحساب بهذا المفتاح." });
  } else {
    const list = ((numbers.data.data ?? []) as Array<{ id?: string; display_phone_number?: string }>);
    const found = list.some((item) => item.id === phoneNumberId);
    checks.push({
      id: "numbers",
      label: "الرقم المحفوظ تابع للحساب",
      status: found ? "ok" : "fail",
      detail: found ? "الرقم المحفوظ تابع لهذا الحساب." : `الرقم المحفوظ (${phoneNumberId}) غير موجود ضمن أرقام هذا الحساب (${list.map((item) => item.display_phone_number || item.id).join("، ") || "لا أرقام"}).`
    });
  }

  // 3) Is our app subscribed to the account's webhooks?
  const subscribed = await graph(`/${wabaId}/subscribed_apps`, token);
  if (subscribed.ok) {
    const apps = ((subscribed.data.data ?? []) as Array<{ whatsapp_business_api_data?: { id?: string }; id?: string }>);
    const ours = apps.some((item) => (item.whatsapp_business_api_data?.id ?? item.id) === TECH_PROVIDER_APP_ID);
    checks.push({ id: "subscribed", label: "ربط التطبيق بأحداث الحساب", status: ours ? "ok" : "warn", detail: ours ? "تطبيق لنكلي مشترك في أحداث الحساب (استقبال الرسائل)." : "تطبيق لنكلي غير مشترك في أحداث هذا الحساب، فقد لا تصل الرسائل الواردة." });
  }

  const failed = checks.filter((check) => check.status === "fail");
  let advice = "كل الفحوصات سليمة. إن استمر الخطأ فجرّب بعد دقائق أو أرسل لنا المعرّفات أعلاه.";
  if (failed.some((check) => check.id === "target" || check.id === "numbers")) {
    advice = "أعد ربط واتساب، وفي نافذة Meta **اختر حساب واتساب للأعمال والرقم نفسه** وفعّل كل الصلاحيات المعروضة (الرسائل والإدارة).";
  } else if (failed.some((check) => check.id === "scopes")) {
    advice = "أعد ربط واتساب ووافق على كل الصلاحيات في نافذة Meta (لا تحذف أي صلاحية).";
  } else if (failed.some((check) => check.id === "token")) {
    advice = "المفتاح غير صالح. أعد ربط واتساب من «الإعدادات والربط».";
  }
  return { ok: failed.length === 0, checks, advice };
}
