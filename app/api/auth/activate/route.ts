import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { authCookieName, createSessionToken } from "../../../../lib/auth";
import { hashPassword } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
  };
  const token = body.token?.trim() || "";
  const password = body.password || "";

  if (!token) {
    return NextResponse.json({ message: "رابط التفعيل غير صالح" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ message: "كلمة السر يجب أن تكون 8 أحرف على الأقل" }, { status: 400 });
  }

  const invite = await prisma.employeeInvite.findUnique({
    where: { tokenHash: hashToken(token) }
  });

  if (!invite || new Date(invite.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ message: "رابط التفعيل منتهي أو غير صالح" }, { status: 400 });
  }

  const user = await prisma.userAccount.update({
    where: { email: invite.email },
    data: { passwordHash: hashPassword(password) }
  });

  await prisma.employeeInvite.deleteMany({ where: { email: invite.email } });

  const { passwordHash: _passwordHash, ...safeUser } = user;
  const response = NextResponse.json({ user: safeUser });
  response.cookies.set(authCookieName, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24
  });

  return response;
}
