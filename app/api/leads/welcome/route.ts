import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { getLeadWelcomeSettings, saveLeadWelcomeSettings } from "../../../../lib/lead-welcome";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  return jsonOk({ settings: await getLeadWelcomeSettings(user.tenantId) });
}

export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("متاح لمالك الحساب فقط", 403);
  const body = (await request.json().catch(() => null)) as { enabled?: unknown; template?: unknown } | null;
  return jsonOk({ settings: await saveLeadWelcomeSettings(user.tenantId, body ?? {}) });
}
