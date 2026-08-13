import { NextRequest, NextResponse } from "next/server";
import { getEmailIntegrationSettings } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getEmailIntegrationSettings());
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const provider = body.provider === "gmail" || body.provider === "outlook" || body.provider === "webhook" ? body.provider : undefined;
  const emailAddress = typeof body.emailAddress === "string" ? body.emailAddress.trim().toLowerCase() : undefined;
  const senderName = typeof body.senderName === "string" ? body.senderName.trim() : undefined;
  const settings = await prisma.emailIntegration.update({ where: { id: "primary-email" }, data: { ...(provider ? { provider } : {}), ...(emailAddress !== undefined ? { emailAddress, ...(emailAddress ? { status: "connected" } : {}) } : {}), ...(senderName !== undefined ? { senderName } : {}), ...(body.status === "not_connected" ? { status: "not_connected", accessToken: "", refreshToken: "" } : {}), updatedAt: new Date().toISOString() } });
  return NextResponse.json({ id: settings.id, provider: settings.provider, status: settings.status, senderName: settings.senderName, emailAddress: settings.emailAddress, webhookSecret: settings.webhookSecret, updatedAt: settings.updatedAt });
}
