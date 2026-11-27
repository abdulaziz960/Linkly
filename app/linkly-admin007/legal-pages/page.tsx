import { listAdminLegalPages } from "../../../lib/legal-store";
import { siteLinkSuggestions } from "../../../lib/blog-links";
import AdminPageHeader from "../AdminPageHeader";
import LegalPagesAdminView from "./LegalPagesAdminView";
import { guardPage } from "../guard";

export const dynamic = "force-dynamic";

export default async function AdminLegalPagesPage() {
  const denied = await guardPage("content");
  if (denied) return denied;
  const pages = await listAdminLegalPages();

  return (
    <>
      <AdminPageHeader
        eyebrow={["الصفحات القانونية", "Legal pages"]}
        title={["الخصوصية والشروط وحذف البيانات", "Privacy, terms and data deletion"]}
        description={["عدّل نص الصفحات القانونية بالعربية والإنجليزية. تظهر التغييرات للزوار خلال نحو نصف دقيقة، ويمكنك إرجاع أي صفحة إلى نصها الأصلي.", "Edit the text of the legal pages in Arabic and English. Changes show to visitors within about half a minute, and any page can be put back to its original text."]}
      />
      <LegalPagesAdminView initialPages={pages} siteLinks={{ ar: await siteLinkSuggestions("ar"), en: await siteLinkSuggestions("en") }} />
    </>
  );
}

export const metadata = { title: "الصفحات القانونية" };
