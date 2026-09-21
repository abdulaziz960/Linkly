"use client";

import { useEffect, useMemo, useState } from "react";
import type { Conversation } from "../types";
import { useLanguage } from "../i18n";
import { ACTIVE_WAIT_MAX_DAYS, countMessagesToday, getWaitingConversations, SLA_MINUTES } from "../../../lib/operations-metrics";

type OperationsProps = {
  conversations: Conversation[];
  onOpenConversation: (id: string) => void;
  onRefreshData: () => Promise<void>;
};

// A live "right now" screen, distinct from Reports (which is entirely
// date-range/historical - no auto-refresh, no unified landing view, per
// the pre-launch audit's operations-gap finding). The tick only
// recomputes wait durations against the CURRENT conversations prop - it
// never itself calls onRefreshData, since that refetches all dashboard
// data (11 endpoints) and would be wasteful to poll automatically; a
// manual button covers pulling fresh data.
const TICK_MS = 15_000;

function formatDuration(minutes: number, t: (ar: string, en: string) => string) {
  if (minutes < 1) return t("أقل من دقيقة", "< 1 min");
  const mins = Math.round(minutes);
  if (mins < 60) return t(`${mins} د`, `${mins}m`);
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return t(`${hours} س${rest ? ` ${rest} د` : ""}`, `${hours}h${rest ? ` ${rest}m` : ""}`);
}

export default function OperationsView({ conversations, onOpenConversation, onRefreshData }: OperationsProps) {
  const { t } = useLanguage();
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  const open = useMemo(() => conversations.filter((c) => c.status !== "closed"), [conversations]);
  const waiting = useMemo(() => getWaitingConversations(conversations, now), [conversations, now]);

  const breaching = waiting.filter((row) => row.minutes > SLA_MINUTES);
  const unassigned = open.filter((c) => c.status === "unassigned" || c.assignee === "بدون موظف");
  const messagesToday = useMemo(() => countMessagesToday(conversations, now), [conversations, now]);

  async function refreshNow() {
    setRefreshing(true);
    try {
      await onRefreshData();
      setNow(Date.now());
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{t("مركز العمليات", "Operations center")}</h2>
            <p>{t("لقطة حية الآن - بدون فلتر تاريخ، تتحدث تلقائيًا كل 15 ثانية.", "A live snapshot right now - no date filter, updates automatically every 15 seconds.")}</p>
          </div>
          <button type="button" className="btn soft" disabled={refreshing} onClick={refreshNow}>
            {refreshing ? t("جارٍ التحديث...", "Refreshing...") : t("تحديث البيانات الآن", "Refresh data now")}
          </button>
        </div>
      </section>

      <div className="report-metrics">
        <div className={`report-metric ${waiting.length ? "warn" : "good"}`}>
          <strong>{waiting.length}</strong>
          <span>{t("بانتظار رد الآن", "Waiting for a reply right now")}</span>
          <em>{t(`محادثات مفتوحة آخر رسالة فيها من العميل خلال آخر ${ACTIVE_WAIT_MAX_DAYS} يوماً`, `Open conversations whose last message is from the customer within the last ${ACTIVE_WAIT_MAX_DAYS} days`)}</em>
        </div>
        <div className={`report-metric ${breaching.length ? "danger" : "good"}`}>
          <strong>{breaching.length}</strong>
          <span>{t("تتجاوز SLA الآن", "Breaching SLA right now")}</span>
          <em>{t(`انتظار أكثر من ${SLA_MINUTES} دقيقة`, `Waiting more than ${SLA_MINUTES} minutes`)}</em>
        </div>
        <div className={`report-metric ${unassigned.length ? "danger" : "good"}`}>
          <strong>{unassigned.length}</strong>
          <span>{t("غير مسندة", "Unassigned")}</span>
          <em>{t("تحتاج توزيعاً على موظف", "Need to be assigned to an agent")}</em>
        </div>
        <div className={`report-metric ${waiting[0] && waiting[0].minutes > SLA_MINUTES ? "danger" : "neutral"}`}>
          <strong>{waiting[0] ? formatDuration(waiting[0].minutes, t) : t("لا يوجد", "None")}</strong>
          <span>{t("أطول انتظار حالي", "Longest current wait")}</span>
          <em>{waiting[0]?.conversation.customer || ""}</em>
        </div>
        <div className="report-metric neutral">
          <strong>{messagesToday}</strong>
          <span>{t("رسائل اليوم", "Messages today")}</span>
          <em>{t("واردة وصادرة، منذ منتصف الليل", "Inbound and outbound, since midnight")}</em>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{t("طابور الانتظار", "Waiting queue")}</h2>
            <p>{t("مرتبة من الأطول انتظاراً إلى الأحدث.", "Sorted from longest waiting to most recent.")}</p>
          </div>
        </div>
        <div className="panel-body table-wrap">
          {waiting.length ? (
            <table className="report-table">
              <thead>
                <tr>
                  <th>{t("العميل", "Customer")}</th>
                  <th>{t("الموظف", "Agent")}</th>
                  <th>{t("الانتظار", "Waiting")}</th>
                  <th>{t("إجراء", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((row) => (
                  <tr key={row.conversation.id}>
                    <td>{row.conversation.customer}</td>
                    <td>{row.conversation.assignee === "بدون موظف" ? t("بدون موظف", "Unassigned") : row.conversation.assignee}</td>
                    <td>
                      <span className={row.minutes > SLA_MINUTES ? "performance-score danger" : "performance-score good"}>
                        {formatDuration(row.minutes, t)}
                      </span>
                    </td>
                    <td><button className="btn soft" type="button" onClick={() => onOpenConversation(row.conversation.id)}>{t("فتح", "Open")}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>{t("لا توجد محادثات بانتظار رد حالياً.", "No conversations are currently waiting for a reply.")}</p>
          )}
        </div>
      </section>
    </>
  );
}
