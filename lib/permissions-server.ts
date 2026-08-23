import { prisma } from "./prisma";
import { computeAllowedViews } from "./permissions";
import type { ViewKey } from "../app/dashboard/types";

type SessionUser = { email: string; tenantId: string; role: string };

export async function getEmployeeForUser(user: SessionUser) {
  return prisma.employee.findFirst({ where: { email: user.email, tenantId: user.tenantId } });
}

export async function userHasViewPermission(user: SessionUser, view: ViewKey): Promise<boolean> {
  // The platform admin can hide the CRM/leads feature per client from the
  // admin panel - this overrides role and employee permissions, owner
  // included, so it must be checked before the owner short-circuit below.
  if (view === "leads") {
    const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId }, select: { leadsEnabled: true } });
    if (subscription && subscription.leadsEnabled === 0) return false;
  }

  if (user.role === "مالك الحساب") return true;

  const employee = await getEmployeeForUser(user);
  return computeAllowedViews(user.role, employee?.permissions ?? "").includes(view);
}
