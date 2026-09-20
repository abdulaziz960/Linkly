import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "../../../../../lib/database";
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
// The path segment is the template's random mediaToken, never its own id -
// the id is predictable (tmpl-<tenantId>-<name>), so it can't double as a
// bearer secret for an endpoint with no other access control (pre-launch
// audit F-01). ensureSchema() guarantees the one-time mediaToken backfill
// (lib/database.ts) has run before this lookup, so there's no window where
// falling back to the insecure id-based lookup would be needed.
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  await ensureSchema();

  const template = await prisma.template.findFirst({ where: { mediaToken: id } });
  if (!template || !template.headerMediaDataUrl) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(template.headerMediaDataUrl);
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
