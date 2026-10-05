import { NextRequest, NextResponse } from "next/server";
import { findRedirect } from "./lib/redirects";

const legacyRedirects: Record<string, string> = {
  "/index.html": "/",
  "/dashboard.html": "/dashboard",
  "/admin.html": "/dashboard?view=inbox",
  "/contact.html": "/",
  "/data-deletion.html": "/data-deletion",
  "/privacy.html": "/privacy",
  "/terms.html": "/terms"
};

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const redirectTo = legacyRedirects[url.pathname];

  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, request.url), 308);
  }

  // Redirects managed from the admin panel (cached in memory, so a request costs a map lookup).
  if (request.method === "GET" || request.method === "HEAD") {
    const rule = await findRedirect(url.pathname);
    if (rule) {
      if (rule.status === 410) {
        return new NextResponse("Gone", { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
      }
      return NextResponse.redirect(new URL(rule.to, request.url), rule.status);
    }
  }

  // Tells the root layout which language the page is, so the server-rendered <html lang dir> is right for /en pages too.
  const headers = new Headers(request.headers);
  headers.set("x-linkly-lang", url.pathname === "/en" || url.pathname.startsWith("/en/") ? "en" : "ar");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Every page except the framework, API, static assets, uploaded media and the signed-in areas.
  matcher: ["/((?!_next/|api/|assets/|icons/|fonts/|media/|dashboard|linkly-admin007|favicon|opengraph-image|twitter-image|robots.txt|sitemap.xml|.*\\.[a-zA-Z0-9]+$).*)", "/index.html", "/dashboard.html", "/admin.html", "/contact.html", "/data-deletion.html", "/privacy.html", "/terms.html"]
};
