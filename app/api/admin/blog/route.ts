import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { cleanBlogInput, createBlogPost, listAdminPosts, seedDefaultPostsIfEmpty, type BlogInput } from "../../../../lib/blog-store";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  await seedDefaultPostsIfEmpty();
  return jsonOk(await listAdminPosts());
}

export async function POST(request: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const cleaned = cleanBlogInput((await request.json().catch(() => null)) as BlogInput ?? {});
  if (!cleaned.ok) return jsonError(cleaned.error, 400);

  await seedDefaultPostsIfEmpty();
  const result = await createBlogPost(cleaned.data);
  if (!result.ok) return jsonError(result.error, result.status);
  await recordAdminAction(admin, "create-blog-post", { type: "blog", id: result.post.id }, JSON.stringify({ slug: result.post.slug }));
  return jsonOk(result.post);
}
