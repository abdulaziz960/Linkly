"use client";

import { useMemo, useState } from "react";
import type { Conversation, Employee, Team } from "../types";
import { statusLabel } from "../utils/conversation";
import { useLanguage } from "../i18n";

// Average reply gap: for every inbound message followed by an outbound
// reply, the time between them in minutes. Conversations with no
// completed in->out pair (still waiting, or agent-only notes) don't
// contribute a data point.
function collectReplyGapsMinutes(conversations: Conversation[]): number[] {
  const gaps: number[] = [];

  for (const conversation of conversations) {
    let lastInboundAt: number | null = null;
    for (const item of conversation.messages) {
      if (!item.createdAt) continue;
      const time = new Date(item.createdAt).getTime();
      if (Number.isNaN(time)) continue;

      if (item.direction === "in") {
        lastInboundAt = time;
      } else if (item.direction === "out" && lastInboundAt !== null) {
        gaps.push(Math.max(0, (time - lastInboundAt) / 60000));
        lastInboundAt = null;
      }
    }
  }

  return gaps;
}

function formatMinutes(minutes: number, t: (ar: string, en: string) => string) {
  if (minutes < 1) return t("أقل من دقيقة", "Less than a minute");
  const total = Math.round(minutes);
  if (total < 60) return t(`${total} د`, `${total}m`);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? t(`${hours} س ${rest} د`, `${hours}h ${rest}m`) : t(`${hours} س`, `${hours}h`);
}

function averageReplyLabel(conversations: Conversation[], t: (ar: string, en: string) => string) {
  const gaps = collectReplyGapsMinutes(conversations);
  if (!gaps.length) return "-";
  return formatMinutes(gaps.reduce((sum, value) => sum + value, 0) / gaps.length, t);
}

function longestOpenWaitLabel(conversations: Conversation[], t: (ar: string, en: string) => string) {
  const now = Date.now();
  let longest = 0;

  for (const conversation of conversations) {
    if (conversation.status === "closed") continue;
    const lastMessage = conversation.messages.at(-1);
    if (!lastMessage || lastMessage.direction !== "in" || !lastMessage.createdAt) continue;
    const time = new Date(lastMessage.createdAt).getTime();
    if (Number.isNaN(time)) continue;
    longest = Math.max(longest, (now - time) / 60000);
  }

  return longest ? formatMinutes(longest, t) : "-";
}

const heatmapDayLabels = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const heatmapBlockHours = [0, 3, 6, 9, 12, 15, 18, 21];

function heatmapDayDisplayLabel(dayLabel: string, t: (ar: string, en: string) => string) {
  const labels: Record<string, string> = {
    "الأحد": t("الأحد", "Sun"),
    "الإثنين": t("الإثنين", "Mon"),
    "الثلاثاء": t("الثلاثاء", "Tue"),
    "الأربعاء": t("الأربعاء", "Wed"),
    "الخميس": t("الخميس", "Thu"),
    "الجمعة": t("الجمعة", "Fri"),
    "السبت": t("السبت", "Sat")
  };
  return labels[dayLabel] ?? dayLabel;
}

function buildActivityHeatmap(conversations: Conversation[]) {
  const grid = heatmapDayLabels.map(() => heatmapBlockHours.map(() => 0));

  for (const conversation of conversations) {
    for (const item of conversation.messages) {
      if (!item.createdAt) continue;
      const time = new Date(item.createdAt).getTime();
      if (Number.isNaN(time)) continue;

      const date = new Date(time);
      const dayIndex = date.getDay();
      const blockIndex = Math.floor(date.getHours() / 3);
      grid[dayIndex][blockIndex] += 1;
    }
  }

  const max = Math.max(1, ...grid.flat());
  return { grid, max };
}

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDateInputValue() {
  return toLocalDateInputValue(new Date());
}

function daysAgoDateInputValue(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toLocalDateInputValue(date);
}

/**
 * Restricts each conversation's messages to the given date range and drops
 * conversations with no activity in that range, so every stat below reflects
 * the selected period instead of all-time data. Status/assignee fields are
 * the conversation's current values (this app doesn't keep a history log),
 * which is the best approximation available for a past period.
 */
function restrictConversationsToRange(conversations: Conversation[], from: string, to: string): Conversation[] {
  const fromTime = new Date(`${from}T00:00:00`).getTime();
  const toTime = new Date(`${to}T23:59:59.999`).getTime();
  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) return conversations;

  const restricted: Conversation[] = [];
  for (const conversation of conversations) {
    const messages = conversation.messages.filter((item) => {
      if (!item.createdAt) return false;
      const time = new Date(item.createdAt).getTime();
      return !Number.isNaN(time) && time >= fromTime && time <= toTime;
    });
    if (messages.length) restricted.push({ ...conversation, messages });
  }

  return restricted;
}

export default function ReportsView({
  conversations,
  employees,
  teams
}: {
  conversations: Conversation[];
  employees: Employee[];
  teams: Team[];
}) {
  const { t, language } = useLanguage();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [dateFrom, setDateFrom] = useState(() => daysAgoDateInputValue(6));
  const [dateTo, setDateTo] = useState(() => todayDateInputValue());
  const [appliedFrom, setAppliedFrom] = useState(() => daysAgoDateInputValue(6));
  const [appliedTo, setAppliedTo] = useState(() => todayDateInputValue());
  const [appliedPeriod, setAppliedPeriod] = useState(() => t("آخر 7 أيام", "Last 7 days"));

  const rangeConversations = useMemo(
    () => restrictConversationsToRange(conversations, appliedFrom, appliedTo),
    [conversations, appliedFrom, appliedTo]
  );

  const reportStats = useMemo(() => {
    const total = rangeConversations.length;
    const open = rangeConversations.filter((conversation) => conversation.status !== "closed").length;
    const closed = rangeConversations.filter((conversation) => conversation.status === "closed").length;
    const unassigned = rangeConversations.filter((conversation) => conversation.status === "unassigned").length;
    const windowExpired = rangeConversations.filter((conversation) => conversation.windowExpired).length;
    const withoutAttendance = rangeConversations.filter((conversation) => conversation.assignee === "بدون موظف").length;

    return [
      [t("إجمالي المحادثات", "Total Conversations"), String(total), t("خلال الفترة المحددة", "During the selected period")],
      [t("المحادثات المفتوحة", "Open Conversations"), String(open), total ? t(`${Math.round((open / total) * 100)}% من الإجمالي`, `${Math.round((open / total) * 100)}% of total`) : t("لا توجد بيانات", "No data")],
      [t("المحادثات المغلقة", "Closed Conversations"), String(closed), t("تم إنهاؤها بنجاح", "Successfully resolved")],
      [t("غير مسندة", "Unassigned"), String(unassigned), t("تحتاج توزيع", "Needs assignment")],
      [t("متوسط وقت الرد", "Average Reply Time"), averageReplyLabel(rangeConversations, t), t("محسوب من الرسائل الفعلية", "Calculated from actual messages")],
      [t("أطول انتظار حالي", "Longest Current Wait"), longestOpenWaitLabel(conversations, t), t("لمحادثة لم يُرد عليها بعد", "For a conversation not yet replied to")],
      [t("خارج أوقات الدوام", "Outside Business Hours"), String(windowExpired), t("انتهت نافذة الرد أو تحتاج قالب", "Reply window expired or needs a template")],
      [t("بدون حضور", "Unattended"), String(withoutAttendance), t("لا يوجد موظف مسند", "No employee assigned")]
    ];
  }, [rangeConversations, conversations, t]);

  const activityHeatmap = useMemo(() => buildActivityHeatmap(rangeConversations), [rangeConversations]);

  const employeeRows = useMemo(() => {
    return employees.map((employee) => {
      const assigned = rangeConversations.filter((conversation) => conversation.assignee === employee.name);
      const closed = assigned.filter((conversation) => conversation.status === "closed");
      const notAnswered = assigned.filter((conversation) => conversation.unread);

      return {
        employee,
        assigned: assigned.length,
        closed: closed.length,
        notAnswered: notAnswered.length,
        avgReply: averageReplyLabel(assigned, t)
      };
    });
  }, [rangeConversations, employees, t]);

  const teamRows = useMemo(() => {
    return teams.map((team) => {
      const memberNames = team.memberIds
        .map((memberId) => employees.find((employee) => employee.id === memberId)?.name)
        .filter(Boolean) as string[];
      const teamConversations = rangeConversations.filter((conversation) => memberNames.includes(conversation.assignee));
      const closed = teamConversations.filter((conversation) => conversation.status === "closed").length;
      const offHours = teamConversations.filter((conversation) => conversation.windowExpired).length;
      const withoutAttendance = teamConversations.filter((conversation) => conversation.assignee === "بدون موظف").length;

      return [team.name, String(teamConversations.length), averageReplyLabel(teamConversations, t), String(closed), String(offHours), String(withoutAttendance)];
    });
  }, [rangeConversations, employees, teams, t]);

  const selectedEmployeeConversations = selectedEmployee
    ? conversations.filter((conversation) => conversation.assignee === selectedEmployee.name)
    : [];

  function applyFilter() {
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
    setAppliedPeriod(dateFrom === dateTo ? dateFrom : `${dateFrom} ${t("إلى", "to")} ${dateTo}`);
  }

  function applyLastSevenDays() {
    const from = daysAgoDateInputValue(6);
    const to = todayDateInputValue();
    setDateFrom(from);
    setDateTo(to);
    setAppliedFrom(from);
    setAppliedTo(to);
    setAppliedPeriod(t("آخر 7 أيام", "Last 7 days"));
  }

  function exportEmployeesReport() {
    downloadCsv(
      "employee-performance.csv",
      [t("الموظف", "Employee"), t("محادثات مسندة له", "Assigned Conversations"), t("محادثات أغلقها", "Closed by them"), t("لم يرد عليها", "Not Answered"), t("متوسط الرد", "Average Reply")],
      employeeRows.map((row) => [row.employee.name, row.assigned, row.closed, row.notAnswered, row.avgReply])
    );
  }

  function exportTeamsReport() {
    downloadCsv(
      "team-performance.csv",
      [t("الفريق", "Team"), t("المحادثات", "Conversations"), t("متوسط الرد", "Average Reply"), t("مغلقة", "Closed"), t("رسائل خارج الدوام", "Messages Outside Hours"), t("بدون حضور", "Unattended")],
      teamRows
    );
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-body report-filter">
          <label>{t("من تاريخ", "From date")}<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>{t("إلى تاريخ", "To date")}<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <button className="btn primary" type="button" onClick={applyFilter}>{t("تطبيق الفلترة", "Apply Filter")}</button>
          <button className="btn soft" type="button" onClick={applyLastSevenDays}>{t("آخر 7 أيام", "Last 7 days")}</button>
          <span>{t("المؤشرات المعروضة حاليًا حسب بيانات المنصة الحالية", "Metrics shown are based on the platform's current data")} · {appliedPeriod}</span>
        </div>
      </div>
      <div className="stats-grid reports">
        {reportStats.map(([label, value, note]) => (
          <div className="stat" key={label}><span>{label}</span><b>{value}</b><small>{note}</small></div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-head"><h2>{t("حركة المحادثات", "Conversation Activity")} ({appliedPeriod})</h2></div>
        <div className="panel-body">
          <div className="activity-heatmap">
            <div className="activity-heatmap-hours">
              <span />
              {heatmapBlockHours.map((hour) => <span key={hour}>{hour}</span>)}
            </div>
            {heatmapDayLabels.map((dayLabel, dayIndex) => (
              <div className="activity-heatmap-row" key={dayLabel}>
                <span className="activity-heatmap-day">{heatmapDayDisplayLabel(dayLabel, t)}</span>
                {activityHeatmap.grid[dayIndex].map((count, blockIndex) => (
                  <span
                    key={blockIndex}
                    className="activity-heatmap-cell"
                    style={{ opacity: count ? 0.18 + 0.82 * (count / activityHeatmap.max) : 0.06 }}
                    title={t(`${count} رسالة`, `${count} messages`)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>{t("أداء الموظفين", "Employee Performance")}</h2><span /><button className="btn soft" type="button" onClick={exportEmployeesReport}>{t("تصدير", "Export")}</button></div>
        <div className="panel-body table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("الموظف", "Employee")}</th>
                <th>{t("محادثات مسندة له", "Assigned Conversations")}</th>
                <th>{t("محادثات أغلقها", "Closed by them")}</th>
                <th>{t("لم يرد عليها", "Not Answered")}</th>
                <th>{t("متوسط الرد", "Average Reply")}</th>
                <th>{t("إجراء", "Action")}</th>
              </tr>
            </thead>
            <tbody>
              {employeeRows.map((row) => (
                <tr key={row.employee.id}>
                  <td>{row.employee.name}</td>
                  <td>{row.assigned}</td>
                  <td>{row.closed}</td>
                  <td>{row.notAnswered}</td>
                  <td>{row.avgReply}</td>
                  <td><button className="btn soft" type="button" onClick={() => setSelectedEmployee(row.employee)}>{t("عرض", "View")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>{t("أداء الفرق", "Team Performance")}</h2><span /><button className="btn soft" type="button" onClick={exportTeamsReport}>{t("تصدير تقرير", "Export Report")}</button></div>
        <div className="panel-body table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("الفريق", "Team")}</th>
                <th>{t("المحادثات", "Conversations")}</th>
                <th>{t("متوسط الرد", "Average Reply")}</th>
                <th>{t("مغلقة", "Closed")}</th>
                <th>{t("رسائل خارج الدوام", "Messages Outside Hours")}</th>
                <th>{t("بدون حضور", "Unattended")}</th>
              </tr>
            </thead>
            <tbody>{teamRows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${row[0]}-${index}`}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>

      {selectedEmployee ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedEmployee(null)}>
          <section className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("محادثات الموظف", "Employee's Conversations")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setSelectedEmployee(null)}>×</button>
              <h2>{t("محادثات", "Conversations")} {selectedEmployee.name}</h2>
            </header>
            <div className="account-modal-body">
              <div className="member-list">
                {selectedEmployeeConversations.map((conversation) => (
                  <div className="member-card" key={conversation.id}>
                    <span className="avatar">{conversation.initial}</span>
                    <div>
                      <b>{conversation.customer}</b>
                      <span>{conversation.lastMessage}</span>
                    </div>
                    <em>{statusLabel(conversation.status, language)}</em>
                  </div>
                ))}
                {!selectedEmployeeConversations.length ? <p className="muted-copy">{t("لا توجد محادثات مسندة لهذا الموظف.", "No conversations assigned to this employee.")}</p> : null}
              </div>
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setSelectedEmployee(null)}>{t("إغلاق", "Close")}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function downloadCsv(fileName: string, header: Array<string | number>, rows: Array<Array<string | number>>) {
  const csv = [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
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
