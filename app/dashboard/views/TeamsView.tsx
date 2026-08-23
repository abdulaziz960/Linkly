"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Employee, Team } from "../types";
import { useLanguage } from "../i18n";

function routingLabel(routing: string, t: (ar: string, en: string) => string) {
  if (routing === "تلقائي بالتساوي") return t("تلقائي بالتساوي", "Automatic (even split)");
  return t("يدوي", "Manual");
}

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
  const { t } = useLanguage();
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
      setError(payload.error || t("تعذر حفظ الفريق", "Could not save the team"));
      setSaving(false);
      return;
    }

    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
  }

  async function deleteTeam(team: Team) {
    if (!window.confirm(t(`حذف فريق ${team.name}؟`, `Delete team ${team.name}?`))) return;
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
          <h2>{t("الفرق", "Teams")}</h2>
          <span />
          <button className="btn primary" type="button" onClick={openCreateForm}>{t("إضافة فريق", "Add Team")}</button>
        </div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">{t("استخدم الفرق لتنظيم الموظفين حسب مهامهم مثل الدعم، المبيعات، الشحن، والفواتير، وتحديد آلية توزيع المحادثات لكل فريق.", "Use teams to organize employees by function, such as support, sales, shipping, and billing, and to set the conversation routing method for each team.")}</p>
          <table>
            <thead><tr><th>{t("الفريق", "Team")}</th><th>{t("المشرف", "Lead")}</th><th>{t("الأعضاء", "Members")}</th><th>{t("التوزيع", "Routing")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.id}>
                  <td><b>{team.name}</b></td>
                  <td>{team.lead || "-"}</td>
                  <td>{team.memberIds.length}</td>
                  <td>{routingLabel(team.routing, t)}</td>
                  <td className="row-actions">
                    <button className="btn soft" type="button" onClick={() => setMembersOpen(team)}>{t("عرض", "View")}</button>
                    <button className="btn soft" type="button" onClick={() => openEditForm(team)}>{t("تعديل", "Edit")}</button>
                    <button className="btn danger" type="button" onClick={() => deleteTeam(team)}>{t("حذف", "Delete")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ فريق", "Save Team")} onSubmit={submitTeam} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? t("تعديل فريق", "Edit Team") : t("إضافة فريق", "Add Team")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <div className="form-intro">
                <h3>{form.id ? t("تحديث بيانات الفريق", "Update Team Details") : t("إنشاء فريق جديد", "Create a New Team")}</h3>
                <p>{t("أضف اسم الفريق والمشرف، ثم اختر الأعضاء وطريقة توزيع المحادثات.", "Add the team name and lead, then choose the members and the conversation routing method.")}</p>
              </div>
              <label>
                <span>{t("اسم الفريق", "Team Name")}</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required placeholder={t("مثال: الدعم، الشحن، الفواتير", "e.g. Support, Shipping, Billing")} />
              </label>
              <label>
                <span>{t("المشرف", "Lead")}</span>
                <select value={form.lead} onChange={(event) => setForm((current) => ({ ...current, lead: event.target.value }))}>
                  <option value="">{t("بدون مشرف", "No lead")}</option>
                  {employees.map((employee) => <option key={employee.id}>{employee.name}</option>)}
                </select>
              </label>
              <label className="check-row team-routing">
                <input
                  type="checkbox"
                  checked={form.autoRouting}
                  onChange={(event) => setForm((current) => ({ ...current, autoRouting: event.target.checked }))}
                />
                <span>{t("السماح بالتوزيع التلقائي لهذا الفريق.", "Allow automatic routing for this team.")}</span>
              </label>
              <div className="permissions-box">
                <div className="permissions-head">
                  <b>{t("أعضاء الفريق", "Team Members")}</b>
                  <span className="muted-inline">{t(`تم تحديد ${form.memberIds.length} من أصل ${employees.length} موظف`, `${form.memberIds.length} of ${employees.length} employees selected`)}</span>
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
              <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}

      {membersOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setMembersOpen(null)}>
          <section className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("أعضاء الفريق", "Team Members")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setMembersOpen(null)}>×</button>
              <h2>{t(`أعضاء فريق ${membersOpen.name}`, `Members of ${membersOpen.name}`)}</h2>
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
                {!membersOpen.memberIds.length ? <p className="muted-copy">{t("لا يوجد أعضاء مضافين لهذا الفريق.", "No members have been added to this team.")}</p> : null}
              </div>
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setMembersOpen(null)}>{t("إغلاق", "Close")}</button>
              <button className="btn primary" type="button" onClick={() => { setMembersOpen(null); openEditForm(membersOpen); }}>{t("تعديل الأعضاء", "Edit Members")}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
