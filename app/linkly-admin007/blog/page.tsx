import { listAdminPosts, seedDefaultPostsIfEmpty } from "../../../lib/blog-store";
import AdminPageHeader from "../AdminPageHeader";
import BlogAdminView from "./BlogAdminView";
import { guardPage } from "../guard";

export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  const denied = await guardPage("content");
  if (denied) return denied;
  // The first visit copies the built-in posts into the table so they can be edited.
  await seedDefaultPostsIfEmpty();
  const posts = await listAdminPosts();

  return (
    <>
      <AdminPageHeader
        eyebrow={["المدونة", "Blog"]}
        title={["إدارة المدونة", "Manage the blog"]}
        description={["اكتب المقالات وعدّلها وانشرها أو أخفِها؛ تظهر في صفحة المدونة وخريطة الموقع بالعربية، وبالإنجليزية إن كتبت النسخة الإنجليزية.", "Write, edit, publish or hide posts; they appear on the blog and in the sitemap in Arabic, and in English when an English version is written."]}
      />
      <BlogAdminView initialPosts={posts} />
    </>
  );
}
