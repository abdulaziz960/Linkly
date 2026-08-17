import { NextRequest, NextResponse } from "next/server";
import { resolveWebsiteTenantId } from "@/lib/database";
import { storeWebsiteMessage } from "@/lib/website-inbox";
import { runChannelBot } from "@/lib/bot-engine";
import { withCors } from "../../_utils/cors";

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

  const tenantId = await resolveWebsiteTenantId(siteKey);
  if (!tenantId) {
    return withCors(NextResponse.json({ ok: false, error: "مفتاح الموقع غير صحيح" }, { status: 404 }));
  }

  try {
    const { conversationId } = await storeWebsiteMessage({
      tenantId,
      visitorId,
      name: body?.name,
      email: body?.email,
      text
    });
    void runChannelBot("website", {
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
