import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { ensureSchema } from "../../../../../lib/database";
import { isPubliclyRoutableUrl } from "../../../../../lib/url-safety";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/**
 * Public on purpose: WhatsApp's servers fetch product-card images from here.
 * WhatsApp only accepts JPEG/PNG for message images, but merchants' sites
 * commonly serve WebP - so this re-encodes a product's own stored image as
 * JPEG. It only ever fetches the URL saved on that product (never a caller-
 * supplied one) and still refuses non-public addresses on every redirect hop.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await ensureSchema();
  const product = await prisma.product.findUnique({ where: { id }, select: { imageUrl: true, active: true } });
  if (!product?.imageUrl || !product.active) return new NextResponse(null, { status: 404 });

  try {
    let url = product.imageUrl;
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!(await isPubliclyRoutableUrl(url))) return new NextResponse(null, { status: 404 });
      response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000), headers: { "User-Agent": "LinklyCatalogImage/1.0" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return new NextResponse(null, { status: 502 });
        url = new URL(location, url).toString();
        response = null;
        continue;
      }
      break;
    }
    if (!response || !response.ok || !response.body) return new NextResponse(null, { status: 502 });

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) return new NextResponse(null, { status: 413 });

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        return new NextResponse(null, { status: 413 });
      }
      chunks.push(value);
    }

    const { default: sharp } = await import("sharp");
    const jpeg = await sharp(Buffer.concat(chunks)).rotate().resize({ width: 1280, withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
    return new NextResponse(new Uint8Array(jpeg), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" }
    });
  } catch (error) {
    console.error("Catalog image conversion failed", error instanceof Error ? error.message : error);
    return new NextResponse(null, { status: 502 });
  }
}
