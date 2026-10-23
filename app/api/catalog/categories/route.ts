import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { addCategory, listCategories, removeCategory } from "../../../../lib/catalog-categories";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

async function authorize(request: NextRequest | null) {
  if (request && !isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("غير مصرح", 401) };
  if (!(await userHasViewPermission(user, "catalog"))) return { error: jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403) };
  return { user };
}

export async function GET() {
  const auth = await authorize(null);
  if (auth.error) return auth.error;
  return jsonOk(await listCategories(auth.user.tenantId));
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const added = await addCategory(auth.user.tenantId, body?.name);
  if (!added.ok) return jsonError(added.error, 400);
  return jsonOk(await listCategories(auth.user.tenantId));
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  await removeCategory(auth.user.tenantId, request.nextUrl.searchParams.get("name"));
  return jsonOk(await listCategories(auth.user.tenantId));
}
