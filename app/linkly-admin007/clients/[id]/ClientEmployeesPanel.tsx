"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { Employee } from "@prisma/client";
import { useRouter } from "next/navigation";
import CustomSelect from "../../../components/CustomSelect";
import { useLanguage } from "../../i18n";
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

/**
 * Lets Linkly staff fix a client's employee role/permissions directly from
 * the admin panel - the only alternative was asking the client to log in
 * and edit it themselves, since there's no "log in as client" capability.
 */
export default function ClientEmployeesPanel({ tenantId, employees }: Props) {
  const { t } = useLanguage();
  const router = useRouter();
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openEditor(employee: Employee) {
    setError("");
    setDraft({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      permissions: parsePermissions(employee.permissions)
    });
  }

  function togglePermission(permission: string) {
    setDraft((current) => {
      if (!current) return current;
      const has = current.permissions.includes(permission);
      return { ...current, permissions: has ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission] };
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${tenantId}/employees/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          email: draft.email,
          role: draft.role,
          permissions: formatPermissions(draft.permissions)
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || t("تعذر حفظ التعديل", "Could not save the change"));
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر حفظ التعديل", "Could not save the change"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>{t("الموظفون", "Employees")}</h2>
            <p>{t("عدّل دور أو صلاحيات أي موظف بحساب هذا العميل مباشرة.", "Edit any employee's role or permissions on this client's account directly.")}</p>
          </div>
        </div>
        <div className="admin-profile-feed">
          {employees.map((employee) => (
            <div key={employee.id}>
              <span className="admin-pill">{employeeRoleLabel(employee.role, t)}</span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <strong>{employee.name}</strong>
                  <small><span dir="ltr">{employee.email}</span> · {employee.permissions || t("بدون صلاحيات إضافية", "No additional permissions")}</small>
                </div>
                <button type="button" className="admin-secondary-button" onClick={() => openEditor(employee)}>
                  {t("تعديل", "Edit")}
                </button>
              </div>
            </div>
          ))}
          {!employees.length && <p className="admin-empty-state">{t("لا يوجد موظفون مسجّلون.", "No employees registered.")}</p>}
        </div>
      </section>

      {draft ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="edit-employee-title">
          <div className="admin-modal-card admin-user-limit-modal">
            <div className="admin-modal-head">
              <div>
                <h2 id="edit-employee-title">{t("تعديل الموظف", "Edit Employee")}</h2>
                <p>{t("يعدّل بيانات الموظف مباشرة بنفس الحساب - يحل محل تسجيل الدخول كالعميل.", "Edits the employee directly on this account - a stand-in for logging in as the client.")}</p>
              </div>
              <button type="button" onClick={() => setDraft(null)} aria-label={t("إغلاق", "Close")}>
                ×
              </button>
            </div>

            <form className="admin-client-form" onSubmit={handleSave}>
              <label>
                {t("الاسم", "Name")}
                <input value={draft.name} onChange={(event) => setDraft((current) => current && { ...current, name: event.target.value })} required />
              </label>
              <label>
                {t("البريد الإلكتروني", "Email")}
                <input type="email" dir="ltr" value={draft.email} onChange={(event) => setDraft((current) => current && { ...current, email: event.target.value })} required />
              </label>
              <label>
                {t("الدور", "Role")}
                <CustomSelect
                  value={draft.role}
                  onChange={(value) => setDraft((current) => current && { ...current, role: value })}
                  options={ROLE_OPTIONS.map((role) => ({ value: role, label: employeeRoleLabel(role, t) }))}
                />
              </label>

              <div className="admin-channel-picker" style={{ gridColumn: "1 / -1" }}>
                <b>{t("الصلاحيات", "Permissions")}</b>
                <div className="admin-channel-picker-grid">
                  {permissionOptions.map((permission) => (
                    <label key={permission} className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={draft.permissions.includes(permission)}
                        onChange={() => togglePermission(permission)}
                      />
                      {permissionLabel(permission, t)}
                    </label>
                  ))}
                </div>
              </div>

              {error ? <p className="admin-form-error">{error}</p> : null}

              <div className="admin-form-actions">
                <button type="button" onClick={() => setDraft(null)}>
                  {t("إلغاء", "Cancel")}
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? t("جاري الحفظ...", "Saving...") : t("حفظ", "Save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
