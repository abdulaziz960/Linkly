import { outboundSignal } from "./outbound-timeout";

/**
 * SMS through Taqnyat (https://dev.taqnyat.sa/ar/doc/sms/): Bearer token in the Authorization header, POST /v1/messages with
 * recipients / body / sender, GET /account/balance. The workspace's own API key and approved sender name are used.
 */
const BASE_URL = "https://api.taqnyat.sa";

export type SmsCredentials = { apiKey: string; sender: string };

/** The key and sender saved in the workspace's SMS settings (API key in accessToken, sender name in phoneNumber), or null when incomplete. */
export function smsCredentials(settings: { accessToken?: string | null; phoneNumber?: string | null }): SmsCredentials | null {
  const apiKey = settings.accessToken?.trim();
  const sender = settings.phoneNumber?.trim();
  return apiKey && sender ? { apiKey, sender } : null;
}

/** International format without "00" or "+": "0551234567" -> "966551234567". Returns "" when it cannot be a mobile number. */
export function taqnyatNumber(value: string): string {
  let digits = String(value ?? "").replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;
  return digits.length >= 9 && digits.length <= 15 ? digits : "";
}

/** Taqnyat's English error texts, said to the user in Arabic. Anything else is shown as Taqnyat wrote it. */
export function taqnyatErrorMessage(raw: string, status: number): string {
  const text = raw.toLowerCase();
  if (status === 401 || /unauthor|invalid (token|credential)/.test(text)) return "مفتاح API غير صحيح. تأكد من مفتاح تقنيات في الإعدادات.";
  if (/balance/.test(text)) return "رصيد تقنيات غير كافٍ. اشحن الرصيد من حسابك في تقنيات.";
  if (/sender/.test(text)) return "اسم المرسل غير معتمد أو غير فعّال في تقنيات. تأكد من الاسم (حساس لحالة الأحرف).";
  if (/recipient|number/.test(text)) return "رقم الجوال غير صحيح. اكتبه بالصيغة الدولية (مثل 9665xxxxxxxx).";
  if (/ip|country|disabled|not authorized|not allowed/.test(text)) return "تقنيات رفضت الإرسال: تحقق من إعدادات الأمان (الإرسال عبر API، والعناوين والدول المسموحة).";
  if (/maintenance|temporar/.test(text) || status >= 500) return "خدمة تقنيات غير متاحة مؤقتًا. حاول بعد قليل.";
  return raw ? `تعذر إرسال الرسالة عبر تقنيات: ${raw}` : `تعذر إرسال الرسالة عبر تقنيات (${status})`;
}

export type TaqnyatSendResult = { messageId: string; cost: number | null; currency: string };

export async function sendSms({ apiKey, sender, to, text }: SmsCredentials & { to: string; text: string }): Promise<TaqnyatSendResult> {
  const recipient = taqnyatNumber(to);
  if (!recipient) throw new Error("رقم الجوال غير صحيح. اكتبه بالصيغة الدولية (مثل 9665xxxxxxxx).");
  const response = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    signal: outboundSignal(),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ recipients: [recipient], body: text, sender })
  });
  const payload = await response.json().catch(() => null) as { message?: string; messageId?: number | string; cost?: number | string; currency?: string; rejected?: unknown[] | string } | null;
  if (!response.ok) throw new Error(taqnyatErrorMessage(String(payload?.message ?? ""), response.status));
  const rejected = Array.isArray(payload?.rejected) ? payload.rejected.length : 0;
  if (rejected > 0) throw new Error("رفضت تقنيات الرقم. تأكد أنه رقم جوال صحيح يدعمه المرسل.");
  const cost = Number(payload?.cost);
  return { messageId: String(payload?.messageId ?? ""), cost: Number.isFinite(cost) ? cost : null, currency: String(payload?.currency ?? "SAR") };
}

export type TaqnyatAccount = { ok: true; balance: number | null; currency: string; status: string } | { ok: false; error: string };

/** Checks the key against Taqnyat (GET /account/balance) and returns the balance. */
export async function getSmsAccount(apiKey: string): Promise<TaqnyatAccount> {
  try {
    const response = await fetch(`${BASE_URL}/account/balance`, { signal: outboundSignal(), headers: { Authorization: `Bearer ${apiKey}` } });
    const payload = await response.json().catch(() => null) as { message?: string; balance?: number | string; currency?: string; accountStatus?: string } | null;
    if (!response.ok) return { ok: false, error: taqnyatErrorMessage(String(payload?.message ?? ""), response.status) };
    const balance = Number(payload?.balance);
    return { ok: true, balance: Number.isFinite(balance) ? balance : null, currency: String(payload?.currency ?? "SAR"), status: String(payload?.accountStatus ?? "") };
  } catch {
    return { ok: false, error: "تعذر الاتصال بتقنيات للتحقق من المفتاح." };
  }
}
