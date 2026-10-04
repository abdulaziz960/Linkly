import type { PaymentRow } from "../types";
import type { Tone } from "../ds/primitives";

export const STATUS_FILTERS = ["الكل", "مكتمل", "قيد الانتظار", "فشل", "منتهي الصلاحية", "مسترد"] as const;
export type PaymentStatusFilter = (typeof STATUS_FILTERS)[number];
export const SOURCE_FILTERS = ["الكل", "اشتراك", "شحن رسائل حملات"] as const;
export type PaymentSourceFilter = (typeof SOURCE_FILTERS)[number];

export type PaymentSort = "recent" | "oldest" | "amount_desc" | "amount_asc";
export const SORT_OPTIONS: Array<{ value: PaymentSort; label: string }> = [
  { value: "recent", label: "الأحدث" },
  { value: "oldest", label: "الأقدم" },
  { value: "amount_desc", label: "أعلى مبلغ" },
  { value: "amount_asc", label: "أقل مبلغ" }
];

export const STATUS_TONE: Record<string, Tone> = {
  مكتمل: "success",
  "قيد الانتظار": "warning",
  فشل: "danger",
  "منتهي الصلاحية": "neutral",
  مسترد: "info"
};

/** Pending longer than this counts as overdue on the summary. */
export const OVERDUE_AFTER_DAYS = 7;

/** Accepts the short query values older links used (?status=pending). */
export function normalizeStatusParam(value: string | undefined): PaymentStatusFilter {
  if (value === "pending") return "قيد الانتظار";
  if (value === "completed") return "مكتمل";
  return (STATUS_FILTERS as readonly string[]).includes(value ?? "") ? (value as PaymentStatusFilter) : "الكل";
}

export type PaymentFilters = {
  client: string; // tenantId or "all"
  status: PaymentStatusFilter;
  source: PaymentSourceFilter;
  query: string;
  from: string; // yyyy-mm-dd or ""
  to: string;
  min: string;
  max: string;
};

export const EMPTY_FILTERS: PaymentFilters = { client: "all", status: "الكل", source: "الكل", query: "", from: "", to: "", min: "", max: "" };

export function filterPayments(payments: PaymentRow[], filters: PaymentFilters) {
  const query = filters.query.trim().toLowerCase();
  const fromTime = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null;
  const toTime = filters.to ? new Date(`${filters.to}T23:59:59`).getTime() : null;
  const min = filters.min.trim() === "" ? null : Number(filters.min);
  const max = filters.max.trim() === "" ? null : Number(filters.max);
  return payments.filter((payment) => {
    if (filters.client !== "all" && payment.tenantId !== filters.client) return false;
    if (filters.status !== "الكل" && payment.status !== filters.status) return false;
    if (filters.source !== "الكل" && payment.source !== filters.source) return false;
    const createdAt = Date.parse(payment.createdAt || payment.completedAt || "");
    if (fromTime !== null && (!createdAt || createdAt < fromTime)) return false;
    if (toTime !== null && createdAt > toTime) return false;
    if (min !== null && Number.isFinite(min) && payment.amount < min) return false;
    if (max !== null && Number.isFinite(max) && payment.amount > max) return false;
    if (!query) return true;
    return payment.companyName.toLowerCase().includes(query) || payment.moyasarId.toLowerCase().includes(query);
  });
}

export function sortPayments(payments: PaymentRow[], sort: PaymentSort) {
  const sorted = [...payments];
  if (sort === "oldest") sorted.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  else if (sort === "amount_desc") sorted.sort((a, b) => b.amount - a.amount);
  else if (sort === "amount_asc") sorted.sort((a, b) => a.amount - b.amount);
  else sorted.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return sorted;
}

const sum = (rows: PaymentRow[]) => rows.reduce((total, row) => total + row.amount, 0);

/** Only completed payments are revenue; pending ones are outstanding, never collected. */
export function paymentStats(payments: PaymentRow[], now: number) {
  const completed = payments.filter((payment) => payment.status === "مكتمل");
  const pending = payments.filter((payment) => payment.status === "قيد الانتظار");
  const failed = payments.filter((payment) => payment.status === "فشل");
  const refunded = payments.filter((payment) => payment.status === "مسترد");
  const overdue = pending.filter((payment) => now - Date.parse(payment.createdAt) > OVERDUE_AFTER_DAYS * 86_400_000);
  return {
    collected: sum(completed),
    completedCount: completed.length,
    outstanding: sum(pending),
    pendingCount: pending.length,
    overdueCount: overdue.length,
    failedCount: failed.length,
    refundedTotal: sum(refunded),
    refundedCount: refunded.length
  };
}

export function statusCounts(payments: PaymentRow[]) {
  const counts: Record<string, number> = { الكل: payments.length };
  for (const status of STATUS_FILTERS) if (status !== "الكل") counts[status] = payments.filter((payment) => payment.status === status).length;
  return counts;
}

/** Footer totals for whatever is currently visible. */
export function visibleTotals(payments: PaymentRow[]) {
  const completed = payments.filter((payment) => payment.status === "مكتمل");
  return { collected: sum(completed), completedCount: completed.length, count: payments.length };
}

export function formatPaymentDate(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value || "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(time);
}

export function gatewayLabel(gateway: string | undefined) {
  switch (gateway) {
    case "moyasar": return "Moyasar";
    case "stripe": return "Stripe (اختبار)";
    case "manual": return "إضافة يدوية";
    case "test": return "محاكاة";
    default: return "—";
  }
}

export function initiatedByLabel(value: string | undefined) {
  if (value === "admin") return "فريق Linkly";
  if (value === "owner") return "مالك الحساب";
  if (value === "member") return "موظف لدى العميل";
  return value || "—";
}
