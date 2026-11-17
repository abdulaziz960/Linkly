import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { applyConfirmedSubscriptionPayment, logAdminAction } from "./subscriptions";
import { chargeHalalas } from "./charge-amount";
import { isBillingCycle, type BillingCycle } from "./billing-pricing";
import { isValidRenewalAt } from "./subscription-access";
import { PAYMENT_STATUS } from "./payment-status";
import { MANUAL_PAYMENT_METHODS } from "./manual-payment-methods";

/**
 * A payment the platform team received outside the gateway (a bank transfer, cash, a cheque) and confirms by hand: the subscription is
 * activated or renewed exactly as a gateway payment would do it, and the payment is recorded as completed so it joins the payments
 * list and the collected totals. Like a quotation payment it is recorded with the total including VAT.
 */

export { MANUAL_PAYMENT_METHODS };

export type ManualPaymentInput = {
  tenantId: string;
  /** The price of one billing period, without tax, in riyals. */
  amount: unknown;
  billingCycle?: unknown;
  method?: unknown;
  reference?: unknown;
  /** The new end date of the subscription (yyyy-mm-dd), when it is not simply one period after the current one. */
  renewalAt?: unknown;
  adminName: string;
};

export type ManualPaymentResult =
  | { ok: true; paymentId: string; netSar: number; totalSar: number; billingCycle: BillingCycle; periodStart: string; periodEnd: string; renewalAt: string; creditedMessages: number }
  | { ok: false; error: string; status: number };

export async function recordManualSubscriptionPayment(input: ManualPaymentInput): Promise<ManualPaymentResult> {
  await ensureSchema();
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: input.tenantId } });
  if (!subscription) return { ok: false, error: "الاشتراك غير موجود", status: 404 };

  const net = Math.round(Number(input.amount));
  if (!Number.isFinite(net) || net < 1 || net > 5_000_000) return { ok: false, error: "اكتب قيمة صحيحة للفاتورة (ريال واحد على الأقل)", status: 400 };

  const billingCycle: BillingCycle = isBillingCycle(input.billingCycle) ? input.billingCycle : isBillingCycle(subscription.billingCycle) ? subscription.billingCycle : "شهري";
  const method = (MANUAL_PAYMENT_METHODS as readonly string[]).includes(String(input.method)) ? String(input.method) : MANUAL_PAYMENT_METHODS[0];
  const reference = typeof input.reference === "string" ? input.reference.trim().slice(0, 120) : "";
  const renewalAt = typeof input.renewalAt === "string" ? input.renewalAt.trim() : "";
  if (renewalAt && !isValidRenewalAt(renewalAt)) return { ok: false, error: "تاريخ انتهاء الاشتراك غير صالح", status: 400 };

  // The plan the client is on stays as it is; naming it here makes this a real renewal of that plan (its message allowance is credited).
  const plan = await prisma.plan.findUnique({ where: { name: subscription.plan } });
  const grossHalalas = await chargeHalalas(input.tenantId, net);
  const now = new Date().toISOString();
  const paymentId = `sub-pay-manual-${randomUUID()}`;
  await prisma.subscriptionPayment.create({
    data: {
      id: paymentId, tenantId: input.tenantId,
      // What the client paid, tax included: this is what the payments list and its totals show.
      amount: grossHalalas / 100, amountHalalas: grossHalalas,
      status: PAYMENT_STATUS.pending, createdAt: now,
      planName: plan?.name ?? "", planEmployeeLimit: subscription.employeeLimit, planMessageQuota: plan?.messageQuota ?? 0,
      billingCycle, gateway: "manual", gatewayStatus: "awaiting_transfer", initiatedBy: "admin",
      metadataJson: JSON.stringify({ kind: "manual", method, reference, by: input.adminName, netSar: net })
    }
  });

  const applied = await applyConfirmedSubscriptionPayment(paymentId, { gateway: "manual", gatewayStatus: "paid", paymentMethod: method });
  if (!applied.activated) return { ok: false, error: "تعذر تأكيد الدفعة", status: 409 };

  // The subscription's price is the price without tax (what MRR and renewals are worked from), not the total just recorded.
  const finalRenewal = renewalAt || (applied.periodEnd ?? "");
  await prisma.subscription.update({ where: { tenantId: input.tenantId }, data: { amount: net, ...(renewalAt ? { renewalAt } : {}), updatedAt: new Date().toISOString() } });
  if (renewalAt) await prisma.subscriptionPayment.update({ where: { id: paymentId }, data: { periodEnd: renewalAt } });

  await logAdminAction(input.tenantId, subscription.companyName, `${input.adminName} أكّد دفعة ${method}${reference ? ` (${reference})` : ""} بمبلغ ${(grossHalalas / 100).toLocaleString("en-US")} ر.س وفُعّل الاشتراك حتى ${finalRenewal.slice(0, 10)}`);
  return { ok: true, paymentId, netSar: net, totalSar: grossHalalas / 100, billingCycle, periodStart: applied.periodStart ?? "", periodEnd: applied.periodEnd ?? "", renewalAt: finalRenewal, creditedMessages: plan?.messageQuota ?? 0 };
}
