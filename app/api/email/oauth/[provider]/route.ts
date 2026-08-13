import { NextRequest, NextResponse } from "next/server";
import { getOAuthUrl } from "../../../../../lib/email-channel";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "gmail" && provider !== "outlook") return NextResponse.json({ error: "Unknown email provider" }, { status: 400 });
  const url = getOAuthUrl(provider);
  if (!url) return NextResponse.json({ error: `أضف بيانات OAuth الخاصة بـ ${provider} في متغيرات البيئة أولاً.` }, { status: 503 });
  return NextResponse.redirect(url);
}
