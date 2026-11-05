"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { stageDisplayLabel } from "../stage-labels";

type Day = { date: string; newCustomers: number; visitsBooked: number; visitsScheduled: number; attended: number };
type Stats = { days: Day[]; totals: Omit<Day, "date">; stages: Array<{ stage: string; count: number }> };
type Group = { name: string; booked: number; attended: number; noShow: number; cancelled: number; sold: number };
type Report = { from: string; to: string; totals: Omit<Group, "name"> & { byAi: number; byStaff: number }; attendanceRate: number | null; saleRate: number | null; byProject: Group[]; byEmployee: Group[]; inventory: Array<{ name: string; total: number; available: number; sold: number }> };

const card: React.CSSProperties = { border: "1px solid var(--line, #dfe7e5)", borderRadius: 14, background: "var(--surface, #fff)" };
const weekday = (date: string) => new Intl.DateTimeFormat("ar-SA", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const monthDay = (date: string) => new Intl.DateTimeFormat("ar-SA-u-nu-latn", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

/** Daily numbers: customers who arrived, visits booked, visits scheduled for the day and how many came. */
export default function LeadStatsTab() {
  const { t, language } = useLanguage();
  const lang = language === "en" ? "en" : "ar";
  const [range, setRange] = useState(14);
  const [stats, setStats] = useState<Stats | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const load = useCallback(async (days: number) => {
    const [response, reportResponse] = await Promise.all([
      fetch(`/api/crm/stats?days=${days}`, { cache: "no-store" }).catch(() => null),
      fetch(`/api/crm/visit-report?days=${days}`, { cache: "no-store" }).catch(() => null)
    ]);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; data?: Stats } | null;
    if (body?.ok && body.data) setStats(body.data);
    const reportBody = (await reportResponse?.json().catch(() => null)) as { ok?: boolean; data?: Report } | null;
    if (reportBody?.ok && reportBody.data) setReport(reportBody.data);
  }, []);
  useEffect(() => {
    void load(range);
  }, [load, range]);

  const today = stats?.days[stats.days.length - 1];
  const tile = (label: string, value: number | undefined, hint: string) => (
    <div style={{ ...card, padding: "12px 14px", display: "grid", gap: 2 }}>
      <small style={{ opacity: 0.7 }}>{label}</small>
      <b style={{ fontSize: 28, lineHeight: 1.2 }}>{value ?? 0}</b>
      <small style={{ opacity: 0.6 }}>{hint}</small>
    </div>
  );
  const maxDay = Math.max(1, ...(stats?.days.map((day) => Math.max(day.newCustomers, day.visitsBooked)) ?? [1]));
  const maxStage = Math.max(1, ...(stats?.stages.map((row) => row.count) ?? [1]));

  return (
    <div style={{ display: "grid", gap: 16, alignContent: "start", gridAutoRows: "max-content" }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>{t("اليوم", "Today")}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, gridAutoRows: "max-content" }}>
        {tile(t("عملاء جدد", "New customers"), today?.newCustomers, t("بدأوا التواصل اليوم", "started chatting today"))}
        {tile(t("حددوا موعد زيارة", "Booked a visit"), today?.visitsBooked, t("حجز تم اليوم", "booked today"))}
        {tile(t("زيارات اليوم", "Visits today"), today?.visitsScheduled, t("مجدولة لهذا اليوم", "scheduled for today"))}
        {tile(t("حضروا", "Came"), today?.attended, t("من زيارات اليوم", "of today's visits"))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{t("حسب اليوم", "By day")}</h3>
        <div className="pipeline-tabs" role="group" aria-label={t("الفترة", "Range")} style={{ marginTop: 0 }}>
          {[7, 14, 30].map((days) => <button key={days} type="button" aria-pressed={range === days} onClick={() => setRange(days)}>{t(`${days} يوم`, `${days} days`)}</button>)}
        </div>
      </div>
      {stats ? (
        <p style={{ margin: 0, opacity: 0.8 }}>
          {t(`في آخر ${range} يوم: ${stats.totals.newCustomers} عميل جديد، و${stats.totals.visitsBooked} موعد زيارة محجوز، و${stats.totals.attended} زيارة حضرها العملاء.`, `Last ${range} days: ${stats.totals.newCustomers} new customers, ${stats.totals.visitsBooked} visits booked, ${stats.totals.attended} visits attended.`)}
        </p>
      ) : null}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>{[t("اليوم", "Day"), t("عملاء جدد", "New customers"), t("حددوا موعدًا", "Booked a visit"), t("زيارات مجدولة", "Visits scheduled"), t("حضروا", "Came")].map((heading) => <th key={heading} style={{ textAlign: "start", padding: "8px 10px", fontWeight: 600, opacity: 0.75 }}>{heading}</th>)}</tr>
          </thead>
          <tbody>
            {[...(stats?.days ?? [])].reverse().map((day) => (
              <tr key={day.date} style={{ borderTop: "1px solid var(--line, #e6ecea)" }}>
                <td style={{ padding: "8px 10px" }}><b>{weekday(day.date)}</b> <small style={{ opacity: 0.65 }}>{monthDay(day.date)}</small></td>
                <td style={{ padding: "8px 10px", minWidth: 160 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}><b style={{ minWidth: 22 }}>{day.newCustomers}</b><span style={{ height: 8, borderRadius: 8, background: "#0f766e", width: `${(day.newCustomers / maxDay) * 100}%`, minWidth: day.newCustomers ? 6 : 0 }} /></span>
                </td>
                <td style={{ padding: "8px 10px", minWidth: 160 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}><b style={{ minWidth: 22 }}>{day.visitsBooked}</b><span style={{ height: 8, borderRadius: 8, background: "#7c3aed", width: `${(day.visitsBooked / maxDay) * 100}%`, minWidth: day.visitsBooked ? 6 : 0 }} /></span>
                </td>
                <td style={{ padding: "8px 10px" }}>{day.visitsScheduled}</td>
                <td style={{ padding: "8px 10px" }}>{day.attended}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: 0, fontSize: 16 }}>{t("تقرير الزيارات", "Visit report")}</h3>
      {report ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, gridAutoRows: "max-content" }}>
            {tile(t("زيارات محجوزة", "Booked"), report.totals.booked, t(`حجز الذكاء الاصطناعي ${report.totals.byAi} · الموظفون ${report.totals.byStaff}`, `AI ${report.totals.byAi} · staff ${report.totals.byStaff}`))}
            {tile(t("حضروا", "Came"), report.totals.attended, report.attendanceRate === null ? t("لا بيانات بعد", "no data yet") : t(`نسبة الحضور ${Math.round(report.attendanceRate * 100)}٪`, `attendance ${Math.round(report.attendanceRate * 100)}%`))}
            {tile(t("لم يحضروا", "No-show"), report.totals.noShow, t(`ملغاة ${report.totals.cancelled}`, `cancelled ${report.totals.cancelled}`))}
            {tile(t("اشتروا بعد الزيارة", "Bought after a visit"), report.totals.sold, report.saleRate === null ? t("لا بيانات بعد", "no data yet") : t(`من الحاضرين ${Math.round(report.saleRate * 100)}٪`, `of those who came ${Math.round(report.saleRate * 100)}%`))}
          </div>
          {report.inventory.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
                <thead>
                  <tr>{[t("المخزون حسب المشروع", "Stock by project"), t("الكلي", "Total"), t("المتاح", "Available"), t("المباع", "Sold")].map((heading) => <th key={heading} style={{ textAlign: "start", padding: "8px 10px", fontWeight: 600, opacity: 0.75 }}>{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {report.inventory.map((row) => (
                    <tr key={row.name} style={{ borderTop: "1px solid var(--line, #e6ecea)" }}>
                      <td style={{ padding: "8px 10px" }}><b>{row.name}</b></td>
                      <td style={{ padding: "8px 10px" }}>{row.total}</td>
                      <td style={{ padding: "8px 10px" }}>{row.available}</td>
                      <td style={{ padding: "8px 10px" }}>{row.sold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {[{ title: t("حسب المشروع", "By project"), rows: report.byProject }, { title: t("حسب الموظف", "By employee"), rows: report.byEmployee }].map((group) => (
            <div key={group.title} style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr>{[group.title, t("محجوزة", "Booked"), t("حضروا", "Came"), t("لم يحضروا", "No-show"), t("ملغاة", "Cancelled"), t("اشتروا", "Bought")].map((heading) => <th key={heading} style={{ textAlign: "start", padding: "8px 10px", fontWeight: 600, opacity: 0.75 }}>{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.name} style={{ borderTop: "1px solid var(--line, #e6ecea)" }}>
                      <td style={{ padding: "8px 10px" }}><b>{row.name}</b></td>
                      <td style={{ padding: "8px 10px" }}>{row.booked}</td>
                      <td style={{ padding: "8px 10px" }}>{row.attended}</td>
                      <td style={{ padding: "8px 10px" }}>{row.noShow}</td>
                      <td style={{ padding: "8px 10px" }}>{row.cancelled}</td>
                      <td style={{ padding: "8px 10px" }}>{row.sold}</td>
                    </tr>
                  ))}
                  {!group.rows.length ? <tr><td colSpan={6} style={{ padding: 12, opacity: 0.7 }}>{t("لا توجد زيارات في هذه الفترة.", "No visits in this period.")}</td></tr> : null}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}

      <h3 style={{ margin: 0, fontSize: 16 }}>{t("العملاء حسب المرحلة", "Customers by stage")}</h3>
      <div style={{ display: "grid", gap: 6 }}>
        {(stats?.stages ?? []).map((row) => (
          <div key={row.stage} style={{ display: "grid", gridTemplateColumns: "130px 1fr 40px", alignItems: "center", gap: 10 }}>
            <span>{stageDisplayLabel(row.stage, lang)}</span>
            <span style={{ height: 10, borderRadius: 10, background: "#e5ecea", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(row.count / maxStage) * 100}%`, background: "#0f766e" }} /></span>
            <b>{row.count}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
