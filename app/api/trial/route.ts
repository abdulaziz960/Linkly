import { NextRequest } from "next/server";
import { sendTrialSignupNotification } from "../../../lib/email";
import { createTenantWithSubscription } from "../../../lib/subscriptions";
import { getActivePlans } from "../../../lib/plans";
import { pickTrialPlan } from "../../../lib/trial-plan";
import { jsonError, jsonOk } from "../_utils/json";
import { consumeRateLimit, requestIdentifier } from "../../../lib/rate-limit";
import { isValidEmail, isValidSaudiPhone, isValidDisplayName } from "../../../lib/validation";
import { finalizeLogin } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { GOOGLE_SIGNUP_COOKIE, verifyGoogleSignupToken } from "../../../lib/google-signin";

export const runtime = "nodejs";

/**
 * Public, unauthenticated self-serve trial signup from the landing page.
 * Creates a real tenant + login account immediately (starter plan, trial
 * status) instead of the old "we'll contact you" lead form.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    companyName?: string;
    businessType?: string;
    ownerName?: string;
    ownerEmail?: string;
    phone?: string;
    teamSize?: string;
    channels?: string[];
    website?: string;
    termsAccepted?: boolean;
    planId?: string;
    googleSignup?: boolean;
  } | null;

  const companyName = body?.companyName?.trim() || "";
  const businessType = body?.businessType?.trim() || "";
  const ownerName = body?.ownerName?.trim() || "";
  // "Sign up with Google": the email comes from the signed cookie the OAuth
  // callback set, never from the request body, and is already verified.
  const googleProfile = body?.googleSignup ? verifyGoogleSignupToken(request.cookies.get(GOOGLE_SIGNUP_COOKIE)?.value) : null;
  if (body?.googleSignup && !googleProfile) return jsonError("انتهت صلاحية التحقق من Google، أعد المحاولة", 400);
  const ownerEmail = googleProfile?.email || body?.ownerEmail?.trim() || "";
  const phone = body?.phone?.trim() || "";
  const teamSize = body?.teamSize?.trim() || "";
  const channels = Array.isArray(body?.channels) ? body.channels.filter((c) => typeof c === "string") : [];

  if (body?.website) return jsonOk({ message: "تم استلام الطلب" });
  const rateLimit = await consumeRateLimit("trial", requestIdentifier(request, ownerEmail), 3, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return jsonError("تم تجاوز عدد المحاولات. حاول مرة أخرى لاحقاً", 429);
  }

  if (!companyName || !businessType || !ownerName || !ownerEmail || !phone) {
    return jsonError("عبّي اسم النشاط ونوع النشاط والاسم والبريد الإلكتروني ورقم الجوال", 400);
  }
  // The checkbox on the signup form already requires this, but that's only
  // a client-side gate - never trust it alone for something a consent
  // record depends on, same rule payment amounts follow in lib/moyasar.ts.
  if (!body?.termsAccepted) {
    return jsonError("يجب الموافقة على شروط الاستخدام وسياسة الخصوصية", 400);
  }
  if (companyName.length > 120 || ownerName.length > 100 || ownerEmail.length > 254 || phone.length > 30) {
    return jsonError("بعض البيانات المدخلة أطول من الحد المسموح", 400);
  }
  if (!isValidEmail(ownerEmail)) return jsonError("أدخل بريداً إلكترونياً صحيحاً", 400);
  if (!isValidSaudiPhone(phone)) return jsonError("أدخل رقم جوال سعودي صحيح (مثال: 05XXXXXXXX)", 400);
  if (!isValidDisplayName(companyName)) return jsonError("أدخل اسم نشاط تجاري صحيح (حرفين على الأقل)", 400);
  if (!isValidDisplayName(ownerName)) return jsonError("أدخل اسمك الكامل (حرفين على الأقل)", 400);
  const allowedChannels = new Set(["whatsapp", "instagram", "telegram", "email", "tiktok"]);
  if (channels.some((channel) => !allowedChannels.has(channel))) return jsonError("إحدى القنوات المختارة غير صالحة", 400);
  const businessTypeLabels: Record<string, string> = {
    real_estate: "عقار وتطوير عقاري",
    retail: "متاجر وتجزئة",
    ecommerce: "متجر إلكتروني",
    restaurant: "مطاعم ومقاهي",
    healthcare: "عيادات وصحة",
    beauty: "صالونات وتجميل",
    education: "تعليم وتدريب",
    automotive: "سيارات وخدماتها",
    travel: "سفر وسياحة",
    professional_services: "خدمات مهنية",
    other: "نشاط آخر"
  };
  if (!businessTypeLabels[businessType]) return jsonError("اختر نوع نشاط صحيح", 400);

  const plans = await getActivePlans();
  // The plan the visitor chose on the pricing page is the one they trial (enterprise excluded).
  const starterPlan = pickTrialPlan(plans, typeof body?.planId === "string" ? body.planId : undefined);

  const signupDetails = [
    phone ? `جوال: ${phone}` : null,
    `نوع النشاط: ${businessTypeLabels[businessType]}`,
    teamSize ? `حجم الفريق: ${teamSize}` : null,
    channels.length ? `قنوات: ${channels.join("، ")}` : null
  ].filter(Boolean);

  try {
    const { inviteDelivery, subscription, created } = await createTenantWithSubscription({
      companyName,
      ownerName,
      ownerEmail,
      businessType,
      plan: starterPlan?.name || "باقة البداية",
      status: "تجربة",
      amount: 0,
      billingCycle: "تجربة 3 أيام",
      renewalAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      emailVerified: Boolean(googleProfile),
      adminName: `تسجيل ذاتي من صفحة الهبوط${signupDetails.length ? ` (${signupDetails.join(" · ")})` : ""}`
    });

    if (created && subscription) {
      // A notification failure must not turn a committed signup into an error.
      try {
        const sent = await sendTrialSignupNotification({ tenantId: subscription.tenantId, companyName, ownerName, ownerEmail: ownerEmail.toLowerCase() });
        if (!sent) console.warn("Trial signup notification delivery failed", { tenantId: subscription.tenantId });
      } catch {
        console.warn("Trial signup notification delivery failed", { tenantId: subscription.tenantId });
      }
    }

    if (googleProfile && subscription) {
      const account = await prisma.userAccount.findUnique({ where: { email: ownerEmail.toLowerCase() } });
      if (account) {
        const { passwordHash: _passwordHash, ...safeUser } = account;
        void _passwordHash;
        const login = await finalizeLogin(safeUser as Parameters<typeof finalizeLogin>[0], false, request);
        const { redirectTo } = (await login.clone().json().catch(() => ({}))) as { redirectTo?: string };
        const response = jsonOk({ redirectTo: redirectTo || "/dashboard?view=settings&onboarding=1", emailSent: true, message: "" });
        for (const cookie of login.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
        response.cookies.delete(GOOGLE_SIGNUP_COOKIE);
        return response;
      }
    }

    return jsonOk({
      // In dev, always hand back the link (no inbox to check). In production,
      // only when the real email failed to send - otherwise the customer's
      // own inbox is the delivery channel and there's no reason to put a
      // live activation link in a network response. Without this fallback a
      // production email-provider outage leaves a brand-new signup with no
      // way at all to activate their account (see the Resend domain-verification
      // incident this guarded against).
      activationUrl: process.env.NODE_ENV !== "production" || !inviteDelivery.sent ? inviteDelivery.activationUrl : undefined,
      emailSent: inviteDelivery.sent,
      message: inviteDelivery.message
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إنشاء الحساب، حاول مرة أخرى", 400);
  }
}
