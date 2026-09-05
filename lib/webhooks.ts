import { randomBytes, randomUUID, createHmac } from "crypto";
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./secret-storage";

export type WebhookEvent = "message.received" | "conversation.closed";

const VALID_EVENTS: WebhookEvent[] = ["message.received", "conversation.closed"];

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

/**
 * Fire-and-forget delivery to every active webhook subscribed to `event` -
 * never blocks or throws back to the caller, mirrors lib/email.ts's
 * try/catch-around-the-fetch-only shape. Single attempt per delivery (no
 * retry queue in v1); every attempt is logged to WebhookDelivery regardless
 * of outcome so the Developers view can show a delivery history.
 */
export async function triggerWebhookEvent(tenantId: string, event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  const webhooks = await prisma.webhook.findMany({ where: { tenantId, active: 1 } });
  const subscribed = webhooks.filter((webhook) => parseEvents(webhook.events).includes(event));
  if (!subscribed.length) return;

  const body = JSON.stringify({ event, data: payload, sentAt: new Date().toISOString() });

  await Promise.allSettled(subscribed.map(async (webhook) => {
    const secret = decryptSecret(webhook.secret);
    let httpStatus = 0;
    let success = false;

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Linkly-Signature": signWebhookPayload(secret, body)
        },
        body
      });
      httpStatus = response.status;
      success = response.ok;
    } catch (error) {
      console.error(`Webhook delivery failed for ${webhook.id}`, error);
    }

    await prisma.webhookDelivery.create({
      data: {
        id: `whd-${randomUUID()}`,
        webhookId: webhook.id,
        tenantId,
        event,
        httpStatus,
        success: success ? 1 : 0,
        createdAt: new Date().toISOString()
      }
    }).catch((error) => console.error("Failed to log webhook delivery", error));
  }));
}
