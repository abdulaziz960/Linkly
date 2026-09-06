import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return jsonError("غير مصرح", 401);

  const memberships = await prisma.employee.findMany({
    where: { userId: user.id },
    select: { tenantId: true, role: true }
  });

  const subscriptions = await prisma.subscription.findMany({
    where: { tenantId: { in: memberships.map((membership) => membership.tenantId) } },
    select: { tenantId: true, companyName: true }
  });
  const companyNameByTenant = new Map(subscriptions.map((subscription) => [subscription.tenantId, subscription.companyName]));

  return jsonOk(
    memberships.map((membership) => ({
      tenantId: membership.tenantId,
      role: membership.role,
      companyName: companyNameByTenant.get(membership.tenantId) || "",
      active: membership.tenantId === user.tenantId
    }))
  );
}
