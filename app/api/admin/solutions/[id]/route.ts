import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../lib/admin-audit";
import { cleanSolutionInput, deleteSolution, updateSolution, type SolutionInput } from "../../../../../lib/solution-store";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;
  const cleaned = cleanSolutionInput(((await request.json().catch(() => null)) as SolutionInput) ?? {});
  if (!cleaned.ok) return jsonError(cleaned.error, 400);

  const result = await updateSolution(id, cleaned.data);
  if (!result.ok) return jsonError(result.error, result.status);
  await recordAdminAction(admin, "update-solution-page", { type: "solution", id }, JSON.stringify({ slug: result.solution.slug, published: result.solution.published }));
  return jsonOk(result.solution);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;
  if (!(await deleteSolution(id))) return jsonError("الصفحة غير موجودة", 404);
  await recordAdminAction(admin, "delete-solution-page", { type: "solution", id }, "");
  return jsonOk({ deleted: true });
}
