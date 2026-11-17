"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../../ds/Dialog";
import { Button } from "../../ds/primitives";
import { adminRequest } from "../../ds/forms";
import { useToast } from "../../ds/Toast";
import { agreedPrice, priceForCycle, type AgreedPrice, type BillingCycle } from "../../../../lib/billing-pricing";

function addToDate(value: string, months: number) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + months);
  // 31 Jan + 1 month would roll into March: land on the last day of the month instead.
  if (date.getUTCDate() !== day) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

/**
 * Sets the client's billing cycle, the price of one whole period (without tax) and the renewal (end) date by hand, e.g. to follow what was
 * agreed in a quotation. The plan itself is not touched.
 */
export default function ClientSubscriptionEditor({ tenantId, plan, currentCycle, renewalAt, amount, planMonthlyPrice, agreed }: { tenantId: string; plan: string; currentCycle: string; renewalAt: string; amount: number; planMonthlyPrice: number; agreed: AgreedPrice | null }) {
  const router = useRouter();
  const toast = useToast();
  const startDate = /^\d{4}-\d{2}-\d{2}/.test(renewalAt) ? renewalAt.slice(0, 10) : "";
  const [open, setOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState(currentCycle === "سنوي" ? "سنوي" : "شهري");
  const [date, setDate] = useState(startDate);
  const startCycle = currentCycle === "سنوي" ? "سنوي" : "شهري";
  // The price of one whole period: the client's own price for the cycle it is on, the plan's usual price for another cycle.
  const suggested = (cycle: string) => {
    const agreedNow = agreedPrice(agreed, plan, cycle as BillingCycle);
    if (agreedNow) return agreedNow;
    if (cycle === startCycle && amount > 0 && !(cycle === "سنوي" && planMonthlyPrice > 0 && amount <= planMonthlyPrice * 1.5)) return amount;
    return planMonthlyPrice > 0 ? priceForCycle(planMonthlyPrice, cycle === "سنوي" ? "سنوي" : "شهري") : amount;
  };
  const [price, setPrice] = useState(String(suggested(startCycle)));
  const [priceEdited, setPriceEdited] = useState(false);
  // Keep the agreed price for this client: on when one already applies to the plan, else on only when the price differs from the usual one.
  const [makeAgreed, setMakeAgreed] = useState(Boolean(agreed && agreed.plan === plan));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!date) { setError("حدّد تاريخ التجديد"); return; }
    const value = Math.round(Number(price));
    if (!Number.isFinite(value) || value < 0) { setError("اكتب سعرًا صحيحًا للدورة"); return; }
    setSaving(true);
    setError("");
    const result = await adminRequest(`/api/admin/clients/${encodeURIComponent(tenantId)}`, { method: "PATCH", body: { billingCycle, renewalAt: date, amount: value, customPrice: makeAgreed && value > 0 ? value : 0 } });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    toast("success", "تم تعديل الاشتراك");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" icon="calendar" onClick={() => { setError(""); setBillingCycle(startCycle); setDate(startDate); setPrice(String(suggested(startCycle))); setPriceEdited(false); setMakeAgreed(Boolean(agreed && agreed.plan === plan)); setOpen(true); }}>تعديل الاشتراك</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="تعديل الاشتراك"
        description="يغيّر دورة الفوترة وسعر الدورة وتاريخ انتهاء الاشتراك (التجديد) كما اتُّفق مع العميل. الباقة لا تتغير."
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>إغلاق</Button><Button variant="primary" type="submit" form="client-subscription-form" loading={saving}>حفظ</Button></>}
      >
        <form id="client-subscription-form" onSubmit={save} style={{ display: "grid", gap: 10 }}>
          <label className="ds-field">
            دورة الفوترة
            <select className="ds-select" value={billingCycle} onChange={(event) => { setBillingCycle(event.target.value); if (!priceEdited) setPrice(String(suggested(event.target.value))); }}>
              <option value="شهري">شهري</option>
              <option value="سنوي">سنوي</option>
            </select>
          </label>
          <label className="ds-field">
            سعر الدورة (ر.س، قبل الضريبة)
            <input className="ds-input" type="number" min={0} step={1} inputMode="numeric" value={price} onChange={(event) => { setPrice(event.target.value); setPriceEdited(true); const usual = planMonthlyPrice > 0 ? priceForCycle(planMonthlyPrice, billingCycle === "سنوي" ? "سنوي" : "شهري") : 0; if (usual > 0 && Math.round(Number(event.target.value)) !== usual) setMakeAgreed(true); }} />
            <small>سعر الدورة كاملة ({billingCycle === "سنوي" ? "السنة" : "الشهر"}). السعر المعتاد للباقة بهذه الدورة: {planMonthlyPrice > 0 ? priceForCycle(planMonthlyPrice, billingCycle === "سنوي" ? "سنوي" : "شهري").toLocaleString("en-US") : "—"} ر.س.</small>
          </label>
          <label className="ds-check" style={{ alignItems: "flex-start" }}>
            <input type="checkbox" checked={makeAgreed} onChange={(event) => setMakeAgreed(event.target.checked)} />
            <span>اعتماد هذا السعر سعرًا خاصًا لهذا العميل: يراه في صفحة اشتراكه ويُحاسَب به عند الدفع والتجديد التلقائي لباقته الحالية ({billingCycle}) فقط. أي باقة أو دورة أخرى تُسعَّر بسعرها المعتاد.</span>
          </label>
          {agreed && agreed.plan === plan ? <small>سعر خاص مفعّل حاليًا: {agreed.price.toLocaleString("en-US")} ر.س ({agreed.cycle}).</small> : null}
          <label className="ds-field">
            تاريخ التجديد (نهاية الاشتراك)
            <input className="ds-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="outline" type="button" onClick={() => setDate(addToDate(date || startDate, 1))}>+ شهر</Button>
            <Button variant="outline" type="button" onClick={() => setDate(addToDate(date || startDate, 12))}>+ سنة</Button>
            <Button variant="outline" type="button" onClick={() => setDate(startDate)}>إعادة التاريخ الحالي</Button>
          </div>
          {error ? <p className="ds-field-error" role="alert">{error}</p> : null}
        </form>
      </Dialog>
    </>
  );
}
