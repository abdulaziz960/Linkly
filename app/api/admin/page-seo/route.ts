import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { cleanPageSeoInput, type PageSeoInput, listPageSeo, savePageSeo } from "../../../../lib/page-seo";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  return jsonOk(await listPageSeo());
}

export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = ((await request.json().catch(() => null)) ?? {}) as { path?: unknown } & Record<string, unknown>;
  const cleaned = cleanPageSeoInput(typeof body.path === "string" ? body.path : "", body as PageSeoInput);
  if (!cleaned.ok) return jsonError(cleaned.error, 400);
  const row = await savePageSeo(cleaned.data);
  await recordAdminAction(admin, "update-page-seo", { type: "page-seo", id: row.path }, JSON.stringify({ noindex: row.noindex }));
  return jsonOk(row);
}
