"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CustomSelect from "../../components/CustomSelect";
import { confirmDialog } from "../../../lib/ui-dialogs";
import { useLanguage } from "../i18n";

type Visit = { id: string; projectId: string; projectName: string; customerName: string; customerPhone: string; date: string; time: string; status: string; bookedBy: string; employee: string; notes: string };
type Day = { date: string; booked: number; limit: number; left: number };
type Project = { id: string; name: string; active: boolean };

const AI_BOOKER = "الذكاء الاصطناعي";
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  "محجوز": { bg: "#e0f2f1", fg: "#0f5f58" },
  "تم الحضور": { bg: "#dcfce7", fg: "#166534" },
  "لم يحضر": { bg: "#fef3c7", fg: "#92400e" },
  "ملغي": { bg: "#f1f5f9", fg: "#64748b" }
};
const field: React.CSSProperties = { width: "100%", minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", background: "var(--surface, #fff)", color: "inherit", font: "inherit" };
const card: React.CSSProperties = { border: "1px solid var(--line, #dfe7e5)", borderRadius: 14, background: "var(--surface, #fff)" };

const weekday = (date: string) => new Intl.DateTimeFormat("ar-SA", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const monthDay = (date: string) => new Intl.DateTimeFormat("ar-SA-u-nu-latn", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const addDays = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** The visit schedule: a week-style strip of days (how full each is), the visits grouped by day, and quick actions. */
export default function VisitsTab() {
  const { t } = useLanguage();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [limit, setLimit] = useState("10");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: "", time: "17:00", customerName: "", customerPhone: "", projectId: "" });
  const today = riyadhToday();

  const load = useCallback(async () => {
    const [visitsResponse, projectsResponse] = await Promise.all([
      fetch(`/api/crm/visits?from=${riyadhToday()}`, { cache: "no-store" }).catch(() => null),
      fetch("/api/crm/projects", { cache: "no-store" }).catch(() => null)
    ]);
    const body = (await visitsResponse?.json().catch(() => null)) as { ok?: boolean; data?: { visits: Visit[]; settings: { dailyLimit: number }; days: Day[] } } | null;
    if (body?.ok && body.data) {
      setVisits(body.data.visits);
      setDays(body.data.days);
      setLimit(String(body.data.settings.dailyLimit));
    }
    const projectsBody = (await projectsResponse?.json().catch(() => null)) as { ok?: boolean; data?: { projects: Project[] } } | null;
    if (projectsBody?.ok && projectsBody.data) setProjects(projectsBody.data.projects.filter((project) => project.active));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(method: string, payload: Record<string, unknown>) {
    setError("");
    setNotice("");
    const response = await fetch("/api/crm/visits", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!body?.ok) {
      setError(body?.error || t("تعذر تنفيذ العملية", "Couldn't complete the action"));
      return false;
    }
    await load();
    return true;
  }

  async function saveLimit() {
    if (await call("PUT", { dailyLimit: Number(limit) })) setNotice(t("تم حفظ حد الزيارات اليومي", "Daily visit limit saved"));
  }

  async function addVisit() {
    if (await call("POST", { ...form, projectId: form.projectId || undefined })) {
      setAdding(false);
      setForm({ date: "", time: "17:00", customerName: "", customerPhone: "", projectId: "" });
    }
  }

  const active = (visit: Visit) => visit.status === "محجوز" || visit.status === "تم الحضور";
  const stats = useMemo(() => {
    const weekEnd = addDays(today, 6);
    return {
      today: visits.filter((visit) => visit.date === today && active(visit)).length,
      tomorrow: visits.filter((visit) => visit.date === addDays(today, 1) && active(visit)).length,
      week: visits.filter((visit) => visit.date <= weekEnd && active(visit)).length,
      byAi: visits.filter((visit) => visit.bookedBy === AI_BOOKER && active(visit)).length
    };
  }, [visits, today]);

  const shown = selectedDay ? visits.filter((visit) => visit.date === selectedDay) : visits;
  const grouped = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const visit of shown) map.set(visit.date, [...(map.get(visit.date) ?? []), visit]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shown]);
  const heading = (date: string) => (date === today ? t("اليوم", "Today") : date === addDays(today, 1) ? t("غدًا", "Tomorrow") : weekday(date));

  const tile = (label: string, value: number, hint?: string) => (
    <div style={{ ...card, padding: "12px 14px", display: "grid", gap: 2 }}>
      <small style={{ opacity: 0.7 }}>{label}</small>
      <b style={{ fontSize: 26, lineHeight: 1.2 }}>{value}</b>
      {hint ? <small style={{ opacity: 0.6 }}>{hint}</small> : null}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16, alignContent: "start", gridAutoRows: "max-content" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, alignItems: "stretch", gridAutoRows: "max-content" }}>
        {tile(t("زيارات اليوم", "Visits today"), stats.today)}
        {tile(t("زيارات الغد", "Visits tomorrow"), stats.tomorrow)}
        {tile(t("خلال 7 أيام", "Next 7 days"), stats.week)}
        {tile(t("حجزها الذكاء الاصطناعي", "Booked by the AI"), stats.byAi, t("من القادمة", "of the upcoming"))}
        <div style={{ ...card, padding: "12px 14px", display: "grid", gap: 6 }}>
          <small style={{ opacity: 0.7 }}>{t("الحد الأقصى للزيارات في اليوم", "Maximum visits per day")}</small>
          <span style={{ display: "flex", gap: 8 }}>
            <input style={{ ...field, minHeight: 38, width: 80 }} inputMode="numeric" value={limit} onChange={(event) => setLimit(event.target.value.replace(/[^0-9]/g, ""))} aria-label={t("الحد الأقصى للزيارات في اليوم", "Maximum visits per day")} />
            <button type="button" className="btn" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => void saveLimit()} disabled={!limit}>{t("حفظ الحد", "Save limit")}</button>
          </span>
        </div>
      </div>
      {notice ? <p role="status" style={{ margin: 0 }}>{notice}</p> : null}
      {error && !adding ? <p role="alert" style={{ margin: 0, color: "#b42318" }}>{error}</p> : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{t("الأيام القادمة", "Coming days")}</h3>
        <button type="button" className="btn primary" onClick={() => { setError(""); setAdding(true); }}>{t("إضافة موعد", "Add visit")}</button>
      </div>
      <div role="group" aria-label={t("امتلاء الأيام القادمة", "How full the coming days are")} style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, alignItems: "stretch" }}>
        <button type="button" onClick={() => setSelectedDay("")} aria-pressed={!selectedDay} style={{ ...card, minWidth: 92, padding: "10px 12px", cursor: "pointer", font: "inherit", textAlign: "center", borderColor: !selectedDay ? "#0f766e" : undefined, background: !selectedDay ? "#e6f4f2" : undefined }}>
          <b>{t("الكل", "All")}</b><br /><small style={{ opacity: 0.7 }}>{visits.length}</small>
        </button>
        {days.map((day) => {
          const full = day.left === 0;
          const ratio = day.limit ? Math.min(1, day.booked / day.limit) : 0;
          const selected = selectedDay === day.date;
          return (
            <button key={day.date} type="button" onClick={() => setSelectedDay(selected ? "" : day.date)} aria-pressed={selected} style={{ ...card, minWidth: 98, padding: "10px 12px", cursor: "pointer", font: "inherit", textAlign: "center", display: "grid", gap: 4, borderColor: selected ? "#0f766e" : full ? "#f5b5b5" : undefined, background: selected ? "#e6f4f2" : full ? "#fff1f1" : undefined }}>
              <small style={{ opacity: 0.7 }}>{day.date === today ? t("اليوم", "Today") : weekday(day.date)}</small>
              <b style={{ fontSize: 13 }}>{monthDay(day.date)}</b>
              <span style={{ height: 6, borderRadius: 6, background: "#e5ecea", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${ratio * 100}%`, background: full ? "#dc2626" : ratio >= 0.7 ? "#f59e0b" : "#0f766e" }} /></span>
              <small>{full ? t("مكتمل", "Full") : `${day.booked} / ${day.limit}`}</small>
            </button>
          );
        })}
      </div>

      {grouped.map(([date, items]) => (
        <section key={date} aria-label={heading(date)} style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, display: "flex", gap: 8, alignItems: "baseline" }}>
            {heading(date)} <small style={{ fontWeight: 400, opacity: 0.65 }}>{monthDay(date)} · {items.filter(active).length} {t("زيارة", "visits")}</small>
          </h3>
          {items.map((visit) => {
            const style = STATUS_STYLE[visit.status] ?? STATUS_STYLE["محجوز"];
            return (
              <article key={visit.id} style={{ ...card, padding: "10px 14px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center", opacity: visit.status === "ملغي" ? 0.65 : 1 }}>
                <b style={{ fontSize: 20, minWidth: 64, textAlign: "center" }}><bdi dir="ltr">{visit.time}</bdi></b>
                <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <b>{visit.customerName || visit.customerPhone}</b>
                  <small style={{ opacity: 0.75 }}>
                    {visit.customerName ? <bdi dir="ltr">{visit.customerPhone}</bdi> : null}
                    {visit.projectName ? ` · ${visit.projectName}` : ""}
                  </small>
                  <small style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 999, background: style.bg, color: style.fg, fontWeight: 700 }}>{visit.status}</span>
                    <span style={{ padding: "2px 8px", borderRadius: 999, background: visit.bookedBy === AI_BOOKER ? "#ede9fe" : "#f1f5f9", color: visit.bookedBy === AI_BOOKER ? "#5b21b6" : "#475569" }}>{t("حجزه", "Booked by")}: {visit.bookedBy}</span>
                  </small>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {visit.status === "محجوز" ? (
                    <>
                      <button type="button" className="btn primary" onClick={() => void call("PATCH", { id: visit.id, status: "تم الحضور" })}>{t("حضر", "Came")}</button>
                      <button type="button" className="btn" onClick={() => void call("PATCH", { id: visit.id, status: "لم يحضر" })}>{t("لم يحضر", "No-show")}</button>
                      <button type="button" className="btn" onClick={() => void call("PATCH", { id: visit.id, status: "ملغي" })}>{t("إلغاء", "Cancel")}</button>
                    </>
                  ) : null}
                  <button type="button" className="btn" aria-label={t("حذف الموعد", "Delete visit")} onClick={async () => { if (await confirmDialog(t("حذف هذا الموعد؟", "Delete this visit?"))) await call("DELETE", { id: visit.id }); }}>{t("حذف", "Delete")}</button>
                </div>
              </article>
            );
          })}
        </section>
      ))}
      {!grouped.length ? (
        <div style={{ ...card, padding: 24, textAlign: "center", opacity: 0.75 }}>
          {selectedDay ? t("لا توجد زيارات في هذا اليوم.", "No visits on this day.") : t("لا توجد زيارات قادمة. اضغط «إضافة موعد» أو دع الذكاء الاصطناعي يحجز للعملاء.", "No upcoming visits. Press “Add visit”, or let the AI book for customers.")}
        </div>
      ) : null}

      {adding ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setAdding(false)}>
          <div className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("إضافة موعد", "Add visit")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setAdding(false)}>×</button>
              <h2>{t("إضافة موعد", "Add visit")}</h2>
            </header>
            <div className="account-modal-body" style={{ gridAutoRows: "max-content", alignContent: "start" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>{t("التاريخ", "Date")}
                  <input type="date" style={field} min={today} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
                </label>
                <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>{t("الوقت", "Time")}
                  <input type="time" style={field} value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} />
                </label>
              </div>
              <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>{t("اسم العميل", "Customer name")}
                <input style={field} value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} />
              </label>
              <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>{t("جوال العميل", "Customer phone")}
                <input dir="ltr" style={field} value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} placeholder="9665XXXXXXXX" />
              </label>
              <div style={{ display: "grid", gap: 6, fontWeight: 700 }}>{t("المشروع (اختياري)", "Project (optional)")}
                <CustomSelect ariaLabel={t("المشروع", "Project")} value={form.projectId} onChange={(projectId) => setForm({ ...form, projectId })} options={[{ value: "", label: t("بدون مشروع", "No project") }, ...projects.map((project) => ({ value: project.id, label: project.name }))]} />
              </div>
              {error ? <p role="alert" style={{ margin: 0, color: "#b42318" }}>{error}</p> : null}
            </div>
            <footer className="modal-foot">
              <button type="button" className="btn" onClick={() => setAdding(false)}>{t("إلغاء", "Cancel")}</button>
              <button type="button" className="btn primary" disabled={!form.date || !form.time || (!form.customerName.trim() && !form.customerPhone.trim())} onClick={() => void addVisit()}>{t("حجز الموعد", "Book visit")}</button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
