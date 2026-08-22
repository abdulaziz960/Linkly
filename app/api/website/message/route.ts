import { NextRequest, NextResponse } from "next/server";
import { resolveWebsiteTenantId } from "@/lib/database";
import { storeWebsiteMessage } from "@/lib/website-inbox";
import { runChannelBot } from "@/lib/bot-engine";
import { withCors } from "../../_utils/cors";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    siteKey?: string;
    visitorId?: string;
    name?: string;
    email?: string;
    text?: string;
  } | null;

  const siteKey = body?.siteKey?.trim() || "";
  const visitorId = body?.visitorId?.trim() || "";
  const text = body?.text?.trim().slice(0, 4000) || "";

  if (!siteKey || !visitorId || !text) {
    return withCors(NextResponse.json({ ok: false, error: "بيانات ناقصة" }, { status: 400 }));
  }
  if (siteKey.length > 200 || visitorId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(visitorId)) {
    return withCors(NextResponse.json({ ok: false, error: "بيانات غير صالحة" }, { status: 400 }));
  }
  const rateLimit = await consumeRateLimit("website-message", requestIdentifier(request, siteKey), 30, 5 * 60 * 1000);
  if (!rateLimit.allowed) {
    return withCors(NextResponse.json({ ok: false, error: "محاولات كثيرة" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }));
  }

  const tenantId = await resolveWebsiteTenantId(siteKey);
  if (!tenantId) {
    return withCors(NextResponse.json({ ok: false, error: "مفتاح الموقع غير صحيح" }, { status: 404 }));
  }

  try {
    const { conversationId } = await storeWebsiteMessage({
      tenantId,
      visitorId,
      name: body?.name?.trim().slice(0, 100),
      email: body?.email?.trim().slice(0, 254),
      text
    });
    await runChannelBot("website", {
      tenantId,
      conversationId,
      recipientId: visitorId,
      incomingText: text
    });
    return withCors(NextResponse.json({ ok: true, conversationId }));
  } catch (error) {
    console.error("Website widget message failed", error);
    return withCors(NextResponse.json({ ok: false, error: "تعذر إرسال الرسالة" }, { status: 500 }));
  }
}
