import { timingSafeEqual } from "node:crypto";
import { prisma } from "../prisma";
import { processOrderPaymentCallback } from "../catalog-payments";
import { ensureSchema } from "../database";

/** Constant-time comparison of a secret the provider echoes back in a header. */
export function secretMatches(received: string | null, expected: string): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * A provider notification for a payment. Nothing in the body is trusted: it only names the payment; the order is then
 * re-verified with the provider. A payment we cannot match yet answers 404 so the provider retries (the notification can
 * arrive before the order's payment id is saved).
 */
export async function handleProviderNotification(tenantId: string, storedPaymentId: string): Promise<{ status: number; body: { ok: boolean } }> {
  await ensureSchema();
  const order = storedPaymentId ? await prisma.catalogOrder.findFirst({ where: { tenantId, paymentId: storedPaymentId }, select: { id: true } }) : null;
  if (!order) return { status: 404, body: { ok: false } };
  const result = await processOrderPaymentCallback(order.id);
  return { status: result.httpStatus, body: { ok: true } };
}
