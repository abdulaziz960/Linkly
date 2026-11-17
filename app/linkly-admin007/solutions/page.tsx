import { listAdminSolutions, seedDefaultSolutionsIfEmpty } from "../../../lib/solution-store";
import { siteLinkSuggestions } from "../../../lib/blog-links";
import AdminPageHeader from "../AdminPageHeader";
import SolutionsAdminView from "./SolutionsAdminView";
import { guardPage } from "../guard";

export const dynamic = "force-dynamic";

export default async function AdminSolutionsPage() {
  const denied = await guardPage("content");
  if (denied) return denied;
  // The first visit copies the built-in guides into the table so they can be edited.
  await seedDefaultSolutionsIfEmpty();
  const pages = await listAdminSolutions();

  return (
    <>
      <AdminPageHeader
        eyebrow={["الحلول", "Solutions"]}
        title={["صفحات الحلول", "Solution pages"]}
        description={["عدّل نص أدلة الاستخدام (الحلول) أو أضف صفحة جديدة لها رابطها وعنوانها؛ تظهر في الموقع وخريطة الموقع، وبالإنجليزية إن كتبت النسخة الإنجليزية. عنوان SEO ووصفها من «SEO الصفحات».", "Edit the text of the use-case guides or add a new page with its own link and title; they appear on the site and in the sitemap, in English when an English version is written. Their SEO title and description are in \"Page SEO\"."]}
      />
      <SolutionsAdminView initialPages={pages} siteLinks={{ ar: await siteLinkSuggestions("ar"), en: await siteLinkSuggestions("en") }} />
    </>
  );
}
