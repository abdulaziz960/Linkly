import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { cleanRedirectInput, createRedirect, listRedirects } from "../../../../lib/redirects";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  return jsonOk(await listRedirects());
}

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const cleaned = cleanRedirectInput((await request.json().catch(() => null)) ?? {});
  if (!cleaned.ok) return jsonError(cleaned.error, 400);
  const result = await createRedirect(cleaned.data);
  if (!result.ok) return jsonError(result.error, result.status);
  await recordAdminAction(admin, "create-redirect", { type: "redirect", id: result.rule.id }, JSON.stringify({ from: result.rule.fromPath, to: result.rule.toUrl, status: result.rule.statusCode }));
  return jsonOk(result.rule);
}
