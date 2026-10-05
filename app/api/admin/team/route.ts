import { NextRequest } from "next/server";
import { requirePlatformAdmin, setAdminPermissions } from "../../../../lib/admin-auth";
import { ADMIN_PERMISSIONS, type AdminPermission } from "../../../../lib/admin-permissions";
import { getPlatformTeam, invitePlatformAdmin } from "../../../../lib/platform-team";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { jsonError, jsonOk } from "../../_utils/json";
import { getAppOrigin } from "../../../../lib/app-url";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin("team");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  return jsonOk(await getPlatformTeam());
}

export async function POST(request: NextRequest) {
  const admin = await requirePlatformAdmin("team");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json().catch(() => ({}))) as { name?: string; email?: string; permissions?: unknown };
  // Optional restriction chosen at invite time; omitted means full access.
  const requested = Array.isArray(body.permissions) ? (ADMIN_PERMISSIONS.filter((permission) => (body.permissions as unknown[]).includes(permission)) as AdminPermission[]) : null;
  if (requested !== null && requested.length === 0) return jsonError("اختر صلاحية واحدة على الأقل للعضو الجديد");

  try {
    const { delivery, userId } = await invitePlatformAdmin(
      { name: body.name || "", email: body.email || "" },
      getAppOrigin(request)
    );
    if (requested && requested.length < ADMIN_PERMISSIONS.length) await setAdminPermissions(userId, requested, admin.id);
    await recordAdminAction(admin, "invite-platform-admin", { type: "user", id: body.email || "" }, JSON.stringify({ subject: body.name, name: body.name, permissions: (requested ?? ADMIN_PERMISSIONS).join("،") }));
    return jsonOk({ delivery });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إضافة العضو", 400);
  }
}
