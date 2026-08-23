import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getUserAccountById } from "./database";
import { prisma } from "./prisma";

export const authCookieName = "audiencew_session";

const ephemeralDevelopmentSecret = randomBytes(32).toString("hex");

function getAuthSecret() {
  const configured = process.env.AUTH_SECRET?.trim() || process.env.OAUTH_STATE_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET or OAUTH_STATE_SECRET must be configured in production");
  }
  return ephemeralDevelopmentSecret;
}

function signPayload(payload: string) {
  return createHmac("sha256", getAuthSecret()).update(payload).digest("hex");
}

export function createSessionToken(userId: string, maxAgeSeconds = 60 * 60 * 24, sessionVersion = 0) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + maxAgeSeconds * 1000;
  const payload = `${userId}.${issuedAt}.${expiresAt}.${sessionVersion}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token?: string) {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 5) {
    return null;
  }

  const [userId, issuedAt, expiresAt, sessionVersion, signature] = parts;
  const issuedAtNumber = Number(issuedAt);
  const expiresAtNumber = Number(expiresAt);
  const sessionVersionNumber = Number(sessionVersion);
  if (!userId || !Number.isFinite(issuedAtNumber) || !Number.isFinite(expiresAtNumber) || !Number.isInteger(sessionVersionNumber)) return null;
  if (issuedAtNumber > Date.now() + 60_000 || expiresAtNumber <= Date.now() || expiresAtNumber <= issuedAtNumber) return null;

  const payload = `${userId}.${issuedAt}.${expiresAt}.${sessionVersion}`;
  const expected = signPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  return { userId, sessionVersion: sessionVersionNumber };
}

export async function getSubscriptionAccess(tenantId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { status: true, renewalAt: true, leadsEnabled: true }
  });
  if (!subscription) return { expired: false, leadsEnabled: true };
  const expiry = subscription.renewalAt ? new Date(subscription.renewalAt).getTime() : Number.NaN;
  const trialExpired = subscription.status === "تجربة" && Number.isFinite(expiry) && expiry <= Date.now();
  const expired = trialExpired || subscription.status === "متوقف";
  return { expired, status: subscription.status, renewalAt: subscription.renewalAt, leadsEnabled: subscription.leadsEnabled !== 0 };
}

export async function getCurrentUser(options: { allowExpired?: boolean } = {}) {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(authCookieName)?.value);

  if (!session) {
    return null;
  }

  const user = await getUserAccountById(session.userId);
  if (!user) {
    return null;
  }
  if (user.sessionVersion !== session.sessionVersion) return null;

  const subscriptionAccess = user.isPlatformAdmin === 1
    ? { expired: false, leadsEnabled: true }
    : await getSubscriptionAccess(user.tenantId);
  if (subscriptionAccess.expired && !options.allowExpired) return null;

  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  return { ...safeUser, subscriptionExpired: subscriptionAccess.expired, leadsEnabled: subscriptionAccess.leadsEnabled };
}
