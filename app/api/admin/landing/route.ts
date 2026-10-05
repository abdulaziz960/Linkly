import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { listLandingRows, saveLandingText } from "../../../../lib/landing-content";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  return jsonOk(await listLandingRows());
}

/** Saves one text; an empty value restores the built-in text. */
export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = ((await request.json().catch(() => null)) ?? {}) as { id?: unknown; value?: unknown };
  const result = await saveLandingText(typeof body.id === "string" ? body.id : "", body.value);
  if (!result.ok) return jsonError(result.error, 400);
  await recordAdminAction(admin, "update-landing-text", { type: "landing-text", id: result.id }, JSON.stringify({ restored: !result.override }));
  return jsonOk(result);
}
