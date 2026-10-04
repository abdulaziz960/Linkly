import type { Tone } from "../ds/primitives";

export type RequestStatus = "pending" | "in_progress" | "resolved" | "rejected";
export const STATUS_FILTERS: RequestStatus[] = ["pending", "in_progress", "resolved", "rejected"];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "قيد المراجعة",
  in_progress: "جاري العمل عليها",
  resolved: "تم التنفيذ",
  rejected: "مرفوضة"
};

export const STATUS_TONE: Record<RequestStatus, Tone> = {
  pending: "warning",
  in_progress: "info",
  resolved: "success",
  rejected: "danger"
};

/** Unknown statuses fall back to "pending", matching how the page always treated them. */
export function normalizeStatus(status: string): RequestStatus {
  return (STATUS_FILTERS as string[]).includes(status) ? (status as RequestStatus) : "pending";
}

/** What an admin can do next from each status. */
export function availableActions(status: string): Array<"accept" | "reject" | "resolve"> {
  const normalized = normalizeStatus(status);
  if (normalized === "pending") return ["accept", "reject"];
  if (normalized === "in_progress") return ["resolve"];
  return [];
}

export function totalCount(counts: Record<string, number>) {
  return STATUS_FILTERS.reduce((sum, status) => sum + (counts[status] || 0), 0);
}

export function formatRequestDate(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso || "";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(time);
}
