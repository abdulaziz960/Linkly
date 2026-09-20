import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

// Mirrors lib/meta-media-upload.ts's write-time allowlist - defense in
// depth against stored XSS via a row that predates that check (or any
// future write path that forgets to call uploadMetaMedia). Never serve
// anything a browser would render/execute as HTML/SVG/script from this
// public, unauthenticated, same-origin URL.
const ALLOWED_MEDIA_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "video/mp4",
  "video/3gpp",
  "application/pdf"
]);

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// Public, unauthenticated by design: WhatsApp's servers fetch this URL
// directly when sending a template message with an image/video/document
// header (the `link` parameter must be a plain HTTPS URL Meta can GET).
// Scoped by the template's own id (tenant-prefixed) rather than name alone.
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template || !template.headerMediaDataUrl) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(template.headerMediaDataUrl);
  if (!match) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [, mimeType, base64] = match;
  if (!ALLOWED_MEDIA_MIME_TYPES.has(mimeType.toLowerCase())) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
