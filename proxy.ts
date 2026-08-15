import { NextRequest, NextResponse } from "next/server";

const legacyRedirects: Record<string, string> = {
  "/index.html": "/",
  "/dashboard.html": "/dashboard",
  "/admin.html": "/dashboard?view=inbox",
  "/contact.html": "/",
  "/data-deletion.html": "/data-deletion",
  "/privacy.html": "/privacy",
  "/terms.html": "/terms"
};

export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const redirectTo = legacyRedirects[url.pathname];

  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, request.url), 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/index.html",
    "/dashboard.html",
    "/admin.html",
    "/contact.html",
    "/data-deletion.html",
    "/privacy.html",
    "/terms.html"
  ]
};
