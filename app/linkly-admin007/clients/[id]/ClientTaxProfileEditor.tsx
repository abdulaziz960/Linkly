"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../../ds/Dialog";
import { Button } from "../../ds/primitives";
import { adminRequest } from "../../ds/forms";
import { useToast } from "../../ds/Toast";

/** Sets the client's VAT number and address for its tax invoices (PUT /api/admin/clients/[id]/tax-profile). */
export default function ClientTaxProfileEditor({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const url = `/api/admin/clients/${encodeURIComponent(tenantId)}/tax-profile`;

  async function openDialog() {
    setError("");
    setOpen(true);
    setLoading(true);
    const result = await adminRequest<{ vatNumber: string; address: string }>(url, { method: "GET" });
    setLoading(false);
    if (result.ok && result.data) {
      setVatNumber(result.data.vatNumber);
      setAddress(result.data.address);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const result = await adminRequest(url, { method: "PUT", body: { vatNumber, address } });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("success", "تم حفظ البيانات الضريبية للعميل");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" icon="edit" onClick={() => void openDialog()}>الرقم الضريبي</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="البيانات الضريبية للعميل"
        description="تظهر في فواتيره الضريبية القديمة والجديدة. اترك الرقم فارغًا لحذفه."
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button variant="primary" type="submit" form="client-tax-form" loading={saving} disabled={loading}>حفظ</Button></>}
      >
        <form id="client-tax-form" onSubmit={save} style={{ display: "grid", gap: 10 }}>
          <label className="ds-field">
            الرقم الضريبي (15 رقمًا)
            <input data-autofocus className="ds-input" dir="ltr" inputMode="numeric" maxLength={20} value={vatNumber} disabled={loading} onChange={(event) => setVatNumber(event.target.value)} placeholder="3XXXXXXXXXXXXX3" />
          </label>
          <label className="ds-field">
            العنوان
            <input className="ds-input" maxLength={300} value={address} disabled={loading} onChange={(event) => setAddress(event.target.value)} />
          </label>
          {error ? <p className="ds-field-error" role="alert">{error}</p> : null}
        </form>
      </Dialog>
    </>
  );
}
