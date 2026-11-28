import { NextRequest } from "next/server";
import { getClientCards, removeSavedCard } from "../../../../../../lib/admin-client-cards";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { consumeRateLimit, requestIdentifier } from "../../../../../../lib/rate-limit";
import { invalidateTenantSubscriptionRow } from "../../../../../../lib/tenant-subscription-row";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** The cards a client paid with (brand and last four digits only). Billing permission. */
export async function GET(request: NextRequest, { params }: Context) {
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  // Each load asks the payment gateway about the client's recent payments.
  const limit = await consumeRateLimit("admin-client-cards", requestIdentifier(request, admin.id), 60, 10 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة، حاول لاحقًا", 429);

  const { id: tenantId } = await params;
  const cards = await getClientCards(tenantId);
  if (!cards) return jsonError("الاشتراك غير موجود", 404);
  return jsonOk(cards);
}

/** Stops auto-renew and deletes the client's saved card, at Moyasar too. There is no way to add one here: only the owner's own payment can. */
export async function DELETE(request: NextRequest, { params }: Context) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId } = await params;
  const removed = await removeSavedCard(tenantId);
  if (!removed) return jsonError("لا توجد بطاقة محفوظة لهذا العميل", 404);
  invalidateTenantSubscriptionRow(tenantId);
  await recordAdminAction(admin, "remove-client-saved-card", { type: "tenant", id: tenantId }, JSON.stringify({ brand: removed.brand, last4: removed.last4, moyasar: removed.gateway }));
  return jsonOk({ gateway: removed.gateway });
}
