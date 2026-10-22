import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { deleteGroup } from "../../../../../lib/catalog-options";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const { id } = await params;
  if (!(await deleteGroup(user.tenantId, id))) return jsonError("المجموعة غير موجودة", 404);
  return jsonOk({ id });
}
