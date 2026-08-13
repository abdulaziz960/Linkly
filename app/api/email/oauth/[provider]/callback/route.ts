import { NextRequest, NextResponse } from "next/server";
import { saveOAuthConnection } from "../../../../../../lib/email-channel";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const code = request.nextUrl.searchParams.get("code");
  if ((provider !== "gmail" && provider !== "outlook") || !code) return NextResponse.redirect(new URL("/dashboard?email=error", request.url));
  try {
    await saveOAuthConnection(provider, code);
    return NextResponse.redirect(new URL("/dashboard?email=connected", request.url));
  } catch (error) {
    console.error("Email OAuth callback failed", error);
    return NextResponse.redirect(new URL("/dashboard?email=error", request.url));
  }
}
