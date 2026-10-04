import type { SubscriptionRow } from "../types";
import { getRenewalAlert, type RenewalAlert } from "../utils";
import { invoiceBreakdown } from "../clients/clients-data";

export type Bucket = "all" | "overdue" | "1" | "3" | "7" | "14" | "30";
export type FollowUp = "new" | "progress" | "contacted" | "closed";

export const BUCKETS: Array<{ value: Bucket; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "overdue", label: "متأخر" },
  { value: "1", label: "يوم واحد" },
  { value: "3", label: "3 أيام" },
  { value: "7", label: "7 أيام" },
  { value: "14", label: "14 يومًا" },
  { value: "30", label: "30 يومًا" }
];

export const FOLLOW_UP_LABEL: Record<FollowUp, string> = { new: "جديد", progress: "قيد المتابعة", contacted: "تم التواصل", closed: "مغلق" };

export type AlertItem = { subscription: SubscriptionRow; alert: RenewalAlert };

/** Active subscriptions that are overdue or due soon; overdue first, then soonest first. */
export function buildAlerts(subscriptions: SubscriptionRow[]): AlertItem[] {
  return subscriptions
    .map((subscription) => ({ subscription, alert: getRenewalAlert(subscription) }))
    .filter((item): item is AlertItem => item.alert !== null)
    .sort((a, b) => a.alert.daysRemaining - b.alert.daysRemaining);
}

export function inBucket(alert: RenewalAlert, bucket: Bucket) {
  const days = alert.daysRemaining;
  switch (bucket) {
    case "all": return true;
    case "overdue": return days < 0;
    case "1": return days >= 0 && days <= 1;
    case "3": return days > 1 && days <= 3;
    case "7": return days > 3 && days <= 7;
    case "14": return days > 7 && days <= 14;
    case "30": return days > 14 && days <= 30;
  }
}

export function bucketCounts(items: AlertItem[]): Record<Bucket, number> {
  const counts = {} as Record<Bucket, number>;
  for (const { value } of BUCKETS) counts[value] = items.filter((item) => inBucket(item.alert, value)).length;
  return counts;
}

/** Monthly invoice value sitting in the shown alerts. */
export function exposure(items: AlertItem[]) {
  return items.reduce((sum, item) => sum + invoiceBreakdown(item.subscription).total, 0);
}

export function isFollowUp(value: unknown): value is FollowUp {
  return value === "new" || value === "progress" || value === "contacted" || value === "closed";
}

export function parseStoredFollowUps(raw: string | null): Record<string, FollowUp> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isFollowUp(value))) as Record<string, FollowUp>;
  } catch {
    return {};
  }
}
