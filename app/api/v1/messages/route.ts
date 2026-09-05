import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, sendApiMessage } from "../../../../lib/developer-api";
import { consumeRateLimit } from "../../../../lib/rate-limit";
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

  const body = (await request.json().catch(() => null)) as { conversationId?: string; text?: string } | null;
  const conversationId = body?.conversationId?.trim() || "";
  const text = body?.text?.trim().slice(0, 4000) || "";

  if (!conversationId || !text) {
    return withCors(NextResponse.json({ ok: false, error: "conversationId and text are required" }, { status: 400 }));
  }

  const result = await sendApiMessage(auth.tenantId, { conversationId, text });
  if (!result) return withCors(NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 }));
  if (!result.ok) return withCors(NextResponse.json({ ok: false, error: "Unable to send the message" }, { status: 502 }));

  return withCors(NextResponse.json({ ok: true }));
}
