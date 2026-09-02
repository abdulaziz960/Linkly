"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Employee, Team } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import {
  employeeRoleLabel,
  employeeStatusLabel,
  formatPermissions,
  parsePermissions,
  permissionLabel,
  permissionOptions
} from "./EmployeesView";

function routingLabel(routing: string, t: (ar: string, en: string) => string) {
  if (routing === "تلقائي بالتساوي") return t("تلقائي بالتساوي", "Automatic (even split)");
  return t("يدوي", "Manual");
}

function formatLoginDate(iso: string, language: "ar" | "en") {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh"
  }).format(date);
}

type TeamFormState = {
  id?: string;
  name: string;
  lead: string;
  memberIds: string[];
  autoRouting: boolean;
};

type EmployeeFormState = {
  id?: string;
  name: string;
  email: string;
  role: Employee["role"];
  status: Employee["status"];
  permissions: string[];
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
  const [activeTab, setActiveTab] = useState<"users" | "teams">("users");

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

  const emptyEmployeeForm = useMemo<EmployeeFormState>(
    () => ({
      name: "",
      email: "",
      role: "موظف دعم",
      status: "متصل",
      permissions: ["المحادثات"]
    }),
    []
  );
  const [employeeFormOpen, setEmployeeFormOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>(emptyEmployeeForm);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [employeeError, setEmployeeError] = useState("");
  const [employeeNotice, setEmployeeNotice] = useState("");
  const [activationUrl, setActivationUrl] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const teamsByEmployeeId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const team of teams) {
      for (const memberId of team.memberIds) {
        map.set(memberId, [...(map.get(memberId) || []), team.name]);
      }
    }
    return map;
  }, [teams]);

  const filteredEmployees = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      employee.name.toLowerCase().includes(query) || employee.email.toLowerCase().includes(query)
    );
  }, [employees, userSearch]);

  const allSelected = filteredEmployees.length > 0 && filteredEmployees.every((employee) => selectedIds.has(employee.id));

  function toggleSelectAll() {
    setSelectedIds(() => {
      if (allSelected) return new Set();
      return new Set(filteredEmployees.map((employee) => employee.id));
    });
  }

  function toggleSelect(employeeId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

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

  function openCreateEmployeeForm() {
    setEmployeeError("");
    setEmployeeNotice("");
    setActivationUrl("");
    setEmployeeForm(emptyEmployeeForm);
    setEmployeeFormOpen(true);
  }

  function openEditEmployeeForm(employee: Employee) {
    setOpenMenuId("");
    setEmployeeError("");
    setEmployeeNotice("");
    setActivationUrl("");
    setEmployeeForm({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      status: employee.status,
      permissions: parsePermissions(employee.permissions)
    });
    setEmployeeFormOpen(true);
  }

  function toggleEmployeePermission(permission: string) {
    setEmployeeForm((current) => {
      const exists = current.permissions.includes(permission);
      const permissions = exists
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission];
      return { ...current, permissions: permissions.length ? permissions : [permission] };
    });
  }

  function toggleAllEmployeePermissions() {
    setEmployeeForm((current) => ({
      ...current,
      permissions: current.permissions.length === permissionOptions.length ? ["المحادثات"] : permissionOptions
    }));
  }

  async function submitEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingEmployee(true);
    setEmployeeError("");

    const response = await fetch(employeeForm.id ? `/api/employees/${employeeForm.id}` : "/api/employees", {
      method: employeeForm.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: employeeForm.name,
        email: employeeForm.email,
        role: employeeForm.role,
        status: employeeForm.status,
        permissions: formatPermissions(employeeForm.permissions)
      })
    });
    const payload = (await response.json()) as {
      ok: boolean;
      error?: string;
      data?: Employee & { inviteDelivery?: { message?: string; activationUrl?: string } };
    };

    if (!payload.ok) {
      setEmployeeError(payload.error || t("تعذر حفظ الموظف", "Could not save the employee"));
      setSavingEmployee(false);
      return;
    }

    await onRefreshData();
    setSavingEmployee(false);
    if (employeeForm.id) {
      setEmployeeFormOpen(false);
      return;
    }

    setEmployeeNotice(payload.data?.inviteDelivery?.message || t("تم حفظ الموظف.", "Employee saved."));
    setActivationUrl(payload.data?.inviteDelivery?.activationUrl || "");
  }

  async function deleteEmployee(employee: Employee) {
    setOpenMenuId("");
    if (!window.confirm(t(`حذف الموظف ${employee.name}؟`, `Delete employee ${employee.name}?`))) return;
    await fetch(`/api/employees/${employee.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="panel user-management-panel">
        <div className="user-management-head">
          <div className="section-tabs user-management-tabs">
            <button className={activeTab === "users" ? "section-tab active" : "section-tab"} type="button" onClick={() => setActiveTab("users")}>{t("المستخدمون", "Users")}</button>
            <button className={activeTab === "teams" ? "section-tab active" : "section-tab"} type="button" onClick={() => setActiveTab("teams")}>{t("الفرق", "Teams")}</button>
          </div>
          {activeTab === "users" ? (
            <div className="user-management-actions">
              <label className="user-search">
                <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4 4" /></svg>
                <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder={t("بحث...", "Search...")} />
              </label>
              <button className="btn primary" type="button" onClick={openCreateEmployeeForm}>{t("إضافة مستخدم", "Add User")}</button>
            </div>
          ) : (
            <div className="user-management-actions">
              <button className="btn primary" type="button" onClick={openCreateTeamForm}>{t("إضافة فريق", "Add Team")}</button>
            </div>
          )}
        </div>

        {activeTab === "users" ? (
          <div className="panel-body table-wrap">
            <table className="user-management-table">
              <thead>
                <tr>
                  <th className="user-check-col"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label={t("تحديد الكل", "Select all")} /></th>
                  <th>{t("المستخدم", "User")}</th>
                  <th>{t("الحالة", "Online Status")}</th>
                  <th>{t("البريد الإلكتروني", "Email")}</th>
                  <th>{t("الدور", "Role")}</th>
                  <th>{t("الفرق", "Teams")}</th>
                  <th>{t("إجراء", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => {
                  const isExpanded = expandedEmployeeId === employee.id;
                  const employeeTeams = teamsByEmployeeId.get(employee.id) || [];
                  return (
                    <>
                      <tr key={employee.id} className={isExpanded ? "is-expanded" : ""}>
                        <td className="user-check-col"><input type="checkbox" checked={selectedIds.has(employee.id)} onChange={() => toggleSelect(employee.id)} aria-label={employee.name} /></td>
                        <td>
                          <div className="user-cell">
                            <span className="avatar small">{employee.initial}</span>
                            <b>{employee.name}</b>
                          </div>
                        </td>
                        <td><span className={employee.status === "متصل" ? "state ok" : employee.status === "مشغول" ? "state warn" : "state muted"}>{employeeStatusLabel(employee.status, t)}</span></td>
                        <td>{employee.email}</td>
                        <td>{employeeRoleLabel(employee.role, t)}</td>
                        <td>{employeeTeams.length ? employeeTeams.join("، ") : "-"}</td>
                        <td className="user-actions-col">
                          <button
                            className="icon-btn user-expand-btn"
                            type="button"
                            aria-expanded={isExpanded}
                            aria-label={t("عرض التفاصيل", "Show details")}
                            onClick={() => setExpandedEmployeeId(isExpanded ? "" : employee.id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? "rotate(180deg)" : undefined }}><path d="m6 9 6 6 6-6" /></svg>
                          </button>
                          <div className="user-menu-wrap">
                            <button className="icon-btn" type="button" aria-label={t("خيارات", "More options")} onClick={() => setOpenMenuId(openMenuId === employee.id ? "" : employee.id)}>
                              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
                            </button>
                            {openMenuId === employee.id ? (
                              <div className="user-menu">
                                <button type="button" onClick={() => openEditEmployeeForm(employee)}>{t("تعديل", "Edit")}</button>
                                <button type="button" className="danger" onClick={() => deleteEmployee(employee)}>{t("حذف", "Delete")}</button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="user-detail-row">
                          <td colSpan={7}>
                            <dl className="user-detail-grid">
                              <div><dt>{t("آخر IP دخول", "Last Login IP")}</dt><dd dir="ltr">{employee.lastLoginIp || "-"}</dd></div>
                              <div><dt>{t("تاريخ آخر دخول", "Last Login Date")}</dt><dd dir="ltr">{formatLoginDate(employee.lastLoginAt || "", language) || "-"}</dd></div>
                              <div><dt>{t("الحالة", "Status")}</dt><dd>{employee.hasAccount ? <span className="state ok">{t("مفعّل", "Activated")}</span> : <span className="state warn">{t("بانتظار التفعيل", "Pending activation")}</span>}</dd></div>
                            </dl>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
                {!filteredEmployees.length ? (
                  <tr><td colSpan={7}><div className="campaign-empty"><strong>{t("لا يوجد مستخدمون مطابقون", "No matching users")}</strong></div></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
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
                      <button className="btn soft" type="button" onClick={() => openEditTeamForm(team)}>{t("تعديل", "Edit")}</button>
                      <button className="btn danger" type="button" onClick={() => deleteTeam(team)}>{t("حذف", "Delete")}</button>
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
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setTeamFormOpen(false)}>×</button>
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
              <button className="btn primary" type="button" onClick={() => { setMembersOpen(null); openEditTeamForm(membersOpen); }}>{t("تعديل الأعضاء", "Edit Members")}</button>
            </footer>
          </section>
        </div>
      ) : null}

      {employeeFormOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setEmployeeFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ موظف", "Save employee")} onSubmit={submitEmployee} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setEmployeeFormOpen(false)}>×</button>
              <h2>{employeeForm.id ? t("تعديل موظف", "Edit Employee") : t("إضافة مستخدم", "Add User")}</h2>
            </header>
            <div className="account-modal-body form-grid">
              <label>
                <span>{t("اسم الموظف", "Employee Name")}</span>
                <input value={employeeForm.name} onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>{t("البريد الإلكتروني", "Email")}</span>
                <input type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm((current) => ({ ...current, email: event.target.value }))} required />
              </label>
              <div className="split-fields">
                <label>
                  <span>{t("الدور", "Role")}</span>
                  <CustomSelect
                    value={employeeForm.role}
                    onChange={(value) => setEmployeeForm((current) => ({ ...current, role: value as Employee["role"] }))}
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
                    value={employeeForm.status}
                    onChange={(value) => setEmployeeForm((current) => ({ ...current, status: value as Employee["status"] }))}
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
                  <button className="btn soft" type="button" onClick={toggleAllEmployeePermissions}>
                    {employeeForm.permissions.length === permissionOptions.length ? t("إلغاء تحديد الكل", "Deselect All") : t("تحديد الكل", "Select All")}
                  </button>
                </div>
                <div className="checkbox-grid">
                  {permissionOptions.map((permission) => (
                    <label key={permission} className="check-row">
                      <input
                        type="checkbox"
                        checked={employeeForm.permissions.includes(permission)}
                        onChange={() => toggleEmployeePermission(permission)}
                      />
                      <span>{permissionLabel(permission, t)}</span>
                    </label>
                  ))}
                </div>
              </div>
              {employeeError ? <p className="form-error">{employeeError}</p> : null}
              {employeeNotice ? <p className="form-success">{employeeNotice}</p> : null}
              {activationUrl ? (
                <a className="activation-link" href={activationUrl} target="_blank" rel="noreferrer">
                  {t("فتح رابط التفعيل", "Open Activation Link")}
                </a>
              ) : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setEmployeeFormOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="submit" disabled={savingEmployee}>{savingEmployee ? t("جاري الحفظ", "Saving...") : t("حفظ", "Save")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
