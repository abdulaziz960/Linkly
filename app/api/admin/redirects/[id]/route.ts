import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../lib/admin-audit";
import { cleanRedirectInput, deleteRedirect, updateRedirect } from "../../../../../lib/redirects";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;
  const cleaned = cleanRedirectInput((await request.json().catch(() => null)) ?? {});
  if (!cleaned.ok) return jsonError(cleaned.error, 400);
  const result = await updateRedirect(id, cleaned.data);
  if (!result.ok) return jsonError(result.error, result.status);
  await recordAdminAction(admin, "update-redirect", { type: "redirect", id }, JSON.stringify({ from: result.rule.fromPath, to: result.rule.toUrl, status: result.rule.statusCode, enabled: result.rule.enabled }));
  return jsonOk(result.rule);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;
  if (!(await deleteRedirect(id))) return jsonError("القاعدة غير موجودة", 404);
  await recordAdminAction(admin, "delete-redirect", { type: "redirect", id }, "");
  return jsonOk({ deleted: true });
}
