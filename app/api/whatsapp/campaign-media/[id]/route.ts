import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

// Mirrors the allowlist app/api/campaigns/route.ts already enforces at
// write time - defense in depth for this public, unauthenticated,
// same-origin URL against ever serving something a browser would
// render/execute as HTML/SVG/script.
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
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign || !campaign.headerMediaDataUrl) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(campaign.headerMediaDataUrl);
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
