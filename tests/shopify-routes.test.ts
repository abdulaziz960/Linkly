import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SECRET = "shpss_route_secret";
const handleShopifyWebhook = vi.fn(async () => ({ handled: true, status: 200, detail: "ok" }));
const handleShopifyPrivacyWebhook = vi.fn(async () => ({ handled: true, status: 200, detail: "erased" }));
vi.mock("../lib/store-engine", () => ({ handleShopifyWebhook, handleShopifyPrivacyWebhook }));

beforeEach(() => {
  vi.stubEnv("SHOPIFY_CLIENT_SECRET", SECRET);
  handleShopifyWebhook.mockClear();
  handleShopifyPrivacyWebhook.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

function webhook(body: string, headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/shopify/webhook", { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } });
}
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("base64");

describe("POST /api/shopify/webhook", () => {
  const body = JSON.stringify({ id: 1, order_number: 1001 });
  const good = { "x-shopify-topic": "orders/create", "x-shopify-shop-domain": "my-store.myshopify.com" };

  it("rejects a request that is not signed with the app secret", async () => {
    const { POST } = await import("../app/api/shopify/webhook/route");
    expect((await POST(webhook(body, { ...good }))).status).toBe(401);
    expect((await POST(webhook(body, { ...good, "x-shopify-hmac-sha256": sign(body, "other-secret") }))).status).toBe(401);
    expect(handleShopifyWebhook).not.toHaveBeenCalled();
  });

  it("hands a signed event to the engine with its topic and shop", async () => {
    const { POST } = await import("../app/api/shopify/webhook/route");
    const response = await POST(webhook(body, { ...good, "x-shopify-hmac-sha256": sign(body) }));
    expect(response.status).toBe(200);
    expect(handleShopifyWebhook).toHaveBeenCalledWith("orders/create", "my-store.myshopify.com", { id: 1, order_number: 1001 });
  });

  it("sends the privacy topics to the privacy handler", async () => {
    const { POST } = await import("../app/api/shopify/webhook/route");
    const privacy = { ...good, "x-shopify-topic": "customers/redact", "x-shopify-hmac-sha256": sign(body) };
    expect((await POST(webhook(body, privacy))).status).toBe(200);
    expect(handleShopifyPrivacyWebhook).toHaveBeenCalledTimes(1);
    expect(handleShopifyWebhook).not.toHaveBeenCalled();
  });

  it("refuses a signed request that names no topic or a shop that is not a myshopify domain", async () => {
    const { POST } = await import("../app/api/shopify/webhook/route");
    const signature = { "x-shopify-hmac-sha256": sign(body) };
    expect((await POST(webhook(body, { ...signature, "x-shopify-shop-domain": "my-store.myshopify.com" }))).status).toBe(400);
    expect((await POST(webhook(body, { ...signature, "x-shopify-topic": "orders/create", "x-shopify-shop-domain": "evil.example.com" }))).status).toBe(400);
  });

  it("refuses a body that is not JSON even when signed", async () => {
    const { POST } = await import("../app/api/shopify/webhook/route");
    const text = "not json";
    expect((await POST(webhook(text, { ...good, "x-shopify-hmac-sha256": sign(text) }))).status).toBe(400);
  });
});
