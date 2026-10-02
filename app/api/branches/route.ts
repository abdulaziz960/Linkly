import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { cleanBranchInput, createBranch, listBranches, type BranchInput } from "../../../lib/branches";
import { withResolvedCoordinates } from "../../../lib/maps-link";
import { logAdminAction, getTenantCompanyName } from "../../../lib/subscriptions";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "branches"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  return jsonOk(await listBranches(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "branches"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as BranchInput | null;
  if (!body) return jsonError("طلب غير صالح", 400);
  const cleaned = cleanBranchInput(await withResolvedCoordinates(body));
  if (!cleaned.ok) return jsonError(cleaned.error, 400);

  const branch = await createBranch(user.tenantId, cleaned.data);
  if (!branch) return jsonError("وصلت للحد الأقصى من الفروع", 400);
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تمت إضافة الفرع "${branch.name}" بواسطة ${user.name}.`, "معلومة", "الفروع");
  return jsonOk(branch);
}
