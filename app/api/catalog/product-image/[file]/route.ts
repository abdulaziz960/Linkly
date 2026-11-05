import { NextRequest, NextResponse } from "next/server";
import { getProductImage, makeProductThumbnail, thumbnailWidthFrom } from "../../../../../lib/catalog-product-image";

export const runtime = "nodejs";

/** Public on purpose (WhatsApp's servers fetch the product photo here); the address holds the product id, which is not guessable. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = decodeURIComponent(file).replace(/\.jpe?g$/i, "");
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(id)) return new NextResponse(null, { status: 404 });
  const original = await getProductImage(id);
  if (!original) return new NextResponse(null, { status: 404 });
  // ?w=96 (dashboard list): a small copy instead of the full photo. The ?v= in the address changes with every upload, so it can be cached.
  const width = thumbnailWidthFrom(request.nextUrl.searchParams.get("w"));
  const bytes = width ? await makeProductThumbnail(original, width) : original;
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
