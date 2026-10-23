import { describe, expect, it } from "vitest";
import { MAX_PRODUCT_IMAGE_BYTES, parseProductImage, productImageUrl } from "../lib/catalog-product-image";

function jpegUrl(size: number) {
  const bytes = Buffer.alloc(size, 1);
  bytes[0] = 0xff; bytes[1] = 0xd8; bytes[2] = 0xff;
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

describe("product image upload", () => {
  it("accepts a real JPEG", () => {
    expect(parseProductImage(jpegUrl(1000)).ok).toBe(true);
  });
  it("rejects other types, bad bytes and oversize", () => {
    expect(parseProductImage("data:image/png;base64,AAAA").ok).toBe(false);
    expect(parseProductImage(`data:image/jpeg;base64,${Buffer.alloc(500, 7).toString("base64")}`).ok).toBe(false);
    expect(parseProductImage(jpegUrl(MAX_PRODUCT_IMAGE_BYTES + 10)).ok).toBe(false);
    expect(parseProductImage(42).ok).toBe(false);
  });
  it("builds a .jpg address WhatsApp can use directly", () => {
    const url = productImageUrl("https://app.example.com/", "prod_123456", 5);
    expect(url).toBe("https://app.example.com/api/catalog/product-image/prod_123456.jpg?v=5");
    expect(/\.(jpe?g|png)(\?|#|$)/i.test(url)).toBe(true);
  });
});
