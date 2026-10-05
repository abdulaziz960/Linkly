import Link from "next/link";
import type { ActionLogRow } from "../../activity";
import { describeAction, relativeTime } from "../../activity";
import { formatNumber, parseTimestamp } from "../../utils";
import { channelNames, type ChannelNameKey } from "../../../channel-names";
import { statusLabel as ticketStatusLabel, priorityLabel } from "../../../../lib/support-labels";
import { Badge, EmptyState, type Tone } from "../../ds/primitives";
import Icon from "../../ds/Icon";

export type TicketBrief = { id: string; ticketNumber: string; subject: string; status: string; priority: string; assignedAgentName: string; updatedAt: string };
export type LogBrief = { id: string; at: string; source: string; level: string; message: string };

// Server-rendered, read-only sections of the client profile tabs.

export function ProfileChannels({ integrations }: { integrations: { id: string; provider: string; status: string; businessName: string }[] }) {
  if (integrations.length === 0) return <EmptyState icon="zap" title="لا توجد قنوات متصلة" description="لم يربط هذا العميل أي قناة بعد." />;
  return (
    <div className="ds-stat-grid">
      {integrations.map((integration) => {
        const connected = integration.status === "connected";
        return (
          <div className="ds-stat" key={integration.id}>
            <div className="ds-stat-top">
              <strong>{channelNames[integration.provider as ChannelNameKey]?.ar ?? integration.provider}</strong>
              <Badge tone={connected ? "success" : integration.status === "pending" ? "warning" : "neutral"}>{connected ? "متصلة" : integration.status === "pending" ? "قيد الإعداد" : "غير متصلة"}</Badge>
            </div>
            <span className="ds-cell-sub">{integration.businessName || "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

function Meter({ label, value, limit, unit }: { label: string; value: number; limit: number; unit: string }) {
  const pct = limit > 0 ? Math.round((value / limit) * 100) : 0;
  return (
    <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong>{label}</strong>
        <span style={{ fontWeight: 800 }}>{formatNumber(value)} من {formatNumber(limit)} {unit}</span>
      </div>
      <div className="ds-meter" data-tone={pct >= 100 ? "danger" : pct >= 80 ? "warning" : undefined} role="img" aria-label={`${label}: ${pct}%`}><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
      {pct >= 100 ? <Badge tone="danger">وصل إلى الحد الأقصى ({formatNumber(pct)}%)</Badge> : pct >= 80 ? <Badge tone="warning">اقترب من الحد ({formatNumber(pct)}%)</Badge> : <span className="ds-cell-sub">{formatNumber(pct)}% من الحد</span>}
    </div>
  );
}

export function ProfileUsage({ employeeCount, employeeLimit, campaignBalance, extraUsers, extraAmount }: { employeeCount: number; employeeLimit: number; campaignBalance: number; extraUsers: number; extraAmount: number }) {
  return (
    <>
      <div className="ds-grid-2">
        <Meter label="المستخدمون" value={employeeCount} limit={employeeLimit} unit="مستخدم" />
        <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 10 }}>
          <strong>رصيد رسائل الحملات</strong>
          <span style={{ fontSize: 26, fontWeight: 900 }}>{formatNumber(campaignBalance)}</span>
          <span className="ds-cell-sub">رسالة متاحة.</span>
        </div>
      </div>
      {extraUsers ? <p className="ds-note" style={{ marginTop: 14 }}><Icon name="alert" size={16} /><span>العميل تجاوز حد الباقة بـ {formatNumber(extraUsers)} مستخدم، ويُضاف إلى فاتورته {formatNumber(extraAmount)} ر.س شهريًا.</span></p> : null}
      <p className="ds-note" style={{ marginTop: 14 }}><Icon name="info" size={16} /><span>لمقارنة استهلاك الرسائل والذكاء الاصطناعي بين كل العملاء افتح صفحة <Link href="/linkly-admin007/usage" style={{ textDecoration: "underline" }}>الاستخدام</Link>.</span></p>
    </>
  );
}

export function ProfileConversations({ byChannel, byStatus }: { byChannel: { key: string; count: number }[]; byStatus: { key: string; count: number }[] }) {
  if (byStatus.reduce((sum, row) => sum + row.count, 0) === 0) return <EmptyState icon="message" title="لا توجد محادثات" description="لم تصل أي محادثة إلى هذا الحساب بعد." />;
  return (
    <>
      <div className="ds-grid-2">
        <div className="ds-card ds-card-pad"><div className="ds-card-head"><h3>حسب القناة</h3></div><ul className="ds-legend">{byChannel.map((row) => <li key={row.key}><span>{channelNames[row.key as ChannelNameKey]?.ar ?? row.key}</span><b>{formatNumber(row.count)}</b></li>)}</ul></div>
        <div className="ds-card ds-card-pad"><div className="ds-card-head"><h3>حسب الحالة</h3></div><ul className="ds-legend">{byStatus.map((row) => <li key={row.key}><span>{row.key}</span><b>{formatNumber(row.count)}</b></li>)}</ul></div>
      </div>
      <p className="ds-note" style={{ marginTop: 14 }}><Icon name="shield" size={16} /><span>لا يُعرض نص رسائل العملاء هنا حمايةً لخصوصية عملاء العميل.</span></p>
    </>
  );
}

export function ProfileTickets({ tickets, now }: { tickets: TicketBrief[]; now: number }) {
  if (tickets.length === 0) return <EmptyState icon="lifebuoy" title="لا توجد تذاكر" description="لم يفتح هذا العميل أي تذكرة دعم." />;
  return (
    <>
      <div className="ds-table-wrap">
        <table className="ds-table">
          <thead><tr><th scope="col">الرقم</th><th scope="col">الموضوع</th><th scope="col">الحالة</th><th scope="col">الأولوية</th><th scope="col">المسؤول</th><th scope="col">آخر تحديث</th></tr></thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td data-cell="main"><bdi dir="ltr">{ticket.ticketNumber}</bdi></td>
                <td data-label="الموضوع">{ticket.subject}</td>
                <td data-label="الحالة"><Badge tone={ticket.status === "resolved" || ticket.status === "closed" ? "success" : "info"}>{ticketStatusLabel(ticket.status, "ar")}</Badge></td>
                <td data-label="الأولوية"><Badge tone={ticket.priority === "urgent" ? "danger" : ticket.priority === "high" ? "warning" : "neutral"}>{priorityLabel(ticket.priority, "ar")}</Badge></td>
                <td data-label="المسؤول">{ticket.assignedAgentName || "غير مسند"}</td>
                <td data-label="آخر تحديث"><span className="ds-cell-sub">{relativeTime(parseTimestamp(ticket.updatedAt) || Date.parse(ticket.updatedAt), now)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 12 }}><Link className="ds-btn" data-variant="outline" href="/linkly-admin007/support">فتح صندوق الدعم</Link></p>
    </>
  );
}

export function ProfileTimeline({ logs, actions, now, tenantId }: { logs: LogBrief[]; actions: ActionLogRow[]; now: number; tenantId: string }) {
  const system = logs.map((log) => ({ id: `l-${log.id}`, at: log.at, title: log.message, meta: log.source, tone: (log.level === "خطأ" ? "danger" : log.level === "تنبيه" ? "warning" : "info") as Tone, admin: false }));
  const admin = actions.map(describeAction).map((view) => ({ id: `a-${view.id}`, at: view.at, title: view.title, meta: view.details.map((detail) => `${detail.label}: ${detail.value}`).join(" · "), tone: view.tone as Tone, admin: true }));
  const items = [...system, ...admin].sort((a, b) => parseTimestamp(b.at) - parseTimestamp(a.at)).slice(0, 80);
  if (items.length === 0) return <EmptyState icon="scroll" title="لا يوجد سجل نشاط" description="ستظهر هنا أحداث النظام وإجراءات فريق الإدارة على هذا العميل." />;
  return (
    <div className="ds-card ds-card-pad">
      <ul className="ds-feed">
        {items.map((item) => (
          <li key={item.id}>
            <Badge tone={item.tone}>{item.admin ? "إداري" : "نظام"}</Badge>
            <div className="ds-feed-body"><strong>{item.title}</strong><span>{item.meta}</span></div>
            <span className="ds-cell-sub">{relativeTime(parseTimestamp(item.at), now)}</span>
          </li>
        ))}
      </ul>
      <p style={{ marginTop: 12 }}><Link className="ds-btn" data-variant="outline" href={`/linkly-admin007/logs?client=${tenantId}`}>السجل الكامل</Link></p>
    </div>
  );
}
