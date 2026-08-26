import { NextRequest, NextResponse } from "next/server";
import { getEmailIntegrationSettings } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { SECRET_MASK } from "../../../../lib/secret-storage";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getEmailIntegrationSettings(user.tenantId);
  return NextResponse.json({ ...settings, webhookSecret: settings.webhookSecret ? SECRET_MASK : "" });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const current = await getEmailIntegrationSettings(user.tenantId);
  const body = await request.json();
  const provider = body.provider === "gmail" || body.provider === "webhook" ? body.provider : undefined;
  const emailAddress = typeof body.emailAddress === "string" ? body.emailAddress.trim().toLowerCase() : undefined;
  const senderName = typeof body.senderName === "string" ? body.senderName.trim() : undefined;
  const settings = await prisma.emailIntegration.update({ where: { id: current.id }, data: { ...(provider ? { provider } : {}), ...(emailAddress !== undefined ? { emailAddress, ...(emailAddress ? { status: "connected" } : {}) } : {}), ...(senderName !== undefined ? { senderName } : {}), ...(body.status === "not_connected" ? { status: "not_connected", accessToken: "", refreshToken: "" } : {}), updatedAt: new Date().toISOString() } });
  return NextResponse.json({ id: settings.id, provider: settings.provider, status: settings.status, senderName: settings.senderName, emailAddress: settings.emailAddress, webhookSecret: settings.webhookSecret ? SECRET_MASK : "", updatedAt: settings.updatedAt });
}
