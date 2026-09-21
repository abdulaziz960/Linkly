import { NextRequest, NextResponse } from "next/server";
import { authCookieName, createSessionToken, getCurrentUser } from "../../../../lib/auth";
import { getUserAccountById, hashPassword } from "../../../../lib/database";
import { getPasswordValidationError, verifyPassword } from "../../../../lib/passwords";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { prisma } from "../../../../lib/prisma";
import { getTenantCompanyName, logAdminAction } from "../../../../lib/subscriptions";

export const runtime = "nodejs";

/**
 * Self-serve "change password" for an already-logged-in user (dashboard
 * profile → security panel). Distinct from /api/auth/activate, which sets a
 * password via a one-time emailed token for a brand-new or forgotten one.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });

  const rateLimit = await consumeRateLimit("account-password", requestIdentifier(request, user.id), 8, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "محاولات كثيرة. حاول مرة أخرى بعد قليل" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { currentPassword?: string; newPassword?: string };
  const currentPassword = body.currentPassword || "";
  const newPassword = body.newPassword || "";

  const account = await getUserAccountById(user.id);
  if (!account) return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });

  const verification = verifyPassword(currentPassword, account.passwordHash);
  if (!verification.valid) {
    return NextResponse.json({ error: "كلمة السر الحالية غير صحيحة" }, { status: 400 });
  }

  const passwordError = getPasswordValidationError(newPassword);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const updated = await prisma.userAccount.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword), sessionVersion: { increment: 1 } }
  });

  if (user.isPlatformAdmin !== 1) {
    await logAdminAction(
      user.tenantId,
      await getTenantCompanyName(user.tenantId),
      `تم تغيير كلمة السر بواسطة ${user.name} (${user.email})`,
      "معلومة",
      "الأمان"
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName, createSessionToken(updated.id, 60 * 60 * 24, updated.sessionVersion), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24
  });
  return response;
}
