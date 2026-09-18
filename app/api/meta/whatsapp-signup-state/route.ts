import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { createOAuthState } from "../../../../lib/oauth-state";

// WhatsApp Embedded Signup runs entirely through the Facebook JS SDK's
// FB.login() popup and never navigates the browser through
// /api/meta/connect, so the CSRF state cookie that route sets is never
// present for this flow. This endpoint mints the same signed
// audiencew_meta_state cookie/state pair from a same-origin fetch instead,
// right before FB.login() is called, so /api/meta/callback can still
// require and verify a valid state for channel=whatsapp instead of
// exempting it (see app/api/meta/callback/route.ts).
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "يلزم تسجيل الدخول" }, { status: 401 });

  const oauthState = createOAuthState("meta", { channel: "whatsapp" });
  const response = NextResponse.json({ ok: true, state: oauthState.state });
  response.cookies.set("audiencew_meta_state", oauthState.nonce, {
    httpOnly: true,
    maxAge: oauthState.maxAgeSeconds,
    path: "/api/meta",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:"
  });
  return response;
}
