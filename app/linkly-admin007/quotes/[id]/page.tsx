import { notFound } from "next/navigation";
import AdminPageHeader from "../../AdminPageHeader";
import { guardPage } from "../../guard";
import { getQuote, listQuoteEvents, listQuoteServices } from "../../../../lib/quotes/store";
import { getActivePlans } from "../../../../lib/plans";
import QuoteEditor from "../QuoteEditor";
import "../quote-editor.css";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await guardPage("billing");
  if (denied) return denied;
  const quote = await getQuote((await params).id);
  if (!quote) notFound();
  return (
    <>
      <AdminPageHeader eyebrow={["عروض الأسعار", "Quotations"]} title={[`عرض سعر ${quote.number}`, `Quotation ${quote.number}`]} description={[quote.customerName, quote.customerName]} />
      <QuoteEditor plans={(await getActivePlans()).map((plan) => ({ name: plan.name, monthlyPrice: plan.monthlyPrice }))} services={await listQuoteServices(true)} quote={quote} events={await listQuoteEvents(quote.id)} />
    </>
  );
}
