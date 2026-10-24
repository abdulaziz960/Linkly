// How each order was paid, for the closing report. Recorded when the payment is confirmed; orders without a row
// (placed without online payment, or paid before this existed) show as "not recorded".

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";

export type PaymentMethod = "mada" | "card" | "applepay" | "stcpay" | "samsungpay" | "tabby" | "tamara" | "zid" | "other";

/** Pure: Moyasar's payment source into a method (mada is a card whose company is mada). */
export function methodFromMoyasarSource(source: { type?: unknown; company?: unknown } | null | undefined): PaymentMethod {
  const type = String(source?.type ?? "").toLowerCase();
  const company = String(source?.company ?? "").toLowerCase();
  if (type === "applepay") return "applepay";
  if (type === "stcpay") return "stcpay";
  if (type === "samsungpay") return "samsungpay";
  if (type === "creditcard" || type === "token" || type === "card") return company === "mada" ? "mada" : "card";
  return "other";
}

/** Pure: a Tabby / Tamara / Zid payment from the id stored on the order. */
export function methodFromPaymentId(paymentId: string): PaymentMethod | null {
  if (paymentId.startsWith("tabby-")) return "tabby";
  if (paymentId.startsWith("tamara-")) return "tamara";
  if (paymentId.startsWith("zid-")) return "zid";
  return null;
}

export async function recordPaymentMethod(orderId: string, method: PaymentMethod) {
  await ensureCatalogSchema();
  await prisma.$executeRaw`DELETE FROM catalog_order_payment_method WHERE order_id = ${orderId}`;
  await prisma.$executeRaw`INSERT INTO catalog_order_payment_method (order_id, method) VALUES (${orderId}, ${method})`;
}

export async function getPaymentMethods(orderIds: string[]): Promise<Map<string, PaymentMethod>> {
  const result = new Map<string, PaymentMethod>();
  if (!orderIds.length) return result;
  await ensureCatalogSchema();
  for (let start = 0; start < orderIds.length; start += 200) {
    const rows = await prisma.$queryRaw<Array<{ order_id: string; method: string }>>`SELECT order_id, method FROM catalog_order_payment_method WHERE order_id IN (${Prisma.join(orderIds.slice(start, start + 200))})`;
    for (const row of rows) result.set(row.order_id, row.method as PaymentMethod);
  }
  return result;
}
