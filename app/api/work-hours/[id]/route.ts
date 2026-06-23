import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { team?: string; days?: string; start?: string; end?: string; status?: string; holidays?: string };
  try {
    return jsonOk(await prisma.workSchedule.update({
      where: { id },
      data: { team: body.team, days: body.days, start: body.start, end: body.end, status: body.status, holidays: body.holidays }
    }));
  } catch {
    return jsonError("تعذر تحديث جدول العمل", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    await prisma.workSchedule.delete({ where: { id } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف جدول العمل", 404);
  }
}
