"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  DEFAULT_PAYMENT_TERMS, DEFAULT_VALIDITY_DAYS, DEFAULT_VAT_RATE, QUOTE_STATUS_LABELS, defaultFieldValues, formatSar, lineFromService, quoteTotals, sarToHalalas, todayInRiyadh, addDays,
  type QuoteServiceDef, type QuoteStatus
} from "../../../lib/quotes/model";
import type { QuoteEvent, QuoteRecord } from "../../../lib/quotes/store";
import QuoteDocument from "../../quotes/QuoteDocument";
import { Badge, Button, type Tone } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { adminRequest } from "../ds/forms";
import { useToast } from "../ds/Toast";

type LineState = { key: string; serviceId: string; name: string; description: string; quantity: string; priceSar: string; vatRate: number; fields: Record<string, string> };

const TONES: Record<QuoteStatus, Tone> = { draft: "neutral", sent: "info", approved: "success", cancelled: "danger", needs_changes: "warning" };
const EVENT_LABELS: Record<string, string> = { workspace_created: "أُنشئت مساحة العميل", payment_pending: "بانتظار تأكيد الدفع", payment_confirmed: "تم تأكيد الدفع وتفعيل الاشتراك", provision_failed: "تعذر إنشاء المساحة", email_changed: "عُدّل بريد مالك المساحة", created: "أُنشئ العرض", edited: "عُدّل العرض", sent: "أُرسل للعميل", approved: "اعتمد العميل العرض", declined: "رفض العميل العرض", changes_requested: "طلب العميل تعديلًا", cancelled: "أُلغي العرض" };
const MAX_LOGO_BYTES = 400_000;

let counter = 0;
const newKey = () => `l${(counter += 1)}`;

function toLineState(line: QuoteRecord["lines"][number]): LineState {
  return { key: newKey(), serviceId: line.serviceId, name: line.name, description: line.description, quantity: String(line.quantity), priceSar: String(line.unitPriceHalalas / 100), vatRate: line.vatRate, fields: line.fields };
}

function numberOf(value: string) {
  const parsed = Number(String(value).replace(/[,،\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function QuoteEditor({ services, plans, quote, events }: { services: QuoteServiceDef[]; plans: Array<{ name: string }>; quote: QuoteRecord | null; events: QuoteEvent[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const status: QuoteStatus = quote?.status ?? "draft";
  const editable = !quote || status === "draft" || status === "needs_changes";

  const [customerName, setCustomerName] = useState(quote?.customerName ?? "");
  const [contactName, setContactName] = useState(quote?.contactName ?? "");
  const [email, setEmail] = useState(quote?.email ?? "");
  const [phone, setPhone] = useState(quote?.phone ?? "");
  const [vatNumber, setVatNumber] = useState(quote?.vatNumber ?? "");
  const [address, setAddress] = useState(quote?.address ?? "");
  const [logoDataUrl, setLogoDataUrl] = useState(quote?.logoDataUrl ?? "");
  const [billingCycle, setBillingCycle] = useState<"شهري" | "سنوي">(quote?.billingCycle ?? "سنوي");
  const [validityDays, setValidityDays] = useState(String(quote?.validityDays ?? DEFAULT_VALIDITY_DAYS));
  const [eyebrow, setEyebrow] = useState(quote?.eyebrow ?? "");
  const [headline, setHeadline] = useState(quote?.headline ?? "");
  const [subtitle, setSubtitle] = useState(quote?.subtitle ?? "");
  const [termsText, setTermsText] = useState((quote?.terms ?? []).join("\n"));
  const [paymentTerms, setPaymentTerms] = useState(quote?.paymentTerms ?? DEFAULT_PAYMENT_TERMS);
  const [planName, setPlanName] = useState(quote?.planName ?? "");
  const [ownerEmail, setOwnerEmail] = useState(quote?.email ?? "");
  const [lines, setLines] = useState<LineState[]>(() => (quote?.lines ?? []).map(toLineState));
  const [busy, setBusy] = useState<"" | "save" | "send" | "ai" | "ai-full" | "cancel" | "provision" | "payment">("");
  const [busyLine, setBusyLine] = useState("");
  const [error, setError] = useState("");
  const [sentInfo, setSentInfo] = useState<{ url: string; emailSent: boolean; id: string } | null>(null);
  // The id of a quote created by this page before it moves to the quote's own address, so a second save edits it instead of making another.
  const [savedId, setSavedId] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => quoteTotals(lines.map((line) => ({ quantity: Math.max(1, Math.round(numberOf(line.quantity))), unitPriceHalalas: sarToHalalas(numberOf(line.priceSar)), vatRate: line.vatRate }))), [lines]);
  const terms = termsText.split("\n").map((term) => term.trim()).filter(Boolean);
  const activeServices = services.filter((service) => service.active || lines.some((line) => line.serviceId === service.id));

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function toggleService(service: QuoteServiceDef) {
    const existing = lines.find((line) => line.serviceId === service.id);
    if (existing) { setLines((current) => current.filter((line) => line.key !== existing.key)); return; }
    const built = lineFromService(service, defaultFieldValues(service));
    setLines((current) => [...current, { key: newKey(), serviceId: service.id, name: built.name, description: built.description, quantity: "1", priceSar: String(built.unitPriceHalalas / 100), vatRate: DEFAULT_VAT_RATE, fields: built.fields }]);
  }

  function changeField(line: LineState, service: QuoteServiceDef | undefined, key: string, value: string) {
    const fields = { ...line.fields, [key]: value };
    if (!service) { updateLine(line.key, { fields }); return; }
    // The service writes the line's name and description and suggests the price again from what was filled in; they can still be edited by hand.
    const built = lineFromService(service, fields);
    updateLine(line.key, { fields, name: built.name, description: built.description, priceSar: String(built.unitPriceHalalas / 100) });
  }

  function addCustomLine() {
    setLines((current) => [...current, { key: newKey(), serviceId: "", name: "", description: "", quantity: "1", priceSar: "0", vatRate: DEFAULT_VAT_RATE, fields: {} }]);
  }

  function pickLogo(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { toast("error", "صيغة الشعار غير مدعومة", "PNG أو JPG أو WebP أو SVG"); return; }
    if (file.size > MAX_LOGO_BYTES) { toast("error", "حجم الشعار كبير", "الحد الأقصى 400 كيلوبايت"); return; }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function payload() {
    return {
      customerName, contactName, email, phone, vatNumber, address, logoDataUrl, billingCycle, validityDays: Number(validityDays) || DEFAULT_VALIDITY_DAYS, eyebrow, headline, subtitle, terms, paymentTerms, planName,
      lines: lines.map((line) => ({ serviceId: line.serviceId, name: line.name, description: line.description, quantity: Math.max(1, Math.round(numberOf(line.quantity))), unitPriceHalalas: sarToHalalas(numberOf(line.priceSar)), vatRate: line.vatRate, fields: line.fields }))
    };
  }

  type DraftContent = { eyebrow: string; headline: string; subtitle: string; terms: string[]; lineDescriptions: string[]; source: "ai" | "template" };

  /** `full` writes the cover, the terms and every line's description; otherwise only the cover and the terms. */
  async function writeWithAi(full: boolean) {
    if (!lines.length) { setError("اختر خدمة واحدة على الأقل أولًا"); return; }
    setBusy(full ? "ai-full" : "ai");
    setError("");
    const result = await adminRequest<DraftContent>("/api/admin/quotes/draft-content", { method: "POST", body: { ...payload(), customerName: customerName || "العميل" } });
    setBusy("");
    if (!result.ok) { setError(result.error); return; }
    setEyebrow(result.data.eyebrow);
    setHeadline(result.data.headline);
    setSubtitle(result.data.subtitle);
    setTermsText(result.data.terms.join("\n"));
    if (full) setLines((current) => current.map((line, index) => ({ ...line, description: result.data.lineDescriptions[index]?.trim() || line.description })));
    const what = full ? "الغلاف والشروط ووصف البنود" : "الغلاف والشروط";
    toast("success", result.data.source === "ai" ? `كُتب ${what} بالذكاء الاصطناعي` : `كُتب ${what} من نصوص الخدمات`, "راجعها وعدّل ما تحتاج");
  }

  /** The description under one service, written for what was asked of it (nothing else on the quote changes). */
  async function writeLineWithAi(line: LineState) {
    setBusyLine(line.key);
    setError("");
    const only = payload().lines.find((_, index) => lines[index]?.key === line.key);
    const result = await adminRequest<DraftContent>("/api/admin/quotes/draft-content", { method: "POST", body: { ...payload(), customerName: customerName || "العميل", lines: only ? [only] : [] } });
    setBusyLine("");
    if (!result.ok) { setError(result.error); return; }
    const text = result.data.lineDescriptions[0]?.trim();
    if (text) updateLine(line.key, { description: text });
    toast("success", result.data.source === "ai" ? "كُتب وصف البند بالذكاء الاصطناعي" : "وصف البند من نص الخدمة", "راجعه وعدّل ما تحتاج");
  }

  /** Saves the quote (creating it the first time) and returns its id, or "" when something is wrong. */
  async function save(): Promise<string> {
    setError("");
    const knownId = quote?.id || savedId;
    const result = knownId
      ? await adminRequest<QuoteRecord>(`/api/admin/quotes/${knownId}`, { method: "PUT", body: payload() })
      : await adminRequest<QuoteRecord>("/api/admin/quotes", { method: "POST", body: payload() });
    if (!result.ok) { setError(result.error); return ""; }
    setSavedId(result.data.id);
    return result.data.id;
  }

  async function onSave() {
    setBusy("save");
    const id = await save();
    setBusy("");
    if (!id) return;
    toast("success", "تم حفظ عرض السعر");
    if (!quote) router.replace(`/linkly-admin007/quotes/${id}`);
    else router.refresh();
  }

  async function onSend() {
    if (!(await confirm({ title: "إرسال العرض للعميل؟", description: `سيصل رابط العرض إلى ${email || "بريد العميل"}، ولن تقدر تعدّله بعد الإرسال إلا إذا طلب العميل تعديلًا.`, confirmLabel: "إرسال" }))) return;
    setBusy("send");
    const id = await save();
    if (!id) { setBusy(""); return; }
    const sent = await adminRequest<{ url: string; emailSent: boolean }>(`/api/admin/quotes/${id}/send`, { method: "POST" });
    setBusy("");
    if (!sent.ok) {
      if (!quote) { toast("error", "حُفظ العرض لكن تعذر إرساله", sent.error); router.replace(`/linkly-admin007/quotes/${id}`); return; }
      setError(sent.error);
      return;
    }
    // The page only moves on once the link has been seen: it is replaced by the quote's own page, which starts without this message.
    setSentInfo({ url: sent.data.url, emailSent: sent.data.emailSent, id });
  }

  function closeSentInfo() {
    const id = sentInfo?.id;
    setSentInfo(null);
    if (id && !quote) router.replace(`/linkly-admin007/quotes/${id}`);
    else router.refresh();
  }

  async function onCancel() {
    if (!quote) return;
    if (!(await confirm({ title: "إلغاء عرض السعر؟", description: "لن يقدر العميل يعتمده بعد الإلغاء.", confirmLabel: "إلغاء العرض", tone: "danger" }))) return;
    setBusy("cancel");
    const result = await adminRequest(`/api/admin/quotes/${quote.id}/cancel`, { method: "POST" });
    setBusy("");
    if (!result.ok) { setError(result.error); return; }
    toast("success", "تم إلغاء العرض");
    router.refresh();
  }

  async function onProvision() {
    if (!quote) return;
    setBusy("provision");
    setError("");
    const result = await adminRequest(`/api/admin/quotes/${quote.id}/provision`, { method: "POST", body: { email: ownerEmail } });
    setBusy("");
    if (!result.ok) { setError(result.error); router.refresh(); return; }
    toast("success", "أُنشئت المساحة وأُرسل رابط التفعيل للعميل");
    router.refresh();
  }

  async function onConfirmPayment() {
    if (!quote) return;
    if (!(await confirm({
      title: "تأكيد استلام الدفع؟",
      description: `سيُسجَّل مبلغ ${formatSar(quote.totalHalalas)} ر.س (شامل الضريبة) كمدفوع، ويُفعَّل اشتراك ${quote.customerName} لفترة ${quote.billingCycle === "سنوي" ? "سنة" : "شهر"}، ويدخل في إجمالي المدفوعات. لا يمكن التراجع من هنا.`,
      confirmLabel: "تم استلام الدفع"
    }))) return;
    setBusy("payment");
    setError("");
    const result = await adminRequest(`/api/admin/quotes/${quote.id}/payment`, { method: "POST" });
    setBusy("");
    if (!result.ok) { setError(result.error); return; }
    toast("success", "تم تأكيد الدفع وتفعيل الاشتراك");
    router.refresh();
  }

  const issuedOn = quote?.issuedOn ?? todayInRiyadh();
  const previewData = {
    number: quote?.number ?? "Q-00000", customerName: customerName || "اسم العميل", logoDataUrl, eyebrow, headline, subtitle, issuedOn, validityDays: Number(validityDays) || DEFAULT_VALIDITY_DAYS,
    lines: lines.map((line) => ({ name: line.name || "بند", description: line.description, quantity: Math.max(1, Math.round(numberOf(line.quantity))), unitPriceHalalas: sarToHalalas(numberOf(line.priceSar)), vatRate: line.vatRate })),
    subtotalHalalas: totals.subtotalHalalas, vatHalalas: totals.vatHalalas, totalHalalas: totals.totalHalalas, terms, paymentTerms, status: quote?.status
  };

  return (
    <div className="quote-editor">
      <div className="quote-editor-top">
        <div>
          <h2 style={{ margin: 0 }}>{quote ? `عرض سعر ${quote.number}` : "عرض سعر جديد"}</h2>
          <small style={{ color: "var(--ds-text-muted, #5a706c)" }}>صالح حتى {quote ? quote.validUntil : addDays(issuedOn, Number(validityDays) || DEFAULT_VALIDITY_DAYS)}</small>
        </div>
        <Badge tone={TONES[status]}>{QUOTE_STATUS_LABELS[status]}</Badge>
        <span style={{ flex: 1 }} />
        <Link className="ds-btn" data-variant="outline" href="/linkly-admin007/quotes">كل العروض</Link>
      </div>

      {status === "needs_changes" && quote?.changeNote ? <div className="quote-note quote-note-warn" role="status"><b>طلب العميل تعديلًا:</b> {quote.changeNote}</div> : null}
      {status === "approved" ? <div className="quote-note quote-note-ok" role="status">اعتمد العميل هذا العرض.</div> : null}
      {error ? <div className="quote-note quote-note-bad" role="alert">{error}</div> : null}
      {!editable ? <div className="quote-note">هذا العرض {status === "sent" ? "أُرسل للعميل" : status === "approved" ? "اعتُمد" : "أُلغي"}، فلا يمكن تعديله.</div> : null}

      <div className="quote-layout">
        <div className="quote-main">
          <section className="ds-card ds-card-pad quote-card">
            <h3>بيانات العميل</h3>
            <div className="quote-grid">
              <label className="ds-field">اسم العميل (يظهر في «مقدم إلى»)<input className="ds-input" disabled={!editable} value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
              <label className="ds-field">الشخص المسؤول<input className="ds-input" disabled={!editable} value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
              <label className="ds-field">البريد الإلكتروني (يصله رابط العرض)<input className="ds-input" dir="ltr" disabled={!editable} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label className="ds-field">الجوال<input className="ds-input" dir="ltr" disabled={!editable} value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
              <label className="ds-field">الرقم الضريبي<input className="ds-input" dir="ltr" disabled={!editable} value={vatNumber} onChange={(event) => setVatNumber(event.target.value)} /></label>
              <label className="ds-field">العنوان<input className="ds-input" disabled={!editable} value={address} onChange={(event) => setAddress(event.target.value)} /></label>
              <div className="quote-logo">
                <div className="quote-logo-box">{logoDataUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoDataUrl} alt="شعار العميل" /> : <span>شعار العميل</span>}</div>
                {editable ? (
                  <div className="quote-logo-actions">
                    <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(event) => { pickLogo(event.target.files?.[0]); event.target.value = ""; }} />
                    <Button variant="outline" onClick={() => logoInput.current?.click()}>{logoDataUrl ? "تغيير الشعار" : "رفع شعار العميل"}</Button>
                    {logoDataUrl ? <Button variant="ghost" onClick={() => setLogoDataUrl("")}>حذف</Button> : null}
                    <small>يظهر أعلى يسار العرض. PNG أو JPG حتى 400 كيلوبايت.</small>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="ds-card ds-card-pad quote-card">
            <h3>الخدمات المطلوبة <small>اضغط خدمة لإضافتها وتظهر خاناتها</small></h3>
            <div className="quote-chips">
              {activeServices.map((service) => {
                const on = lines.some((line) => line.serviceId === service.id);
                return <button key={service.id} type="button" className="quote-chip" data-on={on || undefined} disabled={!editable} onClick={() => toggleService(service)}>{on ? "✓ " : "＋ "}{service.name}</button>;
              })}
              {editable ? <button type="button" className="quote-chip" onClick={addCustomLine}>＋ بند مخصص</button> : null}
            </div>
          </section>

          <section className="ds-card ds-card-pad quote-card">
            <h3>محتوى العرض (الغلاف والشروط) <span className="quote-hint">يُكتب بالذكاء الاصطناعي حسب الخدمات المختارة</span></h3>
            <div className="quote-grid">
              <label className="ds-field">العبارة الصغيرة فوق العنوان<input className="ds-input" disabled={!editable} value={eyebrow} onChange={(event) => setEyebrow(event.target.value)} /></label>
              <label className="ds-field">العنوان الرئيسي<input className="ds-input" disabled={!editable} value={headline} onChange={(event) => setHeadline(event.target.value)} /></label>
              <label className="ds-field quote-span2">الوصف تحت العنوان<input className="ds-input" disabled={!editable} value={subtitle} onChange={(event) => setSubtitle(event.target.value)} /></label>
            </div>
            <label className="ds-field">الشروط والملاحظات (كل سطر نقطة)<textarea className="ds-input" style={{ minHeight: 120, padding: 10 }} disabled={!editable} value={termsText} onChange={(event) => setTermsText(event.target.value)} /></label>
            {editable ? (
              <div className="quote-ai">
                <Button variant="primary" className="quote-ai-btn" loading={busy === "ai"} onClick={() => void writeWithAi(false)}>✦ اكتب الغلاف والشروط بالذكاء الاصطناعي</Button>
                <span className="quote-hint">يكتب النصوص فقط حسب الخدمات المختارة. الأسعار تبقى كما أدخلتها</span>
              </div>
            ) : null}
          </section>

          {lines.map((line) => {
            const service = services.find((item) => item.id === line.serviceId);
            return (
              <section className="ds-card quote-line" key={line.key}>
                <header><span><b>{service?.name ?? "بند مخصص"}</b>{service?.fields.length ? <span className="quote-hint">خانات خاصة بالخدمة</span> : null}</span>{editable ? <button type="button" className="quote-x" aria-label="حذف البند" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>×</button> : null}</header>
                <div className="quote-line-body">
                  <div className="quote-grid quote-grid-4">
                    <label className="ds-field quote-span2">اسم البند<input className="ds-input" disabled={!editable} value={line.name} onChange={(event) => updateLine(line.key, { name: event.target.value })} /></label>
                    <label className="ds-field">الكمية<input className="ds-input" inputMode="numeric" disabled={!editable} value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /></label>
                    <label className="ds-field">سعر الوحدة (ر.س)<input className="ds-input" inputMode="decimal" disabled={!editable} value={line.priceSar} onChange={(event) => updateLine(line.key, { priceSar: event.target.value })} /></label>
                    <label className="ds-field">الضريبة<select className="ds-select" disabled={!editable} value={line.vatRate} onChange={(event) => updateLine(line.key, { vatRate: Number(event.target.value) })}><option value={DEFAULT_VAT_RATE}>15%</option><option value={0}>0%</option></select></label>
                  </div>
                  {service?.fields.length ? (
                    <div className="quote-grid">
                      {service.fields.map((field) => (
                        <label className="ds-field" key={field.key}>{field.label}<input className="ds-input" inputMode={field.type === "number" ? "decimal" : "text"} disabled={!editable} value={line.fields[field.key] ?? ""} onChange={(event) => changeField(line, service, field.key, event.target.value)} /></label>
                      ))}
                    </div>
                  ) : null}
                  <label className="ds-field">الوصف (يظهر تحت البند في العرض)<input className="ds-input" disabled={!editable} value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} /></label>
                  {editable ? <div className="quote-ai"><Button variant="primary" className="quote-ai-btn" loading={busyLine === line.key} onClick={() => void writeLineWithAi(line)}>✦ اكتب الوصف بالذكاء الاصطناعي</Button><span className="quote-hint">يعتمد على الخدمة وخاناتها أعلاه، ويقدر تعدّله</span></div> : null}
                </div>
              </section>
            );
          })}

          {events.length ? (
            <section className="ds-card ds-card-pad quote-card">
              <h3>سجل العرض</h3>
              <ul className="quote-events">
                {events.map((event) => <li key={event.id}><b>{EVENT_LABELS[event.kind] ?? event.kind}</b> <span>{event.actor}</span>{event.note ? <em> — {event.note}</em> : null} <small>{new Date(event.createdAt).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" })}</small></li>)}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="quote-side">
          <section className="ds-card ds-card-pad quote-card">
            <h3>الملخص</h3>
            <dl className="quote-totals">
              <div><dt>المبلغ دون الضريبة</dt><dd>{formatSar(totals.subtotalHalalas)}</dd></div>
              <div><dt>ضريبة القيمة المضافة 15%</dt><dd>{formatSar(totals.vatHalalas)}</dd></div>
              <div className="quote-total"><dt>الإجمالي</dt><dd>{formatSar(totals.totalHalalas)} ر.س</dd></div>
            </dl>
          </section>
          <section className="ds-card ds-card-pad quote-card">
            <h3>الإعدادات</h3>
            <label className="ds-field">دورة الدفع<select className="ds-select" disabled={!editable} value={billingCycle} onChange={(event) => setBillingCycle(event.target.value === "شهري" ? "شهري" : "سنوي")}><option value="سنوي">سنوي</option><option value="شهري">شهري</option></select></label>
            <label className="ds-field">صلاحية العرض (أيام)<input className="ds-input" inputMode="numeric" disabled={!editable} value={validityDays} onChange={(event) => setValidityDays(event.target.value)} /></label>
            <label className="ds-field">شروط السداد<input className="ds-input" disabled={!editable} value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} /></label>
            <label className="ds-field">الباقة (تُنشأ عليها مساحة العميل عند اعتماده)
              <select className="ds-select" disabled={!editable} value={planName} onChange={(event) => setPlanName(event.target.value)}>
                <option value="">اختر الباقة</option>
                {plans.map((plan) => <option key={plan.name} value={plan.name}>{plan.name}</option>)}
                {planName && !plans.some((plan) => plan.name === planName) ? <option value={planName}>{planName}</option> : null}
              </select>
            </label>
          </section>
          <section className="ds-card ds-card-pad quote-card quote-actions-card">
            {editable ? <Button variant="primary" className="quote-ai-btn" loading={busy === "ai-full"} disabled={!lines.length} onClick={() => void writeWithAi(true)}>✦ صياغة العرض كاملًا بالذكاء الاصطناعي</Button> : null}
            <Button variant="outline" onClick={() => setShowPreview(true)}>معاينة العرض</Button>
            {editable ? <Button variant="outline" loading={busy === "save"} onClick={() => void onSave()}>حفظ كمسودة</Button> : null}
            {editable ? <Button variant="primary" loading={busy === "send"} disabled={!lines.length || !customerName.trim() || !email.trim() || !planName} onClick={() => void onSend()}>{status === "needs_changes" ? "إرسال العرض المحدّث" : "إرسال للعميل بالإيميل"}</Button> : null}
            {quote && status === "sent" ? <a className="ds-btn" data-variant="outline" href={`/q/${quote.token}`} target="_blank" rel="noreferrer">فتح العرض كما يراه العميل</a> : null}
            {quote && (status === "draft" || status === "sent" || status === "needs_changes") ? <Button variant="danger" loading={busy === "cancel"} onClick={() => void onCancel()}>إلغاء العرض</Button> : null}
          </section>
          {quote && status === "approved" ? (
            <section className="ds-card ds-card-pad quote-card quote-after">
              <h3>بعد الاعتماد</h3>
              <ol className="quote-steps">
                <li data-done={Boolean(quote.tenantId) || undefined}><b>المساحة</b>{quote.tenantId ? <span>أُنشئت وأُرسل رابط التفعيل لـ{quote.email}. <Link href={`/linkly-admin007/clients/${quote.tenantId}`}>فتح العميل</Link></span> : <span>لم تُنشأ بعد.</span>}</li>
                <li data-done={Boolean(quote.paidAt) || undefined}><b>الدفع</b>{quote.paidAt ? <span>مؤكد، والاشتراك مفعّل لفترة {quote.billingCycle === "سنوي" ? "سنة" : "شهر"}.</span> : quote.paymentId ? <span>بانتظار تأكيدك بعد التحويل ({formatSar(quote.totalHalalas)} ر.س شامل الضريبة).</span> : <span>تظهر بعد إنشاء المساحة.</span>}</li>
              </ol>
              {!quote.tenantId ? <label className="ds-field">بريد مالك المساحة (يصله رابط التفعيل)<input className="ds-input" dir="ltr" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} /></label> : null}
              {!quote.tenantId || !quote.paymentId ? <Button variant="primary" loading={busy === "provision"} onClick={() => void onProvision()}>إنشاء المساحة وإرسال رابط التفعيل</Button> : null}
              {quote.tenantId && quote.paymentId && !quote.paidAt ? <Button variant="primary" loading={busy === "payment"} onClick={() => void onConfirmPayment()}>تم استلام الدفع</Button> : null}
            </section>
          ) : null}
        </aside>
      </div>

      <Dialog open={showPreview} onClose={() => setShowPreview(false)} size="xl" title="معاينة عرض السعر" description="هكذا يراه العميل" footer={<Button variant="primary" onClick={() => setShowPreview(false)}>إغلاق</Button>}>
        <div className="quote-preview"><QuoteDocument quote={previewData} /></div>
      </Dialog>

      <Dialog open={Boolean(sentInfo)} onClose={closeSentInfo} title="تم إرسال العرض" footer={<Button variant="primary" onClick={closeSentInfo}>تمام</Button>}>
        {sentInfo ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0 }}>{sentInfo.emailSent ? `أُرسل الرابط إلى ${email}.` : "تعذر إرسال الإيميل (مزوّد البريد غير مفعّل). انسخ الرابط وأرسله للعميل بنفسك."}</p>
            <input className="ds-input" dir="ltr" readOnly value={sentInfo.url} onFocus={(event) => event.currentTarget.select()} />
            <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(sentInfo.url).then(() => toast("success", "تم نسخ الرابط")); }}>نسخ الرابط</Button>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
