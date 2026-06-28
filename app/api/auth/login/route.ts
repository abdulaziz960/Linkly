import { NextResponse } from "next/server";
import { authCookieName, createSessionToken } from "../../../../lib/auth";
import { verifyUserCredentials } from "../../../../lib/database";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const remember = Boolean(body.remember);

  const user = await verifyUserCredentials(email, password);
  if (!user) {
    return NextResponse.json({ message: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }

  const response = NextResponse.json({ user });
  response.cookies.set(authCookieName, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24
  });

  return response;
}
