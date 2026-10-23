import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { deleteBranch, getBranch, listBranches, saveBranch } from "../../../../lib/catalog-branches";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

async function authorize(request: NextRequest | null) {
  if (request && !isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("غير مصرح", 401) };
  if (!(await userHasViewPermission(user, "catalog"))) return { error: jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403) };
  return { user };
}

export async function GET() {
  const auth = await authorize(null);
  if (auth.error) return auth.error;
  return jsonOk(await listBranches(auth.user.tenantId));
}

/** Creates a branch, or updates the one named by `id`. */
export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("طلب غير صالح", 400);
  const saved = await saveBranch(auth.user.tenantId, body);
  if (!saved.ok) return jsonError(saved.error, 400);
  await logAdminAction(auth.user.tenantId, await getTenantCompanyName(auth.user.tenantId), `تم حفظ الفرع «${saved.branch.name}» بواسطة ${auth.user.name}.`, "معلومة", "الكتالوج");
  return jsonOk(await listBranches(auth.user.tenantId));
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const id = request.nextUrl.searchParams.get("id") || "";
  const branch = await getBranch(auth.user.tenantId, id);
  if (!branch) return jsonError("الفرع غير موجود", 404);
  await deleteBranch(auth.user.tenantId, id);
  await logAdminAction(auth.user.tenantId, await getTenantCompanyName(auth.user.tenantId), `تم حذف الفرع «${branch.name}» بواسطة ${auth.user.name}.`, "تنبيه", "الكتالوج");
  return jsonOk(await listBranches(auth.user.tenantId));
}
