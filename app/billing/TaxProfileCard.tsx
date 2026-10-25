"use client";

import { FormEvent, useState } from "react";

/** The workspace's own VAT number and address, printed on every invoice Linkly issues to it. */
export default function TaxProfileCard({ initial, lang }: { initial: { vatNumber: string; address: string }; lang: "ar" | "en" }) {
  const ar = lang === "ar";
  const [vatNumber, setVatNumber] = useState(initial.vatNumber);
  const [address, setAddress] = useState(initial.address);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/billing/tax-profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vatNumber, address }) }).catch(() => null);
    const payload = await response?.json().catch(() => null) as { ok?: boolean; error?: string; data?: { vatNumber: string; address: string } } | null;
    setBusy(false);
    if (!response || !response.ok || !payload?.ok) {
      setMessage({ ok: false, text: payload?.error || (ar ? "تعذر الحفظ" : "Could not save") });
      return;
    }
    setVatNumber(payload.data?.vatNumber ?? vatNumber);
    setMessage({ ok: true, text: ar ? "تم الحفظ. تظهر البيانات في فواتيرك." : "Saved. These details appear on your invoices." });
  }

  return (
    <section className="tax-profile-card" aria-labelledby="tax-profile-title">
      <h2 id="tax-profile-title">{ar ? "بيانات الفاتورة الضريبية" : "Tax invoice details"}</h2>
      <p>{ar ? "إن كانت منشأتك مسجلة في ضريبة القيمة المضافة، أضف رقمك الضريبي وعنوانك لتظهر في فواتيرك." : "If your business is VAT-registered, add your VAT number and address so they appear on your invoices."}</p>
      <form onSubmit={save}>
        <label>{ar ? "الرقم الضريبي (15 رقمًا)" : "VAT number (15 digits)"}
          <input dir="ltr" inputMode="numeric" value={vatNumber} onChange={(event) => setVatNumber(event.target.value)} maxLength={20} placeholder="3XXXXXXXXXXXXX3" />
        </label>
        <label>{ar ? "العنوان (اختياري)" : "Address (optional)"}
          <input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} />
        </label>
        <button type="submit" disabled={busy}>{busy ? (ar ? "جاري الحفظ..." : "Saving...") : ar ? "حفظ" : "Save"}</button>
      </form>
      {message ? <p className={message.ok ? "billing-success" : "billing-error"} role="status">{message.text}</p> : null}
    </section>
  );
}
