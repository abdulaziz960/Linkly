import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  isShopifyShopDomain,
  normalizeShopDomain,
  normalizeShopifyCheckout,
  normalizeShopifyOrder,
  parseShopifyWebhook,
  shopifyAuthorizeUrl,
  shopifyStatusSlug,
  verifyShopifyQuery,
  verifyShopifyWebhook
} from "../lib/shopify";
import { orderStatusGroup } from "../lib/store-engine";

const SECRET = "shpss_test_secret";

describe("shop domain", () => {
  it("accepts only real myshopify.com hostnames", () => {
    expect(isShopifyShopDomain("my-store.myshopify.com")).toBe(true);
    for (const bad of ["", "evil.com", "my-store.myshopify.com.evil.com", "evil.com/my-store.myshopify.com", "-x.myshopify.com", "my store.myshopify.com", "x.myshopify.com:8080"]) {
      expect(isShopifyShopDomain(bad)).toBe(false);
    }
  });

  it("turns what a merchant types into the canonical domain", () => {
    for (const typed of ["my-store", "My-Store.myshopify.com", "https://my-store.myshopify.com/admin", "https://admin.shopify.com/store/my-store/products", " my-store "]) {
      expect(normalizeShopDomain(typed)).toBe("my-store.myshopify.com");
    }
  });

  it("returns an empty string for anything that is not a shop", () => {
    for (const typed of ["", "evil.com", "https://evil.com/x.myshopify.com", "my-store.example.com", "a b", "127.0.0.1"]) {
      expect(normalizeShopDomain(typed)).toBe("");
    }
  });

  it("builds the authorize URL on the shop itself, with the callback and state", () => {
    process.env.SHOPIFY_CLIENT_ID = "client-1";
    const url = new URL(shopifyAuthorizeUrl("my-store.myshopify.com", "state-1", "https://linklysa.io/api/shopify/callback"));
    expect(url.origin + url.pathname).toBe("https://my-store.myshopify.com/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("redirect_uri")).toBe("https://linklysa.io/api/shopify/callback");
    expect(url.searchParams.get("scope")).toContain("read_orders");
  });
});

describe("signatures", () => {
  it("verifies a webhook body (base64 HMAC-SHA256 with the client secret)", () => {
    const body = JSON.stringify({ id: 1, name: "#1001" });
    const header = createHmac("sha256", SECRET).update(body).digest("base64");
    expect(verifyShopifyWebhook(body, header, SECRET)).toBe(true);
    expect(verifyShopifyWebhook(body + " ", header, SECRET)).toBe(false);
    expect(verifyShopifyWebhook(body, header, "another-secret")).toBe(false);
    expect(verifyShopifyWebhook(body, "", SECRET)).toBe(false);
    expect(verifyShopifyWebhook(body, null, SECRET)).toBe(false);
    expect(verifyShopifyWebhook(body, header, "")).toBe(false);
  });

  it("verifies the OAuth redirect query (hex HMAC over the sorted other parameters)", () => {
    const fields: Record<string, string> = { code: "abc123", shop: "my-store.myshopify.com", state: "s1", timestamp: "1700000000" };
    const message = Object.keys(fields).sort().map((key) => `${key}=${fields[key]}`).join("&");
    const hmac = createHmac("sha256", SECRET).update(message).digest("hex");
    const params = new URLSearchParams({ ...fields, hmac });
    expect(verifyShopifyQuery(params, SECRET)).toBe(true);

    const tampered = new URLSearchParams({ ...fields, shop: "evil.myshopify.com", hmac });
    expect(verifyShopifyQuery(tampered, SECRET)).toBe(false);
    expect(verifyShopifyQuery(new URLSearchParams(fields), SECRET)).toBe(false);
    expect(verifyShopifyQuery(params, "wrong")).toBe(false);
  });
});

describe("orders", () => {
  const base = {
    id: 820982911946154500,
    name: "#1001",
    order_number: 1001,
    total_price: "250.00",
    currency: "SAR",
    customer: { first_name: "سارة", last_name: "العتيبي", phone: "+966501234567" },
    fulfillments: [] as unknown[]
  };

  it("uses the order number the customer sees, the name and an international phone", () => {
    const order = normalizeShopifyOrder(base);
    expect(order).toMatchObject({ reference: "1001", customerName: "سارة العتيبي", customerPhone: "966501234567", total: 250, currency: "SAR" });
  });

  it("falls back to the shipping address for the phone", () => {
    const order = normalizeShopifyOrder({ ...base, customer: {}, shipping_address: { name: "Ali", phone: "0555000111" } });
    expect(order).toMatchObject({ customerName: "Ali", customerPhone: "966555000111" });
  });

  it("derives cancelled / delivered / shipped / pending / processing", () => {
    expect(shopifyStatusSlug({ cancelled_at: "2026-10-14T10:00:00Z", fulfillment_status: "fulfilled" })).toBe("cancelled");
    expect(shopifyStatusSlug({ fulfillment_status: "fulfilled", fulfillments: [{ shipment_status: "delivered" }] })).toBe("delivered");
    expect(shopifyStatusSlug({ fulfillment_status: "fulfilled", fulfillments: [{ shipment_status: "in_transit" }] })).toBe("shipped");
    expect(shopifyStatusSlug({ fulfillment_status: "partial" })).toBe("shipped");
    expect(shopifyStatusSlug({ financial_status: "pending" })).toBe("pending");
    expect(shopifyStatusSlug({ financial_status: "paid", fulfillment_status: null })).toBe("processing");
  });

  it("produces statuses the engine grouping reads correctly", () => {
    const group = (order: Record<string, unknown>) => {
      const normalized = normalizeShopifyOrder({ ...base, ...order });
      return orderStatusGroup(normalized!.statusSlug, normalized!.statusLabel);
    };
    expect(group({ cancelled_at: "2026-10-14T10:00:00Z" })).toBe("cancelled");
    expect(group({ fulfillment_status: "fulfilled" })).toBe("shipped");
    expect(group({ fulfillment_status: "fulfilled", fulfillments: [{ shipment_status: "delivered" }] })).toBe("delivered");
    expect(group({ financial_status: "paid" })).toBe("processing");
  });

  it("reads the tracking details from the fulfillment", () => {
    const order = normalizeShopifyOrder({
      ...base,
      fulfillment_status: "fulfilled",
      fulfillments: [{ tracking_number: "TRK-9", tracking_url: "https://track.example/TRK-9", tracking_company: "Aramex" }]
    });
    expect(order).toMatchObject({ trackingNumber: "TRK-9", trackingUrl: "https://track.example/TRK-9", shippingCompany: "Aramex" });
  });

  it("rejects a payload with no id", () => {
    expect(normalizeShopifyOrder({ name: "#1" })).toBeNull();
    expect(normalizeShopifyOrder(null)).toBeNull();
  });
});

describe("abandoned checkouts", () => {
  it("reads the recovery link, total and phone", () => {
    const cart = normalizeShopifyCheckout({
      id: 99,
      total_price: "120.50",
      currency: "SAR",
      abandoned_checkout_url: "https://my-store.myshopify.com/checkouts/abc/recover",
      phone: "+966501234567",
      customer: { first_name: "Huda" }
    });
    expect(cart).toMatchObject({ id: "99", total: 120.5, customerPhone: "966501234567", customerName: "Huda", url: "https://my-store.myshopify.com/checkouts/abc/recover" });
  });

  it("is not a cart once the checkout completed", () => {
    expect(normalizeShopifyCheckout({ id: 1, completed_at: "2026-10-14T10:00:00Z" })).toBeNull();
  });
});

describe("parseShopifyWebhook", () => {
  const shop = "my-store.myshopify.com";
  const order = { id: 5, order_number: 1005, name: "#1005", total_price: "10", customer: { phone: "+966501234567" } };

  it("maps orders/create to a new order", () => {
    expect(parseShopifyWebhook("orders/create", shop, order)).toMatchObject({ type: "order.created", merchantId: shop, order: { reference: "1005" } });
  });

  it("maps a fulfilled order to a status update", () => {
    const event = parseShopifyWebhook("orders/updated", shop, { ...order, fulfillment_status: "fulfilled" });
    expect(event).toMatchObject({ type: "order.status.updated", order: { statusSlug: "shipped" } });
  });

  it("ignores the edit that follows creation (still unfulfilled, not cancelled)", () => {
    expect(parseShopifyWebhook("orders/updated", shop, { ...order, financial_status: "paid" }).type).toBe("ignored");
    expect(parseShopifyWebhook("orders/updated", shop, { ...order, financial_status: "pending" }).type).toBe("ignored");
  });

  it("maps a cancellation", () => {
    expect(parseShopifyWebhook("orders/updated", shop, { ...order, cancelled_at: "2026-10-14T10:00:00Z" })).toMatchObject({ type: "order.status.updated", order: { statusSlug: "cancelled" } });
  });

  it("maps a checkout with a phone to an abandoned cart and ignores one without", () => {
    expect(parseShopifyWebhook("checkouts/update", shop, { id: 7, phone: "+966501234567", abandoned_checkout_url: "https://x" }).type).toBe("abandoned.cart");
    expect(parseShopifyWebhook("checkouts/update", shop, { id: 7 }).type).toBe("ignored");
  });

  it("ignores other topics", () => {
    expect(parseShopifyWebhook("products/update", shop, {}).type).toBe("ignored");
  });
});
