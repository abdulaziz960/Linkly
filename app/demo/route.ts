import { NextRequest, NextResponse } from "next/server";
import { authCookieName, createSessionToken, getCurrentUser } from "../../lib/auth";
import { getAppOrigin } from "../../lib/app-url";
import { consumeRateLimit, requestIdentifier } from "../../lib/rate-limit";
import { isDemoTenant, DEMO_DAYS } from "../../lib/demo-mode";
import { createDemoWorkspace, isDemoKeyValid } from "../../lib/demo-workspace";

export const runtime = "nodejs";

const MAX_AGE_SECONDS = DEMO_DAYS * 24 * 60 * 60;

/**
 * The reviewers' link: /demo?key=<DEMO_ACCESS_KEY>. Opens a brand-new demo workspace (or, in a browser that already holds
 * a live demo session, goes back into that one). The key is the only gate; without it (or a wrong one) nothing is created.
 */
export async function GET(request: NextRequest) {
  const origin = getAppOrigin(request);
  if (!isDemoKeyValid(request.nextUrl.searchParams.get("key"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const existing = await getCurrentUser().catch(() => null);
  if (existing && (await isDemoTenant(existing.tenantId))) {
    return NextResponse.redirect(new URL("/dashboard?view=inbox", origin));
  }

  const limit = await consumeRateLimit("demo-start", requestIdentifier(request, "demo"), 30, 60 * 60 * 1000);
  if (!limit.allowed) {
    return new NextResponse("Too many requests", { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const workspace = await createDemoWorkspace();
  const response = NextResponse.redirect(new URL("/dashboard?view=inbox", origin));
  response.cookies.set(authCookieName, createSessionToken(workspace.userId, MAX_AGE_SECONDS, 0), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
