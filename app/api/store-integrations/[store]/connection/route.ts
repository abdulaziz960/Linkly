import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { disconnectStore, getStoreConnection } from "../../../../../lib/store-connections";
import { isStoreKey } from "../../../../../lib/store-settings";
import { sallaConfigured } from "../../../../../lib/salla";
import { zidConfigured } from "../../../../../lib/zid";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string }> };

/** Connection status of a store (never a token). `available` is false until the platform's app credentials are set on the server. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (!isStoreKey(store)) return jsonError("المتجر غير مدعوم", 404);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const connection = await getStoreConnection(user.tenantId, store);
  return jsonOk({ connection, available: store === "salla" ? sallaConfigured() : zidConfigured() });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (!isStoreKey(store)) return jsonError("المتجر غير مدعوم", 404);
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("متاح لمالك الحساب فقط", 403);
  await disconnectStore(user.tenantId, store);
  return jsonOk({ connection: await getStoreConnection(user.tenantId, store) });
}
