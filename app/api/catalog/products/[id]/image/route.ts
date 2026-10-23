import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { getProduct } from "../../../../../../lib/catalog";
import { getAppOrigin } from "../../../../../../lib/app-url";
import { productImageUrl, removeProductImages, saveProductImage } from "../../../../../../lib/catalog-product-image";
import { prisma } from "../../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function authorize(request: NextRequest, id: string) {
  if (!isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("غير مصرح", 401) };
  if (!(await userHasViewPermission(user, "catalog"))) return { error: jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403) };
  const product = await getProduct(user.tenantId, id);
  if (!product) return { error: jsonError("المنتج غير موجود", 404) };
  return { user };
}

/** Saves an uploaded photo (a JPEG data URL) as the product's image. */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authorize(request, id);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { dataUrl?: unknown } | null;
  const saved = await saveProductImage(auth.user.tenantId, id, String(body?.dataUrl ?? ""));
  if (!saved.ok) return jsonError(saved.error, 400);
  const url = productImageUrl(getAppOrigin(request), id, saved.version);
  await prisma.product.update({ where: { id }, data: { imageUrl: url, updatedAt: new Date().toISOString() } });
  return jsonOk({ imageUrl: url });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authorize(request, id);
  if (auth.error) return auth.error;
  await removeProductImages(auth.user.tenantId, [id]);
  await prisma.product.update({ where: { id }, data: { imageUrl: "", updatedAt: new Date().toISOString() } });
  return jsonOk({ imageUrl: "" });
}
