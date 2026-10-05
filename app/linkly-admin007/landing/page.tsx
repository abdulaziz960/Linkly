import { listLandingRows } from "../../../lib/landing-content";
import AdminPageHeader from "../AdminPageHeader";
import LandingAdminView from "./LandingAdminView";
import { guardPage } from "../guard";

export const dynamic = "force-dynamic";

export default async function AdminLandingPage() {
  const denied = await guardPage("content");
  if (denied) return denied;
  const rows = await listLandingRows();

  return (
    <>
      <AdminPageHeader
        eyebrow={["نصوص الصفحة الرئيسية", "Home page texts"]}
        title={["نصوص الصفحة الرئيسية", "Home page texts"]}
        description={["عدّل العنوان الرئيسي (H1) وعناوين الأقسام (H2) ووصفها ونصوص الدعوات في الصفحة الرئيسية بالعربية والإنجليزية. اترك الحقل فارغًا لاستخدام النص الأصلي.", "Edit the main headline (H1), section headings (H2), descriptions and call-to-action texts of the home page in Arabic and English. Leave a field blank to keep the original text."]}
      />
      <LandingAdminView initialRows={rows} />
    </>
  );
}
