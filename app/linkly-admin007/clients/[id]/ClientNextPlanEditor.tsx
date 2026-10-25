"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../../ds/Dialog";
import { Button } from "../../ds/primitives";
import { adminRequest } from "../../ds/forms";
import { useToast } from "../../ds/Toast";

type Scheduled = { planName: string; billingCycle: string } | null;

/** Schedules the plan and billing cycle of the client's next renewal; the current period is not touched. */
export default function ClientNextPlanEditor({ tenantId, currentPlan, currentCycle, plans, scheduled }: { tenantId: string; currentPlan: string; currentCycle: string; plans: string[]; scheduled: Scheduled }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [planName, setPlanName] = useState(scheduled?.planName ?? currentPlan);
  const [billingCycle, setBillingCycle] = useState(scheduled?.billingCycle ?? (currentCycle === "سنوي" ? "سنوي" : "شهري"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const url = `/api/admin/clients/${encodeURIComponent(tenantId)}/next-plan`;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const result = await adminRequest(url, { method: "PUT", body: { planName, billingCycle } });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("success", "تم ضبط الباقة القادمة");
    setOpen(false);
    router.refresh();
  }

  async function cancel() {
    setSaving(true);
    const result = await adminRequest(url, { method: "DELETE" });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("success", "أُلغيت الباقة القادمة، سيُجدَّد على باقته الحالية");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" icon="edit" onClick={() => { setError(""); setOpen(true); }}>{scheduled ? `الباقة القادمة: ${scheduled.planName}` : "الباقة القادمة"}</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="الباقة عند التجديد القادم"
        description="لا تتغير باقته الحالية ولا فترته المدفوعة. التجديد القادم (التلقائي أو من صفحة الاشتراك) يكون على الباقة ودورة الفوترة المختارة."
        footer={<>{scheduled ? <Button variant="outline" onClick={() => void cancel()} loading={saving}>إلغاء الباقة القادمة</Button> : null}<Button variant="outline" onClick={() => setOpen(false)}>إغلاق</Button><Button variant="primary" type="submit" form="next-plan-form" loading={saving}>حفظ</Button></>}
      >
        <form id="next-plan-form" onSubmit={save} style={{ display: "grid", gap: 10 }}>
          <label className="ds-field">
            الباقة
            <select className="ds-select" value={planName} onChange={(event) => setPlanName(event.target.value)}>
              {plans.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="ds-field">
            دورة الفوترة
            <select className="ds-select" value={billingCycle} onChange={(event) => setBillingCycle(event.target.value)}>
              <option value="شهري">شهري</option>
              <option value="سنوي">سنوي</option>
            </select>
          </label>
          {error ? <p className="ds-field-error" role="alert">{error}</p> : null}
        </form>
      </Dialog>
    </>
  );
}
