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
