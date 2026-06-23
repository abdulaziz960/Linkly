import { NextRequest } from "next/server";
import { getWorkSchedules } from "../../../lib/database";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getWorkSchedules());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { team?: string; days?: string; start?: string; end?: string; status?: string; holidays?: string };
  if (!body.team?.trim()) return jsonError("الفريق مطلوب");
  const schedule = await prisma.workSchedule.create({
    data: {
      id: `wh-${Date.now()}`,
      team: body.team.trim(),
      days: body.days || "الأحد - الخميس",
      start: body.start || "9:00 ص",
      end: body.end || "6:00 م",
      status: body.status || "نشط",
      holidays: body.holidays || "غير مفعلة"
    }
  });
  return jsonOk(schedule);
}
