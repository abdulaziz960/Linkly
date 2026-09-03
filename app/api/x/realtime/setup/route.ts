import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { getIntegrationSettings } from "../../../../../lib/database";
import { ensureXRealtimeDelivery } from "../../../../../lib/x-activity";
import { prisma } from "../../../../../lib/prisma";
import { getAppOrigin } from "../../../../../lib/app-url";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "يلزم تسجيل الدخول" }, { status: 401 });

  const settings = await getIntegrationSettings("x", user.tenantId);
  const userId = settings.wabaId.trim();
  const accessToken = settings.accessToken.trim() || settings.xAccessToken.trim();

  if (!userId || !accessToken) {
    return NextResponse.json({ ok: false, error: "اربط حساب X أولاً" }, { status: 400 });
  }

  try {
    const baseUrl = getAppOrigin(request);
    // Must match the callback route's webhookUrl exactly (including
    // ?tenant=) - otherwise this creates a second, differently-scoped
    // webhook instead of reusing/repairing the tenant's own one.
    const webhookUrl = `${baseUrl}/api/x/webhook?tenant=${encodeURIComponent(user.tenantId)}`;
    const result = await ensureXRealtimeDelivery({
      userId,
      userAccessToken: accessToken,
      webhookUrl
    });
    await prisma.integrationSetting.update({ where: { id: settings.id }, data: { webhookUrl } }).catch(() => {});
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("X realtime setup failed", error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "تعذر تفعيل الاستقبال اللحظي من X"
    }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
