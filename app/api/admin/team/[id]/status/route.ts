import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { setPlatformAdminDisabled } from "../../../../../../lib/platform-team";
import { getTeamManagerIds } from "../../../../../../lib/team-managers";
import { jsonError, jsonOk } from "../../../../_utils/json";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";

export const runtime = "nodejs";

// Suspend (disabled: true) or reactivate (disabled: false) a team member.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("team");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { disabled?: unknown } | null;
  if (!body || typeof body.disabled !== "boolean") return jsonError("الحالة المطلوبة غير صالحة");

  try {
    await setPlatformAdminDisabled(id, body.disabled, admin.id, await getTeamManagerIds());
    await recordAdminAction(admin, body.disabled ? "suspend-platform-admin" : "reactivate-platform-admin", { type: "user", id });
    return jsonOk({ id, disabled: body.disabled });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر تحديث حالة العضو", 400);
  }
}
