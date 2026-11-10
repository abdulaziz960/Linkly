import { timingSafeEqual } from "crypto";

/**
 * Zid App Market events about this app's own subscription and installation (not store events like orders).
 * They are sent by Zid to the webhook URL set in the Partner Dashboard, with the extra header we chose there.
 * Reference: https://docs.zid.sa/doc-878234
 */
export const ZID_APP_EVENTS = [
  "app.market.application.authorized",
  "app.market.application.install",
  "app.market.application.uninstall",
  "app.market.application.rated",
  "app.market.private.plan.request",
  "app.market.subscription.active",
  "app.market.subscription.renew",
  "app.market.subscription.upgrade",
  "app.market.subscription.warning",
  "app.market.subscription.suspended",
  "app.market.subscription.expired",
  "app.market.subscription.refunded"
] as const;
export type ZidAppEventName = (typeof ZID_APP_EVENTS)[number];

export type ZidAppEvent = {
  event: ZidAppEventName;
  storeId: string;
  storeUuid: string;
  storeUrl: string;
  planName: string;
  status: string;
  endDate: string;
  amountPaid: number | null;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "");

/** A delivery body into a known event, or null for anything else (unknown event, no store, not an object). */
export function parseZidAppEvent(body: unknown): ZidAppEvent | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const payload = body as Record<string, unknown>;
  const event = text(payload.event_name);
  if (!(ZID_APP_EVENTS as readonly string[]).includes(event)) return null;
  const storeId = text(payload.store_id);
  const storeUuid = text(payload.store_uuid);
  if (!storeId && !storeUuid) return null;
  const amount = typeof payload.amount_paid === "number" && Number.isFinite(payload.amount_paid) ? payload.amount_paid : null;
  return { event: event as ZidAppEventName, storeId, storeUuid, storeUrl: text(payload.store_url), planName: text(payload.plan_name), status: text(payload.status), endDate: text(payload.end_date), amountPaid: amount };
}

/** True when the header value is the secret we configured (compared without leaking its length or content). */
export function verifyZidAppSecret(received: string | null): boolean {
  const expected = process.env.ZID_APP_WEBHOOK_SECRET?.trim() || "";
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LABELS: Record<ZidAppEventName, string> = {
  "app.market.application.authorized": "وافق التاجر على صلاحيات التطبيق",
  "app.market.application.install": "تثبيت التطبيق",
  "app.market.application.uninstall": "إلغاء تثبيت التطبيق",
  "app.market.application.rated": "تقييم جديد للتطبيق",
  "app.market.private.plan.request": "طلب باقة خاصة",
  "app.market.subscription.active": "تفعيل اشتراك التطبيق",
  "app.market.subscription.renew": "تجديد اشتراك التطبيق",
  "app.market.subscription.upgrade": "ترقية اشتراك التطبيق",
  "app.market.subscription.warning": "اقتراب انتهاء اشتراك التطبيق",
  "app.market.subscription.suspended": "إيقاف اشتراك التطبيق",
  "app.market.subscription.expired": "انتهاء اشتراك التطبيق",
  "app.market.subscription.refunded": "استرداد اشتراك التطبيق"
};

export function describeZidAppEvent(event: ZidAppEvent): string {
  const parts = [LABELS[event.event], event.planName ? `الباقة: ${event.planName}` : "", event.endDate ? `حتى ${event.endDate.slice(0, 10)}` : "", event.amountPaid !== null ? `المبلغ: ${event.amountPaid}` : ""].filter(Boolean);
  return `زد: ${parts.join(" · ")}.`;
}
