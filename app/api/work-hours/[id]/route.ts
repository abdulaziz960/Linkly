import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const { id } = await context.params;
  const body = (await request.json()) as { team?: string; days?: string; start?: string; end?: string; status?: string; holidays?: string };

  const existing = await prisma.workSchedule.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return jsonError("تعذر تحديث جدول العمل", 404);

  try {
    return jsonOk(await prisma.workSchedule.update({
      where: { id },
      data: {
        team: body.team?.trim(),
        days: body.days?.trim() || undefined,
        start: body.start?.trim() || undefined,
        end: body.end?.trim() || undefined,
        status: body.status,
        holidays: body.holidays
      }
    }));
  } catch {
    return jsonError("تعذر تحديث جدول العمل", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const { id } = await context.params;
  const existing = await prisma.workSchedule.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return jsonError("تعذر حذف جدول العمل", 404);

  try {
    await prisma.workSchedule.delete({ where: { id } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف جدول العمل", 404);
  }
}
