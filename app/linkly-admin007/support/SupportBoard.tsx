"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatNumber } from "../utils";
import { Badge, Button, EmptyState, ErrorState } from "../ds/primitives";
import { useToast } from "../ds/Toast";
import Icon from "../ds/Icon";
import { ADMIN_STATUS_LABEL, PRIORITY_LABEL, PRIORITY_TONE, STATUS_TONE } from "./support-data";
import { KANBAN_COLUMNS, formatWaiting, slaInfo } from "./support-sla";

type BoardTicket = {
  id: string;
  ticketNumber: string;
  companyName: string;
  subject: string;
  priority: string;
  status: string;
  assignedAgentName: string;
  createdAt: string;
  lastCustomerReplyAt: string;
};

const MAX_PAGES = 4;

/**
 * Kanban view of support tickets. Moving a card changes the ticket status
 * through the same PATCH endpoint the inbox uses; the move is optimistic and
 * rolled back with an error toast if the server refuses it. Cards can be moved
 * by dragging or with the "نقل إلى" menu (keyboard and touch friendly).
 */
export default function SupportBoard({ onOpen }: { onOpen: (id: string) => void }) {
  const toast = useToast();
  const [tickets, setTickets] = useState<BoardTicket[] | null>(null);
  const [error, setError] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const all: BoardTicket[] = [];
      let total = 0;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const response = await fetch(`/api/admin/support/tickets?page=${page}`, { cache: "no-store" });
        const json = await response.json();
        if (!response.ok || !json.ok) throw new Error("load failed");
        all.push(...(json.data.tickets as BoardTicket[]));
        total = json.data.total as number;
        if (all.length >= total) break;
      }
      setTickets(all);
      setTruncated(all.length < total);
      setError(false);
      setNow(Date.now());
    } catch {
      setError(true);
      setTickets((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  const byColumn = useMemo(() => {
    const map = new Map<string, BoardTicket[]>(KANBAN_COLUMNS.map((column) => [column, []]));
    for (const ticket of tickets ?? []) map.get(ticket.status)?.push(ticket);
    return map;
  }, [tickets]);

  async function move(ticket: BoardTicket, status: string) {
    if (ticket.status === status) return;
    const previous = tickets;
    setTickets((current) => (current ?? []).map((item) => (item.id === ticket.id ? { ...item, status } : item)));
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticket.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "failed");
      toast("success", `تم نقل التذكرة #${ticket.ticketNumber}`, ADMIN_STATUS_LABEL[status]);
    } catch (reason) {
      setTickets(previous);
      toast("error", "تعذر نقل التذكرة", reason instanceof Error && reason.message !== "failed" ? reason.message : "تحقق من الاتصال وحاول مرة أخرى.");
    }
  }

  if (tickets === null) return <div className="support-board-loading" aria-busy="true">جارٍ تحميل اللوحة…</div>;
  if (error && tickets.length === 0) return <ErrorState title="تعذر تحميل التذاكر" description="تحقق من الاتصال ثم أعد المحاولة." onRetry={() => void load()} />;
  if (tickets.length === 0) return <EmptyState icon="lifebuoy" title="لا توجد تذاكر" description="ستظهر تذاكر العملاء هنا موزعة حسب الحالة." />;

  return (
    <>
      {truncated ? <p className="ds-note" style={{ marginBottom: 12 }}><Icon name="info" size={16} /><span>تُعرض أحدث {formatNumber(tickets.length)} تذكرة فقط. استخدم عرض القائمة والتصفية للبحث في الباقي.</span></p> : null}
      <div className="support-board" role="list" aria-label="لوحة التذاكر">
        {KANBAN_COLUMNS.map((column) => {
          const items = byColumn.get(column) ?? [];
          return (
            <section
              key={column}
              role="listitem"
              className="support-board-col"
              data-over={overColumn === column || undefined}
              aria-label={`${ADMIN_STATUS_LABEL[column]} (${items.length})`}
              onDragOver={(event) => { if (dragId) { event.preventDefault(); setOverColumn(column); } }}
              onDragLeave={() => setOverColumn((current) => (current === column ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setOverColumn(null);
                const ticket = tickets.find((item) => item.id === dragId);
                setDragId(null);
                if (ticket) void move(ticket, column);
              }}
            >
              <header>
                <Badge tone={STATUS_TONE[column] ?? "neutral"}>{ADMIN_STATUS_LABEL[column]}</Badge>
                <b>{formatNumber(items.length)}</b>
              </header>
              <div className="support-board-cards">
                {items.length === 0 ? <p className="support-board-empty">لا توجد تذاكر</p> : null}
                {items.map((ticket) => {
                  const sla = slaInfo(ticket, now);
                  return (
                    <article key={ticket.id} className="support-board-card" draggable onDragStart={() => setDragId(ticket.id)} onDragEnd={() => { setDragId(null); setOverColumn(null); }} data-dragging={dragId === ticket.id || undefined}>
                      <button type="button" className="support-board-open" onClick={() => onOpen(ticket.id)}>
                        <span className="support-board-top"><bdi dir="ltr">#{ticket.ticketNumber}</bdi><Badge tone={PRIORITY_TONE[ticket.priority] ?? "neutral"} dot={false}>{PRIORITY_LABEL[ticket.priority] ?? ticket.priority}</Badge></span>
                        <strong>{ticket.subject}</strong>
                        <span className="support-board-company">{ticket.companyName}</span>
                      </button>
                      <div className="support-board-foot">
                        {sla.state !== "none" ? (
                          <Badge tone={sla.state === "breached" ? "danger" : sla.state === "at_risk" ? "warning" : "success"}>
                            {sla.state === "breached" ? "تجاوز الهدف" : sla.state === "at_risk" ? "قارب الهدف" : "ضمن الهدف"} · {formatWaiting(sla.waitingMinutes)}
                          </Badge>
                        ) : <span />}
                        <span className="support-board-agent">{ticket.assignedAgentName || "غير مسند"}</span>
                      </div>
                      <label className="support-board-move">
                        <span className="ds-sr-only">نقل التذكرة {ticket.ticketNumber} إلى</span>
                        <select className="ds-select" value={ticket.status} onChange={(event) => void move(ticket, event.target.value)} aria-label={`نقل التذكرة ${ticket.ticketNumber} إلى`}>
                          {KANBAN_COLUMNS.map((target) => <option key={target} value={target}>{ADMIN_STATUS_LABEL[target]}</option>)}
                        </select>
                      </label>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <p className="ds-cell-sub" style={{ marginTop: 10 }}>أهداف أول رد الافتراضية: عاجلة ساعة، عالية 4 ساعات، عادية 8 ساعات، منخفضة 24 ساعة. تُحسب من آخر رسالة للعميل.</p>
      <div style={{ marginTop: 6 }}><Button variant="ghost" icon="refresh" onClick={() => void load()}>تحديث</Button></div>
    </>
  );
}
