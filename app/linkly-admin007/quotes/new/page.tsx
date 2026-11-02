import AdminPageHeader from "../../AdminPageHeader";
import { guardPage } from "../../guard";
import { listQuoteServices } from "../../../../lib/quotes/store";
import QuoteEditor from "../QuoteEditor";
import "../quote-editor.css";

export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const denied = await guardPage("billing");
  if (denied) return denied;
  return (
    <>
      <AdminPageHeader eyebrow={["عروض الأسعار", "Quotations"]} title={["عرض سعر جديد", "New quotation"]} description={["أدخل بيانات العميل واختر خدماته، وأرسل له العرض.", "Enter the client's details, pick the services and send the quotation."]} />
      <QuoteEditor services={await listQuoteServices(true)} quote={null} events={[]} />
    </>
  );
}
