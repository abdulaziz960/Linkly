"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { Employee } from "@prisma/client";
import { useRouter } from "next/navigation";
import { Badge, Button, EmptyState, Section } from "../../ds/primitives";
import { Dialog } from "../../ds/Dialog";
import { useToast } from "../../ds/Toast";
import Icon from "../../ds/Icon";
import {
  permissionOptions,
  permissionLabel,
  parsePermissions,
  formatPermissions,
  employeeRoleLabel
} from "../../../dashboard/views/EmployeesView";

type Props = {
  tenantId: string;
  employees: Employee[];
};

type EditDraft = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
};

const ROLE_OPTIONS = ["مالك الحساب", "مشرف", "موظف دعم"];
const ar = (value: string) => value;

/**
 * Lets Linkly staff fix a client's employee role/permissions directly from
 * the admin panel - the only alternative was asking the client to log in
 * and edit it themselves, since there's no "log in as client" capability.
 */
export default function ClientEmployeesPanel({ tenantId, employees }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openEditor(employee: Employee) {
    setError("");
    setDraft({ id: employee.id, name: employee.name, email: employee.email, role: employee.role, permissions: parsePermissions(employee.permissions) });
  }

  function closeEditor() {
    if (saving) return;
    setDraft(null);
  }

  function togglePermission(permission: string) {
    setDraft((current) => {
      if (!current) return current;
      const has = current.permissions.includes(permission);
      return { ...current, permissions: has ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission] };
    });
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${tenantId}/employees/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, email: draft.email, role: draft.role, permissions: formatPermissions(draft.permissions) })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "تعذر حفظ التعديل");
      setDraft(null);
      toast("success", "تم حفظ بيانات الموظف");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ التعديل");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Section title="الموظفون" description="عدّل دور أو صلاحيات أي موظف بحساب هذا العميل مباشرة.">
        <div className="ds-card ds-card-pad">
          {employees.length === 0 ? (
            <EmptyState icon="users" title="لا يوجد موظفون مسجّلون" description="سيظهر موظفو العميل هنا بعد إضافتهم." />
          ) : (
            <ul className="ds-feed">
              {employees.map((employee) => (
                <li key={employee.id}>
                  <Badge tone="neutral" dot={false}>{employeeRoleLabel(employee.role, ar)}</Badge>
                  <div className="ds-feed-body">
                    <strong>{employee.name}</strong>
                    <span><bdi dir="ltr">{employee.email}</bdi> · {employee.permissions || "بدون صلاحيات إضافية"}</span>
                  </div>
                  <Button variant="outline" icon="edit" onClick={() => openEditor(employee)}>تعديل</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Dialog
        open={Boolean(draft)}
        onClose={closeEditor}
        size="lg"
        title="تعديل الموظف"
        description="يعدّل بيانات الموظف مباشرة على نفس الحساب بدل تسجيل الدخول كالعميل."
        footer={<><Button variant="outline" onClick={closeEditor}>إلغاء</Button><Button variant="primary" type="submit" form="employee-edit-form" loading={saving}>حفظ</Button></>}
      >
        {draft ? (
          <form id="employee-edit-form" onSubmit={handleSave} style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label className="ds-field">الاسم<input data-autofocus className="ds-input" required value={draft.name} onChange={(event) => setDraft((current) => current && { ...current, name: event.target.value })} /></label>
              <label className="ds-field">البريد الإلكتروني<input className="ds-input" type="email" dir="ltr" required value={draft.email} onChange={(event) => setDraft((current) => current && { ...current, email: event.target.value })} /></label>
              <label className="ds-field">
                الدور
                <select className="ds-select" value={draft.role} onChange={(event) => setDraft((current) => current && { ...current, role: event.target.value })}>
                  {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{employeeRoleLabel(role, ar)}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="ds-fieldset">
              <legend>الصلاحيات</legend>
              <div className="ds-check-grid">
                {permissionOptions.map((permission) => (
                  <label key={permission} className="ds-check" data-on={draft.permissions.includes(permission) || undefined}>
                    <input type="checkbox" checked={draft.permissions.includes(permission)} onChange={() => togglePermission(permission)} />
                    <span>{permissionLabel(permission, ar)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
