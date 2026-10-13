/**
 * Pure rules for "may this workspace use the product right now?", kept apart
 * from the database so they can be tested exhaustively. lib/auth.ts feeds it
 * the subscription row.
 */

/** The renewal / trial-end moment in ms, or null when the value is empty or not a real date. */
export function parseRenewalAt(value: string | null | undefined): number | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : null;
}

export function isValidRenewalAt(value: unknown): value is string {
  return typeof value === "string" && parseRenewalAt(value) !== null;
}

export type SubscriptionAccess = {
  expired: boolean;
  overdue: boolean;
  /** The row has no usable renewal date: a trial in this state is treated as ended (see below). */
  invalidRenewalDate: boolean;
};

const DAY_MS = 86_400_000;

export function computeSubscriptionAccess(
  subscription: { status: string; renewalAt: string | null | undefined },
  now: number,
  graceDays: number | null
): SubscriptionAccess {
  const expiry = parseRenewalAt(subscription.renewalAt);
  const invalidRenewalDate = expiry === null;

  // A trial is only free because it ends. A trial with no (or an unreadable)
  // end date used to never end at all - an account could stay free forever just
  // because its date was blank or mistyped - so it is treated as ended; the
  // owner pays and the payment sets a real period.
  const trialExpired = subscription.status === "تجربة" && (invalidRenewalDate || expiry <= now);

  // renewalAt is the paid-through date for an active subscription; past it
  // the tenant has not paid for the current period. A paying customer with an
  // unreadable date is not locked out (that would punish them for our data);
  // the flag lets the admin panel surface it.
  const overdue = subscription.status === "نشط" && expiry !== null && expiry <= now;
  const renewalLapsed = overdue && graceDays !== null && expiry + graceDays * DAY_MS <= now;

  return {
    expired: trialExpired || renewalLapsed || subscription.status === "متوقف",
    overdue,
    invalidRenewalDate
  };
}
