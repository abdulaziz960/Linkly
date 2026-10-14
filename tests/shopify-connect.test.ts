import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SECRET = "shpss_connect_secret";
let currentUser: { id: string; role: string; tenantId: string } | null = { id: "u1", role: "مالك الحساب", tenantId: "tenant-shopify-connect" };
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => currentUser) }));

beforeEach(() => {
  vi.stubEnv("SHOPIFY_CLIENT_ID", "client-cn");
  vi.stubEnv("SHOPIFY_CLIENT_SECRET", SECRET);
  currentUser = { id: "u1", role: "مالك الحساب", tenantId: "tenant-shopify-connect" };
});
afterEach(() => vi.unstubAllEnvs());

const connect = (query: string) => new NextRequest(`https://linklysa.io/api/shopify/connect?${query}`);

describe("GET /api/shopify/connect", () => {
  it("sends the owner to the shop's authorize page and keeps the flow in a cookie", async () => {
    const { GET } = await import("../app/api/shopify/connect/route");
    const response = await GET(connect("shop=My-Store"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") || "");
    expect(location.origin + location.pathname).toBe("https://my-store.myshopify.com/admin/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("client-cn");
    expect(location.searchParams.get("redirect_uri")).toBe("https://linklysa.io/api/shopify/callback");
    expect(response.headers.get("set-cookie")).toContain("linkly_shopify_state=");
  });

  it("does not go anywhere for a value that is not a Shopify shop", async () => {
    const { GET } = await import("../app/api/shopify/connect/route");
    for (const shop of ["evil.com", "https://evil.com/x.myshopify.com", ""]) {
      const response = await GET(connect(`shop=${encodeURIComponent(shop)}`));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("أدخل نطاق المتجر");
    }
  });

  it("only the account owner can connect a store", async () => {
    currentUser = { id: "u2", role: "موظف دعم", tenantId: "tenant-shopify-connect" };
    const { GET } = await import("../app/api/shopify/connect/route");
    const response = await GET(connect("shop=my-store"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("لمالك الحساب فقط");
  });

  it("accepts Shopify's signed install link and refuses a forged one", async () => {
    const { GET } = await import("../app/api/shopify/connect/route");
    const fields: Record<string, string> = { host: "abc", shop: "my-store.myshopify.com", timestamp: "1700000000" };
    const message = Object.keys(fields).sort().map((key) => `${key}=${fields[key]}`).join("&");
    const sign = (secret: string) => createHmac("sha256", secret).update(message).digest("hex");

    const signed = await GET(connect(new URLSearchParams({ ...fields, hmac: sign(SECRET) }).toString()));
    expect(signed.status).toBe(307);
    const forged = await GET(connect(new URLSearchParams({ ...fields, hmac: sign("other") }).toString()));
    expect(forged.status).toBe(200);
    expect(await forged.text()).toContain("تعذر التحقق من طلب التثبيت");
  });

  it("asks for a Linkly sign-in first when there is no session", async () => {
    currentUser = null;
    const { GET } = await import("../app/api/shopify/connect/route");
    const response = await GET(connect("shop=my-store"));
    expect(await response.text()).toContain("سجّل الدخول إلى لنكلي أولًا");
  });
});
