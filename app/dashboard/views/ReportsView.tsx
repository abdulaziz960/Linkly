"use client";

import { useMemo, useState } from "react";
import type { Conversation, Employee, Team } from "../types";
import { statusLabel } from "../utils/conversation";

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
      ["متوسط الرد", "2:14", "دقيقة"],
      ["متوسط تقييم العملاء", "4.7", "من 5"],
      ["خارج أوقات الدوام", String(windowExpired), "انتهت نافذة الرد أو تحتاج قالب"],
      ["أثناء العطل الرسمية", "0", "حسب إعدادات العطل"],
      ["بدون حضور", String(withoutAttendance), "لا يوجد موظف مسند"]
    ];
  }, [conversations]);

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
        avgReply: assigned.length ? "2:10 دقيقة" : "-"
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
      const satisfaction = teamConversations.length ? "95%" : "-";

      return [team.name, String(teamConversations.length), teamConversations.length ? "2:20" : "-", String(closed), String(offHours), "0", String(withoutAttendance), satisfaction];
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
      ["الفريق", "المحادثات", "متوسط الرد", "مغلقة", "رسائل خارج الدوام", "رسائل العطل", "بدون حضور", "رضا العملاء"],
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
            <thead><tr><th>الفريق</th><th>المحادثات</th><th>متوسط الرد</th><th>مغلقة</th><th>رسائل خارج الدوام</th><th>رسائل العطل</th><th>بدون حضور</th><th>رضا العملاء</th></tr></thead>
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
