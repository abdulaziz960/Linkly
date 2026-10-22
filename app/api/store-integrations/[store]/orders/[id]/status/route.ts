import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../../../../lib/origin-guard";
import { consumeRateLimit, requestIdentifier } from "../../../../../../../lib/rate-limit";
import { updateSallaOrderStatus } from "../../../../../../../lib/salla";
import { logAdminAction, getTenantCompanyName } from "../../../../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string; id: string }> };

/** Moves a Salla order to a new status; Salla's order.status.updated webhook then sends the customer's WhatsApp notification. */
export async function POST(request: NextRequest, { params }: Params) {
  const { store, id } = await params;
  if (store !== "salla") return jsonError("إدارة الطلبات متاحة لسلة فقط حاليًا", 404);
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);

  const limit = await consumeRateLimit("store-order-status", requestIdentifier(request, user.id), 60, 10 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى بعد قليل", 429);

  const body = (await request.json().catch(() => null)) as { status?: string; reference?: string } | null;
  const status = body?.status?.trim() || "";
  if (!status) return jsonError("الحالة الجديدة مطلوبة");

  const result = await updateSallaOrderStatus(user.tenantId, id, status);
  if (!result.ok) return jsonError(result.error, result.status === 400 ? 400 : result.status === 401 || result.status === 403 ? 400 : 502);

  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم تغيير حالة طلب سلة ${body?.reference || id} إلى "${status}" بواسطة ${user.name}.`, "معلومة", "المتجر");
  return jsonOk({ id, status });
}
