/**
 * How numbers read across the product: Western digits (1,234) in Arabic and English alike, grouped by thousands.
 * Dates and times come from lib/time.ts (formatDateTime, formatFullDateTime, formatRelativeTime): Gregorian, Riyadh time,
 * Western digits. Use these instead of calling toLocaleString with a locale in a component.
 */
export function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "—";
}

/** A ratio as a percentage with at most one decimal: 0.4567 -> "45.7%". */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${(Math.round(ratio * 1000) / 10).toLocaleString("en-US")}%`;
}

/** Riyals with two decimals: 1234.5 -> "1,234.50". */
export function formatSar(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}
