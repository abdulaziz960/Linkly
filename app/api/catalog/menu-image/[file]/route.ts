import { NextRequest, NextResponse } from "next/server";
import { getMenuImage } from "../../../../../lib/catalog-menu-image";

export const runtime = "nodejs";

/** Public on purpose (WhatsApp's servers fetch the menu picture here); the address holds the workspace id, which is not guessable. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = decodeURIComponent(file).replace(/\.jpe?g$/i, "");
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(id)) return new NextResponse(null, { status: 404 });
  const bytes = await getMenuImage(id);
  if (!bytes) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
