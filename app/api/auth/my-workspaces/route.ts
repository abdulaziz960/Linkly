import { getCurrentUser } from "../../../../lib/auth";
import { projectChildTenantIds } from "../../../../lib/workspaces/store";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return jsonError("غير مصرح", 401);

  const allMemberships = await prisma.employee.findMany({
    where: { userId: user.id },
    select: { tenantId: true, role: true }
  });
  // The projects of a multi-project account are chosen from the project switcher, not listed as separate companies.
  const children = await projectChildTenantIds();
  const memberships = allMemberships.filter((membership) => !children.has(membership.tenantId) || membership.tenantId === user.tenantId);

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
