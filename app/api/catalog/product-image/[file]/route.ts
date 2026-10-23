import { NextRequest, NextResponse } from "next/server";
import { getProductImage } from "../../../../../lib/catalog-product-image";

export const runtime = "nodejs";

/** Public on purpose (WhatsApp's servers fetch the product photo here); the address holds the product id, which is not guessable. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = decodeURIComponent(file).replace(/\.jpe?g$/i, "");
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(id)) return new NextResponse(null, { status: 404 });
  const bytes = await getProductImage(id);
  if (!bytes) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
