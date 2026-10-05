import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const COOKIE_NAME = "linkly_consent";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

// Re-issues the visitor's cookie choice as a server-set first-party cookie.
// Safari caps script-written cookies at 7 days; cookies set through a
// Set-Cookie header keep their full lifetime, so the banner does not come back.
// Nothing is stored server-side and no personal data is read.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { choice?: unknown } | null;
  const choice = body?.choice;
  if (choice !== "accepted" && choice !== "rejected") {
    return NextResponse.json({ ok: false, error: "invalid choice" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, choice, {
    maxAge: MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false
  });
  return response;
}
