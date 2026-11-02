import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { confirmQuotePayment } from "../../../../../../lib/quotes/provision";
import { getQuote } from "../../../../../../lib/quotes/store";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

/** تأكيد الدفع لعرض سعر معتمد. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;
  const result = await confirmQuotePayment(id, admin.name);
  if (!result.ok) return jsonError(result.error, result.status);
  const quote = await getQuote(id);
  await recordAdminAction(admin, "confirm-quote-payment", { type: "quote", id }, JSON.stringify({ number: quote?.number, tenantId: result.tenantId }));
  return jsonOk({ quote });
}
