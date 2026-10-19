// Which payment methods a workspace offers at checkout, and how a payment with Tabby or Tamara is started and checked.
// Moyasar (cards) keeps its own code in lib/catalog-payments.ts and lib/catalog.ts; this adds the others around it.

import { prisma } from "../prisma";
import { getMerchantGatewayKey } from "../catalog";
import { hasConnectedStore } from "../catalog-shipping";
import { isZidConnected } from "../catalog-zid";
import { getProviderConfig, isTabbyReady, isTamaraReady } from "./config";
import { createTabbyPayment, verifyTabbyPayment } from "./tabby";
import { createTamaraPayment, verifyTamaraOrder } from "./tamara";
import { PaymentProviderError, type CreatedPayment, type PaymentRequest, type PaymentVerdict, type ProviderKey } from "./types";

/** The methods offered at checkout, in the order the customer sees them. A workspace with a connected store only has cards (as before). */
export async function listPaymentChoices(tenantId: string): Promise<ProviderKey[]> {
  const choices: ProviderKey[] = [];
  if (!(await isZidConnected(tenantId)) && (await getMerchantGatewayKey(tenantId))) choices.push("moyasar");
  if (await hasConnectedStore(tenantId)) return choices;
  const [tabby, tamara] = await Promise.all([getProviderConfig(tenantId, "tabby"), getProviderConfig(tenantId, "tamara")]);
  if (tabby.enabled && isTabbyReady(tabby.config)) choices.push("tabby");
  if (tamara.enabled && isTamaraReady(tamara.config)) choices.push("tamara");
  return choices;
}

/** The order's stored payment id: unchanged for cards (as always), prefixed for the other methods so a callback finds its method. */
export function storedPaymentId(provider: Exclude<ProviderKey, "moyasar">, externalId: string): string {
  return `${provider}-${externalId}`;
}

export function providerOfPaymentId(paymentId: string): ProviderKey | "zid" | null {
  if (paymentId.startsWith("tabby-")) return "tabby";
  if (paymentId.startsWith("tamara-")) return "tamara";
  if (paymentId.startsWith("zid-")) return "zid";
  return paymentId ? "moyasar" : null;
}

/** A customer's history with the merchant (their paid orders): the installment providers use it to score the purchase. */
export async function customerPaymentHistory(tenantId: string, phone: string): Promise<{ count: number; firstPaidAt: string; lastPaidAt: string }> {
  const rows = await prisma.catalogOrder.findMany({ where: { tenantId, customerPhone: phone, status: { in: ["paid", "fulfilled"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  return { count: rows.length, firstPaidAt: rows[0]?.createdAt ?? "", lastPaidAt: rows.at(-1)?.createdAt ?? "" };
}

/** Starts the payment of an order with Tabby or Tamara. Throws PaymentProviderError (rejected: this customer or amount is not eligible). */
export async function startExternalPayment(provider: Exclude<ProviderKey, "moyasar">, request: PaymentRequest & { notificationUrl: string }): Promise<CreatedPayment & { storedId: string }> {
  if (provider === "tabby") {
    const { config } = await getProviderConfig(request.tenantId, "tabby");
    if (!isTabbyReady(config)) throw new PaymentProviderError("تابي غير مفعّل لهذا الحساب", "failed");
    const created = await createTabbyPayment(config, request);
    return { ...created, storedId: storedPaymentId("tabby", created.externalId) };
  }
  const { config } = await getProviderConfig(request.tenantId, "tamara");
  if (!isTamaraReady(config)) throw new PaymentProviderError("تمارا غير مفعّلة لهذا الحساب", "failed");
  const created = await createTamaraPayment(config, request);
  return { ...created, storedId: storedPaymentId("tamara", created.externalId) };
}

/** Asks Tabby or Tamara what became of an order's payment (and authorises / captures it when that is due). */
export async function verifyExternalPayment(order: { id: string; tenantId: string; paymentId: string; total: number }): Promise<PaymentVerdict> {
  const provider = providerOfPaymentId(order.paymentId);
  if (provider === "tabby") {
    const { config } = await getProviderConfig(order.tenantId, "tabby");
    if (!isTabbyReady(config)) return { state: "pending", reason: "not-configured" };
    return verifyTabbyPayment(config, order.paymentId.slice("tabby-".length), order.total, order.id);
  }
  if (provider === "tamara") {
    const { config } = await getProviderConfig(order.tenantId, "tamara");
    if (!isTamaraReady(config)) return { state: "pending", reason: "not-configured" };
    return verifyTamaraOrder(config, order.paymentId.slice("tamara-".length), order.total);
  }
  return { state: "pending" };
}
