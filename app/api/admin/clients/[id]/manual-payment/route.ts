import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { recordManualSubscriptionPayment } from "../../../../../../lib/manual-payment";
import { jsonError, jsonOk } from "../../../../_utils/json";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";

export const runtime = "nodejs";

/** The platform team confirms a payment received outside the gateway (a bank transfer): the subscription is renewed and the payment recorded as completed. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId } = await params;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const result = await recordManualSubscriptionPayment({ tenantId, amount: body.amount, billingCycle: body.billingCycle, method: body.method, reference: body.reference, renewalAt: body.renewalAt, adminName: admin.name });
  if (!result.ok) return jsonError(result.error, result.status);

  await recordAdminAction(admin, "confirm-manual-payment", { type: "tenant", id: tenantId }, JSON.stringify({ net: result.netSar, total: result.totalSar, cycle: result.billingCycle, renewalAt: result.renewalAt, paymentId: result.paymentId }));
  return jsonOk({ paymentId: result.paymentId, totalSar: result.totalSar, renewalAt: result.renewalAt, billingCycle: result.billingCycle });
}
