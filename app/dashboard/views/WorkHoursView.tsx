"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Team, WorkSchedule } from "../types";

type ScheduleForm = Omit<WorkSchedule, "id"> & { id?: string };

export default function WorkHoursView({
  onRefreshData,
  teams,
  workSchedules
}: {
  onRefreshData: () => Promise<void>;
  teams: Team[];
  workSchedules: WorkSchedule[];
}) {
  const emptyForm = useMemo<ScheduleForm>(() => ({ team: teams[0]?.name || "الدعم", days: "الأحد - الخميس", start: "9:00 ص", end: "6:00 م", status: "نشط", holidays: "غير مفعلة" }), [teams]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openForm(schedule?: WorkSchedule) {
    setForm(schedule ? { ...schedule } : emptyForm);
    setFormOpen(true);
  }

  async function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await fetch(form.id ? `/api/work-hours/${form.id}` : "/api/work-hours", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
  }

  async function deleteSchedule(schedule: WorkSchedule) {
    if (!window.confirm(`حذف جدول ${schedule.team}؟`)) return;
    await fetch(`/api/work-hours/${schedule.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head"><h2>ساعات العمل</h2><span /><button className="btn primary" type="button" onClick={() => openForm()}>إضافة جدول</button></div>
        <div className="panel-body table-wrap">
          <table>
            <thead><tr><th>الفريق</th><th>أيام العمل</th><th>بداية الدوام</th><th>نهاية الدوام</th><th>الحالة</th><th>العطل الرسمية</th><th>إجراء</th></tr></thead>
            <tbody>
              {workSchedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td>{schedule.team}</td><td>{schedule.days}</td><td>{schedule.start}</td><td>{schedule.end}</td>
                  <td><span className={schedule.status === "نشط" ? "state ok" : "state muted"}>{schedule.status}</span></td>
                  <td><span className={schedule.holidays === "مفعلة" ? "state ok" : "state muted"}>{schedule.holidays}</span></td>
                  <td className="row-actions"><button className="btn soft" type="button" onClick={() => openForm(schedule)}>تعديل</button><button className="btn danger" type="button" onClick={() => deleteSchedule(schedule)}>حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label="حفظ جدول عمل" onSubmit={submitSchedule} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setFormOpen(false)}>×</button><h2>{form.id ? "تعديل جدول" : "إضافة جدول"}</h2></header>
            <div className="account-modal-body form-grid">
              <label><span>الفريق</span><select value={form.team} onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))}>{teams.map((team) => <option key={team.id}>{team.name}</option>)}</select></label>
              <label><span>أيام العمل</span><input value={form.days} onChange={(event) => setForm((current) => ({ ...current, days: event.target.value }))} /></label>
              <div className="split-fields">
                <label><span>بداية الدوام</span><input value={form.start} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} /></label>
                <label><span>نهاية الدوام</span><input value={form.end} onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))} /></label>
              </div>
              <div className="split-fields">
                <label><span>الحالة</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as WorkSchedule["status"] }))}><option>نشط</option><option>متوقف</option></select></label>
                <label><span>العطل الرسمية</span><select value={form.holidays} onChange={(event) => setForm((current) => ({ ...current, holidays: event.target.value as WorkSchedule["holidays"] }))}><option>مفعلة</option><option>غير مفعلة</option></select></label>
              </div>
            </div>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>إلغاء</button><button className="btn primary" type="submit" disabled={saving}>{saving ? "جاري الحفظ" : "حفظ"}</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
