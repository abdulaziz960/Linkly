import { NextRequest, NextResponse } from "next/server";
import { saveOAuthConnection, verifyOAuthState } from "../../../../../../lib/email-channel";
import { getAppOrigin } from "../../../../../../lib/app-url";
import { popupCloseHtml } from "../../../../../../lib/popup-close";

export const runtime = "nodejs";

function popupResult(origin: string, status: "connected" | "error", emailAddress = "", detail = "") {
  const payload = { type: "audiencew:email-oauth", status, emailAddress };
  const message = status === "connected"
    ? "تم ربط Gmail بنجاح. جارٍ الرجوع إلى لوحة التحكم..."
    : `تعذر ربط Gmail${detail ? `: ${detail}` : ""}. جارٍ الرجوع إلى لوحة التحكم...`;
  return new NextResponse(
    popupCloseHtml(origin, message, payload, `/dashboard?view=settings&channel=email&gmail=${status}`),
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const code = request.nextUrl.searchParams.get("code");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const origin = getAppOrigin(request);
  if (provider !== "gmail") return popupResult(origin, "error", "", "مزود غير معروف");
  if (!code) return popupResult(origin, "error", "", "لم يصل رمز التفويض (code) من Google");
  if (!state || state.provider !== provider) return popupResult(origin, "error", "", "فشل التحقق من حالة الطلب (state) - جرّب من جديد");
  try {
    const emailAddress = await saveOAuthConnection(provider, code, state.tenantId);
    return popupResult(origin, "connected", emailAddress);
  } catch (error) {
    console.error("Email OAuth callback failed", error);
    const detail = error instanceof Error ? error.message : "خطأ غير معروف";
    return popupResult(origin, "error", "", detail);
  }
}
