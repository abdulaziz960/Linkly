import { NextRequest, NextResponse } from "next/server";
import { sendPasswordResetEmailIfRegistered } from "../../../../lib/password-reset";
import { getAppOrigin } from "../../../../lib/app-url";

export const runtime = "nodejs";

// Deliberately purpose-neutral: this same response covers both an
// existing activated account (gets a password-reset link) and an
// existing-but-never-activated account (gets a fresh activation link) -
// saying "password reset" unconditionally was confusing for the second
// case, but the wording can't reveal which one applies without also
// leaking whether the account exists/is activated (pre-launch audit).
const genericMessage = "إذا كان البريد الإلكتروني مسجّلاً لدينا، أرسلنا رابطاً لتسجيل الدخول إلى بريدك الإلكتروني.";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ ok: false, error: "البريد الإلكتروني مطلوب" }, { status: 400 });
  }

  // Always returns the same response whether the account exists, is rate
  // limited, or the email failed to send - this endpoint can't be used to
  // enumerate registered email addresses.
  const result = await sendPasswordResetEmailIfRegistered(email, getAppOrigin(request), request);

  return NextResponse.json({
    ok: true,
    message: genericMessage,
    // Only present when no mail provider is configured - lets the reset
    // still work end-to-end without a real mail provider.
    activationUrl: process.env.NODE_ENV !== "production" ? result?.activationUrl : undefined
  });
}
