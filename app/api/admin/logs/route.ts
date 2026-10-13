import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { getRecentAdminLogs } from "../../../../lib/database";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await requirePlatformAdmin("tech");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const params = request.nextUrl.searchParams;
  // Newest first; ?limit= (max 1000) and ?client= keep the response bounded.
  return jsonOk(await getRecentAdminLogs({ limit: Number(params.get("limit")) || 200, clientId: params.get("client") || undefined }));
}
