import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { addCustomStage, getTenantStages, MAX_CUSTOM_STAGES, removeCustomStage } from "../../../../lib/pipeline-stages";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

/** The workspace's pipeline stages: the built-in ones plus the custom ones it added. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  return jsonOk({ stages: await getTenantStages(user.tenantId), maxCustom: MAX_CUSTOM_STAGES });
}

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("إضافة المراحل متاحة لمالك الحساب فقط", 403);
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const result = await addCustomStage(user.tenantId, body?.name);
  if (!result.ok) return jsonError(result.error, result.code);
  return jsonOk({ stages: result.stages });
}

export async function DELETE(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("حذف المراحل متاح لمالك الحساب فقط", 403);
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const result = await removeCustomStage(user.tenantId, body?.name);
  if (!result.ok) return jsonError(result.error, result.code);
  return jsonOk({ stages: result.stages, moved: result.moved });
}
