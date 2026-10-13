import { NextRequest, NextResponse } from "next/server";
import { getEmailIntegrationSettings } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { SECRET_MASK } from "../../../../lib/secret-storage";
import { userHasViewPermission } from "../../../../lib/permissions-server";

export const runtime = "nodejs";

async function readSettings() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasViewPermission(user, "settings"))) return NextResponse.json({ error: "لا تملك صلاحية الوصول لإعدادات القنوات" }, { status: 403 });
  const settings = await getEmailIntegrationSettings(user.tenantId);
  return NextResponse.json({ ...settings, webhookSecret: settings.webhookSecret ? SECRET_MASK : "" });
}

async function updateSettings(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasViewPermission(user, "settings"))) return NextResponse.json({ error: "لا تملك صلاحية الوصول لإعدادات القنوات" }, { status: 403 });
  const current = await getEmailIntegrationSettings(user.tenantId);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const provider = body.provider === "gmail" || body.provider === "webhook" ? body.provider : undefined;
  const emailAddress = typeof body.emailAddress === "string" ? body.emailAddress.trim().toLowerCase() : undefined;
  const senderName = typeof body.senderName === "string" ? body.senderName.trim() : undefined;
  const settings = await prisma.emailIntegration.update({ where: { id: current.id }, data: { ...(provider ? { provider } : {}), ...(emailAddress !== undefined ? { emailAddress, ...(emailAddress ? { status: "connected" } : {}) } : {}), ...(senderName !== undefined ? { senderName } : {}), ...(body.status === "not_connected" ? { status: "not_connected", accessToken: "", refreshToken: "" } : {}), updatedAt: new Date().toISOString() } });
  return NextResponse.json({ id: settings.id, provider: settings.provider, status: settings.status, senderName: settings.senderName, emailAddress: settings.emailAddress, webhookSecret: settings.webhookSecret ? SECRET_MASK : "", updatedAt: settings.updatedAt });
}

// A failure here used to surface as Next's HTML 500 page, which the settings
// screen could not read. Always answer with JSON the UI can show.
function failure(error: unknown) {
  console.error("email integration route failed", error);
  return NextResponse.json({ error: "تعذر تحميل إعدادات البريد، حاول مرة أخرى" }, { status: 500 });
}

export async function GET() {
  try {
    return await readSettings();
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    return await updateSettings(request);
  } catch (error) {
    return failure(error);
  }
}
