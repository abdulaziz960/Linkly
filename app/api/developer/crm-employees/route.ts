import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { listCrmEmployeeMap, removeCrmEmployeeMapping, setCrmEmployeeMapping } from "../../../../lib/crm-assignment";
import { prisma } from "../../../../lib/prisma";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** Which Linkly employee each CRM employee id stands for (used when the CRM sends `assigneeId`). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "developers"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  await ensureSchema();
  const [mappings, employees] = await Promise.all([
    listCrmEmployeeMap(user.tenantId),
    prisma.employee.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } })
  ]);
  return jsonOk({ mappings, employees });
}

export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("ربط الموظفين متاح لمالك الحساب فقط", 403);
  await ensureSchema();
  const body = (await request.json().catch(() => null)) as { externalId?: unknown; employeeId?: unknown } | null;
  const result = await setCrmEmployeeMapping(user.tenantId, body?.externalId, body?.employeeId);
  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({ mappings: await listCrmEmployeeMap(user.tenantId) });
}

export async function DELETE(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("ربط الموظفين متاح لمالك الحساب فقط", 403);
  const body = (await request.json().catch(() => null)) as { externalId?: unknown } | null;
  if (!(await removeCrmEmployeeMapping(user.tenantId, body?.externalId))) return jsonError("الربط غير موجود", 404);
  return jsonOk({ mappings: await listCrmEmployeeMap(user.tenantId) });
}
