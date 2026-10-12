import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "../../../../lib/prisma";
import { ensureSchema } from "../../../../lib/database";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { WA_LINK_PAGE_ID, clickIdFromQuery, getWaLinkByCode, whatsappUrl, workspaceWhatsappDigits } from "../../../../lib/wa-links";

export const runtime = "nodejs";

function notice(message: string, status: number) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Linkly</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#16302d"><p style="font-size:18px">${message}</p></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * The destination of an ad: records the click (with the ad platform's click id) and opens WhatsApp with the
 * message pre-filled. Public by design (the visitor is a customer's customer); never blocks on a failure.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const limit = await consumeRateLimit("wa-link-click", requestIdentifier(request), 120, 60 * 1000);
  if (!limit.allowed) return notice("طلبات كثيرة، حاول بعد قليل.", 429);

  const link = await getWaLinkByCode(code.toLowerCase());
  if (!link) return notice("هذا الرابط غير متاح.", 404);
  const digits = await workspaceWhatsappDigits(link.tenantId);
  if (!digits) return notice("رقم الواتساب غير مفعّل لهذا الرابط.", 503);

  const query = request.nextUrl.searchParams;
  const { clickId } = clickIdFromQuery(query);
  let ref = "";
  try {
    await ensureSchema();
    ref = randomBytes(8).toString("hex");
    await prisma.linkClick.create({
      data: {
        id: ref,
        tenantId: link.tenantId,
        pageId: WA_LINK_PAGE_ID,
        linkId: link.code,
        // The platform's click id rides in buttonId: it ends up on the conversation (attrButtonId) when the message matches.
        buttonId: (clickId || link.code).slice(0, 100),
        referrer: (request.headers.get("referer") || "").slice(0, 500),
        utmSource: (query.get("utm_source") || link.platform).slice(0, 200),
        utmMedium: (query.get("utm_medium") || "tracking_link").slice(0, 200),
        utmCampaign: (query.get("utm_campaign") || link.campaign).slice(0, 200),
        utmContent: (query.get("utm_content") || link.name).slice(0, 200),
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    // Attribution is best effort: the visitor still reaches WhatsApp.
    console.error("Tracking link click failed", error);
    ref = "";
  }
  return NextResponse.redirect(whatsappUrl(digits, link.message, ref), { status: 302, headers: { "Cache-Control": "no-store" } });
}
