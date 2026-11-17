import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { cleanSolutionInput, createSolution, listAdminSolutions, seedDefaultSolutionsIfEmpty, type SolutionInput } from "../../../../lib/solution-store";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  await seedDefaultSolutionsIfEmpty();
  return jsonOk(await listAdminSolutions());
}

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const cleaned = cleanSolutionInput(((await request.json().catch(() => null)) as SolutionInput) ?? {});
  if (!cleaned.ok) return jsonError(cleaned.error, 400);

  await seedDefaultSolutionsIfEmpty();
  const result = await createSolution(cleaned.data);
  if (!result.ok) return jsonError(result.error, result.status);
  await recordAdminAction(admin, "create-solution-page", { type: "solution", id: result.solution.id }, JSON.stringify({ slug: result.solution.slug }));
  return jsonOk(result.solution);
}
