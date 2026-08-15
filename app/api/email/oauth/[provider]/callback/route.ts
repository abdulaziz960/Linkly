import { NextRequest, NextResponse } from "next/server";
import { saveOAuthConnection, verifyOAuthState } from "../../../../../../lib/email-channel";

export const runtime = "nodejs";

function popupResult(origin: string, status: "connected" | "error", emailAddress = "") {
  const payload = JSON.stringify({ type: "audiencew:email-oauth", status, emailAddress });
  return new NextResponse(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ربط البريد</title></head><body><p>${status === "connected" ? "تم ربط Gmail بنجاح. سيتم إغلاق النافذة." : "تعذر ربط Gmail. يمكنك إغلاق النافذة والمحاولة مجددًا."}</p><script>if(window.opener){window.opener.postMessage(${JSON.stringify(payload)},${JSON.stringify(origin)});window.close();}</script></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const code = request.nextUrl.searchParams.get("code");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const origin = request.nextUrl.origin;
  if ((provider !== "gmail" && provider !== "outlook") || !code || !state || state.provider !== provider) return popupResult(origin, "error");
  try {
    const emailAddress = await saveOAuthConnection(provider, code, state.tenantId);
    return popupResult(origin, "connected", emailAddress);
  } catch (error) {
    console.error("Email OAuth callback failed", error);
    return popupResult(origin, "error");
  }
}
