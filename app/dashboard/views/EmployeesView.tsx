"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Employee } from "../types";

type EmployeeFormState = {
  id?: string;
  name: string;
  email: string;
  role: Employee["role"];
  status: Employee["status"];
  permissions: string[];
};

const permissionOptions = [
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

function parsePermissions(permissions: string) {
  if (permissions === "الكل") return permissionOptions;
  if (permissions.includes("+")) return permissions.split("+").map((permission) => permission.trim()).filter(Boolean);
  if (permissions.endsWith(" فقط")) return [permissions.replace(" فقط", "")];
  return permissions ? [permissions] : [];
}

function formatPermissions(permissions: string[]) {
  if (permissions.length === permissionOptions.length) return "الكل";
  if (permissions.length === 1) return `${permissions[0]} فقط`;
  return permissions.join(" + ");
}

export default function EmployeesView({
  employees,
  onRefreshData
}: {
  employees: Employee[];
  onRefreshData: () => Promise<void>;
}) {
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
      setError(payload.error || "تعذر حفظ الموظف");
      setSaving(false);
      return;
    }

    await onRefreshData();
    setSaving(false);
    if (form.id) {
      setFormOpen(false);
      return;
    }

    setNotice(payload.data?.inviteDelivery?.message || "تم حفظ الموظف.");
    setActivationUrl(payload.data?.inviteDelivery?.activationUrl || "");
  }

  async function deleteEmployee(employee: Employee) {
    if (!window.confirm(`حذف الموظف ${employee.name}؟`)) return;
    await fetch(`/api/employees/${employee.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  function exportEmployees() {
    const header = ["الموظف", "البريد الإلكتروني", "الدور", "الحالة", "الصلاحيات"];
    const rows = employees.map((employee) => [
      employee.name,
      employee.email,
      employee.role,
      employee.status,
      employee.permissions
    ]);
    downloadCsv("employees.csv", header, rows);
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>الموظفين</h2>
          <span />
          <button className="btn soft" type="button" onClick={exportEmployees}>تصدير</button>
          <button className="btn primary" type="button" onClick={openCreateForm}>إضافة موظف</button>
        </div>
        <div className="panel-body table-wrap">
          <table>
            <thead><tr><th>الموظف</th><th>الدور</th><th>الحالة</th><th>الصلاحيات</th><th>إجراء</th></tr></thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <b>{employee.name}</b>
                    <span className="table-subtitle">{employee.email}</span>
                  </td>
                  <td>{employee.role}</td>
                  <td><span className={employee.status === "متصل" ? "state ok" : employee.status === "مشغول" ? "state warn" : "state muted"}>{employee.status}</span></td>
                  <td>{employee.permissions}</td>
                  <td className="row-actions">
                    <button className="btn soft" type="button" onClick={() => openEditForm(employee)}>تعديل</button>
                    <button className="btn danger" type="button" onClick={() => deleteEmployee(employee)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label="حفظ موظف" onSubmit={submitEmployee} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? "تعديل موظف" : "إضافة موظف"}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <label>
                <span>اسم الموظف</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>البريد الإلكتروني</span>
                <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
              </label>
              <div className="split-fields">
                <label>
                  <span>الدور</span>
                  <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as Employee["role"] }))}>
                    <option>مالك الحساب</option>
                    <option>مشرف</option>
                    <option>موظف دعم</option>
                  </select>
                </label>
                <label>
                  <span>الحالة</span>
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as Employee["status"] }))}>
                    <option>متصل</option>
                    <option>مشغول</option>
                    <option>غير متصل</option>
                  </select>
                </label>
              </div>
              <div className="permissions-box">
                <div className="permissions-head">
                  <b>الصلاحيات الإضافية</b>
                  <button className="btn soft" type="button" onClick={toggleAllPermissions}>
                    {form.permissions.length === permissionOptions.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
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
                      <span>{permission}</span>
                    </label>
                  ))}
                </div>
              </div>
              {error ? <p className="form-error">{error}</p> : null}
              {notice ? <p className="form-success">{notice}</p> : null}
              {activationUrl ? (
                <a className="activation-link" href={activationUrl} target="_blank" rel="noreferrer">
                  فتح رابط التفعيل
                </a>
              ) : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>إلغاء</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? "جاري الحفظ" : "حفظ"}</button>
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
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
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
