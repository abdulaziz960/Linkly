import { NextRequest, NextResponse } from "next/server";
import { authCookieName, createSessionToken, getSubscriptionAccess } from "../../../../lib/auth";
import { recordUserLogin, verifyUserCredentials } from "../../../../lib/database";
import { consumeRateLimit, getClientIp, requestIdentifier } from "../../../../lib/rate-limit";
import { prisma } from "../../../../lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const remember = Boolean(body.remember);

  const rateLimit = await consumeRateLimit("login", requestIdentifier(request, email), 8, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "محاولات كثيرة. حاول مرة أخرى بعد قليل" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const user = await verifyUserCredentials(email, password);
  if (!user) {
    return NextResponse.json({ message: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }
  await recordUserLogin(user.id, getClientIp(request));

  const subscriptionAccess = user.isPlatformAdmin === 1 ? { expired: false } : await getSubscriptionAccess(user.tenantId);
  const shouldOnboard = !subscriptionAccess.expired && user.isPlatformAdmin !== 1 && user.role === "مالك الحساب";
  const [connectedIntegration, connectedEmail] = shouldOnboard
    ? await Promise.all([
      prisma.integrationSetting.findFirst({
        where: {
          status: "connected",
          ...(user.tenantId === "tenant-demo" ? { id: { not: { startsWith: "tenant-" } } } : { id: { startsWith: `${user.tenantId}:` } })
        },
        select: { id: true }
      }),
      prisma.emailIntegration.findFirst({
        where: {
          id: user.tenantId === "tenant-demo" ? "primary-email" : `email:${user.tenantId}`,
          status: "connected"
        },
        select: { id: true }
      })
    ])
    : [null, null];
  const onboardingRequired = shouldOnboard && !connectedIntegration && !connectedEmail;

  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
  const response = NextResponse.json({
    user: { ...user, subscriptionExpired: subscriptionAccess.expired },
    onboardingRequired,
    redirectTo: subscriptionAccess.expired
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
