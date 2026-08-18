import { prisma } from "./prisma";
import { computeAllowedViews } from "./permissions";
import type { ViewKey } from "../app/dashboard/types";

type SessionUser = { email: string; tenantId: string; role: string };

export async function getEmployeeForUser(user: SessionUser) {
  return prisma.employee.findFirst({ where: { email: user.email, tenantId: user.tenantId } });
}

export async function userHasViewPermission(user: SessionUser, view: ViewKey): Promise<boolean> {
  if (user.role === "مالك الحساب") return true;

  const employee = await getEmployeeForUser(user);
  return computeAllowedViews(user.role, employee?.permissions ?? "").includes(view);
}
