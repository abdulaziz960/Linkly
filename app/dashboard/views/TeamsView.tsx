"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Employee, Team } from "../types";

type TeamFormState = {
  id?: string;
  name: string;
  lead: string;
  memberIds: string[];
  autoRouting: boolean;
};

export default function TeamsView({
  employees,
  onRefreshData,
  teams
}: {
  employees: Employee[];
  onRefreshData: () => Promise<void>;
  teams: Team[];
}) {
  const emptyForm = useMemo<TeamFormState>(
    () => ({
      name: "",
      lead: employees[0]?.name || "",
      memberIds: [],
      autoRouting: true
    }),
    [employees]
  );
  const [formOpen, setFormOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState<Team | null>(null);
  const [form, setForm] = useState<TeamFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);

  function openCreateForm() {
    setError("");
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEditForm(team: Team) {
    setError("");
    setForm({
      id: team.id,
      name: team.name,
      lead: team.lead,
      memberIds: team.memberIds,
      autoRouting: team.routing === "تلقائي بالتساوي"
    });
    setFormOpen(true);
  }

  function toggleMember(employeeId: string) {
    setForm((current) => {
      const exists = current.memberIds.includes(employeeId);
      return {
        ...current,
        memberIds: exists ? current.memberIds.filter((id) => id !== employeeId) : [...current.memberIds, employeeId]
      };
    });
  }

  async function submitTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch(form.id ? `/api/teams/${form.id}` : "/api/teams", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        lead: form.lead,
        routing: form.autoRouting ? "تلقائي بالتساوي" : "يدوي",
        memberIds: form.memberIds
      })
    });
    const payload = (await response.json()) as { ok: boolean; error?: string };

    if (!payload.ok) {
      setError(payload.error || "تعذر حفظ الفريق");
      setSaving(false);
      return;
    }

    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
  }

  async function deleteTeam(team: Team) {
    if (!window.confirm(`حذف فريق ${team.name}؟`)) return;
    await fetch(`/api/teams/${team.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  function getMemberNames(team: Team) {
    return team.memberIds
      .map((id) => employeeById.get(id))
      .filter(Boolean) as Employee[];
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>الفرق</h2>
          <span />
          <button className="btn primary" type="button" onClick={openCreateForm}>إضافة فريق</button>
        </div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">استخدم الفرق لتنظيم الموظفين حسب مهامهم مثل الدعم، المبيعات، الشحن، والفواتير، وتحديد آلية توزيع المحادثات لكل فريق.</p>
          <table>
            <thead><tr><th>الفريق</th><th>المشرف</th><th>الأعضاء</th><th>التوزيع</th><th>إجراء</th></tr></thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.id}>
                  <td><b>{team.name}</b></td>
                  <td>{team.lead || "-"}</td>
                  <td>{team.memberIds.length}</td>
                  <td>{team.routing}</td>
                  <td className="row-actions">
                    <button className="btn soft" type="button" onClick={() => setMembersOpen(team)}>عرض</button>
                    <button className="btn soft" type="button" onClick={() => openEditForm(team)}>إضافة عضو</button>
                    <button className="btn soft" type="button" onClick={() => openEditForm(team)}>تعديل</button>
                    <button className="btn danger" type="button" onClick={() => deleteTeam(team)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label="حفظ فريق" onSubmit={submitTeam} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? "تعديل فريق" : "إضافة فريق"}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <div className="form-intro">
                <h3>{form.id ? "تحديث بيانات الفريق" : "إنشاء فريق جديد"}</h3>
                <p>أضف اسم الفريق والمشرف، ثم اختر الأعضاء وطريقة توزيع المحادثات.</p>
              </div>
              <label>
                <span>اسم الفريق</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required placeholder="مثال: الدعم، الشحن، الفواتير" />
              </label>
              <label>
                <span>المشرف</span>
                <select value={form.lead} onChange={(event) => setForm((current) => ({ ...current, lead: event.target.value }))}>
                  <option value="">بدون مشرف</option>
                  {employees.map((employee) => <option key={employee.id}>{employee.name}</option>)}
                </select>
              </label>
              <label className="check-row team-routing">
                <input
                  type="checkbox"
                  checked={form.autoRouting}
                  onChange={(event) => setForm((current) => ({ ...current, autoRouting: event.target.checked }))}
                />
                <span>السماح بالتوزيع التلقائي لهذا الفريق.</span>
              </label>
              <div className="permissions-box">
                <div className="permissions-head">
                  <b>أعضاء الفريق</b>
                  <span className="muted-inline">تم تحديد {form.memberIds.length} من أصل {employees.length} موظف</span>
                </div>
                <div className="member-picker">
                  {employees.map((employee) => (
                    <label key={employee.id} className="member-row">
                      <input type="checkbox" checked={form.memberIds.includes(employee.id)} onChange={() => toggleMember(employee.id)} />
                      <span className="avatar small">{employee.initial}</span>
                      <b>{employee.name}</b>
                      <small>{employee.email}</small>
                    </label>
                  ))}
                </div>
              </div>
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>إلغاء</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? "جاري الحفظ" : "حفظ"}</button>
            </footer>
          </form>
        </div>
      ) : null}

      {membersOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setMembersOpen(null)}>
          <section className="account-modal form-modal" role="dialog" aria-modal="true" aria-label="أعضاء الفريق" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setMembersOpen(null)}>×</button>
              <h2>أعضاء فريق {membersOpen.name}</h2>
            </header>
            <div className="account-modal-body">
              <div className="member-list">
                {getMemberNames(membersOpen).map((employee) => (
                  <div key={employee.id} className="member-card">
                    <span className="avatar">{employee.initial}</span>
                    <div>
                      <b>{employee.name}</b>
                      <span>{employee.email}</span>
                    </div>
                    <em>{employee.role}</em>
                  </div>
                ))}
                {!membersOpen.memberIds.length ? <p className="muted-copy">لا يوجد أعضاء مضافين لهذا الفريق.</p> : null}
              </div>
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setMembersOpen(null)}>إغلاق</button>
              <button className="btn primary" type="button" onClick={() => { setMembersOpen(null); openEditForm(membersOpen); }}>تعديل الأعضاء</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
