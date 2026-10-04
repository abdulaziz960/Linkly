import type { PaymentRow, SubscriptionRow } from "../../types";
import { invoiceBreakdown } from "../clients-data";
import type { Tone } from "../../ds/primitives";

/** Totals shown on a client's profile. Only completed payments count as collected. */
export function billingSummary(client: SubscriptionRow, payments: Array<Pick<PaymentRow, "amount" | "status" | "createdAt">>) {
  const collected = payments.filter((payment) => payment.status === "مكتمل").reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = payments.filter((payment) => payment.status === "قيد الانتظار").reduce((sum, payment) => sum + payment.amount, 0);
  const invoice = invoiceBreakdown(client);
  return { collected, outstanding, invoice, paymentCount: payments.length, completedCount: payments.filter((payment) => payment.status === "مكتمل").length };
}

export function newestFirst<T extends { createdAt?: string }>(rows: T[]) {
  return [...rows].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export const PAYMENT_TONE: Record<string, Tone> = {
  مكتمل: "success",
  "قيد الانتظار": "warning",
  فشل: "danger",
  "منتهي الصلاحية": "neutral",
  مسترد: "info"
};

export const LOG_TONE: Record<string, Tone> = { معلومة: "info", تنبيه: "warning", خطأ: "danger" };
