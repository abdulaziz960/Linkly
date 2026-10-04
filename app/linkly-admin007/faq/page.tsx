import { listFaqItems, seedDefaultFaqsIfEmpty } from "../../../lib/faq-store";
import AdminPageHeader from "../AdminPageHeader";
import FaqAdminView from "./FaqAdminView";

export const dynamic = "force-dynamic";

export default async function AdminFaqPage() {
  // The first visit copies the built-in questions into the table so they can be edited.
  await seedDefaultFaqsIfEmpty();
  const items = await listFaqItems();

  return (
    <>
      <AdminPageHeader
        eyebrow={["الأسئلة الشائعة", "FAQ"]}
        title={["إدارة الأسئلة الشائعة", "Manage the FAQ"]}
        description={["أضف الأسئلة وعدّلها ورتّبها وأخفِها؛ تظهر في الصفحة الرئيسية وصفحة الأسئلة الشائعة بالعربية والإنجليزية.", "Add, edit, reorder and hide questions; they appear on the home page and the FAQ page in Arabic and English."]}
      />
      <FaqAdminView initialItems={items} />
    </>
  );
}
