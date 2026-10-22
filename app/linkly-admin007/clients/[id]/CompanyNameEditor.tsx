"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../../ds/Dialog";
import { Button } from "../../ds/primitives";
import { adminRequest } from "../../ds/forms";
import { useToast } from "../../ds/Toast";
import { COMPANY_NAME_MAX, normalizeCompanyName } from "../../../../lib/company-name";

/** Renames the client's company from its profile page (PATCH /api/admin/clients/[id] { companyName }). */
export default function CompanyNameEditor({ tenantId, companyName }: { tenantId: string; companyName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(companyName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    const checked = normalizeCompanyName(draft);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    setSaving(true);
    setError("");
    const result = await adminRequest(`/api/admin/clients/${encodeURIComponent(tenantId)}`, { method: "PATCH", body: { companyName: checked.name } });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("success", "تم تحديث اسم الشركة");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" icon="edit" onClick={() => { setDraft(companyName); setError(""); setOpen(true); }}>تعديل الاسم</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="تعديل اسم الشركة"
        description="يظهر في ملف العميل والبحث والتنبيهات، وفي لوحة تحكم العميل."
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button variant="primary" type="submit" form="company-name-form" loading={saving}>حفظ</Button></>}
      >
        <form id="company-name-form" onSubmit={save} style={{ display: "grid", gap: 10 }}>
          <label className="ds-field">
            اسم الشركة
            <input data-autofocus className="ds-input" required maxLength={COMPANY_NAME_MAX} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          {error ? <p className="ds-field-error" role="alert">{error}</p> : null}
        </form>
      </Dialog>
    </>
  );
}
