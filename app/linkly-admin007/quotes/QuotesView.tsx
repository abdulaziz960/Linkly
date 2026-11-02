"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { QUOTE_STATUSES, QUOTE_STATUS_LABELS, formatSar, type QuoteStatus } from "../../../lib/quotes/model";
import type { listQuotes } from "../../../lib/quotes/store";
import { Badge, EmptyState, LinkButton, Section, Segmented, type Tone } from "../ds/primitives";
import Icon from "../ds/Icon";

type Row = Awaited<ReturnType<typeof listQuotes>>[number];

const TONES: Record<QuoteStatus, Tone> = { draft: "neutral", sent: "info", approved: "success", cancelled: "danger", needs_changes: "warning" };

export default function QuotesView({ quotes }: { quotes: Row[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | QuoteStatus>("all");
  const counts = useMemo(() => Object.fromEntries(QUOTE_STATUSES.map((value) => [value, quotes.filter((quote) => quote.status === value).length])) as Record<QuoteStatus, number>, [quotes]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return quotes.filter((quote) => (status === "all" || quote.status === status) && (!needle || quote.customerName.toLowerCase().includes(needle) || quote.number.toLowerCase().includes(needle) || quote.email.toLowerCase().includes(needle)));
  }, [quotes, query, status]);

  return (
    <Section title="عروض الأسعار" description="كل عروض الأسعار وحالتها." actions={<LinkButton href="/linkly-admin007/quotes/new" variant="primary" icon="plus">عرض سعر جديد</LinkButton>}>
      <div className="ds-toolbar">
        <div className="ds-search">
          <Icon name="search" size={17} />
          <input className="ds-input" type="search" placeholder="ابحث باسم العميل أو رقم العرض…" aria-label="بحث في عروض الأسعار" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Segmented
          label="تصفية حسب الحالة"
          value={status}
          onChange={setStatus}
          options={[{ value: "all" as const, label: `الكل (${quotes.length})` }, ...QUOTE_STATUSES.map((value) => ({ value, label: `${QUOTE_STATUS_LABELS[value]} (${counts[value]})` }))]}
        />
      </div>

      {quotes.length === 0 ? (
        <EmptyState icon="receipt" title="لا توجد عروض أسعار بعد" description="أنشئ أول عرض سعر لعميل." action={<LinkButton href="/linkly-admin007/quotes/new" variant="primary" icon="plus">عرض سعر جديد</LinkButton>} />
      ) : visible.length === 0 ? (
        <EmptyState icon="search" title="لا توجد عروض مطابقة" description="جرّب تغيير البحث أو التصفية." />
      ) : (
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead>
              <tr><th scope="col">الرقم</th><th scope="col">العميل</th><th scope="col">الخدمات</th><th scope="col">الدورة</th><th scope="col">الإجمالي</th><th scope="col">الحالة</th><th scope="col">آخر تحديث</th></tr>
            </thead>
            <tbody>
              {visible.map((quote) => (
                <tr key={quote.id}>
                  <td data-cell="main"><Link href={`/linkly-admin007/quotes/${quote.id}`}><strong dir="ltr">{quote.number}</strong></Link></td>
                  <td data-label="العميل"><div className="ds-cell-stack"><strong>{quote.customerName}</strong><small>{quote.email || "—"}</small></div></td>
                  <td data-label="الخدمات">{quote.lineNames.join(" · ")}</td>
                  <td data-label="الدورة">{quote.billingCycle}</td>
                  <td data-label="الإجمالي"><strong>{formatSar(quote.totalHalalas)}</strong> ر.س</td>
                  <td data-label="الحالة"><span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Badge tone={TONES[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</Badge>{quote.status === "approved" ? (quote.paidAt ? <Badge tone="success" dot={false}>مدفوع</Badge> : <Badge tone="warning" dot={false}>بانتظار الدفع</Badge>) : null}</span></td>
                  <td data-label="آخر تحديث">{new Date(quote.updatedAt).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
