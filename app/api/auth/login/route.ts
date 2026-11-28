import { NextRequest, NextResponse } from "next/server";
import { createTwoFactorPendingToken, finalizeLogin } from "../../../../lib/auth";
import { isLoginLocked, LOGIN_LOCK_MS, PASSWORD_RESET_NUDGE_ATTEMPT, recordFailedLoginAttempt, verifyUserCredentials } from "../../../../lib/database";
import { sendPasswordResetEmailIfRegistered } from "../../../../lib/password-reset";
import { issueTwoFactorCode } from "../../../../lib/two-factor";
import { clearRateLimit, consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { getAppOrigin } from "../../../../lib/app-url";

export const runtime = "nodejs";

const LOCKOUT_MESSAGE = "تم إيقاف حسابك بسبب تكرار محاولات الدخول الخاطئة. أعد تعيين كلمة السر عبر رابط \"نسيت كلمة السر\" لإعادة تفعيله، أو تواصل مع الدعم إذا تعذر ذلك.";
const ADMIN_DISABLED_MESSAGE = "تم تعطيل هذا الحساب. تواصل مع مسؤول حسابكم لإعادة تفعيله.";
// The same answer as the rate limit below, so a paused account looks like any other blocked attempt.
const TOO_MANY_MESSAGE = "محاولات كثيرة. حاول مرة أخرى بعد قليل";
const tooMany = (retryAfterSeconds: number) => NextResponse.json({ message: TOO_MANY_MESSAGE }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
const RESET_NUDGE_MESSAGE = "بيانات الدخول غير صحيحة. تم إرسال رابط لإعادة تعيين كلمة السر إلى بريدك الإلكتروني إن كان مسجلاً لدينا.";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const remember = Boolean(body.remember);

  const loginIdentifier = requestIdentifier(request, email);
  const rateLimit = await consumeRateLimit("login", loginIdentifier, 8, 15 * 60 * 1000);
  if (!rateLimit.allowed) return tooMany(rateLimit.retryAfterSeconds);
  // Checked before the password, so even the right password waits out the pause.
  if (await isLoginLocked(email)) return tooMany(LOGIN_LOCK_MS / 1000);

  const user = await verifyUserCredentials(email, password);
  if (!user) {
    const failure = await recordFailedLoginAttempt(email);
    // An account disabled by the old lockout (before the pause existed) keeps its message until reset.
    if (failure.locked && failure.attempts === null) return NextResponse.json({ message: LOCKOUT_MESSAGE }, { status: 403 });
    if (failure.locked) return tooMany(LOGIN_LOCK_MS / 1000);
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
