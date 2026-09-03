import { NextRequest, NextResponse } from "next/server";
import { getOAuthUrl } from "../../../../../lib/email-channel";
import { getCurrentUser } from "../../../../../lib/auth";
import { getAppOrigin } from "../../../../../lib/app-url";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));
  if (provider !== "gmail") return NextResponse.json({ error: "Unknown email provider" }, { status: 400 });
  const url = getOAuthUrl(provider, { userId: user.id, tenantId: user.tenantId });
  if (!url) return NextResponse.json({ error: `أضف بيانات OAuth الخاصة بـ ${provider} في متغيرات البيئة أولاً.` }, { status: 503 });
  return NextResponse.redirect(url);
}
