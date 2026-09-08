import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "../../../../lib/prisma";
import { ensureSchema } from "../../../../lib/database";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

// Public, unauthenticated by design - called from the marketing homepage
// before the visitor is a customer. Records that a WhatsApp CTA was
// clicked (and with what UTM/referrer context) so the inbound message it
// leads to, if any, can be attributed back to it - see the [REF:<id>]
// marker this id gets embedded in (app/WhatsAppCta.tsx) and how
// lib/whatsapp-inbox.ts's storeWhatsAppMessage() reads it back.
export async function POST(request: NextRequest) {
  const rateLimit = await consumeRateLimit("attribution-click", requestIdentifier(request), 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "طلبات كثيرة، حاول لاحقاً" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const body = await request.json().catch(() => null) as {
    pageId?: string;
    linkId?: string;
    buttonId?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
  } | null;
  if (!body?.pageId || !body.linkId) {
    return NextResponse.json({ ok: false, error: "pageId و linkId مطلوبان" }, { status: 400 });
  }

  await ensureSchema();

  const id = randomBytes(8).toString("hex");
  await prisma.linkClick.create({
    data: {
      id,
      tenantId: process.env.ATTRIBUTION_TENANT_ID?.trim() || "tenant-demo",
      pageId: body.pageId.slice(0, 100),
      linkId: body.linkId.slice(0, 100),
      buttonId: (body.buttonId || body.linkId).slice(0, 100),
      referrer: (body.referrer || "").slice(0, 500),
      utmSource: (body.utmSource || "").slice(0, 200),
      utmMedium: (body.utmMedium || "").slice(0, 200),
      utmCampaign: (body.utmCampaign || "").slice(0, 200),
      utmContent: (body.utmContent || "").slice(0, 200),
      createdAt: new Date().toISOString()
    }
  });

  return NextResponse.json({ ok: true, id });
}
