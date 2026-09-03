"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Conversation, Employee } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";

type EmployeeFormState = {
  id?: string;
  name: string;
  email: string;
  role: Employee["role"];
  status: Employee["status"];
  permissions: string[];
};

export const permissionOptions = [
  "المحادثات",
  "العملاء",
  "قنوات التواصل",
  "الوسوم",
  "الرد الآلي",
  "الحملات",
  "التقارير",
  "الفرق",
  "الموظفين",
  "الإعدادات والربط"
];

export function permissionLabel(permission: string, t: (ar: string, en: string) => string) {
  const labels: Record<string, string> = {
    "المحادثات": t("المحادثات", "Conversations"),
    "العملاء": t("العملاء", "Customers"),
    "قنوات التواصل": t("قنوات التواصل", "Channels"),
    "الوسوم": t("الوسوم", "Tags"),
    "الرد الآلي": t("الرد الآلي", "Auto-Reply"),
    "الحملات": t("الحملات", "Campaigns"),
    "التقارير": t("التقارير", "Reports"),
    "الفرق": t("الفرق", "Teams"),
    "الموظفين": t("الموظفين", "Employees"),
    "الإعدادات والربط": t("الإعدادات والربط", "Settings & Integrations")
  };
  return labels[permission] ?? permission;
}

export function employeeStatusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "متصل") return t("متصل", "Online");
  if (status === "مشغول") return t("مشغول", "Busy");
  return t("غير متصل", "Offline");
}

export function employeeRoleLabel(role: string, t: (ar: string, en: string) => string) {
  if (role === "مالك الحساب") return t("مالك الحساب", "Account Owner");
  if (role === "مشرف") return t("مشرف", "Supervisor");
  return t("موظف دعم", "Support Agent");
}

export function parsePermissions(permissions: string) {
  if (permissions === "الكل") return permissionOptions;
  if (permissions.includes("+")) return permissions.split("+").map((permission) => permission.trim()).filter(Boolean);
  if (permissions.endsWith(" فقط")) return [permissions.replace(" فقط", "")];
  return permissions ? [permissions] : [];
}

export function formatPermissions(permissions: string[]) {
  if (permissions.length === permissionOptions.length) return "الكل";
  if (permissions.length === 1) return `${permissions[0]} فقط`;
  return permissions.join(" + ");
}

// The all-time average, unlike Reports' employee table which is scoped to
// whatever date range is selected there - an employee's profile here should
// reflect their overall rating regardless of when it was earned.
function employeeOverallRating(employee: Employee, conversations: Conversation[]) {
  const rated = conversations.filter((conversation) => conversation.ratingEmployee === employee.name && conversation.rating);
  if (!rated.length) return null;
  const average = rated.reduce((sum, conversation) => sum + (conversation.rating || 0), 0) / rated.length;
  return { average: Math.round(average * 10) / 10, count: rated.length };
}

export default function EmployeesView({
  employees,
  conversations,
  onRefreshData
}: {
  employees: Employee[];
  conversations: Conversation[];
  onRefreshData: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const emptyForm = useMemo<EmployeeFormState>(
    () => ({
      name: "",
      email: "",
      role: "موظف دعم",
      status: "متصل",
      permissions: ["المحادثات"]
    }),
    []
  );
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<EmployeeFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activationUrl, setActivationUrl] = useState("");
  const [resendingId, setResendingId] = useState("");
  const [listNotice, setListNotice] = useState("");
  const [listError, setListError] = useState("");

  function openCreateForm() {
    setError("");
    setNotice("");
    setActivationUrl("");
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEditForm(employee: Employee) {
    setError("");
    setNotice("");
    setActivationUrl("");
    setForm({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      status: employee.status,
      permissions: parsePermissions(employee.permissions)
    });
    setFormOpen(true);
  }

  function togglePermission(permission: string) {
    setForm((current) => {
      const exists = current.permissions.includes(permission);
      const permissions = exists
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission];

      return {
        ...current,
        permissions: permissions.length ? permissions : [permission]
      };
    });
  }

  function toggleAllPermissions() {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.length === permissionOptions.length ? ["المحادثات"] : permissionOptions
    }));
  }

  async function submitEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch(form.id ? `/api/employees/${form.id}` : "/api/employees", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        role: form.role,
        status: form.status,
        permissions: formatPermissions(form.permissions)
      })
    });
    const payload = (await response.json()) as {
      ok: boolean;
      error?: string;
      data?: Employee & { inviteDelivery?: { message?: string; activationUrl?: string } };
    };

    if (!payload.ok) {
      setError(payload.error || t("تعذر حفظ الموظف", "Could not save the employee"));
      setSaving(false);
      return;
    }

    await onRefreshData();
    setSaving(false);
    if (form.id) {
      setFormOpen(false);
      return;
    }

    setNotice(payload.data?.inviteDelivery?.message || t("تم حفظ الموظف.", "Employee saved."));
    setActivationUrl(payload.data?.inviteDelivery?.activationUrl || "");
    window.setTimeout(() => setNotice(""), 3000);
  }

  async function resendInvite(employee: Employee) {
    setListError("");
    setListNotice("");
    setResendingId(employee.id);
    try {
      const response = await fetch(`/api/employees/${employee.id}/resend-invite`, { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; error?: string; data?: { inviteDelivery?: { message?: string; activationUrl?: string } } };
      if (!payload.ok) {
        setListError(payload.error || t("تعذر إعادة إرسال الدعوة", "Could not resend the invitation"));
        return;
      }
      setListNotice(payload.data?.inviteDelivery?.message || t("تم إرسال الدعوة من جديد.", "The invitation was resent."));
      setActivationUrl(payload.data?.inviteDelivery?.activationUrl || "");
    } finally {
      setResendingId("");
    }
  }

  async function deleteEmployee(employee: Employee) {
    if (!window.confirm(t(`حذف الموظف ${employee.name}؟`, `Delete employee ${employee.name}?`))) return;
    await fetch(`/api/employees/${employee.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  function exportEmployees() {
    const header = [
      t("الموظف", "Employee"),
      t("البريد الإلكتروني", "Email"),
      t("الدور", "Role"),
      t("الحالة", "Status"),
      t("الصلاحيات", "Permissions"),
      t("التقييم", "Rating")
    ];
    const rows = employees.map((employee) => {
      const rating = employeeOverallRating(employee, conversations);
      return [
        employee.name,
        employee.email,
        employee.role,
        employee.status,
        employee.permissions,
        rating ? `${rating.average} (${rating.count})` : t("غير متاح", "N/A")
      ];
    });
    downloadCsv("employees.csv", header, rows);
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>{t("الموظفين", "Employees")}</h2>
          <span />
          <button className="btn soft" type="button" onClick={exportEmployees}>{t("تصدير", "Export")}</button>
          <button className="btn primary" type="button" onClick={openCreateForm}>{t("إضافة موظف", "Add Employee")}</button>
        </div>
        {listNotice ? <p className="form-success">{listNotice}</p> : null}
        {listError ? <p className="form-error">{listError}</p> : null}
        {!formOpen && activationUrl ? (
          <a className="activation-link" href={activationUrl} target="_blank" rel="noreferrer">
            {t("فتح رابط التفعيل", "Open Activation Link")}
          </a>
        ) : null}
        <div className="panel-body table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("الموظف", "Employee")}</th>
                <th>{t("الدور", "Role")}</th>
                <th>{t("الحالة", "Status")}</th>
                <th>{t("الصلاحيات", "Permissions")}</th>
                <th>{t("التقييم", "Rating")}</th>
                <th>{t("إجراء", "Action")}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const rating = employeeOverallRating(employee, conversations);
                return (
                <tr key={employee.id}>
                  <td>
                    <b>{employee.name}</b>
                    <span className="table-subtitle">{employee.email}</span>
                  </td>
                  <td>{employeeRoleLabel(employee.role, t)}</td>
                  <td>
                    {employee.pendingActivation ? (
                      <span className="state warn">{t("الدعوة معلقة", "Invitation Pending")}</span>
                    ) : (
                      <span className={employee.status === "متصل" ? "state ok" : employee.status === "مشغول" ? "state warn" : "state muted"}>{employeeStatusLabel(employee.status, t)}</span>
                    )}
                  </td>
                  <td>{employee.permissions}</td>
                  <td>{rating ? <span className="employee-rating">⭐ {rating.average} <small>({rating.count})</small></span> : <span className="table-subtitle">{t("غير متاح", "N/A")}</span>}</td>
                  <td className="row-actions">
                    <button className="btn soft" type="button" onClick={() => openEditForm(employee)}>{t("تعديل", "Edit")}</button>
                    <button className="btn danger" type="button" onClick={() => deleteEmployee(employee)}>{t("حذف", "Delete")}</button>
                    {employee.pendingActivation ? (
                      <button className="btn soft" type="button" disabled={resendingId === employee.id} onClick={() => resendInvite(employee)}>
                        {resendingId === employee.id ? t("جاري الإرسال…", "Sending…") : t("إعادة إرسال الدعوة", "Resend Invitation")}
                      </button>
                    ) : null}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ موظف", "Save employee")} onSubmit={submitEmployee} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? t("تعديل موظف", "Edit Employee") : t("إضافة موظف", "Add Employee")}</h2>
            </header>
            {notice ? <p className="form-success modal-top-notice">{notice}</p> : null}
            <div className="account-modal-body form-grid">
              <label>
                <span>{t("اسم الموظف", "Employee Name")}</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>{t("البريد الإلكتروني", "Email")}</span>
                <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
              </label>
              <div className="split-fields">
                <label>
                  <span>{t("الدور", "Role")}</span>
                  <CustomSelect
                    value={form.role}
                    onChange={(value) => setForm((current) => ({ ...current, role: value as Employee["role"] }))}
                    options={[
                      { value: "مالك الحساب", label: t("مالك الحساب", "Account Owner") },
                      { value: "مشرف", label: t("مشرف", "Supervisor") },
                      { value: "موظف دعم", label: t("موظف دعم", "Support Agent") }
                    ]}
                  />
                </label>
                <label>
                  <span>{t("الحالة", "Status")}</span>
                  <CustomSelect
                    value={form.status}
                    onChange={(value) => setForm((current) => ({ ...current, status: value as Employee["status"] }))}
                    options={[
                      { value: "متصل", label: t("متصل", "Online") },
                      { value: "مشغول", label: t("مشغول", "Busy") },
                      { value: "غير متصل", label: t("غير متصل", "Offline") }
                    ]}
                  />
                </label>
              </div>
              <div className="permissions-box">
                <div className="permissions-head">
                  <b>{t("الصلاحيات الإضافية", "Additional Permissions")}</b>
                  <button className="btn soft" type="button" onClick={toggleAllPermissions}>
                    {form.permissions.length === permissionOptions.length ? t("إلغاء تحديد الكل", "Deselect All") : t("تحديد الكل", "Select All")}
                  </button>
                </div>
                <div className="checkbox-grid">
                  {permissionOptions.map((permission) => (
                    <label key={permission} className="check-row">
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(permission)}
                        onChange={() => togglePermission(permission)}
                      />
                      <span>{permissionLabel(permission, t)}</span>
                    </label>
                  ))}
                </div>
              </div>
              {error ? <p className="form-error">{error}</p> : null}
              {activationUrl ? (
                <a className="activation-link" href={activationUrl} target="_blank" rel="noreferrer">
                  {t("فتح رابط التفعيل", "Open Activation Link")}
                </a>
              ) : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving...") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function downloadCsv(fileName: string, header: Array<string | number>, rows: Array<Array<string | number>>) {
  const csv = [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string | number) {
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}
