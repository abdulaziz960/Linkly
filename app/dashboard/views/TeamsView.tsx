"use client";

import { confirmDialog } from "../../../lib/ui-dialogs";

import { FormEvent, useMemo, useState } from "react";
import type { Employee, Team } from "../types";
import { KpiRow, PageHero } from "../components/PageHero";
import { useLanguage } from "../i18n";
import { billingLabel } from "../../../lib/billing-labels";
import CustomSelect from "../../components/CustomSelect";

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
  const { t, language } = useLanguage();

  const emptyTeamForm = useMemo<TeamFormState>(
    () => ({
      name: "",
      lead: employees[0]?.name || "",
      memberIds: [],
      autoRouting: true
    }),
    [employees]
  );
  const [teamFormOpen, setTeamFormOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState<Team | null>(null);
  const [teamForm, setTeamForm] = useState<TeamFormState>(emptyTeamForm);
  const [savingTeam, setSavingTeam] = useState(false);
  const [teamError, setTeamError] = useState("");

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  function openCreateTeamForm() {
    setTeamError("");
    setTeamForm(emptyTeamForm);
    setTeamFormOpen(true);
  }

  function openEditTeamForm(team: Team) {
    setTeamError("");
    setTeamForm({
      id: team.id,
      name: team.name,
      lead: team.lead,
      memberIds: team.memberIds,
      autoRouting: team.routing === "تلقائي بالتساوي"
    });
    setTeamFormOpen(true);
  }

  function toggleMember(employeeId: string) {
    setTeamForm((current) => {
      const exists = current.memberIds.includes(employeeId);
      return {
        ...current,
        memberIds: exists ? current.memberIds.filter((id) => id !== employeeId) : [...current.memberIds, employeeId]
      };
    });
  }

  async function submitTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamForm.memberIds.length) {
      setTeamError(t("اختر عضوًا واحدًا على الأقل قبل إنشاء الفريق", "Choose at least one member before creating the team"));
      return;
    }
    setSavingTeam(true);
    setTeamError("");

    const response = await fetch(teamForm.id ? `/api/teams/${teamForm.id}` : "/api/teams", {
      method: teamForm.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: teamForm.name,
        lead: teamForm.lead,
        routing: teamForm.autoRouting ? "تلقائي بالتساوي" : "يدوي",
        memberIds: teamForm.memberIds
      })
    });
    const payload = (await response.json()) as { ok: boolean; error?: string };

    if (!payload.ok) {
      setTeamError(payload.error || t("تعذر حفظ الفريق", "Could not save the team"));
      setSavingTeam(false);
      return;
    }

    await onRefreshData();
    setSavingTeam(false);
    setTeamFormOpen(false);
  }

  function getMemberNames(team: Team) {
    return team.memberIds
      .map((id) => employeeById.get(id))
      .filter(Boolean) as Employee[];
  }

  return (
    <section className="page-stack">
      <PageHero
        eyebrow={t("الموظفون والفرق", "TEAM")}
        title={t("الفرق", "Teams")}
        description={t("وزّع المحادثات على فرق متخصصة مثل الدعم والمبيعات والشحن والفواتير.", "Route conversations to specialised teams such as support, sales, shipping and billing.")}
        chips={[t(`${teams.length} فريق`, `${teams.length} teams`)]}
        action={<button className="camp-hero-new" type="button" onClick={openCreateTeamForm}>＋ {t("إضافة فريق", "Add Team")}</button>}
      />
      <KpiRow items={[
        { tone: "t", label: t("عدد الفرق", "Teams"), value: teams.length },
        { tone: "g", label: t("إجمالي الأعضاء", "Total members"), value: teams.reduce((sum, team) => sum + team.memberIds.length, 0) },
        { tone: "o", label: t("فرق بلا مشرف", "Teams without a lead"), value: teams.filter((team) => !team.lead).length }
      ]} />
      <div className="panel">
        {(
          <div className="panel-body table-wrap">
            <p className="muted-copy">{t("استخدم الفرق لتنظيم الموظفين حسب مهامهم مثل الدعم، المبيعات، الشحن، والفواتير، وتحديد آلية توزيع المحادثات لكل فريق. المستخدمون وصلاحياتهم تُدار من صفحة «الموظفون والصلاحيات».", "Use teams to organize employees by function, such as support, sales, shipping, and billing, and to set the conversation routing method for each team. Users and their permissions are managed on the Employees & permissions page.")}</p>
            <table className="mobile-card-table">
              <thead><tr><th>{t("الفريق", "Team")}</th><th>{t("المشرف", "Lead")}</th><th>{t("الأعضاء", "Members")}</th><th>{t("التوزيع", "Routing")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.id}>
                    <td><b>{team.name}</b></td>
                    <td data-label={t("المشرف", "Lead")}>{team.lead || "-"}</td>
                    <td data-label={t("الأعضاء", "Members")}>{team.memberIds.length}</td>
                    <td data-label={t("التوزيع", "Routing")}>{routingLabel(team.routing, t)}</td>
                    <td className="row-actions" data-label={t("إجراء", "Action")}>
                      <button className="btn soft" type="button" onClick={() => setMembersOpen(team)}>{t("عرض", "View")}</button>
                      <button className="btn soft" type="button" onClick={() => openEditTeamForm(team)}>{t("تعديل", "Edit")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {teamFormOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setTeamFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ فريق", "Save Team")} onSubmit={submitTeam} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setTeamFormOpen(false)}>×</button>
              <h2>{teamForm.id ? t("تعديل فريق", "Edit Team") : t("إضافة فريق", "Add Team")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <div className="form-intro">
                <h3>{teamForm.id ? t("تحديث بيانات الفريق", "Update Team Details") : t("إنشاء فريق جديد", "Create a New Team")}</h3>
                <p>{t("أضف اسم الفريق والمشرف، ثم اختر الأعضاء وطريقة توزيع المحادثات.", "Add the team name and lead, then choose the members and the conversation routing method.")}</p>
              </div>
              <label>
                <span>{t("اسم الفريق", "Team Name")}</span>
                <input value={teamForm.name} onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))} required placeholder={t("مثال: الدعم، الشحن، الفواتير", "e.g. Support, Shipping, Billing")} />
              </label>
              <label>
                <span>{t("المشرف", "Lead")}</span>
                <CustomSelect
                  value={teamForm.lead}
                  onChange={(value) => setTeamForm((current) => ({ ...current, lead: value }))}
                  options={[{ value: "", label: t("بدون مشرف", "No lead") }, ...employees.map((employee) => ({ value: employee.name, label: employee.name }))]}
                />
              </label>
              <label className="check-row team-routing">
                <input
                  type="checkbox"
                  checked={teamForm.autoRouting}
                  onChange={(event) => setTeamForm((current) => ({ ...current, autoRouting: event.target.checked }))}
                />
                <span>{t("السماح بالتوزيع التلقائي لهذا الفريق.", "Allow automatic routing for this team.")}</span>
              </label>
              <div className="permissions-box">
                <div className="permissions-head">
                  <b>{t("أعضاء الفريق", "Team Members")}</b>
                  <span className="muted-inline">{t(`تم تحديد ${teamForm.memberIds.length} من أصل ${employees.length} موظف`, `${teamForm.memberIds.length} of ${employees.length} employees selected`)}</span>
                </div>
                <div className="member-picker">
                  {employees.map((employee) => (
                    <label key={employee.id} className="member-row">
                      <input type="checkbox" checked={teamForm.memberIds.includes(employee.id)} onChange={() => toggleMember(employee.id)} />
                      <span className="avatar small">{employee.initial}</span>
                      <b>{employee.name}</b>
                      <small>{employee.email}</small>
                    </label>
                  ))}
                </div>
              </div>
              {teamError ? <p className="form-error">{teamError}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setTeamFormOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={savingTeam}>{savingTeam ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}

      {membersOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setMembersOpen(null)}>
          <section className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("أعضاء الفريق", "Team Members")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setMembersOpen(null)}>×</button>
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
                    <em>{billingLabel(employee.role, language)}</em>
                  </div>
                ))}
                {!membersOpen.memberIds.length ? <p className="muted-copy">{t("لا يوجد أعضاء مضافين لهذا الفريق.", "No members have been added to this team.")}</p> : null}
              </div>
            </div>
            <footer className="modal-foot">
              <button className="btn soft close-red" type="button" onClick={() => setMembersOpen(null)}>{t("إغلاق", "Close")}</button>
              <button className="btn primary" type="button" onClick={() => { setMembersOpen(null); openEditTeamForm(membersOpen); }}>{t("تعديل الأعضاء", "Edit Members")}</button>
            </footer>
          </section>
        </div>
      ) : null}

    </section>
  );
}
