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

/** One-line note under the price of a multi-month cycle. */
export function cycleBilledNote(cycle: BillingCycle, total: number, lang: Lang): string {
  const months = CYCLE_MONTHS[cycle];
  if (lang === "ar") {
    if (cycle === "سنوي") return `خصم ${CYCLE_DISCOUNT_PERCENT[cycle]}٪ · تُدفع دفعة واحدة عن 12 شهرًا بقيمة ${total} ريال`;
    return `تُدفع دفعة واحدة بقيمة ${total} ريال كل ${months} أشهر`;
  }
  if (cycle === "سنوي") return `${CYCLE_DISCOUNT_PERCENT[cycle]}% off · billed once for 12 months: ${total} SAR`;
  return `Billed once as ${total} SAR every ${months} months`;
}

/** Price shown in big type: the per-month equivalent of a cycle's total. */
export function perMonthPrice(total: number, cycle: BillingCycle): number {
  return Math.round(total / CYCLE_MONTHS[cycle]);
}
