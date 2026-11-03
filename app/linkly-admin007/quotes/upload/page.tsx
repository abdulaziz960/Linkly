import AdminPageHeader from "../../AdminPageHeader";
import { guardPage } from "../../guard";
import QuoteUploadForm from "../QuoteUploadForm";
import "../quote-editor.css";

export const dynamic = "force-dynamic";

export default async function UploadQuotePage() {
  const denied = await guardPage("billing");
  if (denied) return denied;
  return (
    <>
      <AdminPageHeader eyebrow={["المبيعات", "Sales"]} title={["رفع عرض سعر جاهز", "Upload a ready quotation"]} description={["ارفع ملف العرض (PDF) واربطه بالعميل مع مبالغه. يُحتسب بعد تسجيل الاعتماد وتأكيد الحوالة.", "Upload the quotation PDF and link it to the client with its amounts."]} />
      <QuoteUploadForm />
    </>
  );
}
