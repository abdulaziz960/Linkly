import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { cleanBranchInput, deleteBranch, updateBranch, type BranchInput } from "../../../../lib/branches";
import { withResolvedCoordinates } from "../../../../lib/maps-link";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "branches"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as BranchInput | null;
  if (!body) return jsonError("طلب غير صالح", 400);

  const resolved = await withResolvedCoordinates(body);
  const cleaned = cleanBranchInput(resolved);
  if (!cleaned.ok) return jsonError(cleaned.error, 400);

  const branch = await updateBranch(user.tenantId, id, cleaned.data);
  if (!branch) return jsonError("الفرع غير موجود", 404);
  return jsonOk(branch);
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "branches"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  if (!(await deleteBranch(user.tenantId, id))) return jsonError("الفرع غير موجود", 404);
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم حذف فرع بواسطة ${user.name}.`, "تنبيه", "الفروع");
  return jsonOk({ deleted: true });
}
