import type { SubscriptionRow } from "../types";
import { EXTRA_USER_PRICE, parseTimestamp } from "../utils";

const DAY = 86_400_000;

// Advanced list filters, applied on top of the basic search/status filters in
// clients-data.ts. Pure functions so they can be unit tested.
export type RenewalFilter = "any" | "overdue" | "7d" | "30d" | "none";
export type UsageFilter = "any" | "idle" | "near" | "full";

export type AdvancedFilters = {
  plans: string[];
  joinedFrom: string;
  joinedTo: string;
  renewal: RenewalFilter;
  usage: UsageFilter;
};

export const NO_ADVANCED_FILTERS: AdvancedFilters = { plans: [], joinedFrom: "", joinedTo: "", renewal: "any", usage: "any" };

export type DerivedClient = {
  renewalDays: number | null;
  usersPct: number;
  extraUsers: number;
  joinedTs: number;
};

export function deriveClient(subscription: SubscriptionRow, now: number): DerivedClient {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let renewalDays: number | null = null;
  if (subscription.renewalAt) {
    const time = new Date(`${subscription.renewalAt}T00:00:00`).getTime();
    if (!Number.isNaN(time)) renewalDays = Math.round((time - today.getTime()) / DAY);
  }
  return {
    renewalDays,
    usersPct: subscription.employeeLimit > 0 ? Math.round((subscription.employeeCount / subscription.employeeLimit) * 100) : 0,
    extraUsers: Math.max(0, subscription.employeeCount - subscription.employeeLimit),
    joinedTs: parseTimestamp(subscription.createdAt)
  };
}

export function countAdvancedFilters(filters: AdvancedFilters) {
  return (filters.plans.length ? 1 : 0) + (filters.joinedFrom || filters.joinedTo ? 1 : 0) + (filters.renewal !== "any" ? 1 : 0) + (filters.usage !== "any" ? 1 : 0);
}

export function matchesAdvanced(client: SubscriptionRow, derived: DerivedClient, filters: AdvancedFilters): boolean {
  if (filters.plans.length && !filters.plans.includes(client.plan)) return false;
  const from = filters.joinedFrom ? new Date(`${filters.joinedFrom}T00:00:00`).getTime() : null;
  const to = filters.joinedTo ? new Date(`${filters.joinedTo}T23:59:59`).getTime() : null;
  if (from !== null && (!derived.joinedTs || derived.joinedTs < from)) return false;
  if (to !== null && (!derived.joinedTs || derived.joinedTs > to)) return false;
  const days = derived.renewalDays;
  const active = client.status === "نشط";
  if (filters.renewal === "overdue" && !(active && days !== null && days < 0)) return false;
  if (filters.renewal === "7d" && !(active && days !== null && days >= 0 && days <= 7)) return false;
  if (filters.renewal === "30d" && !(active && days !== null && days >= 0 && days <= 30)) return false;
  if (filters.renewal === "none" && days !== null) return false;
  if (filters.usage === "idle" && client.conversationCount !== 0) return false;
  if (filters.usage === "near" && !(derived.usersPct >= 80 && derived.usersPct < 100)) return false;
  if (filters.usage === "full" && derived.usersPct < 100) return false;
  return true;
}

export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  return { rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, pageCount };
}

function csvCell(value: string | number) {
  let text = String(value ?? "");
  // Neutralise spreadsheet formula injection (=, +, -, @, tab, CR at the start).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADERS = ["العميل", "المالك", "البريد الإلكتروني", "حالة الاشتراك", "الباقة", "دورة الفوترة", "المبلغ", "عدد المستخدمين", "حد المستخدمين", "الفاتورة الشهرية", "المحادثات", "تاريخ التجديد", "تاريخ الانضمام"];

export function clientsToCsv(clients: SubscriptionRow[]): string {
  const rows = clients.map((client) => [
    client.companyName, client.ownerName, client.ownerEmail, client.status, client.plan, client.billingCycle, client.amount,
    client.employeeCount, client.employeeLimit, client.amount + Math.max(0, client.employeeCount - client.employeeLimit) * EXTRA_USER_PRICE,
    client.conversationCount, client.renewalAt || "", client.createdAt || ""
  ]);
  // BOM so Excel opens the Arabic text as UTF-8.
  return `\uFEFF${[CSV_HEADERS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
