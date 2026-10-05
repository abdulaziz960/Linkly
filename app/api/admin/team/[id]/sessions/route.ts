import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { revokePlatformAdminSessions } from "../../../../../../lib/platform-team";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

// Signs the member out of every device (invalidates all their session tokens).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("team");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;

  try {
    await revokePlatformAdminSessions(id, admin.id);
    await recordAdminAction(admin, "revoke-platform-admin-sessions", { type: "user", id });
    return jsonOk({ id });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إنهاء الجلسات", 400);
  }
}
