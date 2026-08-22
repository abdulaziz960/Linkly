import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { storeEmailMessage } from "../../../../lib/email-inbox";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";

function readToken(request: NextRequest) {
  return (
    request.headers.get("x-audiencew-email-secret") ||
    request.headers.get("x-webhook-secret") ||
    ""
  ).trim();
}

function validToken(actual: string, expected: string) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function getTenantId(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenant")?.trim() || "tenant-demo";
  return /^[a-zA-Z0-9_-]{1,100}$/.test(tenantId) ? tenantId : null;
}

function readEmailAddress(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "email" in value && typeof value.email === "string") return value.email;
  return "";
}

export async function GET(request: NextRequest) {
  const tenantId = getTenantId(request);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Invalid tenant" }, { status: 400 });
  const settings = await getIntegrationSettings("email", tenantId);
  const token = readToken(request);

  if (!validToken(token, settings.verifyToken)) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    channel: "email",
    webhook: settings.webhookUrl
  });
}

export async function POST(request: NextRequest) {
  const tenantId = getTenantId(request);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Invalid tenant" }, { status: 400 });
  const settings = await getIntegrationSettings("email", tenantId);
  const token = readToken(request);

  if (!validToken(token, settings.verifyToken)) {
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
    tenantId,
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
