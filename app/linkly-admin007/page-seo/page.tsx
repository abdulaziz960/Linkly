import { listPageSeo } from "../../../lib/page-seo";
import AdminPageHeader from "../AdminPageHeader";
import PageSeoAdminView from "./PageSeoAdminView";
import { guardPage } from "../guard";

export const dynamic = "force-dynamic";

export default async function AdminPageSeoPage() {
  const denied = await guardPage("content");
  if (denied) return denied;
  const rows = await listPageSeo();

  return (
    <>
      <AdminPageHeader
        eyebrow={["SEO الصفحات", "Page SEO"]}
        title={["SEO الصفحات الثابتة", "SEO for fixed pages"]}
        description={["عدّل عنوان الصفحة ووصفها وCanonical وإعدادات المشاركة للصفحة الرئيسية والأسئلة الشائعة وتواصل معنا وغيرها. الحقل الفارغ يعني استخدام القيمة الافتراضية.", "Edit the title, description, canonical and sharing settings of the home, FAQ, contact and other fixed pages. A blank field keeps the built-in value."]}
      />
      <PageSeoAdminView initialRows={rows} />
    </>
  );
}
