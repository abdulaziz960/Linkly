import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { revokePlatformAdmin } from "../../../../../lib/platform-team";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;

  try {
    await revokePlatformAdmin(id, admin.id);
    return jsonOk({ id });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إزالة الصلاحية", 400);
  }
}
