import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../../lib/prisma";
import { authCookieName, verifySessionToken } from "../../../../lib/auth";

export async function POST() {
  const session = verifySessionToken((await cookies()).get(authCookieName)?.value);
  if (session) {
    // Signed cookies are otherwise valid until expiry. Rotating the version
    // invalidates this session server-side, including any copied cookie.
    await prisma.userAccount.updateMany({
      where: { id: session.userId, sessionVersion: session.sessionVersion },
      data: { sessionVersion: { increment: 1 } }
    });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  return response;
}
