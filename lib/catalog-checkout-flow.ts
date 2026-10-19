// The questions of a checkout in progress, kept per conversation so each answer (the city, a delivery option, the
// address, a payment method) lands on the right step. Raw-SQL lazy table, tagged templates (SQLite and Postgres).

import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";

export type CheckoutStep = "city" | "method" | "address" | "confirm" | "payment" | "email";

export type CheckoutData = {
  city?: string;
  methodId?: string;
  address?: string;
  /** The payment method chosen (while the email, Tabby's only extra question, is still to come). */
  provider?: string;
};

export type CheckoutFlow = { step: CheckoutStep; data: CheckoutData };

const FLOW_MINUTES = 30;

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function getCheckoutFlow(conversationId: string): Promise<CheckoutFlow | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ step: string; data_json: string; expires_at: string }>>`SELECT step, data_json, expires_at FROM catalog_checkout_flow WHERE conversation_id = ${conversationId} LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    await clearCheckoutFlow(conversationId);
    return null;
  }
  let data: CheckoutData = {};
  try {
    data = JSON.parse(row.data_json) as CheckoutData;
  } catch {
    data = {};
  }
  const step: CheckoutStep = row.step === "method" || row.step === "address" || row.step === "confirm" || row.step === "payment" || row.step === "email" ? row.step : "city";
  return { step, data };
}

export async function setCheckoutFlow(tenantId: string, conversationId: string, flow: CheckoutFlow) {
  await ensureTables();
  const expires = new Date(Date.now() + FLOW_MINUTES * 60_000).toISOString();
  const json = JSON.stringify(flow.data);
  await prisma.$executeRaw`DELETE FROM catalog_checkout_flow WHERE conversation_id = ${conversationId}`;
  await prisma.$executeRaw`INSERT INTO catalog_checkout_flow (conversation_id, tenant_id, step, data_json, expires_at) VALUES (${conversationId}, ${tenantId}, ${flow.step}, ${json}, ${expires})`;
}

export async function clearCheckoutFlow(conversationId: string) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_checkout_flow WHERE conversation_id = ${conversationId}`;
}
