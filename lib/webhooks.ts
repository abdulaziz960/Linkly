import { randomBytes, randomUUID, createHmac } from "crypto";
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./secret-storage";
import { isPubliclyRoutableUrl } from "./url-safety";
import { safePublicFetch, UnsafePublicUrlError } from "./safe-public-fetch";

export type WebhookEvent = "message.received" | "conversation.closed" | "lead.created";

const VALID_EVENTS: WebhookEvent[] = ["message.received", "conversation.closed", "lead.created"];

function parseEvents(value: string): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function isValidWebhookEvent(value: string): value is WebhookEvent {
  return (VALID_EVENTS as string[]).includes(value);
}

export async function createWebhook(tenantId: string, input: { url: string; events: string[] }) {
  const secret = randomBytes(24).toString("hex");
  const events = input.events.filter(isValidWebhookEvent);

  const row = await prisma.webhook.create({
    data: {
      id: `wh-${randomUUID()}`,
      tenantId,
      url: input.url.trim(),
      secret: encryptSecret(secret),
      events: JSON.stringify(events),
      createdAt: new Date().toISOString()
    }
  });

  return { id: row.id, url: row.url, events, secret };
}

export async function listWebhooks(tenantId: string) {
  const rows = await prisma.webhook.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    events: parseEvents(row.events),
    active: Boolean(row.active),
    createdAt: row.createdAt
  }));
}

export async function updateWebhook(tenantId: string, id: string, input: { active?: boolean }) {
  const existing = await prisma.webhook.findFirst({ where: { id, tenantId } });
  if (!existing) return null;

  const row = await prisma.webhook.update({
    where: { id },
    data: { active: input.active === undefined ? undefined : (input.active ? 1 : 0) }
  });
  return { id: row.id, url: row.url, events: parseEvents(row.events), active: Boolean(row.active), createdAt: row.createdAt };
}

export async function deleteWebhook(tenantId: string, id: string): Promise<boolean> {
  const result = await prisma.webhook.deleteMany({ where: { id, tenantId } });
  // Nothing is left to retry for a webhook that no longer exists.
  if (result.count > 0) await prisma.webhookRetry.deleteMany({ where: { webhookId: id, tenantId } }).catch(() => {});
  return result.count > 0;
}

export async function listWebhookDeliveries(tenantId: string, webhookId: string, limit = 20) {
  return prisma.webhookDelivery.findMany({
    where: { tenantId, webhookId },
    orderBy: { createdAt: "desc" },
    take: limit
  });
}

export function signWebhookPayload(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/** Time allowed for one delivery attempt to answer. */
const ATTEMPT_TIMEOUT_MS = 8000;

/**
 * Wait before retry n (n = 1..5), counted from the failed attempt: a delivery
 * is tried up to six times in total over about 14.5 hours.
 */
export const WEBHOOK_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];

/** How long a retry stays claimed by one worker before another may pick it up. */
const RETRY_LEASE_MS = 10 * 60_000;
const RETRY_BATCH = 50;

type AttemptResult = { httpStatus: number; success: boolean; retryable: boolean };

// A timeout / network error (status 0), 408, 429 and 5xx are transient; any
// other non-2xx answer (400, 401, 404, a redirect...) will not change by
// itself, so it is logged and not retried.
function isRetryableStatus(status: number) {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

async function attemptDelivery(
  url: string,
  secret: string,
  body: string,
  meta: { event: string; deliveryId: string; attempt: number }
): Promise<AttemptResult> {
  // Re-check on every attempt, not just at registration - the hostname's DNS
  // record can change between registration and the event that triggers this
  // (DNS rebinding), and redirects are never followed.
  if (!(await isPubliclyRoutableUrl(url))) {
    console.error(`Webhook delivery blocked: ${url} no longer resolves to a publicly routable address`);
    return { httpStatus: 0, success: false, retryable: false };
  }
  try {
    const response = await safePublicFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Linkly-Signature": signWebhookPayload(secret, body),
        "X-Linkly-Event": meta.event,
        // The same id on every attempt of one event: receivers use it to ignore duplicates.
        "X-Linkly-Delivery": meta.deliveryId,
        "X-Linkly-Attempt": String(meta.attempt)
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)
    });
    await response.body?.cancel();
    return { httpStatus: response.status, success: response.ok, retryable: !response.ok && isRetryableStatus(response.status) };
  } catch (error) {
    if (error instanceof UnsafePublicUrlError) return { httpStatus: 0, success: false, retryable: false };
    console.error(`Webhook delivery failed for ${url}`, error);
    return { httpStatus: 0, success: false, retryable: true };
  }
}

async function logDelivery(input: { id?: string; webhookId: string; tenantId: string; event: string; result: AttemptResult }) {
  await prisma.webhookDelivery.create({
    data: {
      id: input.id ?? `whd-${randomUUID()}`,
      webhookId: input.webhookId,
      tenantId: input.tenantId,
      event: input.event,
      httpStatus: input.result.httpStatus,
      success: input.result.success ? 1 : 0,
      createdAt: new Date().toISOString()
    }
  }).catch((error) => console.error("Failed to log webhook delivery", error));
}

/**
 * Delivery to every active webhook subscribed to `event` - never throws back
 * to the caller. The first attempt happens here (bounded by a timeout); if it
 * fails for a transient reason the event is queued in webhook_retries and
 * processWebhookRetries (run by the cron job) delivers it later. Every
 * attempt is logged to WebhookDelivery so the Developers view shows the
 * history.
 */
export async function triggerWebhookEvent(tenantId: string, event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  const webhooks = await prisma.webhook.findMany({ where: { tenantId, active: 1 } });
  const subscribed = webhooks.filter((webhook) => parseEvents(webhook.events).includes(event));
  if (!subscribed.length) return;

  const body = JSON.stringify({ event, data: payload, sentAt: new Date().toISOString() });

  await Promise.allSettled(subscribed.map(async (webhook) => {
    const deliveryId = `whd-${randomUUID()}`;
    const result = await attemptDelivery(webhook.url, decryptSecret(webhook.secret), body, { event, deliveryId, attempt: 1 });
    await logDelivery({ id: deliveryId, webhookId: webhook.id, tenantId, event, result });

    if (!result.success && result.retryable) {
      const now = Date.now();
      await prisma.webhookRetry.create({
        data: {
          id: deliveryId,
          webhookId: webhook.id,
          tenantId,
          event,
          body,
          attempts: 1,
          status: "pending",
          nextAttemptAt: new Date(now + WEBHOOK_RETRY_DELAYS_MS[0]).toISOString(),
          lastStatus: result.httpStatus,
          createdAt: new Date(now).toISOString()
        }
      }).catch((error) => console.error("Failed to queue webhook retry", error));
    }
  }));
}

/**
 * Delivers the retries that are due. Called from the cron job; safe to run
 * from several instances at once (each row is claimed with a lease before it
 * is sent).
 */
export async function processWebhookRetries(limit = RETRY_BATCH): Promise<{ attempted: number; delivered: number; dead: number; cancelled: number }> {
  const totals = { attempted: 0, delivered: 0, dead: 0, cancelled: 0 };
  const due = await prisma.webhookRetry.findMany({
    where: { status: "pending", nextAttemptAt: { lte: new Date().toISOString() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit
  });

  for (const row of due) {
    const claimed = await prisma.webhookRetry.updateMany({
      where: { id: row.id, status: "pending", nextAttemptAt: row.nextAttemptAt },
      data: { nextAttemptAt: new Date(Date.now() + RETRY_LEASE_MS).toISOString() }
    });
    if (!claimed.count) continue;

    const webhook = await prisma.webhook.findFirst({ where: { id: row.webhookId, tenantId: row.tenantId } });
    if (!webhook || !webhook.active) {
      await prisma.webhookRetry.update({ where: { id: row.id }, data: { status: "cancelled" } });
      totals.cancelled += 1;
      continue;
    }

    const attempt = row.attempts + 1;
    totals.attempted += 1;
    let result: AttemptResult;
    try {
      result = await attemptDelivery(webhook.url, decryptSecret(webhook.secret), row.body, { event: row.event, deliveryId: row.id, attempt });
    } catch (error) {
      console.error(`Webhook retry failed for ${row.id}`, error);
      result = { httpStatus: 0, success: false, retryable: true };
    }
    await logDelivery({ webhookId: webhook.id, tenantId: row.tenantId, event: row.event, result });

    if (result.success) {
      await prisma.webhookRetry.update({ where: { id: row.id }, data: { status: "done", attempts: attempt, lastStatus: result.httpStatus } });
      totals.delivered += 1;
    } else if (!result.retryable || attempt > WEBHOOK_RETRY_DELAYS_MS.length) {
      await prisma.webhookRetry.update({ where: { id: row.id }, data: { status: "dead", attempts: attempt, lastStatus: result.httpStatus } });
      totals.dead += 1;
    } else {
      await prisma.webhookRetry.update({
        where: { id: row.id },
        data: {
          attempts: attempt,
          lastStatus: result.httpStatus,
          nextAttemptAt: new Date(Date.now() + WEBHOOK_RETRY_DELAYS_MS[attempt - 1]).toISOString()
        }
      });
    }
  }
  return totals;
}
