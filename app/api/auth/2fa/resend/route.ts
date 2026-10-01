import { NextRequest, NextResponse } from "next/server";
import { verifyTwoFactorPendingToken } from "../../../../../lib/auth";
import { getUserAccountById } from "../../../../../lib/database";
import { issueTwoFactorCode } from "../../../../../lib/two-factor";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { pendingToken?: string };
  const pendingToken = typeof body.pendingToken === "string" ? body.pendingToken : "";

  const pending = verifyTwoFactorPendingToken(pendingToken);
  if (!pending) {
    return NextResponse.json({ message: "انتهت الجلسة. سجّل الدخول من جديد" }, { status: 401 });
  }

  const rateLimit = await consumeRateLimit("2fa-resend", requestIdentifier(request, pending.userId), 3, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "محاولات كثيرة. حاول مرة أخرى بعد قليل" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const user = await getUserAccountById(pending.userId);
  if (!user || user.disabled || user.sessionVersion !== pending.sessionVersion) {
    return NextResponse.json({ message: "انتهت الجلسة. سجّل الدخول من جديد" }, { status: 401 });
  }

  const issued = await issueTwoFactorCode(user.id, user.email, user.name);
  return NextResponse.json({
    ok: true,
    code: process.env.NODE_ENV !== "production" ? issued.code : undefined
  });
}
