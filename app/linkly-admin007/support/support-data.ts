import type { Tone } from "../ds/primitives";

export type FilterKey = "all" | "unassigned" | "assigned_to_me" | "new" | "open" | "in_progress" | "waiting" | "urgent" | "resolved" | "closed";

export type TicketLike = { status: string; priority: string };

/** Admin-side wording. The shared labels read from the customer's point of view ("waiting for you"). */
export const ADMIN_STATUS_LABEL: Record<string, string> = {
  new: "جديدة",
  open: "مفتوحة",
  in_progress: "قيد المعالجة",
  waiting_customer: "بانتظار العميل",
  waiting_support: "بانتظار الدعم",
  resolved: "تم الحل",
  closed: "مغلقة"
};

export const STATUS_TONE: Record<string, Tone> = {
  new: "info",
  open: "info",
  in_progress: "warning",
  waiting_customer: "neutral",
  waiting_support: "warning",
  resolved: "success",
  closed: "neutral"
};

export const PRIORITY_LABEL: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة" };
export const PRIORITY_TONE: Record<string, Tone> = { low: "neutral", normal: "neutral", high: "warning", urgent: "danger" };

export const MAIN_FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "كل المحادثات" },
  { key: "unassigned", label: "غير معيّنة" },
  { key: "assigned_to_me", label: "معيّنة لي" },
  { key: "new", label: "جديدة" },
  { key: "open", label: "مفتوحة" },
  { key: "in_progress", label: "قيد المعالجة" },
  { key: "waiting", label: "بانتظار العميل" },
  { key: "urgent", label: "عاجلة" }
];

export const OTHER_FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "resolved", label: "تم حلها" },
  { key: "closed", label: "مغلقة" }
];

const STATUS_FILTERS: FilterKey[] = ["new", "open", "in_progress", "resolved", "closed"];

/** Query string for the tickets API. "waiting" and "urgent" are filtered client-side. */
export function buildListQuery(filter: FilterKey, search: string, adminId: string) {
  const params = new URLSearchParams();
  if (filter === "unassigned") params.set("assignedAgentId", "unassigned");
  if (filter === "assigned_to_me") params.set("assignedAgentId", adminId);
  if (STATUS_FILTERS.includes(filter)) params.set("status", filter);
  if (search.trim()) params.set("search", search.trim());
  return params.toString();
}

export function applyClientFilter<T extends TicketLike>(filter: FilterKey, tickets: T[]) {
  if (filter === "waiting") return tickets.filter((ticket) => ticket.status === "waiting_customer" || ticket.status === "waiting_support");
  if (filter === "urgent") return tickets.filter((ticket) => ticket.priority === "urgent" && ticket.status !== "resolved" && ticket.status !== "closed");
  return tickets;
}

export function formatTicketTime(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(time);
}
