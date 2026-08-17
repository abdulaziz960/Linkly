"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Team, WorkSchedule } from "../types";

type ScheduleForm = Omit<WorkSchedule, "id"> & { id?: string };

const weekDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const businessDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
const timePresets = [
  { label: "٩ ص - ٥ م", start: "09:00", end: "17:00" },
  { label: "٩ ص - ٦ م", start: "09:00", end: "18:00" },
  { label: "١٠ ص - ٦ م", start: "10:00", end: "18:00" },
  { label: "٢٤ ساعة", start: "00:00", end: "23:59" }
];

function parseDays(days: string) {
  if (!days.trim()) return [];
  if (days.trim() === "الأحد - الخميس") return businessDays;

  return days
    .split(/[،,]/)
    .map((day) => day.trim())
    .filter(Boolean);
}

function formatDays(days: string[]) {
  if (days.length === businessDays.length && businessDays.every((day) => days.includes(day))) {
    return "الأحد - الخميس";
  }

  return days.join("، ");
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  return hours * 60 + minutes;
}

function formatDuration(start: string, end: string) {
  const startMinutes = minutesFromTime(start);
  const endMinutes = minutesFromTime(end);

  if (startMinutes === null || endMinutes === null) return "";
  if (endMinutes <= startMinutes) return "وقت النهاية يجب أن يكون بعد البداية";

  const durationMinutes = endMinutes - startMinutes;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (!minutes) return `${hours} ساعة`;
  return `${hours} ساعة و ${minutes} دقيقة`;
}

export default function WorkHoursView({
  onRefreshData,
  teams,
  workSchedules
}: {
  onRefreshData: () => Promise<void>;
  teams: Team[];
  workSchedules: WorkSchedule[];
}) {
  const emptyForm = useMemo<ScheduleForm>(() => ({ team: teams[0]?.name || "", days: "", start: "", end: "", status: "نشط", holidays: "غير مفعلة" }), [teams]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const selectedDays = parseDays(form.days);
  const durationLabel = formatDuration(form.start, form.end);
  const hasInvalidTimeRange = Boolean(form.start && form.end && durationLabel.includes("يجب"));

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

  function updateDays(days: string[]) {
    setForm((current) => ({ ...current, days: formatDays(days) }));
  }

  function toggleDay(day: string) {
    const nextDays = selectedDays.includes(day)
      ? selectedDays.filter((selectedDay) => selectedDay !== day)
      : [...selectedDays, day];

    updateDays(weekDays.filter((weekDay) => nextDays.includes(weekDay)));
  }

  function applyTimePreset(start: string, end: string) {
    setForm((current) => ({ ...current, start, end }));
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head"><h2>ساعات العمل</h2><span /><button className="btn primary" type="button" onClick={() => openForm()}>إضافة جدول</button></div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">عند وجود جدول "نشط"، يرسل النظام تلقائيًا رد "خارج أوقات الدوام" لأول رسالة تصل من عميل خارج الأوقات المحددة (مرة واحدة يوميًا لكل محادثة). بدون أي جدول نشط، لا يوجد أي قيد على الاستقبال.</p>
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
              <label>
                <span>الفريق</span>
                <select value={form.team} onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))}>
                  {!teams.length ? <option value="">لا توجد فرق بعد</option> : null}
                  {teams.map((team) => <option key={team.id}>{team.name}</option>)}
                </select>
              </label>
              <label>
                <span>أيام العمل</span>
                <div className="day-picker">
                  {weekDays.map((day) => (
                    <button
                      className={selectedDays.includes(day) ? "active" : ""}
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <div className="day-picker-actions">
                  <button className="btn soft" type="button" onClick={() => updateDays(businessDays)}>الأحد - الخميس</button>
                  <button className="btn soft" type="button" onClick={() => updateDays(weekDays)}>كل الأيام</button>
                  <button className="btn soft" type="button" onClick={() => updateDays([])}>مسح</button>
                </div>
              </label>
              <div className="split-fields">
                <label>
                  <span>بداية الدوام</span>
                  <input className="time-input" type="time" value={form.start} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} />
                </label>
                <label>
                  <span>نهاية الدوام</span>
                  <input className="time-input" type="time" value={form.end} onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))} />
                </label>
              </div>
              <div className="time-presets">
                {timePresets.map((preset) => (
                  <button
                    className={form.start === preset.start && form.end === preset.end ? "active" : ""}
                    key={preset.label}
                    type="button"
                    onClick={() => applyTimePreset(preset.start, preset.end)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="split-fields">
                <label><span>الحالة</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as WorkSchedule["status"] }))}><option>نشط</option><option>متوقف</option></select></label>
                <label><span>العطل الرسمية</span><select value={form.holidays} onChange={(event) => setForm((current) => ({ ...current, holidays: event.target.value as WorkSchedule["holidays"] }))}><option>مفعلة</option><option>غير مفعلة</option></select></label>
              </div>
              <div className="work-hours-summary">
                <span>الملخص</span>
                <b>{form.days || "لم يتم اختيار أيام"}، من {form.start || "--:--"} إلى {form.end || "--:--"}</b>
                {durationLabel ? <small className={hasInvalidTimeRange ? "invalid" : ""}>{durationLabel}</small> : null}
              </div>
            </div>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>إلغاء</button><button className="btn primary" type="submit" disabled={saving || hasInvalidTimeRange}>{saving ? "جاري الحفظ" : "حفظ"}</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
