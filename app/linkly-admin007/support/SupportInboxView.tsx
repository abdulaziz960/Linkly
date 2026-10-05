"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES } from "../../../lib/support";
import { Badge, Button, EmptyState, Segmented } from "../ds/primitives";
import SupportBoard from "./SupportBoard";
import { formatWaiting, slaInfo } from "./support-sla";
import { useToast } from "../ds/Toast";
import Icon from "../ds/Icon";
import { ADMIN_STATUS_LABEL, MAIN_FILTERS, OTHER_FILTERS, PRIORITY_LABEL, PRIORITY_TONE, STATUS_TONE, applyClientFilter, buildListQuery, formatTicketTime, type FilterKey } from "./support-data";

type Ticket = {
  id: string;
  ticketNumber: string;
  tenantId: string;
  companyName: string;
  createdByName: string;
  createdByEmail: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assignedAgentId: string;
  assignedAgentName: string;
  createdAt: string;
  lastCustomerReplyAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  senderType: string;
  senderName: string;
  text: string;
  isInternal: number;
  attachmentType: string;
  attachmentUrl: string;
  attachmentName: string;
  createdAt: string;
};

type TicketDetail = Ticket & { messages: Message[]; relatedUrl: string };
type Counts = { byStatus: Record<string, number>; urgent: number; unassigned: number; assignedToMe: number };

export default function SupportInboxView({ adminId, adminName }: { adminId: string; adminName: string }) {
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [counts, setCounts] = useState<Counts>({ byStatus: {}, urgent: 0, unassigned: 0, assignedToMe: 0 });
  const [view, setView] = useState<"inbox" | "board">("inbox");
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [replyMode, setReplyMode] = useState<"reply" | "note">("reply");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/support/tickets?${buildListQuery(filter, search, adminId)}`);
      const json = await response.json();
      if (json.ok) {
        setTickets(applyClientFilter(filter, json.data.tickets as Ticket[]));
        setCounts(json.data.counts);
      }
    } catch {
      // Polling runs every 20s; a transient failure just keeps the last list.
    } finally {
      setLoaded(true);
    }
  }, [filter, search, adminId]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/admin/support/tickets/${id}`);
      const json = await response.json();
      if (json.ok) setDetail(json.data);
    } catch {
      // Keep showing the last loaded conversation.
    }
  }, []);

  useEffect(() => {
    loadList();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadList();
    }, 20000);
    return () => window.clearInterval(interval);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadDetail(selectedId);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length]);

  const countFor = useMemo<Partial<Record<FilterKey, number>>>(
    () => ({
      unassigned: counts.unassigned,
      assigned_to_me: counts.assignedToMe,
      new: counts.byStatus.new,
      open: counts.byStatus.open,
      in_progress: counts.byStatus.in_progress,
      urgent: counts.urgent,
      resolved: counts.byStatus.resolved,
      closed: counts.byStatus.closed
    }),
    [counts]
  );

  function select(id: string) {
    setDetail(null);
    setSelectedId(id);
  }

  function back() {
    setSelectedId(null);
    setDetail(null);
  }

  const sendMessage = async () => {
    if (!detail || !replyText.trim() || sending) return;
    setSending(true);
    try {
      const response = await fetch(`/api/admin/support/tickets/${detail.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText, isInternal: replyMode === "note" })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        toast("error", "تعذر الإرسال", json.error);
        return;
      }
      setReplyText("");
      toast("success", replyMode === "note" ? "تم حفظ الملاحظة الداخلية" : "تم إرسال الرد");
      await Promise.all([loadDetail(detail.id), loadList()]);
    } catch {
      toast("error", "تعذر الإرسال", "تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setSending(false);
    }
  };

  const patchTicket = async (body: Record<string, unknown>) => {
    if (!detail) return;
    try {
      const response = await fetch(`/api/admin/support/tickets/${detail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) return toast("error", "تعذر تحديث التذكرة", json.error);
      await Promise.all([loadDetail(detail.id), loadList()]);
    } catch {
      toast("error", "تعذر تحديث التذكرة", "تحقق من الاتصال وحاول مرة أخرى.");
    }
  };

  const filterButton = (item: { key: FilterKey; label: string }) => {
    const count = countFor[item.key];
    return (
      <button key={item.key} type="button" aria-pressed={filter === item.key} data-active={filter === item.key || undefined} onClick={() => setFilter(item.key)}>
        <span>{item.label}</span>
        {typeof count === "number" && count > 0 ? <b>{count}</b> : null}
      </button>
    );
  };

  const toggle = (
    <div style={{ marginBottom: 14 }}>
      <Segmented label="طريقة عرض التذاكر" value={view} onChange={setView} options={[{ value: "inbox", label: "صندوق الوارد" }, { value: "board", label: "لوحة Kanban" }]} />
    </div>
  );

  if (view === "board") {
    return (
      <>
        {toggle}
        <SupportBoard onOpen={(id) => { select(id); setView("inbox"); }} />
      </>
    );
  }

  return (
    <>
      {toggle}
    <div className="support-inbox ds-card" data-pane={selectedId ? "conversation" : "list"}>
      <aside className="support-inbox-filters" aria-label="تصفية التذاكر">
        <h2>البريد الوارد</h2>
        <nav>{MAIN_FILTERS.map(filterButton)}</nav>
        <span className="support-inbox-separator">أخرى</span>
        <nav>{OTHER_FILTERS.map(filterButton)}</nav>
      </aside>

      <section className="support-inbox-list" aria-label="قائمة التذاكر">
        <div className="ds-search support-inbox-search">
          <Icon name="search" size={17} />
          <input className="ds-input" type="search" placeholder="بحث في التذاكر والعملاء…" aria-label="بحث في التذاكر" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="support-inbox-list-rows">
          {!loaded ? (
            <p className="support-inbox-empty">جارٍ التحميل…</p>
          ) : tickets.length === 0 ? (
            <EmptyState icon="lifebuoy" title="لا توجد تذاكر مطابقة" description="جرّب تغيير التصفية أو البحث." />
          ) : (
            tickets.map((ticket) => (
              <button key={ticket.id} type="button" className="support-inbox-row" data-active={selectedId === ticket.id || undefined} onClick={() => select(ticket.id)}>
                <span className="support-inbox-row-top">
                  <b>{ticket.createdByName}</b>
                  <Badge tone={PRIORITY_TONE[ticket.priority] ?? "neutral"} dot={false}>{PRIORITY_LABEL[ticket.priority] ?? ticket.priority}</Badge>
                </span>
                <span className="support-inbox-row-company">{ticket.companyName}</span>
                <span className="support-inbox-row-subject">{ticket.subject}</span>
                <span className="support-inbox-row-bottom">
                  <Badge tone={STATUS_TONE[ticket.status] ?? "neutral"}>{ADMIN_STATUS_LABEL[ticket.status] ?? ticket.status}</Badge>
                  {(() => {
                    const sla = slaInfo(ticket, now);
                    return sla.state === "none" ? null : <Badge tone={sla.state === "breached" ? "danger" : sla.state === "at_risk" ? "warning" : "success"} dot={false}>ينتظر {formatWaiting(sla.waitingMinutes)}</Badge>;
                  })()}
                  <time>{formatTicketTime(ticket.updatedAt)}</time>
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="support-inbox-conversation" aria-label="المحادثة">
        {!selectedId ? (
          <EmptyState icon="message" title="اختر تذكرة" description="اختر تذكرة من القائمة لعرض المحادثة والرد عليها." />
        ) : !detail ? (
          <p className="support-inbox-empty">جارٍ تحميل المحادثة…</p>
        ) : (
          <>
            <header className="support-inbox-conv-header">
              <button type="button" className="ds-icon-btn support-inbox-back" aria-label="العودة إلى القائمة" onClick={back}><Icon name="chevronRight" size={18} /></button>
              <div className="support-inbox-conv-title">
                <b>{detail.createdByName}</b>
                <span>{detail.companyName} · #{detail.ticketNumber}</span>
                <small>{detail.subject}</small>
              </div>
              <div className="support-inbox-quick-actions">
                <select className="ds-select" aria-label="حالة التذكرة" value={detail.status} onChange={(event) => patchTicket({ status: event.target.value })}>
                  {SUPPORT_STATUSES.map((status) => <option key={status} value={status}>{ADMIN_STATUS_LABEL[status] ?? status}</option>)}
                </select>
                <select className="ds-select" aria-label="أولوية التذكرة" value={detail.priority} onChange={(event) => patchTicket({ priority: event.target.value })}>
                  {SUPPORT_PRIORITIES.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABEL[priority] ?? priority}</option>)}
                </select>
                {detail.assignedAgentId ? (
                  <Button variant="outline" onClick={() => patchTicket({ assignedAgentId: "", assignedAgentName: "" })}>إلغاء الإسناد{detail.assignedAgentName ? ` (${detail.assignedAgentName})` : ""}</Button>
                ) : (
                  <Button variant="outline" icon="user" onClick={() => patchTicket({ assignedAgentId: adminId, assignedAgentName: adminName })}>تعيين لي</Button>
                )}
              </div>
            </header>

            <div className="support-inbox-thread" role="log" aria-live="polite">
              {detail.messages.map((message) => (
                <div key={message.id} className={`support-message support-message-${message.senderType}${message.isInternal ? " support-message-internal" : ""}`}>
                  {message.senderType !== "system" ? <div className="support-message-avatar" aria-hidden="true">{(message.senderName || "?").slice(0, 1)}</div> : null}
                  <div className="support-message-body">
                    {message.senderType !== "system" ? (
                      <div className="support-message-meta">
                        <b>{message.senderName}</b>
                        {message.isInternal ? <Badge tone="warning" dot={false}>ملاحظة داخلية</Badge> : null}
                        <time>{formatTicketTime(message.createdAt)}</time>
                      </div>
                    ) : null}
                    {message.text ? <p>{message.text}</p> : null}
                    {message.attachmentUrl ? (
                      message.attachmentType === "image" ? (
                        <Image
                          className="support-message-attachment-image"
                          src={message.attachmentUrl}
                          alt={message.attachmentName}
                          width={220}
                          height={220}
                          style={{ width: "auto", height: "auto" }}
                          unoptimized={message.attachmentUrl.startsWith("data:")}
                        />
                      ) : (
                        <a className="support-message-attachment-file" href={message.attachmentUrl} download={message.attachmentName}>{message.attachmentName}</a>
                      )
                    ) : null}
                  </div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>

            <div className="support-inbox-composer">
              <div className="support-composer-tabs" role="tablist" aria-label="نوع الرسالة">
                <button type="button" role="tab" aria-selected={replyMode === "reply"} data-active={replyMode === "reply" || undefined} onClick={() => setReplyMode("reply")}>الرد على العميل</button>
                <button type="button" role="tab" aria-selected={replyMode === "note"} data-active={replyMode === "note" || undefined} onClick={() => setReplyMode("note")}>ملاحظة داخلية</button>
              </div>
              {replyMode === "note" ? <p className="support-internal-warning"><Icon name="info" size={14} />هذه الملاحظة مرئية لفريق الدعم فقط.</p> : null}
              <textarea
                className="ds-textarea"
                data-note={replyMode === "note" || undefined}
                rows={3}
                value={replyText}
                aria-label={replyMode === "note" ? "ملاحظة داخلية" : "نص الرد"}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder={replyMode === "note" ? "اكتب ملاحظة داخلية…" : "اكتب ردك هنا…"}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void sendMessage();
                }}
              />
              <div className="support-composer-actions">
                <span className="support-composer-hint">Ctrl/Cmd + Enter للإرسال</span>
                <Button variant="primary" icon="message" loading={sending} disabled={!replyText.trim()} onClick={() => void sendMessage()}>
                  {replyMode === "note" ? "حفظ الملاحظة" : "إرسال الرد"}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
    </>
  );
}
