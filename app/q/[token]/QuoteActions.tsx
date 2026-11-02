"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Answer = "approve" | "request_changes" | "decline";

/** What the client can do with the quotation that reached them. */
export default function QuoteActions({ token, totalLabel, billingCycle, paymentTerms }: { token: string; totalLabel: string; billingCycle: string; paymentTerms: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"" | "changes">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Answer | "">("");
  const [error, setError] = useState("");

  async function answer(value: Answer) {
    if (value === "approve" && !window.confirm("اعتماد العرض؟ سنتواصل معكم لإكمال التفعيل.")) return;
    if (value === "decline" && !window.confirm("رفض العرض؟")) return;
    setBusy(value);
    setError("");
    try {
      const response = await fetch(`/api/quotes/answer/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: value, note }) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) { setError(payload?.error || "تعذر إرسال ردكم، حاولوا مرة أخرى"); return; }
      router.refresh();
    } catch {
      setError("تعذر الاتصال، حاولوا مرة أخرى");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="quote-actions no-print">
      <div className="quote-actions-row">
        <div className="quote-actions-total"><b>إجمالي العرض {totalLabel} ريال</b><span>{billingCycle} · {paymentTerms}</span></div>
        <div className="quote-actions-buttons">
          <button type="button" className="qa-btn qa-bad" disabled={Boolean(busy)} onClick={() => void answer("decline")}>رفض</button>
          <button type="button" className="qa-btn" disabled={Boolean(busy)} onClick={() => setMode(mode ? "" : "changes")}>طلب تعديل</button>
          <button type="button" className="qa-btn qa-ok" disabled={Boolean(busy)} onClick={() => void answer("approve")}>{busy === "approve" ? "جارٍ الإرسال…" : "اعتماد العرض"}</button>
        </div>
      </div>
      {mode === "changes" ? (
        <div className="quote-actions-changes">
          <label>ما التعديل المطلوب؟<textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="مثال: نبي نرفع عدد الرسائل إلى 100,000" /></label>
          <button type="button" className="qa-btn qa-ok" disabled={Boolean(busy) || note.trim().length < 3} onClick={() => void answer("request_changes")}>{busy === "request_changes" ? "جارٍ الإرسال…" : "إرسال طلب التعديل"}</button>
        </div>
      ) : null}
      {error ? <p className="quote-actions-error" role="alert">{error}</p> : null}
    </div>
  );
}
