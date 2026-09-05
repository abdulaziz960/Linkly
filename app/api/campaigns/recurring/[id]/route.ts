import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  if (body?.status !== "نشطة" && body?.status !== "متوقفة") {
    return jsonError("حالة غير صالحة");
  }

  const recurrence = await prisma.campaignRecurrence.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!recurrence) return jsonError("السلسلة غير موجودة", 404);
  if (recurrence.status === "منتهية") return jsonError("انتهت هذه السلسلة ولا يمكن استئنافها");

  const updated = await prisma.campaignRecurrence.update({
    where: { id },
    data: { status: body.status, updatedAt: new Date().toISOString() }
  });

  return jsonOk(updated);
}
