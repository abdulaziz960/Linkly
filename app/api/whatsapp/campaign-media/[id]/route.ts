import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

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
  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
