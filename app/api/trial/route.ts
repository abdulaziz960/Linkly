import { NextRequest } from "next/server";
import { createTenantWithSubscription } from "../../../lib/subscriptions";
import { getActivePlans } from "../../../lib/plans";
import { jsonError, jsonOk } from "../_utils/json";

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
  } | null;

  const companyName = body?.companyName?.trim() || "";
  const ownerName = body?.ownerName?.trim() || "";
  const ownerEmail = body?.ownerEmail?.trim() || "";
  const phone = body?.phone?.trim() || "";
  const teamSize = body?.teamSize?.trim() || "";
  const channels = Array.isArray(body?.channels) ? body.channels.filter((c) => typeof c === "string") : [];

  if (!companyName || !ownerName || !ownerEmail) {
    return jsonError("عبّي اسم النشاط والاسم والبريد الإلكتروني", 400);
  }

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
      billingCycle: "تجربة 14 يوم",
      renewalAt: "",
      adminName: `تسجيل ذاتي من صفحة الهبوط${signupDetails.length ? ` (${signupDetails.join(" · ")})` : ""}`
    });

    return jsonOk({
      activationUrl: inviteDelivery.activationUrl,
      message: inviteDelivery.message
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إنشاء الحساب، حاول مرة أخرى", 400);
  }
}
