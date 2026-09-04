import type { SubscriptionRow } from "./types";
import type { Language } from "./i18n";

export const EXTRA_USER_PRICE = 65;
export const RENEWAL_SOON_DAYS = 30;

const numberFormatter = new Intl.NumberFormat("ar-SA", { numberingSystem: "latn" });

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function statusClass(status: string) {
  if (status === "نشط" || status === "مكتمل" || status === "مدفوع") return "is-good";
  if (status === "تجربة" || status === "قيد الانتظار" || status === "معلومة" || status === "تنبيه") return "is-warn";
  return "is-danger";
}

export function parseTimestamp(value: string) {
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;
  const normalized = value.replace(/[٠-٩]/g, (n) => String("٠١٢٣٤٥٦٧٨٩".indexOf(n))).replace("،", " ");
  const parsed = Date.parse(normalized);
  if (Number.isFinite(parsed)) return parsed;
  // Some log entries are stored as a pre-formatted Arabic locale string
  // (DD/MM/YYYY h:mm + ص/م for AM/PM), which Date.parse can never
  // understand in any engine/locale - parse that exact shape by hand.
  const arabicLocaleMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(ص|م)?$/);
  if (arabicLocaleMatch) {
    const [, day, month, year, hour12Raw, minute, meridiem] = arabicLocaleMatch;
    let hour = Number(hour12Raw) % 12;
    if (meridiem === "م") hour += 12;
    const date = new Date(Number(year), Number(month) - 1, Number(day), hour, Number(minute));
    if (Number.isFinite(date.getTime())) return date.getTime();
  }
  return 0;
}

function parseRenewalDate(renewalAt: string) {
  if (!renewalAt) return null;
  const date = new Date(`${renewalAt}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type RenewalAlert = { label: string; tier: "overdue" | "soon"; daysRemaining: number };

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
    return { label: isEn ? `Overdue ${days} day(s)` : `متأخر ${days} يوم`, tier: "overdue", daysRemaining: diffDays };
  }
  if (diffDays <= RENEWAL_SOON_DAYS) {
    const label = diffDays === 0
      ? (isEn ? "Renews today" : "يتجدد اليوم")
      : (isEn ? `Renews in ${formatNumber(diffDays)} day(s)` : `يتجدد خلال ${formatNumber(diffDays)} يوم`);
    return { label, tier: "soon", daysRemaining: diffDays };
  }
  return null;
}
