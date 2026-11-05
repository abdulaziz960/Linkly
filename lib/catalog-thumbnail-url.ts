/**
 * The address a product list should load for a small thumbnail. Only photos uploaded to Linkly can be resized by Linkly
 * (they live behind /api/catalog/product-image/); any other image address is a merchant's own and is used as it is.
 * Pure, so the dashboard (a client component) can use it.
 */
export function thumbnailSrc(imageUrl: string): string {
  if (!imageUrl || !imageUrl.includes("/api/catalog/product-image/")) return imageUrl;
  return `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}w=96`;
}
