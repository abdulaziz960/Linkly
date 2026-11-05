import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { makeProductThumbnail, thumbnailWidthFrom } from "../lib/catalog-product-image";

async function photo(width: number, height: number) {
  // Smooth gradient with a little noise, like a real photo: large enough to matter, small enough to be a valid upload.
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    raw[i] = (x * 255) / width; raw[i + 1] = (y * 255) / height; raw[i + 2] = (x * y) % 97;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

describe("product photo thumbnails", () => {
  it("only honours the widths the list needs", () => {
    expect(thumbnailWidthFrom("96")).toBe(96);
    expect(thumbnailWidthFrom("240")).toBe(240);
    expect(thumbnailWidthFrom("500")).toBeNull();
    expect(thumbnailWidthFrom("abc")).toBeNull();
    expect(thumbnailWidthFrom("-96")).toBeNull();
    expect(thumbnailWidthFrom("")).toBeNull();
    expect(thumbnailWidthFrom(null)).toBeNull();
  });

  it("returns a much smaller JPEG of the requested width", async () => {
    const original = await photo(1200, 900);
    const thumb = await makeProductThumbnail(original, 96);
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(96);
    expect(thumb.length).toBeLessThan(original.length / 10);
  });

  it("never enlarges a photo that is already smaller than the thumbnail", async () => {
    const small = await photo(60, 60);
    const thumb = await makeProductThumbnail(small, 96);
    expect((await sharp(thumb).metadata()).width).toBe(60);
  });

  it("falls back to the original bytes when the image cannot be decoded", async () => {
    const garbage = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);
    expect((await makeProductThumbnail(garbage, 96)).equals(garbage)).toBe(true);
  });
});

import { thumbnailSrc } from "../lib/catalog-thumbnail-url";

describe("list thumbnail address", () => {
  it("asks our own photo endpoint for the small copy, keeping the version", () => {
    expect(thumbnailSrc("https://linklysa.io/api/catalog/product-image/prod_123456.jpg?v=5")).toBe("https://linklysa.io/api/catalog/product-image/prod_123456.jpg?v=5&w=96");
    expect(thumbnailSrc("https://linklysa.io/api/catalog/product-image/prod_123456.jpg")).toBe("https://linklysa.io/api/catalog/product-image/prod_123456.jpg?w=96");
  });
  it("leaves other images (a merchant's own CDN) untouched", () => {
    expect(thumbnailSrc("https://cdn.salla.sa/p/1.jpg?v=2")).toBe("https://cdn.salla.sa/p/1.jpg?v=2");
    expect(thumbnailSrc("")).toBe("");
  });
});
