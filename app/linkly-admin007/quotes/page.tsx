import AdminPageHeader from "../AdminPageHeader";
import { guardPage } from "../guard";
import { listQuotes } from "../../../lib/quotes/store";
import QuotesView from "./QuotesView";

export const dynamic = "force-dynamic";

export default async function AdminQuotesPage() {
  const denied = await guardPage("billing");
  if (denied) return denied;
  const quotes = await listQuotes();

  return (
    <>
      <AdminPageHeader
        eyebrow={["المبيعات", "Sales"]}
        title={["عروض الأسعار", "Quotations"]}
        description={["أنشئ عرض سعر للعميل بخدماته وأسعاره، وأرسله له ليعتمده أو يطلب تعديله.", "Create a quotation with the client's services and prices, and send it for approval."]}
      />
      <QuotesView quotes={quotes} />
    </>
  );
}
