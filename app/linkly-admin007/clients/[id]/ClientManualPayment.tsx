"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../../ds/Dialog";
import { Button } from "../../ds/primitives";
import { adminRequest } from "../../ds/forms";
import { useToast } from "../../ds/Toast";
import { agreedPrice, priceForCycle, type AgreedPrice, type BillingCycle } from "../../../../lib/billing-pricing";
import { MANUAL_PAYMENT_METHODS } from "../../../../lib/manual-payment-methods";
import { grossHalalas } from "../../../../lib/vat";

const CYCLES = ["شهري", "سنوي"] as const;

/**
 * Confirms a payment received outside the gateway (a bank transfer, cash): the subscription is renewed from its current end date (or an
 * agreed date) and the payment joins the payments list as completed, with the total including tax.
 */
export default function ClientManualPayment({ tenantId, plan, currentCycle, amount, planMonthlyPrice, renewalAt, taxCustomer, agreed }: { tenantId: string; plan: string; currentCycle: string; amount: number; planMonthlyPrice: number; renewalAt: string; taxCustomer: boolean; agreed: AgreedPrice | null }) {
  const router = useRouter();
  const toast = useToast();
  const startCycle = currentCycle === "سنوي" ? "سنوي" : "شهري";
  // The price of one whole period: the client's own price for the cycle it is on, the plan's usual price for another cycle.
  const suggested = (cycle: string) => {
    const agreedNow = agreedPrice(agreed, plan, cycle as BillingCycle);
    if (agreedNow) return agreedNow;
    if (cycle === startCycle && amount > 0 && !(cycle === "سنوي" && planMonthlyPrice > 0 && amount <= planMonthlyPrice * 1.5)) return amount;
    return planMonthlyPrice > 0 ? priceForCycle(planMonthlyPrice, cycle === "سنوي" ? "سنوي" : "شهري") : amount;
  };
  const [open, setOpen] = useState(false);
  const [cycle, setCycle] = useState<string>(startCycle);
  const [price, setPrice] = useState(String(suggested(startCycle)));
  const [priceEdited, setPriceEdited] = useState(false);
  const [method, setMethod] = useState<string>(MANUAL_PAYMENT_METHODS[0]);
  const [reference, setReference] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const net = Math.round(Number(price));
  const valid = Number.isFinite(net) && net >= 1;
  const total = valid ? (taxCustomer ? grossHalalas(net) / 100 : net) : 0;
  const currentEnd = /^\d{4}-\d{2}-\d{2}/.test(renewalAt) ? renewalAt.slice(0, 10) : "";
  const money = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

  function reset() {
    setCycle(startCycle); setPrice(String(suggested(startCycle))); setPriceEdited(false); setMethod(MANUAL_PAYMENT_METHODS[0]); setReference(""); setEndDate(""); setError("");
  }

  function changeCycle(next: string) {
    setCycle(next);
    if (!priceEdited) setPrice(String(suggested(next)));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid) { setError("اكتب قيمة صحيحة للفاتورة (ريال واحد على الأقل)."); return; }
    setSaving(true);
    setError("");
    const result = await adminRequest(`/api/admin/clients/${encodeURIComponent(tenantId)}/manual-payment`, {
      method: "POST",
      body: { amount: net, billingCycle: cycle, method, reference, ...(endDate ? { renewalAt: endDate } : {}) }
    });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    toast("success", "تم تأكيد الدفعة وتفعيل الاشتراك", "أُضيفت الدفعة إلى المدفوعات.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" icon="check" onClick={() => { reset(); setOpen(true); }}>تأكيد دفعة</Button>
      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        size="sm"
        title="تأكيد دفعة الاشتراك"
        description="استلمت المبلغ خارج بوابة الدفع (تحويل بنكي مثلًا)؟ يُفعَّل الاشتراك أو يُجدَّد، وتُسجَّل الدفعة «مكتملة» وتُضاف إلى المدفوعات."
        footer={<><Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>إغلاق</Button><Button variant="primary" type="submit" form="manual-payment-form" loading={saving}>تأكيد الدفع وتفعيل الاشتراك</Button></>}
      >
        <form id="manual-payment-form" onSubmit={save} style={{ display: "grid", gap: 10 }}>
          <label className="ds-field">
            دورة الفوترة
            <select className="ds-select" value={cycle} onChange={(event) => changeCycle(event.target.value)}>
              {CYCLES.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="ds-field">
            قيمة الفاتورة للدورة (ر.س، قبل الضريبة)
            <input className="ds-input" type="number" min={1} step={1} inputMode="numeric" value={price} onChange={(event) => { setPrice(event.target.value); setPriceEdited(true); }} />
          </label>
          <p className="muted-copy" style={{ margin: 0 }}>
            {taxCustomer ? <>الإجمالي المسجَّل في المدفوعات: <b>{money(total)} ر.س</b> (يشمل ضريبة 15%).</> : <>الإجمالي المسجَّل في المدفوعات: <b>{money(total)} ر.س</b> (لا تُضاف ضريبة لهذا العميل).</>}
          </p>
          <label className="ds-field">
            طريقة الدفع
            <select className="ds-select" value={method} onChange={(event) => setMethod(event.target.value)}>
              {MANUAL_PAYMENT_METHODS.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="ds-field">
            رقم الحوالة أو مرجعها (اختياري)
            <input className="ds-input" dir="ltr" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} />
          </label>
          <label className="ds-field">
            تاريخ انتهاء الاشتراك (اختياري)
            <input className="ds-input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            <small>{currentEnd ? `اتركه فارغًا ليُمدَّد من ${currentEnd} (أو من اليوم إن كان منتهيًا) لمدة ${cycle === "سنوي" ? "سنة" : "شهر"}.` : `اتركه فارغًا ليُفعَّل من اليوم لمدة ${cycle === "سنوي" ? "سنة" : "شهر"}.`}</small>
          </label>
          {error ? <p className="ds-field-error" role="alert">{error}</p> : null}
        </form>
      </Dialog>
    </>
  );
}
