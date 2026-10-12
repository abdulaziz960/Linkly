import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { deleteWaLink } from "../../../../lib/wa-links";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const { code } = await params;
  await deleteWaLink(user.tenantId, code);
  return jsonOk({ deleted: true });
}
