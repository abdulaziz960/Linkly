"use client";

import { FormEvent, useState } from "react";

/**
 * On the payment page: "add your VAT number to the invoice" - optional, collapsed unless already filled. It saves the same
 * workspace tax details every invoice reads (old and new), so it is asked once.
 */
export default function TaxProfileCard({ initial }: { initial: { vatNumber: string; address: string } }) {
  const [vatNumber, setVatNumber] = useState(initial.vatNumber);
  const [address, setAddress] = useState(initial.address);
  const [saved, setSaved] = useState(initial.vatNumber);
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
      setMessage({ ok: false, text: payload?.error || "تعذر الحفظ" });
      return;
    }
    setVatNumber(payload.data?.vatNumber ?? vatNumber);
    setSaved(payload.data?.vatNumber ?? vatNumber);
    setMessage({ ok: true, text: "تم الحفظ، وسيظهر في فاتورتك." });
  }

  return (
    <details className="pay-tax-profile" open={Boolean(initial.vatNumber) ? false : undefined}>
      <summary>
        <span>أضف بيانات منشأتك الضريبية للفاتورة <small>(اختياري)</small></span>
        {saved ? <small dir="ltr">{saved}</small> : null}
      </summary>
      <form onSubmit={save}>
        <label>الرقم الضريبي (15 رقمًا)
          <input dir="ltr" inputMode="numeric" value={vatNumber} onChange={(event) => setVatNumber(event.target.value)} maxLength={20} placeholder="3XXXXXXXXXXXXX3" />
        </label>
        <label>عنوان المنشأة
          <input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} />
        </label>
        <button type="submit" disabled={busy}>{busy ? "جاري الحفظ..." : "حفظ"}</button>
        <p>تظهر هذه البيانات في فواتيرك الضريبية، القديمة والجديدة.</p>
        {message ? <p className={message.ok ? "billing-success" : "billing-error"} role="status">{message.text}</p> : null}
      </form>
    </details>
  );
}
