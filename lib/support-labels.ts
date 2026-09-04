import type { SupportCategory, SupportPriority, SupportStatus } from "./support";

type Lang = "ar" | "en";

export const STATUS_LABELS: Record<SupportStatus, Record<Lang, string>> = {
  new: { ar: "جديدة", en: "New" },
  open: { ar: "مفتوحة", en: "Open" },
  in_progress: { ar: "قيد المعالجة", en: "In progress" },
  waiting_customer: { ar: "بانتظار ردك", en: "Waiting for you" },
  waiting_support: { ar: "بانتظار الدعم", en: "Waiting for support" },
  resolved: { ar: "تم الحل", en: "Resolved" },
  closed: { ar: "مغلقة", en: "Closed" }
};

export const PRIORITY_LABELS: Record<SupportPriority, Record<Lang, string>> = {
  low: { ar: "منخفضة", en: "Low" },
  normal: { ar: "عادية", en: "Normal" },
  high: { ar: "عالية", en: "High" },
  urgent: { ar: "عاجلة", en: "Urgent" }
};

export const CATEGORY_LABELS: Record<SupportCategory, Record<Lang, string>> = {
  technical: { ar: "مشكلة تقنية", en: "Technical issue" },
  account: { ar: "الحساب", en: "Account" },
  billing: { ar: "الفواتير", en: "Billing" },
  subscription: { ar: "الاشتراك", en: "Subscription" },
  whatsapp: { ar: "واتساب", en: "WhatsApp" },
  integrations: { ar: "التكاملات", en: "Integrations" },
  api: { ar: "واجهة برمجية (API)", en: "API" },
  bug: { ar: "بلاغ عن خلل", en: "Bug report" },
  feature_request: { ar: "طلب ميزة", en: "Feature request" },
  other: { ar: "أخرى", en: "Other" }
};

export function statusLabel(status: string, lang: Lang) {
  return STATUS_LABELS[status as SupportStatus]?.[lang] || status;
}

export function priorityLabel(priority: string, lang: Lang) {
  return PRIORITY_LABELS[priority as SupportPriority]?.[lang] || priority;
}

export function categoryLabel(category: string, lang: Lang) {
  return CATEGORY_LABELS[category as SupportCategory]?.[lang] || category;
}

export function statusBadgeClass(status: string) {
  if (status === "resolved") return "support-badge-resolved";
  if (status === "closed") return "support-badge-closed";
  if (status === "waiting_customer") return "support-badge-waiting-customer";
  if (status === "waiting_support") return "support-badge-waiting-support";
  if (status === "in_progress") return "support-badge-progress";
  if (status === "open") return "support-badge-open";
  return "support-badge-new";
}

export function priorityBadgeClass(priority: string) {
  if (priority === "urgent") return "support-priority-urgent";
  if (priority === "high") return "support-priority-high";
  if (priority === "low") return "support-priority-low";
  return "support-priority-normal";
}
