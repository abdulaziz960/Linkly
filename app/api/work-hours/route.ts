import { NextRequest } from "next/server";
import { getWorkSchedules } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  return jsonOk(await getWorkSchedules(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const body = (await request.json()) as { team?: string; days?: string; start?: string; end?: string; status?: string; holidays?: string };
  if (!body.team?.trim()) return jsonError("الفريق مطلوب");
  const schedule = await prisma.workSchedule.create({
    data: {
      id: `wh-${Date.now()}`,
      tenantId: user.tenantId,
      team: body.team.trim(),
      days: body.days?.trim() || "الأحد - الخميس",
      start: body.start?.trim() || "09:00",
      end: body.end?.trim() || "18:00",
      status: body.status || "نشط",
      holidays: body.holidays || "غير مفعلة"
    }
  });
  return jsonOk(schedule);
}
