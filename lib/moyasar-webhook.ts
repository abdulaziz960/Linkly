import { prisma } from "./prisma";
import { fetchMoyasarInvoice, summarizeMoyasarInvoice, verifyMoyasarWebhookSecret } from "./moyasar";
import type { PaymentKind } from "./payment-status";
import { applyVerifiedGatewayOutcome, expectedHalalas, getTenantCompanyName, invoiceAmountMatches, logAdminAction } from "./subscriptions";

/**
 * Both notification shapes Moyasar can send to the same URL:
 *  - the invoice's own callback_url (set by us at creation): the raw
 *    invoice object, no secret_token;
 *  - the account-level "Payments Webhooks" (dashboard-configured): an
 *    envelope with `type`, `secret_token` and the payment under `data`,
 *    where `data.invoice_id` points back at our invoice.
 */
export type MoyasarWebhookBody = {
  type?: string;
  secret_token?: string;
  id?: string;
  invoice_id?: string;
  status?: string;
  data?: { id?: string; invoice_id?: string; status?: string; metadata?: Record<string, string> };
} | null;

export type MoyasarWebhookResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

export function extractInvoiceId(body: MoyasarWebhookBody) {
  return body?.data?.invoice_id || body?.invoice_id || body?.data?.id || body?.id || "";
}

/**
 * Single code path behind /api/admin/subscriptions/payment-webhook and
 * /api/campaigns/payment-webhook. Regardless of which shape arrives, and
 * regardless of whether secret_token was present, only the invoice id is
 * taken from the payload; the invoice's real status and amount are then
 * fetched from Moyasar with our own secret key. Nothing in a webhook body
 * is ever trusted for a money decision.
 *
 * Always answers 200 for events that are ours but need no action (already
 * processed, transitional status, unknown invoice) so Moyasar doesn't keep
 * retrying; 401 only for a present-but-wrong secret_token.
 */
export async function processMoyasarInvoiceWebhook(kind: PaymentKind, body: MoyasarWebhookBody): Promise<MoyasarWebhookResult> {
  const tag = `[moyasar:${kind === "subscription" ? "subscriptions" : "campaigns"}-webhook]`;

  if (body?.secret_token && !verifyMoyasarWebhookSecret(body.secret_token)) {
    console.error(`${tag} rejected - secret_token mismatch`);
    return { httpStatus: 401, body: { error: "Unauthorized webhook" } };
  }

  const invoiceId = extractInvoiceId(body);
  if (!invoiceId) {
    console.error(`${tag} skipped - no invoice id`, JSON.stringify(body));
    return { httpStatus: 200, body: { ok: true, skipped: true, reason: "no_invoice_id" } };
  }

  const payment = kind === "subscription"
    ? await prisma.subscriptionPayment.findFirst({ where: { moyasarId: invoiceId } })
    : await prisma.campaignPayment.findFirst({ where: { moyasarId: invoiceId } });
  if (!payment) {
    console.error(`${tag} no payment row found for moyasarId=${invoiceId}`);
    return { httpStatus: 200, body: { ok: true, skipped: true, reason: "unknown_invoice" } };
  }

  const invoice = await fetchMoyasarInvoice(invoiceId);
  if (!invoice?.status) {
    console.error(`${tag} could not verify invoice ${invoiceId} against Moyasar`);
    return { httpStatus: 200, body: { ok: true, skipped: true, reason: "unverified" } };
  }

  if (invoice.status === "paid" && !invoiceAmountMatches(invoice.amount, payment)) {
    console.error(`${tag} amount mismatch for ${invoiceId}: invoice=${invoice.amount} expected=${expectedHalalas(payment)}`);
    await logAdminAction(
      payment.tenantId,
      await getTenantCompanyName(payment.tenantId),
      `تعارض مبلغ في دفعة ${kind === "subscription" ? "اشتراك" : "شحن رسائل"}: فاتورة Moyasar ${invoiceId} بقيمة ${invoice.amount} هللة بينما الدفعة المسجلة ${expectedHalalas(payment)} هللة. لم يتم تفعيل أي مزايا - تحقق يدويًا.`,
      "خطأ"
    );
    return { httpStatus: 200, body: { ok: true, skipped: true, reason: "amount_mismatch" } };
  }

  const details = summarizeMoyasarInvoice(invoice);
  const { outcome, changed } = await applyVerifiedGatewayOutcome(kind, payment.id, invoice.status, details);

  if (outcome === "pending") {
    console.error(`${tag} skipped - invoice ${invoiceId} still ${invoice.status}`);
    return { httpStatus: 200, body: { ok: true, skipped: true, reason: "not_final", status: invoice.status } };
  }
  if (!changed) {
    return { httpStatus: 200, body: { ok: true, alreadyProcessed: true, outcome } };
  }

  if (outcome === "completed") {
    const companyName = await getTenantCompanyName(payment.tenantId);
    const method = details.paymentMethod ? ` (${details.paymentMethod})` : "";
    await logAdminAction(
      payment.tenantId,
      companyName,
      kind === "subscription"
        ? `تم استلام دفعة اشتراك بقيمة ${payment.amount} ر.س عبر Moyasar${method}، وتم تجديد الاشتراك.`
        : `تم استلام دفعة شحن رسائل بقيمة ${payment.amount} ر.س عبر Moyasar${method}، وتمت إضافة ${"messages" in payment ? payment.messages.toLocaleString("en-US") : ""} رسالة إلى الرصيد.`
    );
  } else if (outcome === "failed") {
    console.error(`${tag} payment ${payment.id} failed: ${details.failureReason || invoice.status}`);
  }

  return { httpStatus: 200, body: { ok: true, outcome } };
}
