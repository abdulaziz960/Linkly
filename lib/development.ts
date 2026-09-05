export const DEVELOPMENT_STATUSES = ["pending", "in_progress", "resolved", "rejected"] as const;
export type DevelopmentStatus = (typeof DEVELOPMENT_STATUSES)[number];

export function isDevelopmentStatus(value: unknown): value is DevelopmentStatus {
  return typeof value === "string" && (DEVELOPMENT_STATUSES as readonly string[]).includes(value);
}

export function developmentStatusLabel(status: string, lang: "ar" | "en") {
  const labels: Record<DevelopmentStatus, [string, string]> = {
    pending: ["قيد المراجعة", "Pending"],
    in_progress: ["جاري العمل عليها", "In progress"],
    resolved: ["تم التنفيذ", "Resolved"],
    rejected: ["مرفوضة", "Rejected"]
  };
  const [ar, en] = labels[status as DevelopmentStatus] || labels.pending;
  return lang === "en" ? en : ar;
}

export function developmentStatusBadgeClass(status: string) {
  if (status === "resolved") return "development-badge-resolved";
  if (status === "rejected") return "development-badge-rejected";
  if (status === "in_progress") return "development-badge-progress";
  return "development-badge-pending";
}
