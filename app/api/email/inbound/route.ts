import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { storeEmailMessage } from "../../../../lib/email-inbox";

export const runtime = "nodejs";

function readToken(request: NextRequest) {
  return (
    request.headers.get("x-audiencew-email-secret") ||
    request.headers.get("x-webhook-secret") ||
    request.nextUrl.searchParams.get("token") ||
    ""
  ).trim();
}

function readEmailAddress(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "email" in value && typeof value.email === "string") return value.email;
  return "";
}

export async function GET(request: NextRequest) {
  const settings = await getIntegrationSettings("email");
  const token = readToken(request);

  if (settings.verifyToken && token !== settings.verifyToken) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    channel: "email",
    webhook: settings.webhookUrl
  });
}

export async function POST(request: NextRequest) {
  const settings = await getIntegrationSettings("email");
  const token = readToken(request);

  if (settings.verifyToken && token !== settings.verifyToken) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    from?: unknown;
    fromName?: string;
    name?: string;
    subject?: string;
    text?: string;
    html?: string;
    messageId?: string;
    id?: string;
    receivedAt?: string;
    date?: string;
  } | null;

  const from = readEmailAddress(body?.from);
  if (!from.trim()) {
    return NextResponse.json({ ok: false, error: "from is required" }, { status: 400 });
  }

  const message = await storeEmailMessage({
    tenantId: "tenant-demo",
    from,
    fromName: body?.fromName || body?.name,
    subject: body?.subject,
    text: body?.text,
    html: body?.html,
    messageId: body?.messageId || body?.id,
    receivedAt: body?.receivedAt || body?.date
  });

  return NextResponse.json({
    ok: true,
    messageId: message.message.id
  });
}
