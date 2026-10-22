import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { listGroups, saveGroup, type GroupInput } from "../../../../lib/catalog-options";
import { getProduct } from "../../../../lib/catalog";
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

/** The option groups of one product (productId=...), of every product (productId= empty), or all of them. */
export async function GET(request: NextRequest) {
  const auth = await authorize(null);
  if (auth.error) return auth.error;
  const productId = request.nextUrl.searchParams.get("productId");
  return jsonOk(await listGroups(auth.user.tenantId, productId === null ? undefined : productId));
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as GroupInput | null;
  if (!body || typeof body !== "object") return jsonError("طلب غير صالح", 400);
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (productId && !(await getProduct(auth.user.tenantId, productId))) return jsonError("المنتج غير موجود", 404);
  const result = await saveGroup(auth.user.tenantId, { ...body, productId });
  if (!result.ok) return jsonError(result.error, 400);
  await logAdminAction(auth.user.tenantId, await getTenantCompanyName(auth.user.tenantId), `تم حفظ مجموعة خيارات "${result.group.name}" بواسطة ${auth.user.name}.`, "معلومة", "الكتالوج");
  return jsonOk(result.group);
}
