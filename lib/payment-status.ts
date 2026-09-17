/**
 * Canonical payment-row statuses for SubscriptionPayment and CampaignPayment.
 *
 * The UI (customer dashboard, invoices, admin Payments page) and every
 * write path share these exact Arabic strings, so a payment's state is
 * always one of a known set instead of whatever a gateway happened to
 * return. Mapping from Moyasar's own invoice statuses lives next to it so
 * the webhook and the cron reconciler can never disagree.
 *
 *   pending   - invoice created, customer has not completed payment yet
 *   completed - gateway confirmed the money; benefits have been applied
 *   failed    - gateway reported a declined/failed payment attempt
 *   expired   - abandoned/canceled/voided; will never complete
 *   refunded  - was completed, then refunded on the gateway side
 */
export const PAYMENT_STATUS = {
  pending: "قيد الانتظار",
  completed: "مكتمل",
  failed: "فشل",
  expired: "منتهي الصلاحية",
  refunded: "مسترد"
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/** Every status a payment row can legitimately hold - used by filters/validation. */
export const ALL_PAYMENT_STATUSES: PaymentStatus[] = Object.values(PAYMENT_STATUS);

/** Which gateway produced a payment row. Stored in the `gateway` column. */
export const PAYMENT_GATEWAY = {
  moyasar: "moyasar",
  stripe: "stripe",
  manual: "manual",
  test: "test"
} as const;

export type PaymentGateway = (typeof PAYMENT_GATEWAY)[keyof typeof PAYMENT_GATEWAY];

/** What a payment row is buying. Mirrors the `payment_kind` metadata key sent to the gateway. */
export type PaymentKind = "subscription" | "campaign_topup";

/**
 * Translates a Moyasar invoice status into the outcome we should record.
 * Returns null for transitional states ("initiated", "on_hold") where the
 * right move is to leave the row pending and wait for the next event.
 *
 * Moyasar invoice statuses: initiated, paid, failed, canceled, on_hold,
 * expired, refunded, voided.
 */
export function mapMoyasarInvoiceStatus(status: string | undefined | null): "completed" | "failed" | "expired" | "refunded" | null {
  switch ((status || "").toLowerCase()) {
    case "paid":
      return "completed";
    case "failed":
      return "failed";
    case "refunded":
      return "refunded";
    case "canceled":
    case "cancelled":
    case "expired":
    case "voided":
      return "expired";
    default:
      return null;
  }
}

/**
 * Subscription-level paid/unpaid summary derived from the Subscription row.
 * `renewalAt` is the paid-through date: an active subscription whose
 * renewalAt is in the past has not paid for the current period.
 */
export type SubscriptionPaymentState = "trial" | "paid" | "overdue" | "suspended" | "unknown";

export function subscriptionPaymentState(subscription: { status: string; renewalAt: string } | null | undefined, now = Date.now()): SubscriptionPaymentState {
  if (!subscription) return "unknown";
  if (subscription.status === "متوقف") return "suspended";
  if (subscription.status === "تجربة") return "trial";
  if (subscription.status !== "نشط") return "unknown";
  const paidThrough = subscription.renewalAt ? new Date(subscription.renewalAt).getTime() : Number.NaN;
  if (!Number.isFinite(paidThrough)) return "paid";
  return paidThrough >= now ? "paid" : "overdue";
}
