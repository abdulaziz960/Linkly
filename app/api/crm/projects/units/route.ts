import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { createUnit, deleteUnit, listUnits, updateUnit, type UnitInput } from "../../../../../lib/crm-units";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/** The unit types (stock) of a project. Anyone with the leads page sees them; the owner edits. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
  if (!projectId) return jsonError("المشروع مطلوب", 400);
  return jsonOk({ units: await listUnits(user.tenantId, projectId) });
}

async function ownerOnly(request: NextRequest) {
  if (!isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("يلزم تسجيل الدخول", 401) };
  if (user.role !== "مالك الحساب") return { error: jsonError("إدارة الوحدات متاحة لمالك الحساب فقط", 403) };
  return { user };
}

export async function POST(request: NextRequest) {
  const auth = await ownerOnly(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as (UnitInput & { projectId?: string }) | null;
  const result = await createUnit(auth.user!.tenantId, String(body?.projectId ?? ""), body ?? {});
  if (!result.ok) return jsonError(result.error, result.code);
  return jsonOk({ units: await listUnits(auth.user!.tenantId, result.unit.projectId) });
}

export async function PATCH(request: NextRequest) {
  const auth = await ownerOnly(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as (UnitInput & { id?: string }) | null;
  const result = await updateUnit(auth.user!.tenantId, String(body?.id ?? ""), body ?? {});
  if (!result.ok) return jsonError(result.error, result.code);
  return jsonOk({ units: await listUnits(auth.user!.tenantId, result.unit.projectId) });
}

export async function DELETE(request: NextRequest) {
  const auth = await ownerOnly(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { id?: string; projectId?: string } | null;
  if (!(await deleteUnit(auth.user!.tenantId, String(body?.id ?? "")))) return jsonError("نوع الوحدة غير موجود", 404);
  return jsonOk({ units: await listUnits(auth.user!.tenantId, String(body?.projectId ?? "")) });
}
