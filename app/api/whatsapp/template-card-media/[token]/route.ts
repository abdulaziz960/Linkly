import { NextRequest, NextResponse } from "next/server";
import { getCarouselCardImage } from "../../../../../lib/template-carousel";

export const runtime = "nodejs";

// Public by design: WhatsApp fetches a carousel card's image from this URL when a carousel template is sent. The
// path segment is the card's random token, and only JPEG/PNG is ever served (same allowlist as the template media).
export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const dataUrl = await getCarouselCardImage(token);
  const match = dataUrl ? /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(dataUrl) : null;
  if (!match) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(Buffer.from(match[2], "base64"), {
    headers: { "Content-Type": match[1], "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable" }
  });
}
