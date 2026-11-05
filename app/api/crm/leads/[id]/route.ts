import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { canAccessConversation, userHasViewPermission } from "../../../../../lib/permissions-server";
import { getLeadDetail } from "../../../../../lib/crm-lead-detail";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/** One lead's detail panel: customer, project, visits and the timeline of everything that happened. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;
  if (!(await canAccessConversation(user, id))) return jsonError("العميل غير موجود", 404);
  const detail = await getLeadDetail(user.tenantId, id);
  if (!detail) return jsonError("العميل غير موجود", 404);
  return jsonOk(detail);
}
