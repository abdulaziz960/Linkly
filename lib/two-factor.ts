import { createHash, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { sendTwoFactorCodeEmail } from "./email";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Issues a fresh 6-digit code for a login that requires 2FA (see
 * app/api/auth/login/route.ts and .../2fa/resend/route.ts), replacing any
 * still-pending code for the same user - only the most recent one is ever
 * valid, so a resend can't leave an older, unexpired code guessable
 * alongside the new one.
 */
export async function issueTwoFactorCode(userId: string, email: string, name: string): Promise<{ code?: string }> {
  const code = generateCode();
  const now = new Date();

  await prisma.$transaction([
    prisma.twoFactorCode.deleteMany({ where: { userId } }),
    prisma.twoFactorCode.create({
      data: {
        id: randomUUID(),
        userId,
        codeHash: hashCode(code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
        createdAt: now.toISOString()
      }
    })
  ]);

  const sent = await sendTwoFactorCodeEmail({ to: email, name, code });
  // Dev/test convenience only, same pattern as forgot-password's
  // activationUrl fallback - lets 2FA be tested end-to-end without a real
  // mail provider configured. Never returned when a provider is set, and
  // callers must additionally gate this on NODE_ENV !== "production".
  return { code: sent ? undefined : code };
}

export type TwoFactorVerifyResult = "valid" | "invalid" | "expired" | "exhausted";

/**
 * Checks a submitted code against the latest pending one for this user.
 * Wrong guesses count against a per-code attempt cap (independent of the
 * route-level rate limit in app/api/auth/2fa/verify/route.ts, which caps
 * requests rather than guesses against one specific code) - once exhausted,
 * the user must request a fresh code via resend.
 */
export async function verifyTwoFactorCode(userId: string, submittedCode: string): Promise<TwoFactorVerifyResult> {
  const record = await prisma.twoFactorCode.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (!record) return "invalid";
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await prisma.twoFactorCode.deleteMany({ where: { userId } });
    return "expired";
  }
  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    return "exhausted";
  }

  const expectedBuffer = Buffer.from(record.codeHash);
  const actualBuffer = Buffer.from(hashCode(submittedCode.trim()));
  const matches = actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);

  if (!matches) {
    await prisma.twoFactorCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return "invalid";
  }

  await prisma.twoFactorCode.deleteMany({ where: { userId } });
  return "valid";
}
