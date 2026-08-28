import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { authCookieName, createSessionToken } from "../../../../lib/auth";
import { hashPassword } from "../../../../lib/database";
import { getPasswordValidationError } from "../../../../lib/passwords";
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
  const passwordError = getPasswordValidationError(password);
  if (passwordError) return NextResponse.json({ message: passwordError }, { status: 400 });

  const invite = await prisma.employeeInvite.findUnique({
    where: { tokenHash: hashToken(token) }
  });

  if (!invite || new Date(invite.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ message: "رابط التفعيل منتهي أو غير صالح" }, { status: 400 });
  }

  const existingAccount = await prisma.userAccount.findUnique({ where: { email: invite.email } });
  if (!existingAccount) {
    return NextResponse.json({ message: "رابط التفعيل منتهي أو غير صالح" }, { status: 400 });
  }

  // A token can only be consumed for the account state its purpose implies:
  // an activation token (employee, tenant-owner, or platform-admin invite)
  // sets a FIRST password on a brand-new account, while a password-reset
  // token replaces an existing one - neither can substitute for the other,
  // even though both flows land on this same endpoint.
  const isResetPurpose = invite.purpose === "password_reset";
  const accountAlreadyActivated = Boolean(existingAccount.passwordHash);
  if (isResetPurpose !== accountAlreadyActivated) {
    return NextResponse.json({ message: "رابط التفعيل منتهي أو غير صالح" }, { status: 400 });
  }

  const user = await prisma.userAccount.update({
    where: { email: invite.email },
    data: { passwordHash: hashPassword(password), sessionVersion: { increment: 1 } }
  });

  await prisma.employeeInvite.deleteMany({ where: { email: invite.email } });

  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  const response = NextResponse.json({ user: safeUser });
  response.cookies.set(authCookieName, createSessionToken(user.id, 60 * 60 * 24, user.sessionVersion), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24
  });

  return response;
}
