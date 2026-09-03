import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { getPlatformTeam, invitePlatformAdmin } from "../../../../lib/platform-team";
import { jsonError, jsonOk } from "../../_utils/json";
import { getAppOrigin } from "../../../../lib/app-url";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  return jsonOk(await getPlatformTeam());
}

export async function POST(request: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json().catch(() => ({}))) as { name?: string; email?: string };

  try {
    const { delivery } = await invitePlatformAdmin(
      { name: body.name || "", email: body.email || "" },
      getAppOrigin(request)
    );
    return jsonOk({ delivery });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إضافة العضو", 400);
  }
}
