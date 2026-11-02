import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { PAYMENT_STATUS } from "../payment-status";
import { applyConfirmedSubscriptionPayment, createTenantWithSubscription } from "../subscriptions";
import { formatSar, todayInRiyadh } from "./model";
import { getQuote, recordQuoteEvent } from "./store";

// What happens once a client has approved a quotation. Approval makes the workspace and sends the owner the activation link, and puts the
// amount in the payments as waiting; the workspace stays stopped until the platform team confirms the transfer, and only then is the
// subscription activated for the agreed period - the same payment path every other customer goes through, so the amount joins the totals.

export type StepResult = { ok: true; tenantId: string } | { ok: false; error: string; status: number };

/**
 * Creates the workspace (owner account and activation email included) and the payment waiting for confirmation. Safe to run again:
 * it only does what is still missing, and only one run does it at a time.
 */
export async function provisionQuoteWorkspace(quoteId: string, actor: string): Promise<StepResult> {
  const quote = await getQuote(quoteId);
  if (!quote) return { ok: false, error: "عرض السعر غير موجود", status: 404 };
  if (quote.status !== "approved") return { ok: false, error: "تُنشأ المساحة بعد اعتماد العميل للعرض فقط", status: 409 };
  if (quote.tenantId && quote.paymentId) return { ok: true, tenantId: quote.tenantId };
  if (!quote.planName) return fail(quote.id, "اختر الباقة المرتبطة بالمساحة في عرض السعر ثم أعد المحاولة", 400);
  const plan = await prisma.plan.findUnique({ where: { name: quote.planName } });
  if (!plan) return fail(quote.id, `الباقة «${quote.planName}» غير موجودة`, 400);

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
        // The price without tax, in riyals, like every other subscription payment; what is to be paid (with tax) is amountHalalas.
        amount: quote.subtotalHalalas / 100, amountHalalas: quote.totalHalalas,
        status: PAYMENT_STATUS.pending, createdAt: new Date().toISOString(),
        planName: plan.name, planEmployeeLimit: plan.employeeLimit, planMessageQuota: plan.messageQuota, billingCycle: quote.billingCycle,
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

  const result = await applyConfirmedSubscriptionPayment(quote.paymentId, { gateway: "manual", gatewayStatus: "paid", paymentMethod: "تحويل بنكي" });
  if (!result.activated) return { ok: false, error: "تعذر تأكيد الدفعة (أُكدت مسبقًا أو غير موجودة)", status: 409 };
  await prisma.$executeRaw`UPDATE quotes SET paid_at = ${new Date().toISOString()}, updated_at = ${new Date().toISOString()} WHERE id = ${quote.id}`;
  await recordQuoteEvent(quote.id, "payment_confirmed", actor, `${result.periodStart ?? ""} → ${result.periodEnd ?? ""}`);
  return { ok: true, tenantId: quote.tenantId };
}
