import { NextRequest, NextResponse } from "next/server";
import { findRedirect } from "./lib/redirects";
import { randomBytes } from "node:crypto";
import { contentSecurityPolicy } from "./lib/security-headers";

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
  if (url.hostname === "www.linklysa.io") {
    const canonical = url.clone();
    canonical.hostname = "linklysa.io";
    canonical.protocol = "https:";
    canonical.port = "";
    return NextResponse.redirect(canonical, 308);
  }
  const redirectTo = legacyRedirects[url.pathname];

  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, request.url), 308);
  }

  // Redirects managed from the admin panel (cached in memory, so a request costs a map lookup).
  const privateArea = /^\/(dashboard|linkly-admin007|billing|checkout)(\/|$)/.test(url.pathname);
  if (!privateArea && (request.method === "GET" || request.method === "HEAD")) {
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
  const nonce = randomBytes(18).toString("base64");
  const policy = contentSecurityPolicy(nonce);
  headers.set("x-nonce", nonce);
  // Next.js reads the request CSP to nonce its framework and hydration scripts.
  headers.set("Content-Security-Policy", policy);
  headers.set("x-linkly-lang", url.pathname === "/en" || url.pathname.startsWith("/en/") ? "en" : "ar");
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  // private: never shared between visitors (each page carries its own nonce); no-cache instead of no-store so the browser may keep the page for instant back/forward navigation (bfcache) but must revalidate it.
  response.headers.set("Cache-Control", "private, no-cache, max-age=0, must-revalidate");
  return response;
}

export const config = {
  // Every page except the framework, API, static assets, uploaded media and the signed-in areas.
  matcher: ["/((?!_next/|api/|assets/|icons/|fonts/|media/|tutorials/|favicon|opengraph-image|twitter-image|robots.txt|sitemap.xml|llms.txt|widget.js|service-worker.js|manifest.json).*)"]
};
