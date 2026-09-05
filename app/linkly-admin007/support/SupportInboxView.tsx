"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n";
import { statusLabel, priorityLabel, statusBadgeClass, priorityBadgeClass } from "../../../lib/support-labels";
import { SUPPORT_STATUSES, SUPPORT_PRIORITIES } from "../../../lib/support";

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

type TicketDetail = Ticket & { messages: Message[]; createdAt: string; relatedUrl: string };

type FilterKey = "all" | "unassigned" | "assigned_to_me" | "new" | "open" | "in_progress" | "waiting" | "urgent" | "resolved" | "closed";

function formatDateTime(iso: string, lang: "ar" | "en") {
  if (!iso) return "";
  return new Date(iso).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function SupportInboxView({ adminId, adminName }: { adminId: string; adminName: string }) {
  const { language, t } = useLanguage();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<{ byStatus: Record<string, number>; urgent: number; unassigned: number; assignedToMe: number }>({
    byStatus: {}, urgent: 0, unassigned: 0, assignedToMe: 0
  });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [replyMode, setReplyMode] = useState<"reply" | "note">("reply");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter === "unassigned") params.set("assignedAgentId", "unassigned");
    if (filter === "assigned_to_me") params.set("assignedAgentId", adminId);
    if (filter === "new") params.set("status", "new");
    if (filter === "open") params.set("status", "open");
    if (filter === "in_progress") params.set("status", "in_progress");
    if (filter === "resolved") params.set("status", "resolved");
    if (filter === "closed") params.set("status", "closed");
    if (search.trim()) params.set("search", search.trim());

    const response = await fetch(`/api/admin/support/tickets?${params.toString()}`);
    const json = await response.json();
    if (json.ok) {
      let list: Ticket[] = json.data.tickets;
      if (filter === "waiting") list = list.filter((tk) => tk.status === "waiting_customer" || tk.status === "waiting_support");
      if (filter === "urgent") list = list.filter((tk) => tk.priority === "urgent" && tk.status !== "resolved" && tk.status !== "closed");
      setTickets(list);
      setCounts(json.data.counts);
    }
  }, [filter, search, adminId]);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/admin/support/tickets/${id}`);
    const json = await response.json();
    if (json.ok) setDetail(json.data);
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

  const filters: Array<{ key: FilterKey; label: [string, string]; count?: number }> = useMemo(() => [
    { key: "all", label: ["كل المحادثات", "All conversations"] },
    { key: "unassigned", label: ["غير معيّنة", "Unassigned"], count: counts.unassigned },
    { key: "assigned_to_me", label: ["معيّنة لي", "Assigned to me"], count: counts.assignedToMe },
    { key: "new", label: ["جديدة", "New"], count: counts.byStatus.new },
    { key: "open", label: ["مفتوحة", "Open"], count: counts.byStatus.open },
    { key: "in_progress", label: ["قيد المعالجة", "In progress"], count: counts.byStatus.in_progress },
    { key: "waiting", label: ["بانتظار العميل", "Waiting for customer"] },
    { key: "urgent", label: ["عاجلة", "Urgent"], count: counts.urgent }
  ], [counts]);

  const otherFilters: Array<{ key: FilterKey; label: [string, string]; count?: number }> = [
    { key: "resolved", label: ["تم حلها", "Resolved"], count: counts.byStatus.resolved },
    { key: "closed", label: ["مغلقة", "Closed"], count: counts.byStatus.closed }
  ];

  const sendMessage = async () => {
    if (!detail || !replyText.trim()) return;
    setSending(true);
    const response = await fetch(`/api/admin/support/tickets/${detail.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: replyText, isInternal: replyMode === "note" })
    });
    const json = await response.json();
    if (json.ok) {
      setReplyText("");
      await loadDetail(detail.id);
      await loadList();
    }
    setSending(false);
  };

  const patchTicket = async (body: Record<string, unknown>) => {
    if (!detail) return;
    const response = await fetch(`/api/admin/support/tickets/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await response.json();
    if (json.ok) {
      await loadDetail(detail.id);
      await loadList();
    }
  };

  return (
    <div className="support-inbox" dir={language === "ar" ? "rtl" : "ltr"}>
      <aside className="support-inbox-filters">
        <h2>{t("البريد الوارد", "Inbox")}</h2>
        <nav>
          {filters.map((item) => (
            <button key={item.key} type="button" className={filter === item.key ? "active" : ""} onClick={() => setFilter(item.key)}>
              <span>{t(item.label[0], item.label[1])}</span>
              {typeof item.count === "number" && item.count > 0 ? <b>{item.count}</b> : null}
            </button>
          ))}
        </nav>
        <span className="support-inbox-separator">{t("أخرى", "Other")}</span>
        <nav>
          {otherFilters.map((item) => (
            <button key={item.key} type="button" className={filter === item.key ? "active" : ""} onClick={() => setFilter(item.key)}>
              <span>{t(item.label[0], item.label[1])}</span>
              {typeof item.count === "number" && item.count > 0 ? <b>{item.count}</b> : null}
            </button>
          ))}
        </nav>
      </aside>

      <section className="support-inbox-list">
        <input
          className="support-inbox-search"
          placeholder={t("بحث في التذاكر والعملاء...", "Search tickets and customers...")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="support-inbox-list-rows">
          {tickets.length === 0 ? (
            <p className="support-inbox-empty">{t("لا توجد تذاكر مطابقة", "No matching tickets")}</p>
          ) : (
            tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                className={`support-inbox-row ${selectedId === ticket.id ? "active" : ""}`}
                onClick={() => setSelectedId(ticket.id)}
              >
                <div className="support-inbox-row-top">
                  <b>{ticket.createdByName}</b>
                  <span className={`support-priority-badge ${priorityBadgeClass(ticket.priority)}`}>{priorityLabel(ticket.priority, language)}</span>
                </div>
                <span className="support-inbox-row-company">{ticket.companyName}</span>
                <span className="support-inbox-row-subject">{ticket.subject}</span>
                <div className="support-inbox-row-bottom">
                  <span className={`support-status-badge ${statusBadgeClass(ticket.status)}`}>{statusLabel(ticket.status, language)}</span>
                  <time>{formatDateTime(ticket.updatedAt, language)}</time>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="support-inbox-conversation">
        {!detail ? (
          <div className="support-inbox-empty-detail">{t("اختر تذكرة لعرض المحادثة", "Select a ticket to view the conversation")}</div>
        ) : (
          <>
            <header className="support-inbox-conv-header">
              <div>
                <b>{detail.createdByName}</b>
                <span>{detail.companyName} · #{detail.ticketNumber}</span>
              </div>
              <div className="support-inbox-quick-actions">
                <select value={detail.status} onChange={(event) => patchTicket({ status: event.target.value })}>
                  {SUPPORT_STATUSES.map((status) => (
                    <option key={status} value={status}>{statusLabel(status, language)}</option>
                  ))}
                </select>
                <select value={detail.priority} onChange={(event) => patchTicket({ priority: event.target.value })}>
                  {SUPPORT_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>{priorityLabel(priority, language)}</option>
                  ))}
                </select>
                {detail.assignedAgentId ? (
                  <button type="button" onClick={() => patchTicket({ assignedAgentId: "", assignedAgentName: "" })}>
                    {t("إلغاء الإسناد", "Unassign")}
                  </button>
                ) : (
                  <button type="button" onClick={() => patchTicket({ assignedAgentId: adminId, assignedAgentName: adminName })}>
                    {t("تعيين لي", "Assign to me")}
                  </button>
                )}
              </div>
            </header>

            <div className="support-inbox-thread">
              {detail.messages.map((message) => (
                <div
                  key={message.id}
                  className={`support-message support-message-${message.senderType} ${message.isInternal ? "support-message-internal" : ""}`}
                >
                  {message.senderType !== "system" ? <div className="support-message-avatar">{(message.senderName || "?").slice(0, 1)}</div> : null}
                  <div className="support-message-body">
                    {message.senderType !== "system" ? (
                      <div className="support-message-meta">
                        <b>{message.senderName}</b>
                        {message.isInternal ? <span className="support-internal-tag">{t("ملاحظة داخلية", "Internal note")}</span> : null}
                        <time>{formatDateTime(message.createdAt, language)}</time>
                      </div>
                    ) : null}
                    {message.text ? <p>{message.text}</p> : null}
                    {message.attachmentUrl ? (
                      message.attachmentType === "image" ? (
                        <img className="support-message-attachment-image" src={message.attachmentUrl} alt={message.attachmentName} />
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
              <div className="support-composer-tabs">
                <button type="button" className={replyMode === "reply" ? "active" : ""} onClick={() => setReplyMode("reply")}>
                  {t("الرد على العميل", "Reply to customer")}
                </button>
                <button type="button" className={replyMode === "note" ? "active" : ""} onClick={() => setReplyMode("note")}>
                  {t("ملاحظة داخلية", "Internal note")}
                </button>
              </div>
              {replyMode === "note" ? (
                <p className="support-internal-warning">{t("هذه الملاحظة مرئية لفريق الدعم فقط.", "This note is visible to the support team only.")}</p>
              ) : null}
              <textarea
                className={replyMode === "note" ? "support-composer-note" : ""}
                rows={3}
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder={replyMode === "note" ? t("اكتب ملاحظة داخلية...", "Write an internal note...") : t("اكتب ردك هنا...", "Write your reply here...")}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendMessage();
                }}
              />
              <div className="support-composer-actions">
                <span className="support-composer-hint">{t("Ctrl/Cmd + Enter للإرسال", "Ctrl/Cmd + Enter to send")}</span>
                <button type="button" className="support-cta-primary" disabled={sending || !replyText.trim()} onClick={sendMessage}>
                  {sending ? t("جاري الإرسال…", "Sending…") : replyMode === "note" ? t("حفظ الملاحظة", "Save note") : t("إرسال الرد", "Send reply")}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
