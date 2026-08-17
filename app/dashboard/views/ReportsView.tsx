"use client";

import { useMemo, useState } from "react";
import type { Conversation, Employee, Team } from "../types";
import { statusLabel } from "../utils/conversation";

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

function formatMinutes(minutes: number) {
  if (minutes < 1) return "أقل من دقيقة";
  const total = Math.round(minutes);
  if (total < 60) return `${total} د`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} س ${rest} د` : `${hours} س`;
}

function averageReplyLabel(conversations: Conversation[]) {
  const gaps = collectReplyGapsMinutes(conversations);
  if (!gaps.length) return "-";
  return formatMinutes(gaps.reduce((sum, value) => sum + value, 0) / gaps.length);
}

function longestOpenWaitLabel(conversations: Conversation[]) {
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

  return longest ? formatMinutes(longest) : "-";
}

const heatmapDayLabels = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const heatmapBlockHours = [0, 3, 6, 9, 12, 15, 18, 21];

function buildActivityHeatmap(conversations: Conversation[]) {
  const grid = heatmapDayLabels.map(() => heatmapBlockHours.map(() => 0));
  const cutoff = Date.now() - 7 * 86400000;

  for (const conversation of conversations) {
    for (const item of conversation.messages) {
      if (!item.createdAt) continue;
      const time = new Date(item.createdAt).getTime();
      if (Number.isNaN(time) || time < cutoff) continue;

      const date = new Date(time);
      const dayIndex = date.getDay();
      const blockIndex = Math.floor(date.getHours() / 3);
      grid[dayIndex][blockIndex] += 1;
    }
  }

  const max = Math.max(1, ...grid.flat());
  return { grid, max };
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
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [dateFrom, setDateFrom] = useState("2026-06-08");
  const [dateTo, setDateTo] = useState("2026-06-14");
  const [appliedPeriod, setAppliedPeriod] = useState("آخر 7 أيام");

  const reportStats = useMemo(() => {
    const total = conversations.length;
    const open = conversations.filter((conversation) => conversation.status !== "closed").length;
    const closed = conversations.filter((conversation) => conversation.status === "closed").length;
    const unassigned = conversations.filter((conversation) => conversation.status === "unassigned").length;
    const windowExpired = conversations.filter((conversation) => conversation.windowExpired).length;
    const withoutAttendance = conversations.filter((conversation) => conversation.assignee === "بدون موظف").length;

    return [
      ["إجمالي المحادثات", String(total), "حسب البيانات الحالية"],
      ["المحادثات المفتوحة", String(open), total ? `${Math.round((open / total) * 100)}% من الإجمالي` : "لا توجد بيانات"],
      ["المحادثات المغلقة", String(closed), "تم إنهاؤها بنجاح"],
      ["غير مسندة", String(unassigned), "تحتاج توزيع"],
      ["متوسط وقت الرد", averageReplyLabel(conversations), "محسوب من الرسائل الفعلية"],
      ["أطول انتظار حالي", longestOpenWaitLabel(conversations), "لمحادثة لم يُرد عليها بعد"],
      ["خارج أوقات الدوام", String(windowExpired), "انتهت نافذة الرد أو تحتاج قالب"],
      ["أثناء العطل الرسمية", "0", "حسب إعدادات العطل"],
      ["بدون حضور", String(withoutAttendance), "لا يوجد موظف مسند"]
    ];
  }, [conversations]);

  const activityHeatmap = useMemo(() => buildActivityHeatmap(conversations), [conversations]);

  const employeeRows = useMemo(() => {
    return employees.map((employee) => {
      const assigned = conversations.filter((conversation) => conversation.assignee === employee.name);
      const closed = assigned.filter((conversation) => conversation.status === "closed");
      const notAnswered = assigned.filter((conversation) => conversation.unread);

      return {
        employee,
        assigned: assigned.length,
        closed: closed.length,
        notAnswered: notAnswered.length,
        avgReply: averageReplyLabel(assigned)
      };
    });
  }, [conversations, employees]);

  const teamRows = useMemo(() => {
    return teams.map((team) => {
      const memberNames = team.memberIds
        .map((memberId) => employees.find((employee) => employee.id === memberId)?.name)
        .filter(Boolean) as string[];
      const teamConversations = conversations.filter((conversation) => memberNames.includes(conversation.assignee));
      const closed = teamConversations.filter((conversation) => conversation.status === "closed").length;
      const offHours = teamConversations.filter((conversation) => conversation.windowExpired).length;
      const withoutAttendance = teamConversations.filter((conversation) => conversation.assignee === "بدون موظف").length;

      return [team.name, String(teamConversations.length), averageReplyLabel(teamConversations), String(closed), String(offHours), "0", String(withoutAttendance)];
    });
  }, [conversations, employees, teams]);

  const selectedEmployeeConversations = selectedEmployee
    ? conversations.filter((conversation) => conversation.assignee === selectedEmployee.name)
    : [];

  function applyFilter() {
    setAppliedPeriod(`${dateFrom} إلى ${dateTo}`);
  }

  function applyLastSevenDays() {
    setDateFrom("2026-06-16");
    setDateTo("2026-06-22");
    setAppliedPeriod("آخر 7 أيام");
  }

  function exportEmployeesReport() {
    downloadCsv(
      "employee-performance.csv",
      ["الموظف", "محادثات مسندة له", "محادثات أغلقها", "لم يرد عليها", "متوسط الرد"],
      employeeRows.map((row) => [row.employee.name, row.assigned, row.closed, row.notAnswered, row.avgReply])
    );
  }

  function exportTeamsReport() {
    downloadCsv(
      "team-performance.csv",
      ["الفريق", "المحادثات", "متوسط الرد", "مغلقة", "رسائل خارج الدوام", "رسائل العطل", "بدون حضور"],
      teamRows
    );
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-body report-filter">
          <label>من تاريخ<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>إلى تاريخ<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <button className="btn primary" type="button" onClick={applyFilter}>تطبيق الفلترة</button>
          <button className="btn soft" type="button" onClick={applyLastSevenDays}>آخر 7 أيام</button>
          <span>المؤشرات المعروضة حاليًا حسب بيانات المنصة الحالية · {appliedPeriod}</span>
        </div>
      </div>
      <div className="stats-grid reports">
        {reportStats.map(([label, value, note]) => (
          <div className="stat" key={label}><span>{label}</span><b>{value}</b><small>{note}</small></div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-head"><h2>حركة المحادثات (آخر 7 أيام)</h2></div>
        <div className="panel-body">
          <div className="activity-heatmap">
            <div className="activity-heatmap-hours">
              <span />
              {heatmapBlockHours.map((hour) => <span key={hour}>{hour}</span>)}
            </div>
            {heatmapDayLabels.map((dayLabel, dayIndex) => (
              <div className="activity-heatmap-row" key={dayLabel}>
                <span className="activity-heatmap-day">{dayLabel}</span>
                {activityHeatmap.grid[dayIndex].map((count, blockIndex) => (
                  <span
                    key={blockIndex}
                    className="activity-heatmap-cell"
                    style={{ opacity: count ? 0.18 + 0.82 * (count / activityHeatmap.max) : 0.06 }}
                    title={`${count} رسالة`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>أداء الموظفين</h2><span /><button className="btn soft" type="button" onClick={exportEmployeesReport}>تصدير</button></div>
        <div className="panel-body table-wrap">
          <table>
            <thead><tr><th>الموظف</th><th>محادثات مسندة له</th><th>محادثات أغلقها</th><th>لم يرد عليها</th><th>متوسط الرد</th><th>إجراء</th></tr></thead>
            <tbody>
              {employeeRows.map((row) => (
                <tr key={row.employee.id}>
                  <td>{row.employee.name}</td>
                  <td>{row.assigned}</td>
                  <td>{row.closed}</td>
                  <td>{row.notAnswered}</td>
                  <td>{row.avgReply}</td>
                  <td><button className="btn soft" type="button" onClick={() => setSelectedEmployee(row.employee)}>عرض</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>أداء الفرق</h2><span /><button className="btn soft" type="button" onClick={exportTeamsReport}>تصدير تقرير</button></div>
        <div className="panel-body table-wrap">
          <table>
            <thead><tr><th>الفريق</th><th>المحادثات</th><th>متوسط الرد</th><th>مغلقة</th><th>رسائل خارج الدوام</th><th>رسائل العطل</th><th>بدون حضور</th></tr></thead>
            <tbody>{teamRows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${row[0]}-${index}`}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>

      {selectedEmployee ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedEmployee(null)}>
          <section className="account-modal form-modal" role="dialog" aria-modal="true" aria-label="محادثات الموظف" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setSelectedEmployee(null)}>×</button>
              <h2>محادثات {selectedEmployee.name}</h2>
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
                    <em>{statusLabel(conversation.status)}</em>
                  </div>
                ))}
                {!selectedEmployeeConversations.length ? <p className="muted-copy">لا توجد محادثات مسندة لهذا الموظف.</p> : null}
              </div>
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setSelectedEmployee(null)}>إغلاق</button>
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
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
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
