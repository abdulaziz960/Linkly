import { getCurrentUser } from "./auth";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { ADMIN_PERMISSIONS, hasAdminPermission, parseAdminPermissions, serializeAdminPermissions, type AdminPermission } from "./admin-permissions";

/**
 * Permissions of a platform team member. A member with no stored row has full
 * access (the behaviour before restrictions existed). If the table cannot be
 * read the member also keeps full access: restrictions can only exist once a
 * row has been written, so an unreadable table means nobody is restricted yet.
 */
export async function getAdminPermissions(userId: string): Promise<AdminPermission[]> {
  try {
    await ensureSchema();
    const row = await prisma.platformAdminPermission.findUnique({ where: { userId } });
    return parseAdminPermissions(row?.permissions);
  } catch (error) {
    console.error("[admin-permissions] could not read permissions, defaulting to full access", error);
    return [...ADMIN_PERMISSIONS];
  }
}

export async function setAdminPermissions(userId: string, permissions: AdminPermission[], updatedBy: string) {
  await ensureSchema();
  const value = serializeAdminPermissions(permissions);
  const now = new Date().toISOString();
  await prisma.platformAdminPermission.upsert({
    where: { userId },
    create: { userId, permissions: value, updatedAt: now, updatedBy },
    update: { permissions: value, updatedAt: now, updatedBy }
  });
}

/** Permissions for every member id (members without a row get full access). */
export async function getAllAdminPermissions(userIds: string[]): Promise<Map<string, AdminPermission[]>> {
  const map = new Map<string, AdminPermission[]>(userIds.map((id) => [id, [...ADMIN_PERMISSIONS]]));
  try {
    await ensureSchema();
    const rows = await prisma.platformAdminPermission.findMany({ where: { userId: { in: userIds } } });
    for (const row of rows) map.set(row.userId, parseAdminPermissions(row.permissions));
  } catch (error) {
    console.error("[admin-permissions] could not read permissions", error);
  }
  return map;
}

/**
 * Returns the signed-in platform admin, or null. When a permission is given the
 * member must also hold it - enforced here on the server, never only in the UI.
 */
export async function requirePlatformAdmin(permission?: AdminPermission) {
  const user = await getCurrentUser();
  if (!user || user.isPlatformAdmin !== 1) return null;
  if (!permission) return user;
  const permissions = await getAdminPermissions(user.id);
  return hasAdminPermission(permissions, permission) ? user : null;
}
