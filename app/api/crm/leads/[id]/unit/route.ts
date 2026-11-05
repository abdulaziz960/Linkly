import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { canAccessConversation, userHasViewPermission } from "../../../../../../lib/permissions-server";
import { setConversationUnit } from "../../../../../../lib/crm-units";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

/** Links a lead to the unit type it wants (so a sale takes the right unit from the stock); null clears it. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;
  if (!(await canAccessConversation(user, id))) return jsonError("العميل غير موجود", 404);
  const body = (await request.json().catch(() => null)) as { unitId?: string | null } | null;
  const result = await setConversationUnit(user.tenantId, id, body?.unitId ? String(body.unitId) : null, user.name);
  if (!result.ok) return jsonError(result.error, result.code);
  return jsonOk({});
}
