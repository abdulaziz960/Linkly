import { NextRequest } from "next/server";
import { createTenantWithSubscription } from "../../../lib/subscriptions";
import { getActivePlans } from "../../../lib/plans";
import { jsonError, jsonOk } from "../_utils/json";
import { consumeRateLimit, requestIdentifier } from "../../../lib/rate-limit";
import { isValidEmail, isValidSaudiPhone, isValidDisplayName } from "../../../lib/validation";

export const runtime = "nodejs";

/**
 * Public, unauthenticated self-serve trial signup from the landing page.
 * Creates a real tenant + login account immediately (starter plan, trial
 * status) instead of the old "we'll contact you" lead form.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    companyName?: string;
    ownerName?: string;
    ownerEmail?: string;
    phone?: string;
    teamSize?: string;
    channels?: string[];
    website?: string;
  } | null;

  const companyName = body?.companyName?.trim() || "";
  const ownerName = body?.ownerName?.trim() || "";
  const ownerEmail = body?.ownerEmail?.trim() || "";
  const phone = body?.phone?.trim() || "";
  const teamSize = body?.teamSize?.trim() || "";
  const channels = Array.isArray(body?.channels) ? body.channels.filter((c) => typeof c === "string") : [];

  if (body?.website) return jsonOk({ message: "تم استلام الطلب" });
  const rateLimit = await consumeRateLimit("trial", requestIdentifier(request, ownerEmail), 3, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return jsonError("تم تجاوز عدد المحاولات. حاول مرة أخرى لاحقاً", 429);
  }

  if (!companyName || !ownerName || !ownerEmail || !phone) {
    return jsonError("عبّي اسم النشاط والاسم والبريد الإلكتروني ورقم الجوال", 400);
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

  const plans = await getActivePlans();
  const starterPlan = plans.find((p) => p.name.includes("البداية")) || plans[0];

  const signupDetails = [
    phone ? `جوال: ${phone}` : null,
    teamSize ? `حجم الفريق: ${teamSize}` : null,
    channels.length ? `قنوات: ${channels.join("، ")}` : null
  ].filter(Boolean);

  try {
    const { inviteDelivery } = await createTenantWithSubscription({
      companyName,
      ownerName,
      ownerEmail,
      plan: starterPlan?.name || "باقة البداية",
      status: "تجربة",
      amount: 0,
      billingCycle: "تجربة 3 أيام",
      renewalAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      adminName: `تسجيل ذاتي من صفحة الهبوط${signupDetails.length ? ` (${signupDetails.join(" · ")})` : ""}`
    });

    return jsonOk({
      activationUrl: process.env.NODE_ENV !== "production" ? inviteDelivery.activationUrl : undefined,
      emailSent: inviteDelivery.sent,
      message: inviteDelivery.message
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إنشاء الحساب، حاول مرة أخرى", 400);
  }
}
