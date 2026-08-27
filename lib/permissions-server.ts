import { prisma } from "./prisma";
import { computeAllowedViews } from "./permissions";
import { getCurrentUser } from "./auth";
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

/**
 * Shared "require the current session's tenant OWNER" helper, for routes
 * that were each hand-rolling `user.role !== "مالك الحساب"` inline (e.g.
 * billing/checkout). Returns null (route should respond 401/403) instead of
 * throwing, matching the existing requirePlatformAdmin() convention.
 * allowExpired mirrors getCurrentUser's option - owners managing billing
 * need access even with an expired subscription.
 */
export async function requireOwner(options: { allowExpired?: boolean } = {}) {
  const user = await getCurrentUser(options);
  if (!user || user.role !== "مالك الحساب") return null;
  return user;
}
