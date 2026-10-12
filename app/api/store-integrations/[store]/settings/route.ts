import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { getStoreSettings, isStoreKey, saveStoreSettings, storeSettingsWarnings } from "../../../../../lib/store-settings";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (!isStoreKey(store)) return jsonError("المتجر غير مدعوم", 404);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const { settings, updatedAt } = await getStoreSettings(user.tenantId, store);
  return jsonOk({ settings, updatedAt, warnings: storeSettingsWarnings(settings) });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (!isStoreKey(store)) return jsonError("المتجر غير مدعوم", 404);
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("إعدادات المتجر متاحة لمالك الحساب فقط", 403);
  const body = await request.json().catch(() => null);
  const { settings, updatedAt } = await saveStoreSettings(user.tenantId, store, body);
  return jsonOk({ settings, updatedAt, warnings: storeSettingsWarnings(settings) });
}
