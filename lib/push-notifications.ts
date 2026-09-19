import { randomUUID } from "crypto";
import webpush from "web-push";
import { prisma } from "./prisma";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:support@linklysa.io";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!vapidPublicKey || !vapidPrivateKey) return false;
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string {
  return vapidPublicKey;
}

export type PushSubscriptionKeys = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function saveSubscription(userId: string, tenantId: string, subscription: PushSubscriptionKeys) {
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { userId, tenantId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    create: {
      id: `push-${randomUUID()}`,
      userId,
      tenantId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      createdAt: new Date().toISOString()
    }
  });
}

// userId is omitted for the internal dead-subscription cleanup in
// notifyTenant (a delivery failure isn't tied to a request's caller), but
// required from the user-facing unsubscribe route so one logged-in user
// can't remove another user's subscription by guessing/observing its
// endpoint URL.
export async function removeSubscription(endpoint: string, userId?: string) {
  await prisma.pushSubscription.deleteMany({ where: userId ? { endpoint, userId } : { endpoint } });
}

/**
 * Fire-and-forget, mirrors triggerWebhookEvent's shape (lib/webhooks.ts) -
 * never throws back to the caller. Notifies every device subscribed for the
 * whole tenant rather than a specific assignee: Conversation.assignee is a
 * display name (not every conversation has one - see lib/segments.ts's
 * "بدون موظف" default), so there's no reliable per-assignee subscription
 * key to target instead. A dead/expired subscription (410 Gone, or 404 if
 * the push service purged it) is deleted so the table doesn't accumulate
 * stale rows that would fail on every future send.
 */
export async function notifyTenant(tenantId: string, payload: { title: string; body: string; url: string }): Promise<void> {
  if (!ensureConfigured()) return;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { tenantId } });
  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);

  await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        body
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } }).catch(() => {});
      } else {
        console.error(`Push delivery failed for ${subscription.endpoint}`, error);
      }
    }
  }));
}
