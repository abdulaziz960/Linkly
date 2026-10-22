// Pure Shopify price math (no prisma import, safe in client components): prices are set in US dollars per
// plan; yearly is 12 months with the same discount as the riyal prices (lib/billing-pricing.ts).
import { CYCLE_DISCOUNT_PERCENT, CYCLE_MONTHS, type BillingCycle } from "./billing-pricing";

/** USD charged per period: the monthly price, or 12 months with the yearly discount (to the cent). */
export function shopifyPriceForCycle(monthlyUsd: number, cycle: BillingCycle): number {
  return Math.round(monthlyUsd * CYCLE_MONTHS[cycle] * (1 - CYCLE_DISCOUNT_PERCENT[cycle] / 100) * 100) / 100;
}

export function shopifyIntervalFor(cycle: BillingCycle): "EVERY_30_DAYS" | "ANNUAL" | null {
  if (cycle === "شهري") return "EVERY_30_DAYS";
  if (cycle === "سنوي") return "ANNUAL";
  return null;
}

/** "$49" / "$36.75" */
export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
