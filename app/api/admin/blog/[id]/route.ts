import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../lib/admin-audit";
import { cleanBlogInput, deleteBlogPost, updateBlogPost, type BlogInput } from "../../../../../lib/blog-store";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;
  const cleaned = cleanBlogInput((await request.json().catch(() => null)) as BlogInput ?? {});
  if (!cleaned.ok) return jsonError(cleaned.error, 400);

  const result = await updateBlogPost(id, cleaned.data);
  if (!result.ok) return jsonError(result.error, result.status);
  await recordAdminAction(admin, "update-blog-post", { type: "blog", id }, JSON.stringify({ slug: result.post.slug, published: result.post.published }));
  return jsonOk(result.post);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;
  if (!(await deleteBlogPost(id))) return jsonError("المقال غير موجود", 404);
  await recordAdminAction(admin, "delete-blog-post", { type: "blog", id }, "");
  return jsonOk({ deleted: true });
}
