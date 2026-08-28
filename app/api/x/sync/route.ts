import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings } from "../../../../lib/database";
import { syncXTenant } from "../../../../lib/x-sync";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "يلزم تسجيل الدخول" }, { status: 401 });

  const settings = await getIntegrationSettings("x", user.tenantId);
  const result = await syncXTenant(settings);
  return NextResponse.json(result, { status: result.status });
}

export async function GET() {
  return POST();
}
