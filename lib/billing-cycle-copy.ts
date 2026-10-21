import { CYCLE_DISCOUNT_PERCENT, CYCLE_MONTHS, type BillingCycle } from "./billing-pricing";

type Lang = "ar" | "en";

const TAB: Record<Lang, Record<BillingCycle, string>> = {
  ar: { "شهري": "شهري", "ربع سنوي": "ربع سنوي", "نصف سنوي": "نصف سنوي", "سنوي": "سنوي" },
  en: { "شهري": "Monthly", "ربع سنوي": "Quarterly", "نصف سنوي": "Semi-annual", "سنوي": "Yearly" }
};

/** Short tab label for a cycle. */
export function cycleTabLabel(cycle: BillingCycle, lang: Lang): string {
  return TAB[lang][cycle];
}

/** Badge shown on the tab, or "" for the monthly cycle. */
export function cycleSaveBadge(cycle: BillingCycle, lang: Lang): string {
  if (cycle === "شهري") return "";
  const percent = CYCLE_DISCOUNT_PERCENT[cycle];
  return lang === "ar" ? `وفر ${percent}٪` : `Save ${percent}%`;
}

/** "/ month" suffix next to the price (always per month). */
export function cyclePriceSuffix(cycle: BillingCycle, lang: Lang): string {
  // Multi-month cycles show the per-month equivalent; the full charge is in cycleBilledNote.
  void cycle;
  return lang === "ar" ? "/ الشهر" : "/ month";
}

/**
 * A riyal amount for display: thousands separators, and two decimals only
 * when the amount has a fraction (199 -> "199", 149.25 -> "149.25",
 * 1791 -> "1,791"). Western digits on both pages, like the rest of the site.
 */
export function formatPrice(amount: number): string {
  const whole = Number.isInteger(amount);
  return amount.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** One-line note under the price of a multi-month cycle. */
export function cycleBilledNote(cycle: BillingCycle, total: number, lang: Lang): string {
  const months = CYCLE_MONTHS[cycle];
  const amount = formatPrice(total);
  if (lang === "ar") {
    if (cycle === "سنوي") return `الإجمالي ${amount} ريال · يُدفع سنويًا`;
    return `يُدفع دفعة واحدة بقيمة ${amount} ريال كل ${months} أشهر`;
  }
  if (cycle === "سنوي") return `${amount} SAR total · billed yearly`;
  return `Billed once as ${amount} SAR every ${months} months`;
}

/**
 * Price shown in big type: the exact per-month equivalent of a cycle's
 * total, to the halala (1791 / 12 = 149.25) - never rounded to a whole
 * riyal, so the monthly figure times 12 is the yearly charge.
 */
export function perMonthPrice(total: number, cycle: BillingCycle): number {
  return Math.round((total / CYCLE_MONTHS[cycle]) * 100) / 100;
}

/** What a multi-month cycle saves against paying month by month, in riyals (0 for the monthly cycle). */
export function cycleSavings(monthlyPrice: number, total: number, cycle: BillingCycle): number {
  return Math.max(0, Math.round(monthlyPrice * CYCLE_MONTHS[cycle]) - total);
}

/** Text of the red corner ribbon, e.g. "وفر 597 ريال". */
export function cycleSavingsLabel(amount: number, lang: Lang): string {
  return lang === "ar" ? `وفر ${formatPrice(amount)} ريال` : `Save ${formatPrice(amount)} SAR`;
}
