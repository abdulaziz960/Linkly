import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { hasConnectedStore } from "../../../../lib/catalog-shipping";
import { getProviderStatuses, removeProvider, saveTabby, saveTamara, type TabbyInput, type TamaraInput } from "../../../../lib/payments/settings";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** The extra payment methods (Tabby, Tamara): on/off and whether keys are saved. Never returns a key. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  return jsonOk({ providers: await getProviderStatuses(user.tenantId), storeConnected: await hasConnectedStore(user.tenantId) });
}

/** Saves a method's keys and/or switches it on or off: `{ provider: "tabby" | "tamara", ...fields }`. Owner only. */
export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (user.role !== "مالك الحساب") return jsonError("إعدادات الدفع متاحة لمالك الحساب فقط", 403);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  if (await hasConnectedStore(user.tenantId)) return jsonError("متجرك مربوط بمنصة متاجر، والدفع يُدار منها", 409);

  const body = (await request.json().catch(() => null)) as ({ provider?: string } & Record<string, unknown>) | null;
  if (!body || (body.provider !== "tabby" && body.provider !== "tamara")) return jsonError("طلب غير صالح", 400);
  const result = body.provider === "tabby" ? await saveTabby(user.tenantId, body as TabbyInput) : await saveTamara(user.tenantId, body as TamaraInput);
  if (!result.ok) return jsonError(result.error, 400);
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم تحديث إعدادات الدفع عبر ${body.provider === "tabby" ? "تابي" : "تمارا"} بواسطة ${user.name}.`, "معلومة", "الكتالوج");
  return jsonOk({ providers: result.statuses });
}

export async function DELETE(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (user.role !== "مالك الحساب") return jsonError("إعدادات الدفع متاحة لمالك الحساب فقط", 403);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const provider = request.nextUrl.searchParams.get("provider");
  if (provider !== "tabby" && provider !== "tamara") return jsonError("طلب غير صالح", 400);
  await removeProvider(user.tenantId, provider);
  return jsonOk({ providers: await getProviderStatuses(user.tenantId) });
}
