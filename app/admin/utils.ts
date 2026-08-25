import type { SubscriptionRow } from "./types";
import type { Language } from "./i18n";

export const EXTRA_USER_PRICE = 65;
export const RENEWAL_SOON_DAYS = 7;

const numberFormatter = new Intl.NumberFormat("ar-SA", { numberingSystem: "latn" });

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function statusClass(status: string) {
  if (status === "نشط" || status === "مكتمل" || status === "مدفوع") return "is-good";
  if (status === "تجربة" || status === "قيد الانتظار" || status === "معلومة" || status === "تنبيه") return "is-warn";
  return "is-danger";
}

function parseRenewalDate(renewalAt: string) {
  if (!renewalAt) return null;
  const date = new Date(`${renewalAt}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type RenewalAlert = { label: string; tier: "overdue" | "soon" };

export function getRenewalAlert(subscription: SubscriptionRow, language: Language = "ar"): RenewalAlert | null {
  if (subscription.status !== "نشط") return null;
  const renewalDate = parseRenewalDate(subscription.renewalAt);
  if (!renewalDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((renewalDate.getTime() - today.getTime()) / 86400000);

  const isEn = language === "en";

  if (diffDays < 0) {
    const days = formatNumber(Math.abs(diffDays));
    return { label: isEn ? `Overdue ${days} day(s)` : `متأخر ${days} يوم`, tier: "overdue" };
  }
  if (diffDays <= RENEWAL_SOON_DAYS) {
    const label = diffDays === 0
      ? (isEn ? "Renews today" : "يتجدد اليوم")
      : (isEn ? `Renews in ${formatNumber(diffDays)} day(s)` : `يتجدد خلال ${formatNumber(diffDays)} يوم`);
    return { label, tier: "soon" };
  }
  return null;
}
