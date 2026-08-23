import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { addManualCampaignBalance } from "../../../../../../lib/campaign-engine";
import { getSubscriptionForTenant, logAdminAction } from "../../../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId } = await params;
  const body = (await request.json().catch(() => null)) as { messages?: number; amount?: number } | null;
  const messages = Number(body?.messages);
  const amount = Number(body?.amount ?? 0);

  if (!Number.isFinite(messages) || messages < 1 || !Number.isInteger(messages)) {
    return jsonError("اكتب عدد رسائل صحيح");
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return jsonError("اكتب مبلغ صحيح");
  }

  const subscription = await getSubscriptionForTenant(tenantId);
  if (!subscription) return jsonError("العميل غير موجود", 404);

  await addManualCampaignBalance(tenantId, messages, amount);
  await logAdminAction(
    tenantId,
    subscription.companyName,
    `إضافة رصيد يدوي للحملات: ${messages.toLocaleString("en-US")} رسالة${amount > 0 ? ` مقابل ${amount.toLocaleString("en-US")} ر.س` : ""} بواسطة ${admin.name}`
  );

  return jsonOk({ ok: true });
}
