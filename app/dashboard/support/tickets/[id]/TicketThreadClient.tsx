"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStoredLanguage } from "../../../../useStoredLanguage";
import { statusLabel, priorityLabel, categoryLabel, statusBadgeClass, priorityBadgeClass } from "../../../../../lib/support-labels";

type Message = {
  id: string;
  senderType: string;
  senderName: string;
  text: string;
  attachmentType: string;
  attachmentUrl: string;
  attachmentName: string;
  createdAt: string;
};

type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  relatedUrl: string;
  messages: Message[];
};

function formatDateTime(iso: string, lang: "ar" | "en") {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleString(lang === "ar" ? "ar-SA" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function TicketThreadClient({ ticketId }: { ticketId: string }) {
  const [lang] = useStoredLanguage("ar");
  const isEnglish = lang === "en";
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState("");
  const [attachment, setAttachment] = useState<{ type: "image" | "audio" | "document"; name: string; dataUrl: string; mimeType: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/support/tickets/${ticketId}`);
    const json = await response.json();
    if (json.ok) setTicket(json.data);
    else setNotFound(true);
  }, [ticketId]);

  useEffect(() => {
    load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 6000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [ticket?.messages.length]);

  const attachFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;
      const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "document";
      setAttachment({ type, name: file.name, dataUrl, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const sendReply = async () => {
    if (!reply.trim() && !attachment) return;
    setSending(true);
    const response = await fetch(`/api/support/tickets/${ticketId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reply, attachment })
    });
    const json = await response.json();
    if (json.ok) {
      setReply("");
      setAttachment(null);
      await load();
    }
    setSending(false);
  };

  const reopen = async () => {
    const response = await fetch(`/api/support/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reopen" })
    });
    const json = await response.json();
    if (json.ok) load();
  };

  if (notFound) {
    return (
      <main className="support-page" dir={isEnglish ? "ltr" : "rtl"}>
        <div className="support-empty-state">
          <h3>{isEnglish ? "Ticket not found" : "التذكرة غير موجودة"}</h3>
          <Link href="/dashboard/support" className="support-cta-primary">{isEnglish ? "Back to support" : "العودة للدعم الفني"}</Link>
        </div>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main className="support-page" dir={isEnglish ? "ltr" : "rtl"}>
        <div className="support-empty-state"><p>{isEnglish ? "Loading…" : "جاري التحميل…"}</p></div>
      </main>
    );
  }

  const isClosedState = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <main className="support-page support-thread-page" dir={isEnglish ? "ltr" : "rtl"}>
      <header className="support-thread-header">
        <Link href="/dashboard/support" className="support-back">
          {isEnglish ? "← Back to tickets" : "→ العودة للتذاكر"}
        </Link>
        <div>
          <span className="support-ticket-id">#{ticket.ticketNumber}</span>
          <h1>{ticket.subject}</h1>
          <p className="support-thread-meta">
            <span className={`support-status-badge ${statusBadgeClass(ticket.status)}`}>{statusLabel(ticket.status, lang)}</span>
            {" • "}
            <span className={`support-priority-badge ${priorityBadgeClass(ticket.priority)}`}>{priorityLabel(ticket.priority, lang)}</span>
            {" • "}
            {categoryLabel(ticket.category, lang)}
          </p>
        </div>
        <button type="button" className="support-details-toggle" onClick={() => setDetailsOpen((v) => !v)}>
          {isEnglish ? "Ticket details" : "تفاصيل التذكرة"}
        </button>
      </header>

      <div className="support-thread-body">
        <section className="support-thread-conversation">
          {ticket.messages.map((message) => (
            <div key={message.id} className={`support-message support-message-${message.senderType}`}>
              {message.senderType !== "system" ? (
                <div className="support-message-avatar">{(message.senderName || "?").slice(0, 1)}</div>
              ) : null}
              <div className="support-message-body">
                {message.senderType !== "system" ? (
                  <div className="support-message-meta">
                    <b>{message.senderName}</b>
                    <span>{message.senderType === "agent" ? (isEnglish ? "Linkly support team" : "فريق دعم Linkly") : (isEnglish ? "Customer" : "العميل")}</span>
                    <time>{formatDateTime(message.createdAt, lang)}</time>
                  </div>
                ) : null}
                {message.text ? <p className={message.senderType === "system" ? "support-system-note" : ""}>{message.text}</p> : null}
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
        </section>

        {detailsOpen ? (
          <aside className="support-thread-sidebar">
            <h3>{isEnglish ? "Ticket details" : "تفاصيل التذكرة"}</h3>
            <div className="support-detail-row"><span>{isEnglish ? "Ticket number" : "رقم التذكرة"}</span><b>{ticket.ticketNumber}</b></div>
            <div className="support-detail-row"><span>{isEnglish ? "Status" : "الحالة"}</span><b>{statusLabel(ticket.status, lang)}</b></div>
            <div className="support-detail-row"><span>{isEnglish ? "Priority" : "الأولوية"}</span><b>{priorityLabel(ticket.priority, lang)}</b></div>
            <div className="support-detail-row"><span>{isEnglish ? "Category" : "التصنيف"}</span><b>{categoryLabel(ticket.category, lang)}</b></div>
            <div className="support-detail-row"><span>{isEnglish ? "Created" : "تاريخ الإنشاء"}</span><b>{formatDateTime(ticket.createdAt, lang)}</b></div>
            <div className="support-detail-row"><span>{isEnglish ? "Last activity" : "آخر نشاط"}</span><b>{formatDateTime(ticket.updatedAt, lang)}</b></div>
            {ticket.relatedUrl ? (
              <div className="support-detail-row"><span>{isEnglish ? "Related page" : "رابط الصفحة"}</span><a href={ticket.relatedUrl} target="_blank" rel="noreferrer">{ticket.relatedUrl}</a></div>
            ) : null}
          </aside>
        ) : null}
      </div>

      {isClosedState ? (
        <div className="support-composer support-composer-closed">
          <p>{isEnglish ? "This ticket is closed." : "هذه التذكرة مغلقة."}</p>
          <button type="button" className="support-cta-secondary" onClick={reopen}>
            {isEnglish ? "Reopen ticket" : "إعادة فتح التذكرة"}
          </button>
        </div>
      ) : (
        <div className="support-composer">
          {attachment ? (
            <div className="support-composer-attachment">
              <span>{attachment.name}</span>
              <button type="button" onClick={() => setAttachment(null)}>×</button>
            </div>
          ) : null}
          <textarea
            rows={3}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder={isEnglish ? "Write your reply here..." : "اكتب ردك هنا..."}
            onPaste={(event) => {
              const file = Array.from(event.clipboardData.files)[0];
              if (file) attachFile(file);
            }}
          />
          <div className="support-composer-actions">
            <input ref={fileInputRef} type="file" hidden onChange={(event) => attachFile(event.target.files?.[0])} />
            <button type="button" className="support-attach-btn" onClick={() => fileInputRef.current?.click()}>
              📎
            </button>
            <button type="button" className="support-cta-primary" disabled={sending || (!reply.trim() && !attachment)} onClick={sendReply}>
              {sending ? (isEnglish ? "Sending…" : "جاري الإرسال…") : (isEnglish ? "Send reply" : "إرسال الرد")}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
