"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../../ds/Dialog";
import { Button } from "../../ds/primitives";
import { adminRequest } from "../../ds/forms";
import { useToast } from "../../ds/Toast";

export default function ClientTrialExtension({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("7");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function extend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const result = await adminRequest(`/api/admin/clients/${encodeURIComponent(tenantId)}/trial`, {
      method: "PATCH",
      body: { days: Number(days) }
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("success", "تم تمديد الفترة التجريبية");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" icon="calendar" onClick={() => { setDays("7"); setError(""); setOpen(true); }}>تمديد التجربة</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        beforeClose={() => !saving}
        size="sm"
        title="تمديد الفترة التجريبية"
        description="تُضاف الأيام إلى الموعد الحالي إذا كانت التجربة مستمرة، أو تبدأ من الآن إذا انتهت."
        footer={<><Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>إلغاء</Button><Button variant="primary" type="submit" form="client-trial-extension" loading={saving}>تمديد التجربة</Button></>}
      >
        <form id="client-trial-extension" onSubmit={extend} style={{ display: "grid", gap: 10 }}>
          <label className="ds-field">
            عدد الأيام الإضافية
            <input className="ds-input" type="number" min={1} max={365} step={1} required value={days} disabled={saving} onChange={(event) => setDays(event.target.value)} />
          </label>
          {error ? <p className="ds-field-error" role="alert">{error}</p> : null}
        </form>
      </Dialog>
    </>
  );
}
