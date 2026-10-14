import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";
import { readStoreTokens } from "../../../../../lib/store-connections";
import { getZidProductSyncStatus, syncZidProducts } from "../../../../../lib/zid-products";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string }> };

/** Product sync from the connected store into the catalog (Zid only for now). */
export async function GET(_request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (store !== "zid") return jsonError("المزامنة متاحة لمتجر زد فقط", 404);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);
  return jsonOk(await getZidProductSyncStatus(user.tenantId));
}

export async function POST(request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (store !== "zid") return jsonError("المزامنة متاحة لمتجر زد فقط", 404);
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);
  if (!(await readStoreTokens(user.tenantId, "zid"))) return jsonError("اربط متجر زد أولًا", 400);

  const limit = await consumeRateLimit("zid-product-sync", requestIdentifier(request, user.tenantId), 6, 10 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة، حاول بعد قليل", 429);

  const result = await syncZidProducts(user.tenantId);
  if (!result.ok) return jsonError(result.message, 502);
  return jsonOk(result);
}
