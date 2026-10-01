import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserAccountById, recordUserLogin, type UserAccount } from "./database";
import { prisma } from "./prisma";
import { getClientIp } from "./rate-limit";
import { getTenantCompanyName, logAdminAction } from "./subscriptions";

export const authCookieName = "audiencew_session";

// How long a session cookie stays valid before the user has to log in
// again. Unchecked "remember me" covers a full work shift (12h) without
// forcing a re-login mid-day, but still expires overnight rather than
// staying open indefinitely on a shared/public device. Checked "remember
// me" keeps the existing 30-day convenience window. Both are absolute
// lifetimes from login, not idle timeouts - re-authenticating resets the
// clock (see finalizeLogin in this file and every createSessionToken call
// below), but inactivity alone doesn't shorten it.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const REMEMBERED_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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

export function createSessionToken(userId: string, maxAgeSeconds = SESSION_MAX_AGE_SECONDS, sessionVersion = 0) {
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

const TWO_FACTOR_PENDING_PREFIX = "2fa";
const TWO_FACTOR_PENDING_TTL_SECONDS = 10 * 60;

/**
 * A short-lived, signed token for the gap between "password verified" and
 * "session issued" when a user has 2FA enabled (app/api/auth/login/route.ts,
 * app/api/auth/2fa/verify+resend/route.ts). Deliberately a different shape
 * from createSessionToken's 5-part payload (this one has 6 parts, tagged
 * with the "2fa" prefix) so verifySessionToken's strict part-count check can
 * never mistake it for - and accept - a real session cookie.
 */
export function createTwoFactorPendingToken(userId: string, remember: boolean, sessionVersion: number) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TWO_FACTOR_PENDING_TTL_SECONDS * 1000;
  const payload = `${TWO_FACTOR_PENDING_PREFIX}.${userId}.${remember ? 1 : 0}.${issuedAt}.${expiresAt}.${sessionVersion}`;
  return `${payload}.${signPayload(payload)}`;
}

export function verifyTwoFactorPendingToken(token?: string) {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 7 || parts[0] !== TWO_FACTOR_PENDING_PREFIX) return null;

  const [, userId, rememberFlag, issuedAt, expiresAt, sessionVersion, signature] = parts;
  const issuedAtNumber = Number(issuedAt);
  const expiresAtNumber = Number(expiresAt);
  const sessionVersionNumber = Number(sessionVersion);
  if (!userId || (rememberFlag !== "0" && rememberFlag !== "1") || !Number.isFinite(issuedAtNumber)
    || !Number.isFinite(expiresAtNumber) || !Number.isInteger(sessionVersionNumber)) return null;
  if (issuedAtNumber > Date.now() + 60_000 || expiresAtNumber <= Date.now() || expiresAtNumber <= issuedAtNumber) return null;

  const payload = `${TWO_FACTOR_PENDING_PREFIX}.${userId}.${rememberFlag}.${issuedAt}.${expiresAt}.${sessionVersion}`;
  const expected = signPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  return { userId, remember: rememberFlag === "1", sessionVersion: sessionVersionNumber };
}

/**
 * Days an ACTIVE (paid) subscription may run past its paid-through date
 * (renewalAt) before the workspace is locked to /billing like an expired
 * trial. Unset/blank keeps the historical behaviour: a paid subscription is
 * never locked out for non-renewal, it just shows as overdue in the admin
 * panel. Set e.g. SUBSCRIPTION_GRACE_DAYS=7 to enforce renewals.
 */
export function subscriptionGraceDays(): number | null {
  const raw = process.env.SUBSCRIPTION_GRACE_DAYS?.trim();
  if (!raw) return null;
  const days = Number(raw);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

export async function getSubscriptionAccess(tenantId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { status: true, renewalAt: true }
  });
  if (!subscription) return { expired: false, overdue: false };
  const expiry = subscription.renewalAt ? new Date(subscription.renewalAt).getTime() : Number.NaN;
  const now = Date.now();
  const trialExpired = subscription.status === "تجربة" && Number.isFinite(expiry) && expiry <= now;
  // renewalAt is the paid-through date for an active subscription; past it
  // the tenant has not paid for the current period.
  const overdue = subscription.status === "نشط" && Number.isFinite(expiry) && expiry <= now;
  const graceDays = subscriptionGraceDays();
  const renewalLapsed = overdue && graceDays !== null && expiry + graceDays * 86_400_000 <= now;
  const expired = trialExpired || renewalLapsed || subscription.status === "متوقف";
  return { expired, overdue, status: subscription.status, renewalAt: subscription.renewalAt };
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
  if (user.disabled) return null;

  const subscriptionAccess = await getSubscriptionAccess(user.tenantId);
  // Platform admins never get locked out of their own dashboard by an unpaid subscription.
  if (user.isPlatformAdmin === 1) subscriptionAccess.expired = false;
  if (subscriptionAccess.expired && !options.allowExpired) return null;

  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  return { ...safeUser, subscriptionExpired: subscriptionAccess.expired };
}

/**
 * Everything that happens after credentials (and, if enabled, the 2FA code)
 * are verified: bookkeeping, the multi-workspace/onboarding/subscription
 * branching, and issuing the real session cookie. Extracted from
 * app/api/auth/login/route.ts so app/api/auth/2fa/verify/route.ts's success
 * path doesn't have to duplicate this branching - both call this once the
 * user is fully authenticated.
 */
export async function finalizeLogin(user: Omit<UserAccount, "passwordHash">, remember: boolean, request: Request): Promise<NextResponse> {
  const clientIp = getClientIp(request);
  await recordUserLogin(user.id, clientIp);

  if (user.isPlatformAdmin !== 1) {
    await logAdminAction(
      user.tenantId,
      await getTenantCompanyName(user.tenantId),
      `تسجيل دخول ناجح بواسطة ${user.name} (${user.email}) — IP: ${clientIp}`,
      "معلومة",
      "تسجيل الدخول"
    );
  }

  // A member of more than one company picks which one to enter right after
  // logging in, instead of silently landing in whichever workspace their
  // account happened to be pointed at last time (they can always switch
  // again later from inside the dashboard's profile menu).
  const membershipCount = user.isPlatformAdmin === 1 ? 1 : await prisma.employee.count({ where: { userId: user.id } });
  if (membershipCount > 1) {
    const maxAge = remember ? REMEMBERED_SESSION_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;
    const response = NextResponse.json({
      user: { ...user, subscriptionExpired: false },
      onboardingRequired: false,
      redirectTo: "/choose-workspace"
    });
    response.cookies.set(authCookieName, createSessionToken(user.id, maxAge, user.sessionVersion), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge
    });
    return response;
  }

  const subscriptionAccess = user.isPlatformAdmin === 1 ? { expired: false } : await getSubscriptionAccess(user.tenantId);
  const shouldOnboard = !subscriptionAccess.expired && user.isPlatformAdmin !== 1 && user.role === "مالك الحساب";
  const [connectedIntegration, connectedEmail] = shouldOnboard
    ? await Promise.all([
      prisma.integrationSetting.findFirst({
        where: {
          status: "connected",
          tenantId: user.tenantId
        },
        select: { id: true }
      }),
      prisma.emailIntegration.findFirst({
        where: {
          tenantId: user.tenantId,
          status: "connected"
        },
        select: { id: true }
      })
    ])
    : [null, null];
  const onboardingRequired = shouldOnboard && !connectedIntegration && !connectedEmail;

  const maxAge = remember ? REMEMBERED_SESSION_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;
  const response = NextResponse.json({
    user: { ...user, subscriptionExpired: subscriptionAccess.expired },
    onboardingRequired,
    redirectTo: user.isPlatformAdmin === 1
      ? "/linkly-admin007"
      : subscriptionAccess.expired
        ? "/billing?expired=1"
        : onboardingRequired
          ? "/dashboard?view=settings&onboarding=1"
          : "/dashboard?view=inbox"
  });
  response.cookies.set(authCookieName, createSessionToken(user.id, maxAge, user.sessionVersion), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge
  });

  return response;
}
