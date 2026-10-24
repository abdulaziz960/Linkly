import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { getAppOrigin } from "../../../../lib/app-url";
import { getMenuImageVersion, menuImageUrl, removeMenuImage, saveMenuImage } from "../../../../lib/catalog-menu-image";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

async function authorize(request: NextRequest | null) {
  if (request && !isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("غير مصرح", 401) };
  if (!(await userHasViewPermission(user, "catalog"))) return { error: jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403) };
  return { user };
}

async function current(request: NextRequest, tenantId: string) {
  const version = await getMenuImageVersion(tenantId);
  return { imageUrl: version ? menuImageUrl(getAppOrigin(request), tenantId, version) : "" };
}

export async function GET(request: NextRequest) {
  const auth = await authorize(null);
  if (auth.error) return auth.error;
  return jsonOk(await current(request, auth.user.tenantId));
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { dataUrl?: unknown } | null;
  const saved = await saveMenuImage(auth.user.tenantId, String(body?.dataUrl ?? ""));
  if (!saved.ok) return jsonError(saved.error, 400);
  return jsonOk(await current(request, auth.user.tenantId));
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  await removeMenuImage(auth.user.tenantId);
  return jsonOk({ imageUrl: "" });
}
