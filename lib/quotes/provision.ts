import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { PAYMENT_STATUS } from "../payment-status";
import { applyConfirmedCampaignPayment, applyConfirmedSubscriptionPayment, createTenantWithSubscription } from "../subscriptions";
import { addManualCampaignBalance } from "../campaign-engine";
import { DEFAULT_QUOTE_PLAN, formatSar, messagesSold, todayInRiyadh } from "./model";
import { getQuote, recordQuoteEvent } from "./store";

// What happens once a client has approved a quotation. Approval makes the workspace and sends the owner the activation link, and puts the
// amount in the payments as waiting; the workspace stays stopped until the platform team confirms the transfer, and only then is the
// subscription activated for the agreed period - the same payment path every other customer goes through, so the amount joins the totals.

export type StepResult = { ok: true; tenantId: string; creditedMessages?: number; warning?: string } | { ok: false; error: string; status: number };

/**
 * Creates the workspace (owner account and activation email included) and the payment waiting for confirmation. Safe to run again:
 * it only does what is still missing, and only one run does it at a time.
 */
export async function provisionQuoteWorkspace(quoteId: string, actor: string): Promise<StepResult> {
  const quote = await getQuote(quoteId);
  if (!quote) return { ok: false, error: "عرض السعر غير موجود", status: 404 };
  if (quote.status !== "approved") return { ok: false, error: "تُنشأ المساحة بعد اعتماد العميل للعرض فقط", status: 409 };
  if (quote.tenantId && quote.paymentId) return { ok: true, tenantId: quote.tenantId };
  if (quote.linkedExisting) return linkExistingClient(quote, actor);
  // Always the Individuals plan, unless the quote has a line for another plan.
  const planName = quote.planName || DEFAULT_QUOTE_PLAN;
  const plan = await prisma.plan.findUnique({ where: { name: planName } });
  if (!plan) return fail(quote.id, `الباقة «${planName}» غير موجودة`, 400);

  // One run at a time: whoever sets the mark first does the work.
  const claimed = await prisma.$executeRaw`UPDATE quotes SET provisioned_at = ${new Date().toISOString()} WHERE id = ${quote.id} AND provisioned_at = '' `;
  if (!claimed) return { ok: false, error: "جارٍ إنشاء المساحة", status: 409 };

  try {
    let tenantId = quote.tenantId;
    if (!tenantId) {
      const created = await createTenantWithSubscription({
        companyName: quote.customerName,
        ownerName: quote.contactName || quote.customerName,
        ownerEmail: quote.email,
        plan: plan.name,
        status: "متوقف",
        amount: Math.round(quote.subtotalHalalas / 100),
        billingCycle: quote.billingCycle,
        renewalAt: todayInRiyadh(),
        adminName: `عرض سعر ${quote.number}`
      });
      tenantId = created.subscription?.tenantId ?? "";
      if (!tenantId) throw new Error("تعذر إنشاء المساحة");
      await prisma.$executeRaw`UPDATE quotes SET tenant_id = ${tenantId}, updated_at = ${new Date().toISOString()} WHERE id = ${quote.id}`;
      await recordQuoteEvent(quote.id, "workspace_created", actor, tenantId);
    }
    const paymentId = `sub-pay-quote-${randomUUID()}`;
    await prisma.subscriptionPayment.create({
      data: {
        id: paymentId, tenantId,
        // The payments list shows what the client pays: the total with tax. (The subscription keeps the price without tax; see confirmQuotePayment.)
        amount: quote.totalHalalas / 100, amountHalalas: quote.totalHalalas,
        status: PAYMENT_STATUS.pending, createdAt: new Date().toISOString(),
        // The client's message balance is what the quote sells and nothing else, so this payment brings no plan allowance of its own
        // (the messages come from the quote when the payment is confirmed); later renewals use the plan's allowance as usual.
        planName: plan.name, planEmployeeLimit: plan.employeeLimit, planMessageQuota: 0, billingCycle: quote.billingCycle,
        gateway: "manual", gatewayStatus: "awaiting_transfer", initiatedBy: "quote",
        metadataJson: JSON.stringify({ kind: "quote", quoteId: quote.id, number: quote.number })
      }
    });
    await prisma.$executeRaw`UPDATE quotes SET payment_id = ${paymentId}, updated_at = ${new Date().toISOString()} WHERE id = ${quote.id}`;
    await recordQuoteEvent(quote.id, "payment_pending", actor, `${formatSar(quote.totalHalalas)} ر.س شامل الضريبة`);
    return { ok: true, tenantId };
  } catch (error) {
    // Let the next try start again from what is still missing.
    await prisma.$executeRaw`UPDATE quotes SET provisioned_at = '' WHERE id = ${quote.id}`;
    return fail(quote.id, error instanceof Error ? error.message : "تعذر إنشاء المساحة", 409);
  }
}

/**
 * A quote for a client who already has a workspace: nothing is made and nothing about their subscription changes. The amount is recorded on
 * their workspace as a messages payment waiting for confirmation (so it shows as due), and confirming it credits the quote's messages.
 */
async function linkExistingClient(quote: NonNullable<Awaited<ReturnType<typeof getQuote>>>, actor: string): Promise<StepResult> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: quote.tenantId }, select: { tenantId: true } });
  if (!subscription) return fail(quote.id, "مساحة العميل المرتبطة بالعرض غير موجودة", 404);
  const claimed = await prisma.$executeRaw`UPDATE quotes SET provisioned_at = ${new Date().toISOString()} WHERE id = ${quote.id} AND provisioned_at = '' `;
  if (!claimed) return { ok: false, error: "جارٍ تسجيل الدفعة", status: 409 };
  try {
    const paymentId = `cpay-quote-${randomUUID()}`;
    await prisma.campaignPayment.create({
      data: {
        id: paymentId, tenantId: quote.tenantId, messages: messagesSold(quote.lines),
        // What the client pays, tax included: this is what the payments list and its totals show.
        amount: quote.totalHalalas / 100, amountHalalas: quote.totalHalalas,
        status: PAYMENT_STATUS.pending, createdAt: new Date().toISOString(),
        gateway: "manual", gatewayStatus: "awaiting_transfer", initiatedBy: "quote",
        metadataJson: JSON.stringify({ kind: "quote", quoteId: quote.id, number: quote.number })
      }
    });
    await prisma.$executeRaw`UPDATE quotes SET payment_id = ${paymentId}, updated_at = ${new Date().toISOString()} WHERE id = ${quote.id}`;
    await recordQuoteEvent(quote.id, "payment_pending", actor, `${formatSar(quote.totalHalalas)} ر.س شامل الضريبة`);
    return { ok: true, tenantId: quote.tenantId };
  } catch (error) {
    await prisma.$executeRaw`UPDATE quotes SET provisioned_at = '' WHERE id = ${quote.id}`;
    return fail(quote.id, error instanceof Error ? error.message : "تعذر تسجيل الدفعة", 409);
  }
}

async function fail(quoteId: string, message: string, status: number): Promise<StepResult> {
  await recordQuoteEvent(quoteId, "provision_failed", "النظام", message);
  return { ok: false, error: message, status };
}

/** The platform team has the transfer: the payment is completed, the subscription is activated for the period and the amount counts as paid. */
export async function confirmQuotePayment(quoteId: string, actor: string): Promise<StepResult> {
  const quote = await getQuote(quoteId);
  if (!quote) return { ok: false, error: "عرض السعر غير موجود", status: 404 };
  if (quote.status !== "approved") return { ok: false, error: "تأكيد الدفع لعرض معتمد فقط", status: 409 };
  if (!quote.tenantId || !quote.paymentId) return { ok: false, error: "لم تُنشأ المساحة بعد", status: 409 };
  if (quote.paidAt) return { ok: false, error: "تم تأكيد الدفع مسبقًا", status: 409 };

  if (quote.linkedExisting) return confirmExistingClientPayment(quote, actor);

  const result = await applyConfirmedSubscriptionPayment(quote.paymentId, { gateway: "manual", gatewayStatus: "paid", paymentMethod: "تحويل بنكي" });
  if (!result.activated) return { ok: false, error: "تعذر تأكيد الدفعة (أُكدت مسبقًا أو غير موجودة)", status: 409 };
  // The payment above is the total with tax, but the subscription's price (what MRR and renewals are worked from) is the price without tax.
  await prisma.subscription.update({ where: { tenantId: quote.tenantId }, data: { amount: Math.round(quote.subtotalHalalas / 100) } });
  await prisma.$executeRaw`UPDATE quotes SET paid_at = ${new Date().toISOString()}, updated_at = ${new Date().toISOString()} WHERE id = ${quote.id}`;
  await recordQuoteEvent(quote.id, "payment_confirmed", actor, `${result.periodStart ?? ""} → ${result.periodEnd ?? ""}`);

  // The client's message balance is exactly what the quote sold, as bought credit that renewals keep.
  const messages = messagesSold(quote.lines);
  if (messages > 0) {
    try {
      await addManualCampaignBalance(quote.tenantId, messages, 0);
      await recordQuoteEvent(quote.id, "messages_credited", actor, `${messages.toLocaleString("en-US")} رسالة`);
      return { ok: true, tenantId: quote.tenantId, creditedMessages: messages };
    } catch {
      await recordQuoteEvent(quote.id, "credit_failed", "النظام", `${messages.toLocaleString("en-US")} رسالة`);
      return { ok: true, tenantId: quote.tenantId, warning: `فُعّل الاشتراك لكن تعذرت إضافة ${messages.toLocaleString("en-US")} رسالة للرصيد. أضفها يدويًا من «إضافة رصيد رسائل حملات».` };
    }
  }
  return { ok: true, tenantId: quote.tenantId, creditedMessages: 0 };
}

/** The transfer is confirmed for an existing client: the payment is completed and counted, and the messages the quote sold are credited. Their subscription is untouched. */
async function confirmExistingClientPayment(quote: NonNullable<Awaited<ReturnType<typeof getQuote>>>, actor: string): Promise<StepResult> {
  const result = await applyConfirmedCampaignPayment(quote.paymentId, { gateway: "manual", gatewayStatus: "paid", paymentMethod: "تحويل بنكي" });
  if (!result.credited) return { ok: false, error: "تعذر تأكيد الدفعة (أُكدت مسبقًا أو غير موجودة)", status: 409 };
  await prisma.$executeRaw`UPDATE quotes SET paid_at = ${new Date().toISOString()}, updated_at = ${new Date().toISOString()} WHERE id = ${quote.id}`;
  await recordQuoteEvent(quote.id, "payment_confirmed", actor, `${formatSar(quote.totalHalalas)} ر.س`);
  if (result.messages > 0) await recordQuoteEvent(quote.id, "messages_credited", actor, `${result.messages.toLocaleString("en-US")} رسالة`);
  return { ok: true, tenantId: quote.tenantId, creditedMessages: result.messages };
}
