import { NextRequest } from "next/server";
import { requireOwner } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";
import { ensureSchema } from "../../../../lib/database";
import { isTrialEligiblePlan } from "../../../../lib/trial-plan";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/**
 * Lets an owner who is still on the free trial try another plan's features
 * without paying: the trial simply moves to that plan (its sections, channels
 * and user limit apply). Nothing is charged and nothing changes once the
 * trial is over - after that, plans only change through payment.
 */
export async function POST(request: NextRequest) {
  const user = await requireOwner();
  if (!user) return jsonError("هذه العملية متاحة لمالك الحساب فقط", 403);

  const limit = await consumeRateLimit("trial-switch-plan", requestIdentifier(request, user.id), 10, 60 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة، حاول لاحقًا", 429);

  const body = (await request.json().catch(() => null)) as { plan?: string } | null;
  const planName = body?.plan?.trim() || "";
  if (!planName) return jsonError("اختر الباقة", 400);

  await ensureSchema();
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
  const trialEnd = subscription?.renewalAt ? Date.parse(subscription.renewalAt) : NaN;
  if (!subscription || subscription.status !== "تجربة" || !Number.isFinite(trialEnd) || trialEnd <= Date.now()) {
    return jsonError("تجربة الباقات متاحة خلال الفترة التجريبية فقط. للترقية استخدم صفحة الفوترة.", 400);
  }

  const plan = await prisma.plan.findFirst({ where: { name: planName, active: 1 } });
  if (!plan || !isTrialEligiblePlan(plan.name)) return jsonError("هذه الباقة غير متاحة للتجربة، تواصل معنا لتفعيلها.", 400);
  if (plan.name === subscription.plan) return jsonOk({ plan: plan.name, changed: false });

  await prisma.subscription.update({
    where: { tenantId: user.tenantId },
    data: { plan: plan.name, employeeLimit: plan.employeeLimit, updatedAt: new Date().toISOString() }
  });
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `انتقل ${user.name} لتجربة «${plan.name}» خلال الفترة التجريبية (من «${subscription.plan}»).`, "معلومة", "الاشتراك");
  return jsonOk({ plan: plan.name, changed: true });
}
