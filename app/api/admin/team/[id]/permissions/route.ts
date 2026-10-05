import { NextRequest } from "next/server";
import { getAdminPermissions, requirePlatformAdmin, setAdminPermissions } from "../../../../../../lib/admin-auth";
import { ADMIN_PERMISSIONS, validatePermissionChange, type AdminPermission } from "../../../../../../lib/admin-permissions";
import { changeDetails, recordAdminAction } from "../../../../../../lib/admin-audit";
import { prisma } from "../../../../../../lib/prisma";
import { getTeamManagerIds } from "../../../../../../lib/team-managers";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("team");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { permissions?: unknown } | null;
  if (!body || !Array.isArray(body.permissions)) return jsonError("الصلاحيات مطلوبة");
  const next = ADMIN_PERMISSIONS.filter((permission) => (body.permissions as unknown[]).includes(permission)) as AdminPermission[];

  const target = await prisma.userAccount.findUnique({ where: { id }, select: { id: true, name: true, isPlatformAdmin: true } });
  if (!target || target.isPlatformAdmin !== 1) return jsonError("العضو غير موجود", 404);

  const problem = validatePermissionChange({ targetId: id, next, teamManagerIds: await getTeamManagerIds() });
  if (problem) return jsonError(problem, 400);

  const previous = await getAdminPermissions(id);
  await setAdminPermissions(id, next, admin.id);
  await recordAdminAction(admin, "update-team-permissions", { type: "user", id }, changeDetails({ permissions: previous.join("،") }, { permissions: next.join("،") }, target.name));
  return jsonOk({ id, permissions: next });
}
