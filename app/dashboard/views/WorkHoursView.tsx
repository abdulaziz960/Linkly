"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Team, WorkSchedule } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";

type ScheduleForm = Omit<WorkSchedule, "id"> & { id?: string };

const weekDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const businessDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
const dayLabelsEn: Record<string, string> = {
  "الأحد": "Sunday",
  "الإثنين": "Monday",
  "الثلاثاء": "Tuesday",
  "الأربعاء": "Wednesday",
  "الخميس": "Thursday",
  "الجمعة": "Friday",
  "السبت": "Saturday"
};
const timePresets = [
  { label: "9 ص - 5 م", labelEn: "9 AM - 5 PM", start: "09:00", end: "17:00" },
  { label: "9 ص - 6 م", labelEn: "9 AM - 6 PM", start: "09:00", end: "18:00" },
  { label: "10 ص - 6 م", labelEn: "10 AM - 6 PM", start: "10:00", end: "18:00" },
  { label: "24 ساعة", labelEn: "24 hours", start: "00:00", end: "23:59" }
];

function dayLabel(day: string, t: (ar: string, en: string) => string) {
  return t(day, dayLabelsEn[day] || day);
}

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

function formatDaysDisplay(days: string, t: (ar: string, en: string) => string) {
  if (!days.trim()) return "";
  if (days.trim() === "الأحد - الخميس") return `${dayLabel("الأحد", t)} - ${dayLabel("الخميس", t)}`;

  return days
    .split(/[،,]/)
    .map((day) => day.trim())
    .filter(Boolean)
    .map((day) => dayLabel(day, t))
    .join(t("، ", ", "));
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  return hours * 60 + minutes;
}

function formatDuration(start: string, end: string, t: (ar: string, en: string) => string) {
  const startMinutes = minutesFromTime(start);
  const endMinutes = minutesFromTime(end);

  if (startMinutes === null || endMinutes === null) return { text: "", invalid: false };
  if (endMinutes <= startMinutes) {
    return { text: t("وقت النهاية يجب أن يكون بعد البداية", "End time must be after the start time"), invalid: true };
  }

  const durationMinutes = endMinutes - startMinutes;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (!minutes) return { text: t(`${hours} ساعة`, `${hours} hour${hours === 1 ? "" : "s"}`), invalid: false };
  return { text: t(`${hours} ساعة و ${minutes} دقيقة`, `${hours}h ${minutes}m`), invalid: false };
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
  const { t } = useLanguage();
  const emptyForm = useMemo<ScheduleForm>(() => ({ team: teams[0]?.name || "", days: "", start: "", end: "", status: "نشط", holidays: "غير مفعلة" }), [teams]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const selectedDays = parseDays(form.days);
  const duration = formatDuration(form.start, form.end, t);
  const durationLabel = duration.text;
  const hasInvalidTimeRange = Boolean(form.start && form.end && duration.invalid);

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
    if (!window.confirm(t(`حذف جدول ${schedule.team}؟`, `Delete ${schedule.team}'s schedule?`))) return;
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

  const [offHoursLoaded, setOffHoursLoaded] = useState(false);
  const [offHoursEnabled, setOffHoursEnabled] = useState(false);
  const [offHoursMessage, setOffHoursMessage] = useState("");
  const [offHoursSaving, setOffHoursSaving] = useState(false);
  const [offHoursFeedback, setOffHoursFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/preferences")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || !payload?.ok) return;
        setOffHoursEnabled(Boolean(payload.data?.offHoursAutoReplyEnabled));
        setOffHoursMessage(payload.data?.offHoursAutoReplyMessage || "");
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setOffHoursLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveOffHours(next: { enabled: boolean; message: string }) {
    setOffHoursSaving(true);
    setOffHoursFeedback(null);
    try {
      const response = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offHoursAutoReplyEnabled: next.enabled, offHoursAutoReplyMessage: next.message })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || t("تعذر حفظ إعداد الرد خارج أوقات العمل.", "Could not save the off-hours auto-reply setting."));
      setOffHoursEnabled(next.enabled);
      setOffHoursMessage(next.message);
      setOffHoursFeedback({ type: "success", message: t("تم حفظ إعداد الرد خارج أوقات العمل.", "Off-hours auto-reply setting saved.") });
    } catch (error) {
      setOffHoursFeedback({ type: "error", message: error instanceof Error ? error.message : t("تعذر حفظ إعداد الرد خارج أوقات العمل.", "Could not save the off-hours auto-reply setting.") });
    } finally {
      setOffHoursSaving(false);
    }
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head"><h2>{t("ساعات العمل", "Work Hours")}</h2><span /><button className="btn primary" type="button" onClick={() => openForm()}>{t("إضافة جدول", "Add schedule")}</button></div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">{t('عند وجود جدول "نشط"، يرسل النظام تلقائيًا رد "خارج أوقات الدوام" لأول رسالة تصل من عميل خارج الأوقات المحددة (مرة واحدة يوميًا لكل محادثة). بدون أي جدول نشط، لا يوجد أي قيد على الاستقبال.', 'When there is an "active" schedule, the system automatically sends an "outside working hours" reply to the first message that arrives from a customer outside the set hours (once a day per conversation). Without any active schedule, there is no restriction on receiving messages.')}</p>
          <table className="mobile-card-table">
            <thead><tr><th>{t("الفريق", "Team")}</th><th>{t("أيام العمل", "Working days")}</th><th>{t("بداية الدوام", "Start time")}</th><th>{t("نهاية الدوام", "End time")}</th><th>{t("الحالة", "Status")}</th><th>{t("العطل الرسمية", "Public holidays")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
            <tbody>
              {workSchedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td>{schedule.team}</td><td data-label={t("أيام العمل", "Working days")}>{formatDaysDisplay(schedule.days, t)}</td><td data-label={t("بداية الدوام", "Start time")}>{schedule.start}</td><td data-label={t("نهاية الدوام", "End time")}>{schedule.end}</td>
                  <td data-label={t("الحالة", "Status")}><span className={schedule.status === "نشط" ? "state ok" : "state muted"}>{schedule.status === "نشط" ? t("نشط", "Active") : t("متوقف", "Stopped")}</span></td>
                  <td data-label={t("العطل الرسمية", "Public holidays")}><span className={schedule.holidays === "مفعلة" ? "state ok" : "state muted"}>{schedule.holidays === "مفعلة" ? t("مفعلة", "Enabled") : t("غير مفعلة", "Disabled")}</span></td>
                  <td className="row-actions" data-label={t("إجراء", "Action")}><button className="btn soft" type="button" onClick={() => openForm(schedule)}>{t("تعديل", "Edit")}</button><button className="btn danger" type="button" onClick={() => deleteSchedule(schedule)}>{t("حذف", "Delete")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>{t("الرد التلقائي خارج أوقات العمل", "Off-hours auto-reply")}</h2>
        </div>
        <div className="panel-body">
          <p>{t("عند التفعيل، يرسل النظام رسالتك أدناه تلقائيًا لأول رسالة تصل من عميل خارج جدول العمل النشط أعلاه (مرة واحدة يوميًا لكل محادثة). اتركها فارغة لاستخدام الرسالة الافتراضية.", "When enabled, the system automatically sends your message below to the first message that arrives from a customer outside the active schedule above (once a day per conversation). Leave it blank to use the default message.")}</p>
          {offHoursFeedback ? <p className={`automation-feedback ${offHoursFeedback.type}`} role="status">{offHoursFeedback.message}</p> : null}
          <label className="automation-switch">
            <input
              type="checkbox"
              checked={offHoursEnabled}
              disabled={!offHoursLoaded || offHoursSaving}
              aria-label={offHoursEnabled ? t("إيقاف الرد خارج أوقات العمل", "Disable the off-hours auto-reply") : t("تشغيل الرد خارج أوقات العمل", "Enable the off-hours auto-reply")}
              onChange={(event) => saveOffHours({ enabled: event.target.checked, message: offHoursMessage })}
            />
            <span>{offHoursEnabled ? t("مفعّل", "Enabled") : t("متوقف", "Disabled")}</span>
          </label>
          <label>
            <span>{t("نص الرسالة", "Message text")}</span>
            <textarea
              rows={3}
              value={offHoursMessage}
              disabled={!offHoursLoaded || offHoursSaving}
              placeholder={t("شكرًا لتواصلك معنا. فريقنا غير متوفر حاليًا خارج أوقات الدوام الرسمية، وسنرد على رسالتك في أقرب وقت ضمن ساعات العمل.", "Thanks for reaching out. Our team is currently unavailable outside official working hours, and we'll reply to your message as soon as possible during work hours.")}
              onChange={(event) => setOffHoursMessage(event.target.value)}
              onBlur={() => saveOffHours({ enabled: offHoursEnabled, message: offHoursMessage })}
            />
          </label>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("حفظ جدول عمل", "Save work schedule")} onSubmit={submitSchedule} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button><h2>{form.id ? t("تعديل جدول", "Edit schedule") : t("إضافة جدول", "Add schedule")}</h2></header>
            <div className="account-modal-body form-grid">
              <label>
                <span>{t("الفريق", "Team")}</span>
                <CustomSelect
                  value={form.team}
                  onChange={(value) => setForm((current) => ({ ...current, team: value }))}
                  options={
                    teams.length
                      ? teams.map((team) => ({ value: team.name, label: team.name }))
                      : [{ value: "", label: t("لا توجد فرق بعد", "No teams yet") }]
                  }
                />
              </label>
              <label>
                <span>{t("أيام العمل", "Working days")}</span>
                <div className="day-picker">
                  {weekDays.map((day) => (
                    <button
                      className={selectedDays.includes(day) ? "active" : ""}
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                    >
                      {dayLabel(day, t)}
                    </button>
                  ))}
                </div>
                <div className="day-picker-actions">
                  <button className="btn soft" type="button" onClick={() => updateDays(businessDays)}>{t("الأحد - الخميس", "Sunday - Thursday")}</button>
                  <button className="btn soft" type="button" onClick={() => updateDays(weekDays)}>{t("كل الأيام", "All days")}</button>
                  <button className="btn soft" type="button" onClick={() => updateDays([])}>{t("مسح", "Clear")}</button>
                </div>
              </label>
              <div className="split-fields">
                <label>
                  <span>{t("بداية الدوام", "Start time")}</span>
                  <input className="time-input" type="time" value={form.start} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} />
                </label>
                <label>
                  <span>{t("نهاية الدوام", "End time")}</span>
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
                    {t(preset.label, preset.labelEn)}
                  </button>
                ))}
              </div>
              <div className="split-fields">
                <label><span>{t("الحالة", "Status")}</span><CustomSelect value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value as WorkSchedule["status"] }))} options={[{ value: "نشط", label: t("نشط", "Active") }, { value: "متوقف", label: t("متوقف", "Stopped") }]} /></label>
                <label><span>{t("العطل الرسمية", "Public holidays")}</span><CustomSelect value={form.holidays} onChange={(value) => setForm((current) => ({ ...current, holidays: value as WorkSchedule["holidays"] }))} options={[{ value: "مفعلة", label: t("مفعلة", "Enabled") }, { value: "غير مفعلة", label: t("غير مفعلة", "Disabled") }]} /></label>
              </div>
              <div className="work-hours-summary">
                <span>{t("الملخص", "Summary")}</span>
                <b>{form.days ? formatDaysDisplay(form.days, t) : t("لم يتم اختيار أيام", "No days selected")}{t("، من", ", from")} {form.start || "--:--"} {t("إلى", "to")} {form.end || "--:--"}</b>
                {durationLabel ? <small className={hasInvalidTimeRange ? "invalid" : ""}>{durationLabel}</small> : null}
              </div>
            </div>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button><button className="btn primary" type="submit" disabled={saving || hasInvalidTimeRange}>{saving ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
