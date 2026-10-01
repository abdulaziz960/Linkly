import { NextRequest, NextResponse } from "next/server";
import { finalizeLogin, verifyTwoFactorPendingToken } from "../../../../../lib/auth";
import { getUserAccountById } from "../../../../../lib/database";
import { verifyTwoFactorCode } from "../../../../../lib/two-factor";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";

export const runtime = "nodejs";

const verifyMessages: Record<string, string> = {
  invalid: "الرمز غير صحيح",
  expired: "انتهت صلاحية الرمز. اطلب رمزاً جديداً",
  exhausted: "محاولات كثيرة. اطلب رمزاً جديداً"
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { pendingToken?: string; code?: string };
  const pendingToken = typeof body.pendingToken === "string" ? body.pendingToken : "";
  const code = typeof body.code === "string" ? body.code : "";

  const pending = verifyTwoFactorPendingToken(pendingToken);
  if (!pending) {
    return NextResponse.json({ message: "انتهت الجلسة. سجّل الدخول من جديد" }, { status: 401 });
  }

  const rateLimit = await consumeRateLimit("2fa-verify", requestIdentifier(request, pending.userId), 10, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "محاولات كثيرة. حاول مرة أخرى بعد قليل" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const result = await verifyTwoFactorCode(pending.userId, code);
  if (result !== "valid") {
    return NextResponse.json({ message: verifyMessages[result] }, { status: 401 });
  }

  const user = await getUserAccountById(pending.userId);
  if (!user || user.disabled || user.sessionVersion !== pending.sessionVersion) {
    return NextResponse.json({ message: "انتهت الجلسة. سجّل الدخول من جديد" }, { status: 401 });
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  return finalizeLogin(safeUser, pending.remember, request);
}
