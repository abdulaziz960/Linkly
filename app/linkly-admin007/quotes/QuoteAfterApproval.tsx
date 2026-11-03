"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatSar, messagesSold } from "../../../lib/quotes/model";
import type { QuoteRecord } from "../../../lib/quotes/store";
import { Button } from "../ds/primitives";
import { useConfirm } from "../ds/Dialog";
import { adminRequest } from "../ds/forms";
import { useToast } from "../ds/Toast";

/** What follows a client's approval of a quote: their workspace (made, or the existing one) and the payment the platform team confirms after the transfer. */
export default function QuoteAfterApproval({ quote }: { quote: QuoteRecord }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"" | "provision" | "payment">("");
  const [error, setError] = useState("");
  const [ownerEmail, setOwnerEmail] = useState(quote.email);

  async function onProvision() {
    setBusy("provision");
    setError("");
    const result = await adminRequest(`/api/admin/quotes/${quote.id}/provision`, { method: "POST", body: { email: ownerEmail } });
    setBusy("");
    if (!result.ok) { setError(result.error); router.refresh(); return; }
    toast("success", "أُنشئت المساحة وأُرسل رابط التفعيل للعميل");
    router.refresh();
  }

  async function onConfirmPayment() {
    if (!(await confirm({
      title: "تأكيد استلام الدفع؟",
      description: `سيُسجَّل مبلغ ${formatSar(quote.totalHalalas)} ر.س (شامل الضريبة) كمدفوع${quote.linkedExisting ? "" : `، ويُفعَّل اشتراك ${quote.customerName} لفترة ${quote.billingCycle === "سنوي" ? "سنة" : "شهر"}`}، ويدخل في إجمالي المدفوعات${messagesSold(quote.lines) > 0 ? `، ويصير رصيد رسائله ${messagesSold(quote.lines).toLocaleString("en-US")} رسالة (نفس ما في العرض)` : ""}. لا يمكن التراجع من هنا.`,
      confirmLabel: "تم استلام الدفع"
    }))) return;
    setBusy("payment");
    setError("");
    const result = await adminRequest<{ creditedMessages: number; warning: string }>(`/api/admin/quotes/${quote.id}/payment`, { method: "POST" });
    setBusy("");
    if (!result.ok) { setError(result.error); return; }
    if (result.data.warning) { toast("error", "فُعّل الاشتراك مع تنبيه", result.data.warning); setError(result.data.warning); }
    else toast("success", "تم تأكيد الدفع وتفعيل الاشتراك", result.data.creditedMessages ? `وأُضيفت ${result.data.creditedMessages.toLocaleString("en-US")} رسالة لرصيده` : undefined);
    router.refresh();
  }

  return (
              <section className="ds-card ds-card-pad quote-card quote-after">
              <h3>بعد الاعتماد</h3>
              {error ? <div className="quote-note quote-note-bad" role="alert">{error}</div> : null}
              <ol className="quote-steps">
                <li data-done={Boolean(quote.tenantId) || undefined}><b>المساحة</b>{quote.linkedExisting ? <span>مساحة العميل الحالية، لا يتغير اشتراكه. <Link href={`/linkly-admin007/clients/${quote.tenantId}`}>فتح العميل</Link></span> : quote.tenantId ? <span>أُنشئت وأُرسل رابط التفعيل لـ{quote.email}. <Link href={`/linkly-admin007/clients/${quote.tenantId}`}>فتح العميل</Link></span> : <span>لم تُنشأ بعد.</span>}</li>
                <li data-done={Boolean(quote.paidAt) || undefined}><b>الدفع</b>{quote.paidAt ? <span>مؤكد{quote.linkedExisting ? "، وأُضيفت رسائل العرض لرصيده" : `، والاشتراك مفعّل لفترة ${quote.billingCycle === "سنوي" ? "سنة" : "شهر"}`}.</span> : quote.paymentId ? <span>بانتظار تأكيدك بعد التحويل ({formatSar(quote.totalHalalas)} ر.س شامل الضريبة){messagesSold(quote.lines) > 0 ? `، وعند التأكيد يصير رصيد رسائله ${messagesSold(quote.lines).toLocaleString("en-US")} رسالة (نفس ما في العرض)` : ""}.</span> : <span>تظهر بعد إنشاء المساحة.</span>}</li>
              </ol>
              {!quote.tenantId && !quote.linkedExisting ? <label className="ds-field">بريد مالك المساحة (يصله رابط التفعيل)<input className="ds-input" dir="ltr" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} /></label> : null}
              {!quote.tenantId || !quote.paymentId ? <Button variant="primary" loading={busy === "provision"} onClick={() => void onProvision()}>{quote.linkedExisting ? "تسجيل الدفعة على مساحته" : "إنشاء المساحة وإرسال رابط التفعيل"}</Button> : null}
              {quote.tenantId && quote.paymentId && !quote.paidAt ? <Button variant="primary" loading={busy === "payment"} onClick={() => void onConfirmPayment()}>تم استلام الدفع</Button> : null}
    </section>
  );
}
