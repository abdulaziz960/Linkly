import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { getIntegrationSettings } from "../../../../../lib/database";
import { ensureXRealtimeDelivery } from "../../../../../lib/x-activity";

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
    const baseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
    const result = await ensureXRealtimeDelivery({
      userId,
      userAccessToken: accessToken,
      webhookUrl: `${baseUrl}/api/x/webhook`
    });
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
