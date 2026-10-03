// Pure pricing math shared between server code (lib/subscriptions.ts) and
// client components (app/billing/BillingClient.tsx) - no prisma import, so
// it's safe to use from a "use client" file.

export type BillingCycle = "شهري" | "سنوي";

/** Annual billing pays the full year upfront at this discount off 12x the monthly price. */
export const ANNUAL_DISCOUNT_PERCENT = 20;

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === "شهري" || value === "سنوي";
}

/** Full-year price, paid upfront in one charge, discounted off 12x the monthly price. */
export function computeYearlyPrice(monthlyPrice: number): number {
  return Math.round(monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT_PERCENT / 100));
}

export function priceForCycle(monthlyPrice: number, billingCycle: BillingCycle): number {
  return billingCycle === "سنوي" ? computeYearlyPrice(monthlyPrice) : monthlyPrice;
}

/** Renewing the plan you're already on opens this many days before the paid period ends. */
export const RENEWAL_WINDOW_DAYS = 7;

/**
 * True when buying `targetPlan` again right now would just stack a second
 * payment on a plan that is active and paid up for more than the renewal
 * window: same plan, same billing cycle, status active, renewal date far
 * enough away. A different plan (upgrade/downgrade), a cycle change, a
 * trial, an overdue or suspended account are never blocked.
 */
export function isSamePlanRenewalTooEarly(
  subscription: { plan?: string; status?: string; renewalAt?: string; billingCycle?: string } | null | undefined,
  targetPlan: string,
  targetCycle: BillingCycle,
  now: number = Date.now()
): boolean {
  if (!subscription || subscription.status !== "نشط" || subscription.plan !== targetPlan) return false;
  if ((subscription.billingCycle || "شهري") !== targetCycle) return false;
  const paidThrough = subscription.renewalAt ? new Date(subscription.renewalAt).getTime() : Number.NaN;
  if (!Number.isFinite(paidThrough)) return false;
  return paidThrough - now > RENEWAL_WINDOW_DAYS * 86_400_000;
}
