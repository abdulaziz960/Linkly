import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { revokePlatformAdmin } from "../../../../../lib/platform-team";
import { recordAdminAction } from "../../../../../lib/admin-audit";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("team");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;

  try {
    await revokePlatformAdmin(id, admin.id);
    await recordAdminAction(admin, "revoke-platform-admin", { type: "user", id });
    return jsonOk({ id });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إزالة الصلاحية", 400);
  }
}
