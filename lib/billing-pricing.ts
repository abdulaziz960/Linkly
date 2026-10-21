// Pure pricing math shared between server code (lib/subscriptions.ts) and
// client components (app/billing/BillingClient.tsx) - no prisma import, so
// it's safe to use from a "use client" file.

export type BillingCycle = "شهري" | "ربع سنوي" | "نصف سنوي" | "سنوي";

/** Every cycle the system can still price and renew (existing subscribers may be on the quarterly/semi-annual ones). */
export const BILLING_CYCLES: readonly BillingCycle[] = ["شهري", "ربع سنوي", "نصف سنوي", "سنوي"];

/** The cycles offered for a new purchase: monthly and yearly only. */
export const SELLABLE_BILLING_CYCLES: readonly BillingCycle[] = ["شهري", "سنوي"];

export function isSellableBillingCycle(value: unknown): value is BillingCycle {
  return typeof value === "string" && (SELLABLE_BILLING_CYCLES as readonly string[]).includes(value);
}

/** Length of one paid period, in months, per billing cycle. */
export const CYCLE_MONTHS: Record<BillingCycle, number> = { "شهري": 1, "ربع سنوي": 3, "نصف سنوي": 6, "سنوي": 12 };

/** Discount off months x monthly price. */
export const CYCLE_DISCOUNT_PERCENT: Record<BillingCycle, number> = { "شهري": 0, "ربع سنوي": 20, "نصف سنوي": 35, "سنوي": 25 };

/** URL (?billing=) slug per cycle. */
export const CYCLE_SLUGS: Record<BillingCycle, string> = { "شهري": "monthly", "ربع سنوي": "quarterly", "نصف سنوي": "semiannual", "سنوي": "yearly" };

export function cycleFromSlug(slug: unknown): BillingCycle {
  return SELLABLE_BILLING_CYCLES.find((cycle) => CYCLE_SLUGS[cycle] === slug) ?? "شهري";
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return typeof value === "string" && (BILLING_CYCLES as readonly string[]).includes(value);
}

export function priceForCycle(monthlyPrice: number, billingCycle: BillingCycle): number {
  return Math.round(monthlyPrice * CYCLE_MONTHS[billingCycle] * (1 - CYCLE_DISCOUNT_PERCENT[billingCycle] / 100));
}

/** Full-year price, paid upfront in one charge: 12 months with the yearly discount. */
export function computeYearlyPrice(monthlyPrice: number): number {
  return priceForCycle(monthlyPrice, "سنوي");
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
