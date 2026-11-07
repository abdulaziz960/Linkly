import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { importUnits, listUnits, type UnitInput } from "../../../../../../lib/crm-units";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

/** Saves the reviewed units: an existing name is updated, a new one is added; all or nothing. */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("استيراد الوحدات متاح لمالك الحساب فقط", 403);
  const body = (await request.json().catch(() => null)) as { projectId?: string; units?: UnitInput[] } | null;
  if (!body?.projectId || !Array.isArray(body.units)) return jsonError("بيانات الاستيراد غير مكتملة", 400);
  const result = await importUnits(user.tenantId, body.projectId, body.units.slice(0, 1000));
  if (!result.ok) return jsonError(result.error, result.code);
  return jsonOk({ created: result.created, updated: result.updated, units: await listUnits(user.tenantId, body.projectId) });
}
