import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { getPrepSettings, savePrepSettings } from "../../../../lib/catalog-prep";
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

/** The usual preparation time told to customers when their order is paid. */
export async function GET() {
  const auth = await authorize(null);
  if (auth.error) return auth.error;
  return jsonOk(await getPrepSettings(auth.user.tenantId));
}

export async function PUT(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") return jsonError("طلب غير صالح", 400);
  const settings = await savePrepSettings(auth.user.tenantId, body);
  await logAdminAction(auth.user.tenantId, await getTenantCompanyName(auth.user.tenantId), `تم تحديث وقت تجهيز الطلبات (${settings.enabled ? `${settings.defaultMinutes} دقيقة` : "متوقف"}) بواسطة ${auth.user.name}.`, "معلومة", "الكتالوج");
  return jsonOk(settings);
}
