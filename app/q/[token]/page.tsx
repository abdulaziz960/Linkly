import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatSar, isExpired } from "../../../lib/quotes/model";
import { getQuoteByToken } from "../../../lib/quotes/store";
import QuoteDocument from "../../quotes/QuoteDocument";
import QuoteActions from "./QuoteActions";
import PrintButton from "./PrintButton";
import "./quote-page.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "عرض سعر | لنكلي", robots: { index: false, follow: false } };

const NOTICES: Record<string, { text: string; tone: "ok" | "warn" | "bad" }> = {
  approved: { text: "تم اعتماد هذا العرض. شكرًا لثقتكم، وسنتواصل معكم لإكمال التفعيل.", tone: "ok" },
  needs_changes: { text: "وصلنا طلب التعديل وسنرسل لكم عرضًا محدّثًا قريبًا.", tone: "warn" },
  cancelled: { text: "تم إلغاء هذا العرض.", tone: "bad" }
};

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const quote = await getQuoteByToken((await params).token);
  if (!quote) notFound();

  // A quote being rewritten after the client asked for changes is not shown until it is sent again.
  if (quote.status === "draft") {
    return (
      <main className="quote-page"><div className="quote-page-note quote-page-note-warn">هذا العرض قيد التحديث وسيصلكم رابط جديد عند جاهزيته.</div></main>
    );
  }

  const expired = quote.status === "sent" && isExpired(quote.validUntil);
  const notice = expired ? { text: "انتهت صلاحية هذا العرض. تواصلوا معنا لتجديده.", tone: "warn" as const } : NOTICES[quote.status];

  return (
    <main className="quote-page">
      {notice ? <div className={`quote-page-note quote-page-note-${notice.tone}`} role="status">{notice.text}</div> : null}
      <QuoteDocument quote={{ ...quote, status: quote.status }} />
      {quote.status === "sent" && !expired ? (
        <QuoteActions token={quote.token} totalLabel={formatSar(quote.totalHalalas)} billingCycle={quote.billingCycle} paymentTerms={quote.paymentTerms} />
      ) : null}
      <div className="quote-page-tools no-print"><PrintButton /></div>
    </main>
  );
}
