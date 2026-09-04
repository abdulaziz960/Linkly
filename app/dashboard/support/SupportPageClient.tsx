"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useStoredLanguage } from "../../useStoredLanguage";
import { statusLabel, priorityLabel, categoryLabel, statusBadgeClass, priorityBadgeClass } from "../../../lib/support-labels";
import CreateTicketModal from "./CreateTicketModal";

type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  updatedAt: string;
};

type CardFilter = "open" | "waiting_support" | "waiting_customer" | "resolved" | null;

function timeAgo(iso: string, lang: "ar" | "en") {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return lang === "ar" ? "الآن" : "just now";
  if (minutes < 60) return lang === "ar" ? `منذ ${minutes} دقيقة` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return lang === "ar" ? `منذ ${hours} ساعة` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return lang === "ar" ? `منذ ${days} يوم` : `${days}d ago`;
}

export default function SupportPageClient() {
  const [lang] = useStoredLanguage("ar");
  const isEnglish = lang === "en";
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cardFilter, setCardFilter] = useState<CardFilter>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const loadTickets = useCallback(async () => {
    const response = await fetch("/api/support/tickets");
    const json = await response.json();
    if (json.ok) setTickets(json.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTickets();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadTickets();
    }, 25000);
    return () => window.clearInterval(interval);
  }, [loadTickets]);

  const counts = useMemo(() => {
    const open = tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length;
    const waitingSupport = tickets.filter((t) => t.status === "waiting_support" || t.status === "new").length;
    const waitingCustomer = tickets.filter((t) => t.status === "waiting_customer").length;
    const resolved = tickets.filter((t) => t.status === "resolved").length;
    return { open, waitingSupport, waitingCustomer, resolved };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    let list = tickets;
    if (cardFilter === "open") list = list.filter((t) => !["resolved", "closed"].includes(t.status));
    if (cardFilter === "waiting_support") list = list.filter((t) => t.status === "waiting_support" || t.status === "new");
    if (cardFilter === "waiting_customer") list = list.filter((t) => t.status === "waiting_customer");
    if (cardFilter === "resolved") list = list.filter((t) => t.status === "resolved");
    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (t) => t.ticketNumber.toLowerCase().includes(query) || t.subject.toLowerCase().includes(query)
      );
    }
    return list;
  }, [tickets, cardFilter, search]);

  return (
    <main className="support-page" dir={isEnglish ? "ltr" : "rtl"}>
      <header className="support-header">
        <Link href="/dashboard" className="support-back">
          {isEnglish ? "← Back to dashboard" : "→ العودة للوحة العميل"}
        </Link>
        <div className="support-header-brand">
          <Image src="/assets/linkly-logo.png" alt="" width={56} height={31} />
          <b>Linkly</b>
        </div>
      </header>

      <section className="support-hero">
        <div>
          <h1>{isEnglish ? "Support" : "الدعم الفني"}</h1>
          <p>{isEnglish ? "How can we help you?" : "كيف يمكننا مساعدتك؟"}</p>
        </div>
        <div className="support-hero-actions">
          <button type="button" className="support-cta-primary" onClick={() => setCreateOpen(true)}>
            {isEnglish ? "+ New ticket" : "+ إنشاء تذكرة جديدة"}
          </button>
        </div>
      </section>

      <section className="support-summary-cards">
        <button type="button" className={cardFilter === "open" ? "active" : ""} onClick={() => setCardFilter(cardFilter === "open" ? null : "open")}>
          <b>{counts.open}</b>
          <span>{isEnglish ? "Open tickets" : "التذاكر المفتوحة"}</span>
        </button>
        <button type="button" className={cardFilter === "waiting_support" ? "active" : ""} onClick={() => setCardFilter(cardFilter === "waiting_support" ? null : "waiting_support")}>
          <b>{counts.waitingSupport}</b>
          <span>{isEnglish ? "Waiting for support" : "بانتظار الدعم"}</span>
        </button>
        <button type="button" className={cardFilter === "waiting_customer" ? "active" : ""} onClick={() => setCardFilter(cardFilter === "waiting_customer" ? null : "waiting_customer")}>
          <b>{counts.waitingCustomer}</b>
          <span>{isEnglish ? "Waiting for you" : "بانتظار ردك"}</span>
        </button>
        <button type="button" className={cardFilter === "resolved" ? "active" : ""} onClick={() => setCardFilter(cardFilter === "resolved" ? null : "resolved")}>
          <b>{counts.resolved}</b>
          <span>{isEnglish ? "Resolved" : "تم حلها"}</span>
        </button>
      </section>

      <section className="support-list-section">
        <div className="support-list-header">
          <h2>{isEnglish ? "My tickets" : "تذاكري"}</h2>
          <input
            className="support-search"
            placeholder={isEnglish ? "Search tickets..." : "بحث في التذاكر..."}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {loading ? (
          <div className="support-empty-state"><p>{isEnglish ? "Loading…" : "جاري التحميل…"}</p></div>
        ) : filteredTickets.length === 0 && tickets.length === 0 ? (
          <div className="support-empty-state">
            <h3>{isEnglish ? "No support tickets" : "لا توجد تذاكر دعم"}</h3>
            <p>{isEnglish ? "If you run into a problem, create a ticket and our team will reach out." : "إذا واجهتك أي مشكلة، أنشئ تذكرة وسيتواصل معك فريقنا."}</p>
            <button type="button" className="support-cta-primary" onClick={() => setCreateOpen(true)}>
              {isEnglish ? "Create your first ticket" : "إنشاء أول تذكرة"}
            </button>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="support-empty-state"><p>{isEnglish ? "No tickets match this filter." : "لا توجد تذاكر مطابقة لهذا الفلتر."}</p></div>
        ) : (
          <div className="support-ticket-table">
            {filteredTickets.map((ticket) => (
              <Link key={ticket.id} href={`/dashboard/support/tickets/${ticket.id}`} className="support-ticket-row">
                <span className="support-ticket-number">{ticket.ticketNumber}</span>
                <span className="support-ticket-subject">{ticket.subject}</span>
                <span className="support-ticket-category">{categoryLabel(ticket.category, lang)}</span>
                <span className={`support-priority-badge ${priorityBadgeClass(ticket.priority)}`}>{priorityLabel(ticket.priority, lang)}</span>
                <span className={`support-status-badge ${statusBadgeClass(ticket.status)}`}>{statusLabel(ticket.status, lang)}</span>
                <span className="support-ticket-time">{timeAgo(ticket.updatedAt, lang)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {createOpen ? (
        <CreateTicketModal
          lang={lang}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            loadTickets();
          }}
        />
      ) : null}
    </main>
  );
}
