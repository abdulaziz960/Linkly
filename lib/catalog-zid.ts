import { prisma } from "./prisma";
import { readStoreTokens } from "./store-connections";
import { getStoreSettings } from "./store-settings";
import type { CatalogProduct } from "./catalog";

/**
 * How the WhatsApp catalog behaves for a workspace that connected a Zid store.
 *
 * Connected to Zid means Zid owns the money and the orders: the merchant's own payment gateway (Moyasar) is
 * not used for catalog purchases and a product feed URL is not accepted, so nothing can be paid or listed
 * twice. A purchase of a product that came from Zid becomes an order in the store, paid through Zid's link;
 * anything else (a hand-added product, or checkout not set up yet) is sent to a person to follow up.
 */

export type ZidCatalogMode = {
  connected: boolean;
  /** Checkout is switched on and has what it needs (a delivery option and the payment-link method). */
  ready: boolean;
  shippingMethodId: number;
  paymentMethodId: number;
  linkValidHours: number;
};

export async function isZidConnected(tenantId: string): Promise<boolean> {
  return Boolean(await readStoreTokens(tenantId, "zid"));
}

export async function getZidCatalogMode(tenantId: string): Promise<ZidCatalogMode> {
  const connected = await isZidConnected(tenantId);
  if (!connected) return { connected: false, ready: false, shippingMethodId: 0, paymentMethodId: 0, linkValidHours: 24 };
  const { settings } = await getStoreSettings(tenantId, "zid");
  const checkout = settings.checkout;
  return {
    connected: true,
    ready: checkout.enabled && checkout.shippingMethodId > 0 && checkout.paymentMethodId > 0,
    shippingMethodId: checkout.shippingMethodId,
    paymentMethodId: checkout.paymentMethodId,
    linkValidHours: checkout.linkValidHours
  };
}

/** Only a product pulled from the Zid store has a Zid SKU to order by. */
export function isZidProduct(product: Pick<CatalogProduct, "externalId" | "sku">): boolean {
  return product.externalId.startsWith("zid-") && Boolean(product.sku.trim());
}

// ---------- the address questions ----------

const CHECKOUT_MINUTES = 30;

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma
    .$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS catalog_checkout_state (
      conversation_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      step TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL
    )`)
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

export type CheckoutState = { productId: string; step: "city" | "address"; city: string };

export async function getCheckoutState(conversationId: string): Promise<CheckoutState | null> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ product_id: string; step: string; city: string; expires_at: string }>>`SELECT product_id, step, city, expires_at FROM catalog_checkout_state WHERE conversation_id = ${conversationId}`;
  const row = rows[0];
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    await clearCheckoutState(conversationId);
    return null;
  }
  return { productId: row.product_id, step: row.step === "address" ? "address" : "city", city: row.city };
}

export async function setCheckoutState(tenantId: string, conversationId: string, state: CheckoutState): Promise<void> {
  await ensureTable();
  const expires = new Date(Date.now() + CHECKOUT_MINUTES * 60_000).toISOString();
  await prisma.$executeRaw`DELETE FROM catalog_checkout_state WHERE conversation_id = ${conversationId}`;
  await prisma.$executeRaw`INSERT INTO catalog_checkout_state (conversation_id, tenant_id, product_id, step, city, expires_at) VALUES (${conversationId}, ${tenantId}, ${state.productId}, ${state.step}, ${state.city}, ${expires})`;
}

export async function clearCheckoutState(conversationId: string): Promise<void> {
  await ensureTable();
  await prisma.$executeRaw`DELETE FROM catalog_checkout_state WHERE conversation_id = ${conversationId}`;
}
