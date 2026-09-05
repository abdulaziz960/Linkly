import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, openApiConversation } from "../../../../lib/developer-api";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { isValidSaudiPhone } from "../../../../lib/validation";
import { withCors } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (!auth) return withCors(NextResponse.json({ ok: false, error: "Invalid or missing API key" }, { status: 401 }));

  const rateLimit = await consumeRateLimit("public-api", auth.rawKey, 60, 60_000);
  if (!rateLimit.allowed) {
    return withCors(NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }));
  }

  const body = (await request.json().catch(() => null)) as { customerPhone?: string; customerName?: string; text?: string } | null;
  const customerPhone = body?.customerPhone?.trim() || "";
  const text = body?.text?.trim().slice(0, 4000) || "";

  if (!customerPhone || !text) {
    return withCors(NextResponse.json({ ok: false, error: "customerPhone and text are required" }, { status: 400 }));
  }
  if (!isValidSaudiPhone(customerPhone)) {
    return withCors(NextResponse.json({ ok: false, error: "customerPhone must be a valid Saudi mobile number" }, { status: 400 }));
  }

  try {
    const { conversationId } = await openApiConversation(auth.tenantId, {
      customerPhone,
      customerName: body?.customerName?.trim().slice(0, 100),
      text
    });
    return withCors(NextResponse.json({ ok: true, data: { conversationId } }));
  } catch (error) {
    console.error("Public API conversation creation failed", error);
    return withCors(NextResponse.json({ ok: false, error: "Unable to create the conversation" }, { status: 500 }));
  }
}
