import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { createShippingMethod, hasConnectedStore, listShippingMethods, type ShippingInput } from "../../../../lib/catalog-shipping";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** The workspace's delivery options, and whether delivery is the store's job (a connected Zid / Salla / Shopify store). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  return jsonOk({ methods: await listShippingMethods(user.tenantId), storeConnected: await hasConnectedStore(user.tenantId) });
}

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  if (await hasConnectedStore(user.tenantId)) return jsonError("متجرك مربوط بمنصة متاجر، والشحن يُدار من المتجر نفسه", 409);

  const body = (await request.json().catch(() => null)) as ShippingInput | null;
  if (!body) return jsonError("طلب غير صالح", 400);
  const result = await createShippingMethod(user.tenantId, body);
  if (!result.ok) return jsonError(result.error, 400);
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تمت إضافة طريقة الشحن "${result.method.name}" بواسطة ${user.name}.`, "معلومة", "الكتالوج");
  return jsonOk(result.method);
}
