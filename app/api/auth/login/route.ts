import { NextRequest, NextResponse } from "next/server";
import { createTwoFactorPendingToken, finalizeLogin } from "../../../../lib/auth";
import { PASSWORD_RESET_NUDGE_ATTEMPT, recordFailedLoginAttempt, verifyUserCredentials } from "../../../../lib/database";
import { sendPasswordResetEmailIfRegistered } from "../../../../lib/password-reset";
import { issueTwoFactorCode } from "../../../../lib/two-factor";
import { clearRateLimit, consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { getAppOrigin } from "../../../../lib/app-url";

export const runtime = "nodejs";

const LOCKOUT_MESSAGE = "تم إيقاف حسابك بسبب تكرار محاولات الدخول الخاطئة. أعد تعيين كلمة السر عبر رابط \"نسيت كلمة السر\" لإعادة تفعيله، أو تواصل مع الدعم إذا تعذر ذلك.";
const ADMIN_DISABLED_MESSAGE = "تم تعطيل هذا الحساب. تواصل مع مسؤول حسابكم لإعادة تفعيله.";
const RESET_NUDGE_MESSAGE = "بيانات الدخول غير صحيحة. تم إرسال رابط لإعادة تعيين كلمة السر إلى بريدك الإلكتروني إن كان مسجلاً لدينا.";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const remember = Boolean(body.remember);

  const loginIdentifier = requestIdentifier(request, email);
  const rateLimit = await consumeRateLimit("login", loginIdentifier, 8, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "محاولات كثيرة. حاول مرة أخرى بعد قليل" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const user = await verifyUserCredentials(email, password);
  if (!user) {
    const failure = await recordFailedLoginAttempt(email);
    if (failure.locked) {
      return NextResponse.json({ message: LOCKOUT_MESSAGE }, { status: 403 });
    }
    if (failure.attempts === PASSWORD_RESET_NUDGE_ATTEMPT) {
      await sendPasswordResetEmailIfRegistered(email, getAppOrigin(request), request);
      return NextResponse.json({ message: RESET_NUDGE_MESSAGE }, { status: 401 });
    }
    return NextResponse.json({ message: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }
  if (user.disabled) {
    return NextResponse.json({ message: user.lockedAt ? LOCKOUT_MESSAGE : ADMIN_DISABLED_MESSAGE }, { status: 403 });
  }
  await clearRateLimit("login", loginIdentifier);

  if (user.twoFactorEnabled) {
    const issued = await issueTwoFactorCode(user.id, user.email, user.name);
    return NextResponse.json({
      twoFactorRequired: true,
      pendingToken: createTwoFactorPendingToken(user.id, remember, user.sessionVersion),
      // Only present when no mail provider is configured - lets 2FA be
      // tested end-to-end without a real mail provider, same as forgot-
      // password's activationUrl fallback.
      code: process.env.NODE_ENV !== "production" ? issued.code : undefined
    });
  }

  return finalizeLogin(user, remember, request);
}
