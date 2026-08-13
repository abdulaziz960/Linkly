import { NextRequest, NextResponse } from "next/server";
import { getEmailIntegrationSettings } from "../../../../lib/database";
import { storeIncomingEmail } from "../../../../lib/email-inbox";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const settings = await getEmailIntegrationSettings();
  const secret = request.headers.get("x-audiencew-email-secret") || request.nextUrl.searchParams.get("secret");
  const configuredSecret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret || (secret !== settings.webhookSecret && secret !== configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
  }
  const body = await request.json();
  const from = typeof body.from === "string" ? body.from : "";
  const text = typeof body.text === "string" ? body.text : typeof body.html === "string" ? body.html.replace(/<[^>]*>/g, " ") : "";
  if (!from || !text) return NextResponse.json({ error: "from and text are required" }, { status: 400 });
  const result = await storeIncomingEmail({ from, fromName: typeof body.fromName === "string" ? body.fromName : undefined, subject: typeof body.subject === "string" ? body.subject : undefined, text, messageId: typeof body.messageId === "string" ? body.messageId : undefined, receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined });
  return NextResponse.json({ received: true, ...result });
}
