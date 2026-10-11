import { prisma } from "./prisma";

// Meta's error code for "There was an error related to your payment
// method" - covers a missing/declined payment method or an exceeded credit
// line on the WhatsApp Business Account. Meta doesn't expose the actual
// amount owed to a tech-provider app like ours via the Graph API (that
// figure only shows inside the business's own Meta Business Suite), so we
// can only detect and surface THAT there's a payment problem, not how much.
const PAYMENT_ISSUE_ERROR_CODE = 131042;

/**
 * Meta's raw error text ("(#200) You do not have the necessary permission...")
 * is English and says nothing about what to do. The common send failures get a
 * short Arabic explanation with the fix; anything else keeps Meta's own text.
 */
export function friendlyWhatsAppError(payload: unknown, fallback: string): string {
  const error = (payload as { error?: { code?: number; error_subcode?: number; error_user_msg?: string; message?: string; fbtrace_id?: string } } | null | undefined)?.error;
  switch (error?.code) {
    case 200:
      return "صلاحيات ربط واتساب لهذا الحساب ناقصة (Meta رفضت الإرسال). أعد ربط قناة واتساب من «الإعدادات والربط» ووافق على كل الصلاحيات المطلوبة أثناء الربط.";
    case 190:
      return "انتهت صلاحية ربط واتساب أو أُلغيت. أعد ربط القناة من «الإعدادات والربط».";
    case 131030:
      return "هذا الرقم غير مسموح له باستقبال الرسائل حاليًا (حساب واتساب في وضع التجربة). أضفه كرقم تجريبي في Meta أو فعّل الحساب.";
    case 133010:
      return "رقم واتساب غير مسجل لدى Meta (133010). أكمل تسجيله من الإعدادات والربط قبل إرسال الرسائل.";
    default:
      if (error?.error_user_msg) return error.error_user_msg;
      if (error?.message && /^(an unknown error has occurred|something went wrong)\.?$/i.test(error.message.trim())) {
        const code = error.code !== undefined ? ` (رمز ${error.code}${error.error_subcode ? `/${error.error_subcode}` : ""})` : "";
        const trace = error.fbtrace_id ? ` رمز التتبع للدعم: ${error.fbtrace_id}.` : "";
        return `تعذر إرسال الرسالة عبر واتساب: أعادت Meta خطأ عامًا${code} دون توضيح السبب. جرّب بعد قليل، وإذا استمر الخطأ تواصل مع دعم Meta.${trace}`;
      }
      return error?.message || fallback;
  }
}

export function whatsappSendErrorCode(payload: unknown): number | undefined {
  const code = (payload as { error?: { code?: number } } | null | undefined)?.error?.code;
  return typeof code === "number" ? code : undefined;
}

/**
 * Called after every WhatsApp send attempt. Only writes to the database
 * when the payment-issue state actually changes, so a healthy account's
 * hot send path never pays for an extra query per message.
 */
export async function recordWhatsAppSendOutcome(params: {
  tenantId: string;
  ok: boolean;
  hadIssueFlag: boolean;
  errorCode?: number;
}) {
  if (!params.ok && params.errorCode === PAYMENT_ISSUE_ERROR_CODE && !params.hadIssueFlag) {
    await prisma.integrationSetting.updateMany({
      where: { tenantId: params.tenantId, provider: "whatsapp_cloud", whatsappPaymentIssueAt: "" },
      data: { whatsappPaymentIssueAt: new Date().toISOString() }
    }).catch(() => {});
    return;
  }
  if (params.ok && params.hadIssueFlag) {
    await prisma.integrationSetting.updateMany({
      where: { tenantId: params.tenantId, provider: "whatsapp_cloud", whatsappPaymentIssueAt: { not: "" } },
      data: { whatsappPaymentIssueAt: "" }
    }).catch(() => {});
  }
}
