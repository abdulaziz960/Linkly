import { randomBytes, randomUUID, createHash } from "crypto";
import { prisma } from "./prisma";
import { runInboundMessageAutomations } from "./automation-engine";
import { sendWhatsAppTextMessage } from "./whatsapp-send";
import { formatMessageTime } from "./time";

const KEY_PREFIX = "lk_";

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export async function generateApiKey(tenantId: string, name: string): Promise<{ id: string; rawKey: string }> {
  const rawKey = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  const id = `key-${randomBytes(12).toString("hex")}`;

  await prisma.apiKey.create({
    data: {
      id,
      tenantId,
      name: name.trim(),
      keyHash: hashKey(rawKey),
      keyPrefix: rawKey.slice(0, 8),
      createdAt: new Date().toISOString()
    }
  });

  return { id, rawKey };
}

/**
 * Shared auth entry point for every app/api/v1/* route: pulls the bearer
 * token off the request, resolves it to a tenant. Returns the raw key
 * alongside the tenant so callers can rate-limit by it (consumeRateLimit
 * needs a stable per-key identifier, not the tenantId, so two different
 * keys for the same tenant get independent limits).
 */
export async function authenticateApiRequest(request: Request): Promise<{ tenantId: string; rawKey: string } | null> {
  const header = request.headers.get("authorization") || "";
  const rawKey = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!rawKey) return null;

  const tenantId = await resolveApiKeyTenant(rawKey);
  return tenantId ? { tenantId, rawKey } : null;
}

export async function resolveApiKeyTenant(rawKey: string): Promise<string | null> {
  const key = rawKey.trim();
  if (!key) return null;

  const record = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(key) } });
  if (!record) return null;

  await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date().toISOString() } });
  return record.tenantId;
}

export async function listApiKeys(tenantId: string) {
  const rows = await prisma.apiKey.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt
  }));
}

export async function revokeApiKey(tenantId: string, id: string): Promise<boolean> {
  const result = await prisma.apiKey.deleteMany({ where: { id, tenantId } });
  return result.count > 0;
}

/**
 * Opens (or reuses) a WhatsApp-channel conversation for a customer phone and
 * logs an inbound message on it - the public-API equivalent of an inbound
 * webhook handler, mirroring lib/website-inbox.ts's storeWebsiteMessage
 * shape but keyed by phone (matching app/api/customers/route.ts's own
 * customerId === conversationId convention for a brand-new customer).
 * runInboundMessageAutomations already fires the "message.received" webhook
 * event, so no separate trigger call is needed here.
 */
export async function openApiConversation(tenantId: string, input: { customerPhone: string; customerName?: string; text: string }): Promise<{ conversationId: string }> {
  const phone = input.customerPhone.trim();
  const text = input.text.trim();
  if (!phone) throw new Error("Missing customer phone");
  if (!text) throw new Error("Missing message text");

  const name = input.customerName?.trim() || phone;
  const createdAt = new Date().toISOString();

  const conversationId = await prisma.$transaction(async (tx) => {
    let customer = await tx.customer.findFirst({ where: { tenantId, phone } });
    if (!customer) {
      const id = `c-${randomUUID()}`;
      customer = await tx.customer.create({ data: { id, tenantId, name, phone, initial: name.slice(0, 1) } });
    }

    let conversation = await tx.conversation.findFirst({ where: { tenantId, customerId: customer.id }, orderBy: { lastActivityAt: "desc" } });
    if (!conversation) {
      conversation = await tx.conversation.create({
        data: {
          id: `c-${randomUUID()}`,
          tenantId,
          customerId: customer.id,
          channel: "whatsapp",
          status: "unassigned",
          assignee: "",
          lastMessage: text,
          unread: 1,
          lastActivityAt: createdAt
        }
      });
    } else {
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessage: text, unread: { increment: 1 }, lastActivityAt: createdAt }
      });
    }

    await tx.message.create({
      data: {
        id: `api-in-${randomUUID()}`,
        conversationId: conversation.id,
        direction: "in",
        text,
        time: formatMessageTime(),
        createdAt,
        author: ""
      }
    });

    return conversation.id;
  });

  await runInboundMessageAutomations(conversationId, tenantId, text);
  return { conversationId };
}

export async function sendApiMessage(tenantId: string, input: { conversationId: string; text: string }) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId },
    include: { customer: true }
  });
  if (!conversation) return null;

  return sendWhatsAppTextMessage({ tenantId, conversationId: conversation.id, to: conversation.customer.phone, text: input.text });
}

export async function listApiCustomers(tenantId: string, options: { limit: number; cursor?: string }) {
  const rows = await prisma.customer.findMany({
    where: { tenantId },
    orderBy: { id: "asc" },
    take: options.limit,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {})
  });
  return {
    items: rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone })),
    nextCursor: rows.length === options.limit ? rows[rows.length - 1]?.id : null
  };
}

export async function upsertApiCustomer(tenantId: string, input: { phone: string; name: string }) {
  const existing = await prisma.customer.findFirst({ where: { tenantId, phone: input.phone } });
  if (existing) {
    return prisma.customer.update({ where: { id: existing.id }, data: { name: input.name } });
  }

  return prisma.customer.create({
    data: {
      id: `c-${randomUUID()}`,
      tenantId,
      name: input.name,
      phone: input.phone,
      initial: input.name.slice(0, 1)
    }
  });
}
