import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const recurrences = await prisma.campaignRecurrence.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      intervalDays: true,
      nextRunAt: true,
      endAt: true,
      occurrences: true,
      status: true
    }
  });

  return jsonOk(recurrences);
}
