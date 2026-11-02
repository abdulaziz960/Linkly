import "./quote-document.css";
import { formatSar } from "../../lib/quotes/model";

export type QuoteDocumentData = {
  number: string;
  customerName: string;
  logoDataUrl: string;
  eyebrow: string;
  headline: string;
  subtitle: string;
  issuedOn: string;
  validityDays: number;
  lines: Array<{ name: string; description: string; quantity: number; unitPriceHalalas: number; vatRate: number }>;
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  terms: string[];
  paymentTerms: string;
  status?: "draft" | "sent" | "approved" | "cancelled" | "needs_changes";
};

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** "2026-10-29" as "29 أكتوبر 2026". */
export function longArabicDate(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? ""} ${match[1]}`;
}

/** The quotation itself: one page that looks the same in the panel, on the client's page and when printed to PDF. */
export default function QuoteDocument({ quote }: { quote: QuoteDocumentData }) {
  const showVatNote = quote.lines.some((line) => line.vatRate > 0);
  return (
    <article className="qd" aria-label={`عرض سعر ${quote.number}`}>
      <header className="qd-hero">
        <div className="qd-corner">
          {quote.logoDataUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={quote.logoDataUrl} alt={quote.customerName} />
            : <span className="qd-corner-name">{quote.customerName}</span>}
        </div>
        <div className="qd-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/linkly-logo.png" alt="" />
          <span>لنكلي<small>LINKLY</small></span>
        </div>
        <span className="qd-badge">عرض سعر | QUOTATION</span>
        <div className="qd-hero-text">
          {quote.eyebrow ? <div className="qd-eyebrow">{quote.eyebrow}</div> : null}
          <h1>{quote.headline || "عرض سعر"}</h1>
          {quote.subtitle ? <p>{quote.subtitle}</p> : null}
        </div>
      </header>

      <div className="qd-body">
        <div className="qd-cards">
          <div><small>مقدم إلى</small><b>{quote.customerName}</b></div>
          <div><small>تاريخ العرض</small><b>{longArabicDate(quote.issuedOn)}</b></div>
          <div><small>صلاحية العرض</small><b>{quote.validityDays} {quote.validityDays === 1 ? "يوم" : "أيام"}</b></div>
        </div>

        <section className="qd-section">
          <small>01 / تفاصيل العرض</small>
          <h2>الخدمات والتكلفة</h2>
          <div className="qd-table">
            <div className="qd-th"><span>الخدمة</span><span>القيمة</span></div>
            {quote.lines.map((line, index) => (
              <div className="qd-row" key={index}>
                <div className="qd-name">
                  <b>{line.name}{line.quantity > 1 ? ` × ${line.quantity}` : ""}</b>
                  {line.description ? <span>{line.description}</span> : null}
                </div>
                <div className="qd-value">{formatSar(line.quantity * line.unitPriceHalalas)} ريال</div>
              </div>
            ))}
            <div className="qd-row qd-sumrow"><span>الإجمالي قبل الضريبة</span><span className="qd-value">{formatSar(quote.subtotalHalalas)} ريال</span></div>
            {showVatNote ? <div className="qd-row qd-sumrow"><span>ضريبة القيمة المضافة (15%)</span><span className="qd-value">{formatSar(quote.vatHalalas)} ريال</span></div> : null}
            <div className="qd-total"><span>الإجمالي شامل الضريبة</span><span className="qd-total-value">{formatSar(quote.totalHalalas)} ريال</span></div>
          </div>
        </section>

        <section className="qd-terms">
          <small>02 / معلومات مهمة</small>
          <h2>الشروط والملاحظات</h2>
          <ul>
            {quote.paymentTerms ? <li>شروط السداد: {quote.paymentTerms}.</li> : null}
            {quote.terms.map((term, index) => <li key={index}>{term}</li>)}
          </ul>
        </section>
      </div>

      <footer className="qd-foot"><span>حلول تواصل تجمعك بعملائك</span><b>linklysa.io</b></footer>
      {quote.status === "approved" ? <div className="qd-stamp">معتمد</div> : null}
      {quote.status === "cancelled" ? <div className="qd-stamp qd-stamp-bad">ملغي</div> : null}
    </article>
  );
}
