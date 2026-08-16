import { NextRequest, NextResponse } from "next/server";
import { resolveWebsiteTenantId } from "@/lib/database";
import { websiteConversationId } from "@/lib/website-inbox";
import { prisma } from "@/lib/prisma";
import { withCors } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  const siteKey = request.nextUrl.searchParams.get("siteKey")?.trim() || "";
  const visitorId = request.nextUrl.searchParams.get("visitorId")?.trim() || "";

  if (!siteKey || !visitorId) {
    return withCors(NextResponse.json({ ok: false, error: "بيانات ناقصة" }, { status: 400 }));
  }

  const tenantId = await resolveWebsiteTenantId(siteKey);
  if (!tenantId) {
    return withCors(NextResponse.json({ ok: false, error: "مفتاح الموقع غير صحيح" }, { status: 404 }));
  }

  const conversationId = websiteConversationId(tenantId, visitorId);
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" }
  });

  return withCors(
    NextResponse.json({
      ok: true,
      messages: messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        text: message.text,
        createdAt: message.createdAt
      }))
    })
  );
}
