import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "workHours"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const body = (await request.json()) as { team?: string; days?: string; start?: string; end?: string; status?: string; holidays?: string };

  const existing = await prisma.workSchedule.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return jsonError("تعذر تحديث جدول العمل", 404);

  try {
    // Re-scope the mutation itself to tenantId (not just the existence
    // check above) so a future refactor that drops/reorders the check
    // can't turn this into a cross-tenant write.
    await prisma.workSchedule.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        team: body.team?.trim(),
        days: body.days?.trim() || undefined,
        start: body.start?.trim() || undefined,
        end: body.end?.trim() || undefined,
        status: body.status,
        holidays: body.holidays
      }
    });
    return jsonOk(await prisma.workSchedule.findFirst({ where: { id, tenantId: user.tenantId } }));
  } catch {
    return jsonError("تعذر تحديث جدول العمل", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "workHours"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const existing = await prisma.workSchedule.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return jsonError("تعذر حذف جدول العمل", 404);

  try {
    await prisma.workSchedule.deleteMany({ where: { id, tenantId: user.tenantId } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف جدول العمل", 404);
  }
}
