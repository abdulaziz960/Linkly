import { prisma } from "./prisma";
import { computeAllowedViews } from "./permissions";
import { getCurrentUser } from "./auth";
import type { ViewKey } from "../app/dashboard/types";
import { isViewLockedForTenant } from "./plan-access-server";

type SessionUser = { email: string; tenantId: string; role: string };

export async function getEmployeeForUser(user: SessionUser) {
  return prisma.employee.findFirst({ where: { email: user.email, tenantId: user.tenantId } });
}

/**
 * Which conversation assignees a user is allowed to see. `undefined` means
 * full tenant-wide visibility (the account owner only). A supervisor
 * additionally sees every conversation assigned to a member of any team
 * they lead - not just their own - since "مشرف" only ever meant "sees my
 * own conversations" before, same as a regular employee.
 */
export async function getVisibleAssigneeNames(user: SessionUser, employee?: { name: string } | null): Promise<string[] | undefined> {
  if (user.role === "مالك الحساب") return undefined;

  const ownName = employee?.name || "__no_matching_employee__";
  if (user.role !== "مشرف" || !employee) return [ownName];

  const ledTeams = await prisma.team.findMany({
    where: { tenantId: user.tenantId, lead: employee.name },
    include: { members: { include: { employee: true } } }
  });

  const names = new Set<string>([ownName]);
  for (const team of ledTeams) {
    for (const member of team.members) names.add(member.employee.name);
  }
  return [...names];
}

export async function userHasViewPermission(user: SessionUser, view: ViewKey): Promise<boolean> {
  // The plan caps every role, the account owner included.
  if (await isViewLockedForTenant(user.tenantId, view)) return false;
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
