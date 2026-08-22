import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "../../../../lib/prisma";
import { sendActivationEmail } from "../../../../lib/email";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

const genericMessage = "إذا كان البريد الإلكتروني مسجّلاً لدينا، أرسلنا رابط إعادة تعيين كلمة المرور إليه.";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ ok: false, error: "البريد الإلكتروني مطلوب" }, { status: 400 });
  }

  const rateLimit = await consumeRateLimit("password-reset", requestIdentifier(request, email), 3, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: true, message: genericMessage }, { headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const user = await prisma.userAccount.findUnique({ where: { email } });

  // Always return the same response whether the account exists or not, so
  // this endpoint can't be used to enumerate registered email addresses.
  if (!user) {
    return NextResponse.json({ ok: true, message: genericMessage });
  }

  const resetToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(resetToken).digest("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60).toISOString();

  await prisma.$transaction([
    prisma.employeeInvite.deleteMany({ where: { email } }),
    prisma.employeeInvite.create({
      data: {
        id: `reset-${Date.now()}`,
        email,
        tokenHash,
        expiresAt,
        createdAt: now.toISOString()
      }
    })
  ]);

  const origin = process.env.NODE_ENV === "production"
    ? "https://audiencew.audience.sa"
    : (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin).replace(/\/$/, "");
  const activationUrl = `${origin}/activate?token=${resetToken}`;
  const delivery = await sendActivationEmail({ to: email, name: user.name, activationUrl });

  return NextResponse.json({
    ok: true,
    message: genericMessage,
    // Only present when RESEND_API_KEY isn't configured - lets the reset
    // still work end-to-end without a real mail provider.
    activationUrl: process.env.NODE_ENV !== "production" && !delivery.sent ? delivery.activationUrl : undefined
  });
}
