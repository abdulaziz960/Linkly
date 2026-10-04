import { CYCLE_DISCOUNT_PERCENT, CYCLE_MONTHS, YEARLY_FREE_MONTHS, type BillingCycle } from "./billing-pricing";

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
  if (cycle === "سنوي") return lang === "ar" ? `${YEARLY_FREE_MONTHS} شهرين مجانًا` : `${YEARLY_FREE_MONTHS} months free`;
  const percent = CYCLE_DISCOUNT_PERCENT[cycle];
  return lang === "ar" ? `وفر ${percent}٪` : `Save ${percent}%`;
}

/** "SAR / month" style suffix next to the price. */
export function cyclePriceSuffix(cycle: BillingCycle, lang: Lang): string {
  const months = CYCLE_MONTHS[cycle];
  if (lang === "ar") return cycle === "شهري" ? "/ الشهر" : cycle === "سنوي" ? "/ السنة" : `/ ${months} أشهر`;
  return cycle === "شهري" ? "/ month" : cycle === "سنوي" ? "/ year" : `/ ${months} months`;
}

/** One-line note under the price of a multi-month cycle. */
export function cycleBilledNote(cycle: BillingCycle, total: number, lang: Lang): string {
  const months = CYCLE_MONTHS[cycle];
  if (lang === "ar") {
    if (cycle === "سنوي") return `12 شهرًا تُحسب 10 + شهرين مجانًا · تُدفع دفعة واحدة ${total} ريال`;
    return `تُدفع دفعة واحدة بقيمة ${total} ريال كل ${months} أشهر`;
  }
  if (cycle === "سنوي") return `12 months for the price of 10 (2 free) · billed once as ${total} SAR`;
  return `Billed once as ${total} SAR every ${months} months`;
}
