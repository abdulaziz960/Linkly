"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../../ds/Dialog";
import { Button } from "../../ds/primitives";
import { adminRequest } from "../../ds/forms";
import { useToast } from "../../ds/Toast";

function addToDate(value: string, months: number) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + months);
  // 31 Jan + 1 month would roll into March: land on the last day of the month instead.
  if (date.getUTCDate() !== day) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

/** Sets the client's current billing cycle and renewal (end) date by hand, e.g. to follow what was agreed in a quotation. The price is not touched. */
export default function ClientSubscriptionEditor({ tenantId, currentCycle, renewalAt }: { tenantId: string; currentCycle: string; renewalAt: string }) {
  const router = useRouter();
  const toast = useToast();
  const startDate = /^\d{4}-\d{2}-\d{2}/.test(renewalAt) ? renewalAt.slice(0, 10) : "";
  const [open, setOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState(currentCycle === "سنوي" ? "سنوي" : "شهري");
  const [date, setDate] = useState(startDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!date) { setError("حدّد تاريخ التجديد"); return; }
    setSaving(true);
    setError("");
    const result = await adminRequest(`/api/admin/clients/${encodeURIComponent(tenantId)}`, { method: "PATCH", body: { billingCycle, renewalAt: date } });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    toast("success", "تم تعديل الاشتراك");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" icon="calendar" onClick={() => { setError(""); setBillingCycle(currentCycle === "سنوي" ? "سنوي" : "شهري"); setDate(startDate); setOpen(true); }}>تعديل الاشتراك</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="تعديل الاشتراك"
        description="يغيّر دورة الفوترة وتاريخ انتهاء الاشتراك الحالي (التجديد) كما اتُّفق مع العميل. السعر والباقة لا يتغيران."
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>إغلاق</Button><Button variant="primary" type="submit" form="client-subscription-form" loading={saving}>حفظ</Button></>}
      >
        <form id="client-subscription-form" onSubmit={save} style={{ display: "grid", gap: 10 }}>
          <label className="ds-field">
            دورة الفوترة
            <select className="ds-select" value={billingCycle} onChange={(event) => setBillingCycle(event.target.value)}>
              <option value="شهري">شهري</option>
              <option value="سنوي">سنوي</option>
            </select>
          </label>
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
