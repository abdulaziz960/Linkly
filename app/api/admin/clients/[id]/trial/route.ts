import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { ensureSchema } from "../../../../../../lib/database";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { prisma } from "../../../../../../lib/prisma";
import { isSallaBilled } from "../../../../../../lib/salla-billing";
import { isShopifyBilled } from "../../../../../../lib/shopify-billing";
import { parseRenewalAt } from "../../../../../../lib/subscription-access";
import { invalidateTenantSubscriptionRow } from "../../../../../../lib/tenant-subscription-row";
import { jsonError, jsonOk } from "../../../../_utils/json";

const DAY_MS = 86_400_000;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId } = await params;
  const body = await request.json().catch(() => null) as { days?: unknown } | null;
  const days = body?.days;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 365) {
    return jsonError("أدخل عدد أيام صحيحًا من 1 إلى 365.", 400);
  }

  await ensureSchema();
  const trial = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { status: true, renewalAt: true, companyName: true }
  });
  if (!trial) return jsonError("الاشتراك غير موجود", 404);
  if (trial.status !== "تجربة") return jsonError("التمديد متاح للحسابات التجريبية فقط.", 409);
  if (await isSallaBilled(tenantId) || await isShopifyBilled(tenantId)) {
    return jsonError("تُدار تجربة هذا الحساب من منصة المتجر.", 409);
  }

  const now = Date.now();
  const renewalAt = new Date(Math.max(now, parseRenewalAt(trial.renewalAt) ?? now) + days * DAY_MS).toISOString();
  const result = await prisma.subscription.updateMany({
    where: { tenantId, status: "تجربة", renewalAt: trial.renewalAt },
    data: { renewalAt, updatedAt: new Date(now).toISOString() }
  });
  if (!result.count) return jsonError("تغيّر الاشتراك أثناء التمديد. حدّث الصفحة وحاول مرة أخرى.", 409);

  invalidateTenantSubscriptionRow(tenantId);
  await recordAdminAction(admin, "extend-client-trial", { type: "tenant", id: tenantId }, JSON.stringify({
    subject: trial.companyName,
    days,
    before: { renewalAt: trial.renewalAt },
    after: { renewalAt }
  }));
  return jsonOk({ renewalAt });
}
