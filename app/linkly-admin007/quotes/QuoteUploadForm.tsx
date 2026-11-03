"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatSar, quoteTotals, sarToHalalas, todayInRiyadh } from "../../../lib/quotes/model";
import { Button } from "../ds/primitives";
import { adminRequest } from "../ds/forms";
import { useToast } from "../ds/Toast";

type Client = { tenantId: string; companyName: string; ownerEmail: string };
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export default function QuoteUploadForm() {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [existingTenantId, setExistingTenantId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [reference, setReference] = useState("");
  const [issuedOn, setIssuedOn] = useState(todayInRiyadh());
  const [subtotal, setSubtotal] = useState("");
  const [vatRate, setVatRate] = useState("15");
  const [messages, setMessages] = useState("");
  const [billingCycle, setBillingCycle] = useState("سنوي");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void adminRequest<Client[]>("/api/admin/clients").then((result) => { if (result.ok) setClients(result.data); });
  }, []);

  const totals = useMemo(() => {
    const net = Number(subtotal.replace(/[,،\s]/g, ""));
    return quoteTotals([{ quantity: 1, unitPriceHalalas: Number.isFinite(net) && net > 0 ? sarToHalalas(net) : 0, vatRate: Number(vatRate) }]);
  }, [subtotal, vatRate]);

  function pickClient(tenantId: string) {
    setExistingTenantId(tenantId);
    const client = clients.find((item) => item.tenantId === tenantId);
    if (client) {
      setCustomerName((current) => current.trim() || client.companyName);
      setEmail((current) => current.trim() || client.ownerEmail);
    }
  }

  function pickFile(selected: File | undefined) {
    setError("");
    if (!selected) { setFile(null); return; }
    if (selected.size > MAX_FILE_BYTES) { setFile(null); setError("حجم الملف كبير (الحد الأقصى 4 ميجابايت)"); return; }
    setFile(selected);
  }

  async function submit() {
    setError("");
    if (!file) { setError("اختر ملف العرض (PDF)"); return; }
    const form = new FormData();
    form.set("file", file);
    for (const [key, value] of Object.entries({ customerName, contactName, email, vatNumber, reference, issuedOn, subtotalSar: subtotal, vatRate, messages, billingCycle, existingTenantId })) form.set(key, value);
    setBusy(true);
    try {
      const response = await fetch("/api/admin/quotes/upload", { method: "POST", body: form });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { id: string } } | null;
      if (!response.ok || !payload?.ok || !payload.data) { setError(payload?.error || "تعذر رفع العرض"); return; }
      toast("success", "تم رفع العرض وربطه");
      router.push(`/linkly-admin007/quotes/${payload.data.id}`);
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quote-editor">
      {error ? <div className="quote-note quote-note-bad" role="alert">{error}</div> : null}
      <div className="quote-layout">
        <div className="quote-main">
          <section className="ds-card ds-card-pad quote-card">
            <h3>ملف العرض</h3>
            <div className="quote-logo">
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => { pickFile(event.target.files?.[0]); event.target.value = ""; }} />
              <Button variant="primary" onClick={() => fileInput.current?.click()}>{file ? "تغيير الملف" : "رفع ملف العرض (PDF)"}</Button>
              <span>{file ? `${file.name} (${Math.round(file.size / 1024).toLocaleString("en-US")} ك.ب)` : "PDF حتى 4 ميجابايت"}</span>
            </div>
          </section>

          <section className="ds-card ds-card-pad quote-card">
            <h3>العميل</h3>
            <label className="ds-field quote-existing">عميل موجود في لنكلي (اختياري)
              <select className="ds-select" value={existingTenantId} onChange={(event) => pickClient(event.target.value)}>
                <option value="">عميل جديد (تُنشأ له مساحة عند الاعتماد)</option>
                {clients.map((client) => <option key={client.tenantId} value={client.tenantId}>{client.companyName}{client.ownerEmail ? ` — ${client.ownerEmail}` : ""}</option>)}
              </select>
              <small>{existingTenantId ? "لن تُنشأ مساحة جديدة ولن يتغير اشتراكه: يُسجَّل المبلغ دفعة عليه ويُضاف رصيد الرسائل." : "لعميل عنده مساحة أصلًا: اختره بدل ما تُنشأ مساحة ثانية."}</small>
            </label>
            <div className="quote-grid">
              <label className="ds-field">اسم العميل<input className="ds-input" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
              <label className="ds-field">الشخص المسؤول<input className="ds-input" value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
              <label className="ds-field">{existingTenantId ? "البريد الإلكتروني" : "البريد الإلكتروني (يصله رابط التفعيل بعد الاعتماد)"}<input className="ds-input" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label className="ds-field">الرقم الضريبي<input className="ds-input" dir="ltr" value={vatNumber} onChange={(event) => setVatNumber(event.target.value)} /></label>
            </div>
          </section>

          <section className="ds-card ds-card-pad quote-card">
            <h3>بيانات العرض</h3>
            <div className="quote-grid">
              <label className="ds-field">الرقم المرجعي (مثل S00121)<input className="ds-input" dir="ltr" value={reference} onChange={(event) => setReference(event.target.value)} /></label>
              <label className="ds-field">تاريخ العرض<input className="ds-input" type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} /></label>
              <label className="ds-field">المبلغ دون الضريبة (ر.س)<input className="ds-input" inputMode="decimal" value={subtotal} onChange={(event) => setSubtotal(event.target.value)} /></label>
              <label className="ds-field">الضريبة<select className="ds-select" value={vatRate} onChange={(event) => setVatRate(event.target.value)}><option value="15">15%</option><option value="0">0%</option></select></label>
              <label className="ds-field">عدد الرسائل في العرض (تُضاف لرصيده عند تأكيد الدفع)<input className="ds-input" inputMode="numeric" value={messages} onChange={(event) => setMessages(event.target.value)} /></label>
              {existingTenantId ? null : <label className="ds-field">دورة الدفع<select className="ds-select" value={billingCycle} onChange={(event) => setBillingCycle(event.target.value)}><option value="سنوي">سنوي</option><option value="شهري">شهري</option></select></label>}
            </div>
          </section>
        </div>

        <aside className="quote-side">
          <section className="ds-card ds-card-pad quote-card">
            <h3>الملخص</h3>
            <dl className="quote-totals">
              <div><dt>المبلغ دون الضريبة</dt><dd>{formatSar(totals.subtotalHalalas)}</dd></div>
              <div><dt>ضريبة القيمة المضافة</dt><dd>{formatSar(totals.vatHalalas)}</dd></div>
              <div className="quote-total"><dt>الإجمالي</dt><dd>{formatSar(totals.totalHalalas)} ر.س</dd></div>
            </dl>
          </section>
          <section className="ds-card ds-card-pad quote-card quote-actions-card">
            <Button variant="primary" loading={busy} disabled={!file || !customerName.trim() || !subtotal.trim()} onClick={() => void submit()}>رفع العرض وربطه بالعميل</Button>
            <Link className="ds-btn" data-variant="outline" href="/linkly-admin007/quotes">إلغاء</Link>
            <small className="quote-hint">بعد الرفع تسجّل اعتماد العميل ثم تؤكد الحوالة، فيُضاف المبلغ للمدفوعات.</small>
          </section>
        </aside>
      </div>
    </div>
  );
}
