import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog.db");
const tenantA = "tenant-catalog-a";
const tenantB = "tenant-catalog-b";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("parsePrice / cleanProductInput", () => {
  it("parses Arabic digits, currency words and separators", async () => {
    const { parsePrice } = await import("../lib/catalog");
    expect(parsePrice("١٢٣٫٥٠")).toBe(123.5);
    expect(parsePrice("1,299.00 SAR")).toBe(1299);
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice(-5)).toBeNull();
  });

  it("rejects bad input and accepts good input", async () => {
    const { cleanProductInput } = await import("../lib/catalog");
    expect(cleanProductInput({ name: "", price: 10 }).ok).toBe(false);
    expect(cleanProductInput({ name: "x", price: "oops" }).ok).toBe(false);
    expect(cleanProductInput({ name: "x", price: 10, imageUrl: "javascript:alert(1)" }).ok).toBe(false);
    expect(cleanProductInput({ name: "x", price: 10, productUrl: "ftp://a.b" }).ok).toBe(false);
    const ok = cleanProductInput({ name: "قميص", price: 99 });
    expect(ok.ok).toBe(true);
  });
});

describe("feed parsing", () => {
  it("parses JSON, CSV and Google-Merchant XML into the same product shape", async () => {
    const { parseFeed, mapFeedRecord } = await import("../lib/product-feed");
    const json = parseFeed(JSON.stringify({ products: [{ id: "1", name: "A", price: "10", image: "http://x.com/a.png" }] }));
    const csv = parseFeed("id,title,price\n2,\"B, big\",20\n");
    const xml = parseFeed(`<rss><channel><item><g:id>3</g:id><title><![CDATA[C]]></title><g:price>30.00 SAR</g:price><g:availability>out of stock</g:availability></item></channel></rss>`);

    const a = mapFeedRecord(json[0]);
    const b = mapFeedRecord(csv[0]);
    const c = mapFeedRecord(xml[0]);
    expect("error" in a).toBe(false);
    expect(a).toMatchObject({ name: "A", price: 10, imageUrl: "https://x.com/a.png" });
    expect(b).toMatchObject({ name: "B, big", price: 20 });
    expect(c).toMatchObject({ name: "C", price: 30, stock: 0 });
  });
});

describe("catalog CRUD, upsert and tenant isolation", () => {
  it("upserts by externalId and keeps tenants separate", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { upsertProductByExternalId, listProducts, deleteProduct, cleanProductInput } = await import("../lib/catalog");
    await ensureSchema();

    const clean = (name: string, price: number) => {
      const r = cleanProductInput({ externalId: "sku-1", name, price });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    };
    const first = await upsertProductByExternalId(tenantA, "api", clean("Old", 10));
    const second = await upsertProductByExternalId(tenantA, "api", clean("New", 12));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.product.id).toBe(first.product.id);

    await upsertProductByExternalId(tenantB, "api", clean("Other tenant", 5));
    expect((await listProducts(tenantA)).items.map((p) => p.name)).toEqual(["New"]);
    expect(await deleteProduct(tenantB, "sku-1")).toBe(true);
    expect((await listProducts(tenantB)).items).toHaveLength(0);
    expect((await listProducts(tenantA)).items).toHaveLength(1);
  });

  it("only hides feed products that are missing from a valid feed read", async () => {
    const { importFeedRecords } = await import("../lib/product-feed");
    const { listProducts } = await import("../lib/catalog");
    const result = await importFeedRecords("tenant-feed", [{ id: "f1", name: "F1", price: "5" }, { id: "f2", name: "F2", price: "6" }]);
    expect(result.created).toBe(2);
    const again = await importFeedRecords("tenant-feed", [{ id: "f1", name: "F1", price: "7" }]);
    expect(again.updated).toBe(1);
    expect((await listProducts("tenant-feed")).items.length).toBe(2);
  });
});

describe("settings + payment safety", () => {
  it("never enables payment without a key, and never exposes the key", async () => {
    const { saveCatalogSettings, getPublicCatalogSettings, getMerchantGatewayKey } = await import("../lib/catalog");
    await saveCatalogSettings(tenantA, { paymentEnabled: true });
    expect((await getPublicCatalogSettings(tenantA)).paymentEnabled).toBe(false);

    await saveCatalogSettings(tenantA, { paymentEnabled: true, gatewaySecretKey: "sk_test_abcdefghijklmnop1234" });
    const pub = await getPublicCatalogSettings(tenantA);
    expect(pub.paymentEnabled).toBe(true);
    expect(JSON.stringify(pub)).not.toContain("abcdefghijklmnop1234");
    expect(await getMerchantGatewayKey(tenantA)).toBe("sk_test_abcdefghijklmnop1234");
    expect(await getMerchantGatewayKey(tenantB)).toBe("");
  });

  it("ignores forged payment callbacks (no order / no invoice)", async () => {
    const { processOrderPaymentCallback } = await import("../lib/catalog-payments");
    const result = await processOrderPaymentCallback("does-not-exist");
    expect(result.body.status).toBeUndefined();
  });
});
