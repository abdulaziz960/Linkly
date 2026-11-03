"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QUOTE_STATUS_LABELS, formatSar, messagesSold, type QuoteStatus } from "../../../lib/quotes/model";
import type { QuoteEvent, QuoteRecord } from "../../../lib/quotes/store";
import { Badge, Button, type Tone } from "../ds/primitives";
import { useConfirm } from "../ds/Dialog";
import { adminRequest } from "../ds/forms";
import { useToast } from "../ds/Toast";
import QuoteAfterApproval from "./QuoteAfterApproval";

const TONES: Record<QuoteStatus, Tone> = { draft: "neutral", sent: "info", approved: "success", cancelled: "danger", needs_changes: "warning" };
const EVENT_LABELS: Record<string, string> = {
  created: "أُضيف العرض", file_uploaded: "رُفع ملف العرض", approved_offline: "سُجّل اعتماد العميل", workspace_created: "أُنشئت مساحة العميل", payment_pending: "بانتظار تأكيد الدفع",
  payment_confirmed: "تم تأكيد الدفع", messages_credited: "أُضيفت رسائل العرض لرصيد العميل", credit_failed: "تعذرت إضافة رسائل العرض للرصيد", provision_failed: "تعذر إنشاء المساحة",
  email_changed: "عُدّل بريد مالك المساحة", cancelled: "أُلغي العرض"
};

/** A ready quotation (a PDF made elsewhere) kept with its amounts: it goes through approval and payment like any quote, but it is never sent from here. */
export default function UploadedQuoteView({ quote, events }: { quote: QuoteRecord; events: QuoteEvent[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"" | "approve" | "cancel">("");
  const [error, setError] = useState("");
  const messages = messagesSold(quote.lines);
  const fileUrl = `/api/admin/quotes/${quote.id}/file`;

  async function approve() {
    if (!(await confirm({
      title: "تسجيل اعتماد العميل؟",
      description: `ستسجّل أن ${quote.customerName} اعتمد هذا العرض. ${quote.linkedExisting ? "يُسجَّل المبلغ دفعة قيد الانتظار على مساحته الحالية دون تغيير اشتراكه" : "تُنشأ له مساحة ويصله رابط التفعيل على الإيميل"}، وتبقى الدفعة بانتظار تأكيدك بعد التحويل.`,
      confirmLabel: "تسجيل الاعتماد"
    }))) return;
    setBusy("approve");
    setError("");
    const result = await adminRequest<{ warning: string }>(`/api/admin/quotes/${quote.id}/approve`, { method: "POST" });
    setBusy("");
    if (!result.ok) { setError(result.error); return; }
    if (result.data.warning) { toast("error", "سُجّل الاعتماد لكن تعذرت الخطوة التالية", result.data.warning); setError(result.data.warning); }
    else toast("success", "سُجّل اعتماد العميل");
    router.refresh();
  }

  async function cancel() {
    if (!(await confirm({ title: "إلغاء العرض؟", description: "يُلغى هذا العرض ولا يُحتسب. تقدر ترفع ملفًا جديدًا بعده.", confirmLabel: "إلغاء العرض", tone: "danger" }))) return;
    setBusy("cancel");
    const result = await adminRequest(`/api/admin/quotes/${quote.id}/cancel`, { method: "POST" });
    setBusy("");
    if (!result.ok) { setError(result.error); return; }
    toast("success", "تم إلغاء العرض");
    router.refresh();
  }

  return (
    <div className="quote-editor">
      <div className="quote-editor-top">
        <Badge tone={TONES[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</Badge>
        <Badge tone="info" dot={false}>عرض مرفوع</Badge>
        {quote.reference ? <small>الرقم المرجعي: <b dir="ltr">{quote.reference}</b></small> : null}
        <span style={{ flex: 1 }} />
        <Link className="ds-btn" data-variant="outline" href="/linkly-admin007/quotes">كل العروض</Link>
      </div>
      {error ? <div className="quote-note quote-note-bad" role="alert">{error}</div> : null}

      <div className="quote-layout">
        <div className="quote-main">
          <section className="ds-card ds-card-pad quote-card">
            <h3>ملف العرض <small>{quote.fileName}</small></h3>
            <div className="quote-ai"><a className="ds-btn" data-variant="primary" href={fileUrl} target="_blank" rel="noreferrer">فتح الملف</a><a className="ds-btn" data-variant="outline" href={fileUrl} download={quote.fileName}>تنزيل</a></div>
            <iframe title="ملف العرض" src={fileUrl} className="quote-file-frame" />
          </section>

          <section className="ds-card ds-card-pad quote-card">
            <h3>العميل</h3>
            <dl className="quote-facts">
              <div><dt>الاسم</dt><dd>{quote.customerName}</dd></div>
              {quote.contactName ? <div><dt>المسؤول</dt><dd>{quote.contactName}</dd></div> : null}
              <div><dt>البريد</dt><dd dir="ltr">{quote.email || "—"}</dd></div>
              {quote.vatNumber ? <div><dt>الرقم الضريبي</dt><dd dir="ltr">{quote.vatNumber}</dd></div> : null}
              <div><dt>المساحة</dt><dd>{quote.linkedExisting ? <>مساحته الحالية. <Link href={`/linkly-admin007/clients/${quote.tenantId}`}>فتح العميل</Link></> : quote.tenantId ? <>أُنشئت. <Link href={`/linkly-admin007/clients/${quote.tenantId}`}>فتح العميل</Link></> : "عميل جديد: تُنشأ مساحته عند تسجيل الاعتماد"}</dd></div>
            </dl>
          </section>

          {events.length ? (
            <section className="ds-card ds-card-pad quote-card">
              <h3>سجل العرض</h3>
              <ul className="quote-events">
                {events.map((event) => <li key={event.id}><b>{EVENT_LABELS[event.kind] ?? event.kind}</b> {event.actor ? <span>{event.actor}</span> : null}{event.note ? <em> — {event.note}</em> : null} <small>{new Date(event.createdAt).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" })}</small></li>)}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="quote-side">
          <section className="ds-card ds-card-pad quote-card">
            <h3>المبالغ</h3>
            <dl className="quote-totals">
              <div><dt>المبلغ دون الضريبة</dt><dd>{formatSar(quote.subtotalHalalas)}</dd></div>
              <div><dt>ضريبة القيمة المضافة</dt><dd>{formatSar(quote.vatHalalas)}</dd></div>
              <div className="quote-total"><dt>الإجمالي</dt><dd>{formatSar(quote.totalHalalas)} ر.س</dd></div>
            </dl>
            {messages > 0 ? <p className="quote-hint" style={{ marginTop: 10 }}>رصيد الرسائل عند تأكيد الدفع: {messages.toLocaleString("en-US")}</p> : null}
            <p className="quote-hint" style={{ marginTop: 10 }}>تاريخ العرض: {quote.issuedOn}</p>
          </section>
          {quote.status === "draft" ? (
            <section className="ds-card ds-card-pad quote-card quote-actions-card">
              <Button variant="primary" loading={busy === "approve"} onClick={() => void approve()}>تسجيل كمعتمد (اعتمده العميل)</Button>
              <Button variant="danger" loading={busy === "cancel"} onClick={() => void cancel()}>إلغاء العرض</Button>
            </section>
          ) : null}
          {quote.status === "approved" ? <QuoteAfterApproval quote={quote} /> : null}
        </aside>
      </div>
    </div>
  );
}
