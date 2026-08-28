import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { syncXMentionsForTenant } from "../../../../../lib/x-public-sync";
import { XApiError } from "../../../../../lib/x-api";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "يلزم تسجيل الدخول" }, { status: 401 });

  try {
    const result = await syncXMentionsForTenant(user.tenantId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof XApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر مزامنة X" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
