"use client";

import { priceForCycle } from "../lib/billing-pricing";
import { cyclePriceSuffix, formatPrice, perMonthPrice } from "../lib/billing-cycle-copy";
import { useBillingCycle } from "./useBillingCycle";

/** A plan's price in the comparison header; follows the monthly/yearly toggle above the plan cards. */
export default function ComparisonPrice({ monthlyPrice, lang }: { monthlyPrice: number; lang: "ar" | "en" }) {
  const { billingCycle } = useBillingCycle();
  const shown = perMonthPrice(priceForCycle(monthlyPrice, billingCycle), billingCycle);
  return <><b>{formatPrice(shown)}</b> {lang === "ar" ? "ريال" : "SAR"} <small>{cyclePriceSuffix(billingCycle, lang)}</small></>;
}
