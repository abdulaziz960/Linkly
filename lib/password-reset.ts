import { createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "./prisma";
import { sendActivationEmail } from "./email";
import { consumeRateLimit, requestIdentifier } from "./rate-limit";

/**
 * Generates and emails a password-reset link for `email` if (and only if) it
 * matches a registered account - silently no-ops otherwise, and never tells
 * the caller which happened, so this can't be used to enumerate registered
 * addresses. Owns its own rate limit (3/hour per email) so every caller -
 * the explicit "forgot password" page and the login route's 3rd-wrong-
 * attempt nudge - shares one send budget instead of each needing its own.
 *
 * Returns the raw activationUrl only when no mail provider is configured
 * (dev/test convenience, same as before this was extracted) - callers
 * should only ever surface that outside production, same as this file's
 * original caller did.
 */
export async function sendPasswordResetEmailIfRegistered(rawEmail: string, origin: string, request: Request): Promise<{ activationUrl?: string } | null> {
  const email = rawEmail.trim().toLowerCase();
  const rateLimit = await consumeRateLimit("password-reset", requestIdentifier(request, email), 3, 60 * 60 * 1000);
  if (!rateLimit.allowed) return null;

  const user = await prisma.userAccount.findUnique({ where: { email } });
  if (!user) return null;

  const resetToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(resetToken).digest("hex");
  const now = new Date();
  const accountAlreadyActivated = Boolean(user.passwordHash);
  const purpose = accountAlreadyActivated ? "password_reset" : "employee_activation";
  const lifetimeMs = accountAlreadyActivated ? 1000 * 60 * 60 : 1000 * 60 * 60 * 24 * 3;
  const expiresAt = new Date(now.getTime() + lifetimeMs).toISOString();

  await prisma.$transaction([
    prisma.employeeInvite.deleteMany({ where: { email } }),
    prisma.employeeInvite.create({
      data: {
        id: `reset-${randomUUID()}`,
        email,
        tokenHash,
        expiresAt,
        createdAt: now.toISOString(),
        purpose
      }
    })
  ]);

  const activationUrl = `${origin}/activate?token=${resetToken}`;
  const delivery = await sendActivationEmail({
    to: email,
    name: user.name,
    activationUrl,
    purpose: accountAlreadyActivated ? "password_reset" : "activation"
  });

  return { activationUrl: !delivery.sent ? delivery.activationUrl : undefined };
}
