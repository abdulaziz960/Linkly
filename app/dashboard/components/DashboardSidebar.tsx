"use client";

import { useEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { planDisplayName } from "../../../lib/plan-features";
import Link from "next/link";
import PwaInstallButton from "./PwaInstallButton";
import { getChannelName } from "../../channel-names";
import type { ConversationChannel, ConversationChannelFilter, ViewKey } from "../types";
import { navItems, navItemLabelsEn } from "../data/navigation";
import { ChannelIcon } from "../views/SettingsView";
import { usePlanAccess } from "../plan-access-context";

type DashboardSidebarProps = {
  activeView: ViewKey;
  allowedViews: ViewKey[];
  /** Sections the user's role allows but the plan doesn't - shown locked. */
  lockedViews?: ViewKey[];
  integrationStatus: "connected" | "not_connected" | "pending";
  instagramStatus: "connected" | "not_connected" | "pending";
  facebookStatus: "connected" | "not_connected" | "pending";
  telegramStatus: "connected" | "not_connected" | "pending";
  xStatus: "connected" | "not_connected" | "pending";
  googleMapsStatus: "connected" | "not_connected" | "pending";
  emailStatus: "connected" | "not_connected" | "pending";
  planName: string;
  branding: { name: string; logoDataUrl: string };
  selectedChannel: ConversationChannelFilter;
  language?: "ar" | "en";
  mobileOpen: boolean;
  canManageBilling: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onChangeView: (view: ViewKey) => void;
  onChangeChannel: (channel: ConversationChannel) => void;
};

type SidebarTooltipState = {
  label: string;
  top: number;
  left?: number;
  right?: number;
};

function DashboardNavIcon({ view }: { view: ViewKey }) {
  const paths: Partial<Record<ViewKey, ReactNode>> = {
    inbox: <><path d="M4 5h16v11H8l-4 3V5Z" /><path d="M8 9h8M8 12h5" /></>,
    operations: <><circle cx="12" cy="12" r="9" /><path d="M8 12h2l1.5-4L13 16l1.5-4H16" /></>,
    contacts: <><circle cx="12" cy="8" r="3" /><path d="M5.5 19c.7-4 3-6 6.5-6s5.8 2 6.5 6" /></>,
    pipeline: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></>,
    ai: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />,
    knowledgeBase: <><path d="M12 5v15M3 4h5l4 2 4-2h5v15h-5l-4 2-4-2H3z" /></>,
    developers: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" /></>,
    branches: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
    catalog: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" /><path d="m3 7.5 9 4.5 9-4.5M12 12v9" /></>,
    branding: <><circle cx="12" cy="12" r="8" /><path d="m8 16 4-9 4 9m-6-3h4" /></>,
    tags: <path d="m4 12 8-8h7v7l-8 8-7-7Zm11-4h.01" />,
    bot: <><rect x="5" y="7" width="14" height="11" rx="3" /><path d="M12 3v4M9 12h.01M15 12h.01M9 15h6" /></>,
    automations: <><path d="m13 2-7 11h6l-1 9 7-12h-6l1-8Z" /></>,
    campaigns: <><path d="m4 13 12-5v8L4 11v2Z" /><path d="M7 13v6h3v-5" /></>,
    emailPromotions: <><path d="M4 5h16v14H4z" /><path d="m4 7 8 6 8-6" /><path d="M7 16h5" /></>,
    segments: <><circle cx="7" cy="7" r="3" /><circle cx="17" cy="7" r="3" /><circle cx="12" cy="17" r="3" /></>,
    templates: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    quickReplies: <><path d="M5 5h14v11H9l-4 3V5Z" /><path d="m13 8-3 4h3l-2 3" /></>,
    workHours: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    reports: <><path d="M5 20V9M12 20V4M19 20v-7" /></>,
    teams: <><circle cx="8" cy="9" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M2.5 19c.5-4 2.5-6 5.5-6s5 2 5.5 6M14 14c3 0 5 1.5 5.5 4.5" /></>,
    employees: <><rect x="4" y="5" width="16" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M6.5 16c.5-2 1.3-3 2.5-3s2 1 2.5 3M14 10h3M14 14h3" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a8 8 0 0 0-1.7 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.4-1.1a8 8 0 0 0 1.7 1l.4 3.1h5l.4-3.1a8 8 0 0 0 1.7-1L19 18l2-3.5-2.1-1.5c.1-.3.1-.7.1-1Z" /></>,
    integrations: <><path d="M9 3v4M15 3v4M9 21v-4M15 21v-4" /><rect x="6" y="7" width="12" height="10" rx="3" /></>
  };

  return <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[view]}</svg>;
}


export default function DashboardSidebar({
  activeView,
  allowedViews,
  lockedViews = [],
  integrationStatus,
  instagramStatus,
  facebookStatus,
  telegramStatus,
  xStatus,
  googleMapsStatus,
  emailStatus,
  planName,
  branding,
  selectedChannel,
  language = "ar",
  mobileOpen,
  canManageBilling,
  onClose,
  onOpenProfile,
  onChangeView,
  onChangeChannel
}: DashboardSidebarProps) {
  const { promptForView } = usePlanAccess();
  const [navigationSearchOpen, setNavigationSearchOpen] = useState(false);
  const [navigationSearch, setNavigationSearch] = useState("");
  const [sidebarTooltip, setSidebarTooltip] = useState<SidebarTooltipState | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const searchPopoverRef = useRef<HTMLDivElement>(null);
  const isEnglish = language === "en";
  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const controls = [...(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
        .filter((element) => element.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [mobileOpen, onClose]);
  useEffect(() => {
    if (!navigationSearchOpen) return;
    function close() {
      setNavigationSearchOpen(false);
      setNavigationSearch("");
    }
    function handleClickOutside(event: globalThis.MouseEvent) {
      if (searchTriggerRef.current?.contains(event.target as Node)) return;
      if (searchPopoverRef.current?.contains(event.target as Node)) return;
      close();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigationSearchOpen]);
  const showSidebarTooltip = (
    event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
    label: string
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const top = Math.min(window.innerHeight - 24, Math.max(24, bounds.top + bounds.height / 2));

    setSidebarTooltip(isEnglish
      ? { label, top, left: bounds.right + 12 }
      : { label, top, right: window.innerWidth - bounds.left + 12 });
  };
  const hideSidebarTooltip = () => setSidebarTooltip(null);
  // The live operations board lives inside Reports as a tab for anyone who has both: one entry, not two.
  const mergedOperations = allowedViews.includes("operations") && allowedViews.includes("reports");
  // Same for the AI assistant and the knowledge base it answers from.
  const mergedAi = allowedViews.includes("ai") && allowedViews.includes("knowledgeBase");
  const mergedContacts = allowedViews.includes("contacts") && allowedViews.includes("tags");
  // Leads (the sales kanban) are a tab of the customers page for anyone who has both.
  const leadsInContacts = allowedViews.includes("contacts") && (allowedViews.includes("pipeline") || lockedViews.includes("pipeline"));
  // Employees, teams and the teams' work hours are one page; the entry shows when any of the extra parts exists.
  const mergedTeam = allowedViews.includes("employees") && (allowedViews.includes("teams") || allowedViews.includes("workHours"));
  const labelFor = (item: { key: ViewKey; label: string }) =>
    item.key === "reports" && mergedOperations ? (isEnglish ? "Reports & operations" : "التقارير والعمليات")
      : item.key === "ai" && mergedAi ? (isEnglish ? "AI assistant & knowledge base" : "مساعد AI وقاعدة المعرفة")
      : item.key === "catalog" && catalogPair ? (isEnglish ? "Catalog & branches" : "الكتالوج والفروع")
      : item.key === "contacts" && (mergedContacts || leadsInContacts) ? (isEnglish ? "Customers, leads & tags" : "العملاء والعملاء المحتملون والوسوم")
      : item.key === "employees" && mergedTeam ? (isEnglish ? "Team, permissions & hours" : "الموظفون والفرق وساعات العمل")
      : isEnglish ? navItemLabelsEn[item.key] : item.label;
  // A part that is merged into a page is not a sidebar entry of its own, allowed or plan-locked: when it is locked
  // the page shows it as a locked tab that opens the same upgrade message.
  const partOf = (part: ViewKey, anchor: ViewKey) => allowedViews.includes(anchor) && (allowedViews.includes(part) || lockedViews.includes(part));
  const mergedPart = (key: ViewKey) =>
    (key === "operations" && partOf("operations", "reports")) ||
    (key === "knowledgeBase" && partOf("knowledgeBase", "ai")) ||
    (key === "tags" && partOf("tags", "contacts")) ||
    (key === "pipeline" && partOf("pipeline", "contacts")) ||
    (key === "teams" && partOf("teams", "employees")) ||
    (key === "workHours" && partOf("workHours", "employees")) ||
    (key === "integrations" && partOf("integrations", "settings")) ||
    (key === "developers" && partOf("developers", "settings"));
  // Catalog and branches share one entry as soon as either is available (the other shows as a locked tab).
  const catalogPair = allowedViews.includes("catalog") || allowedViews.includes("branches");
  const navTarget = (item: { key: ViewKey }): ViewKey => (item.key === "catalog" && catalogPair && !allowedViews.includes("catalog") ? "branches" : item.key);
  const itemLocked = (item: { key: ViewKey }) => (item.key === "catalog" && catalogPair ? false : lockedViews.includes(item.key));
  const itemActive = (item: { key: ViewKey }) => activeView === item.key || (item.key === "catalog" && catalogPair && activeView === "branches");
  const visibleNavItems = navItems.filter(
    (item) =>
      (allowedViews.includes(item.key) || lockedViews.includes(item.key) || (item.key === "catalog" && catalogPair)) &&
      !mergedPart(item.key) &&
      !(item.key === "branches" && catalogPair)
  );
  // Four blocks, most-used first: daily work, marketing, automation and AI, then administration.
  const navigationGroups: Array<{ label: string; labelEn: string; keys: ViewKey[] }> = [
    { label: "العمل اليومي", labelEn: "Daily work", keys: ["inbox", "quickReplies", "contacts", "tags", "pipeline", "catalog", "branches"] },
    { label: "التسويق", labelEn: "Marketing", keys: ["campaigns", "emailPromotions", "segments", "templates"] },
    { label: "الأتمتة والذكاء", labelEn: "Automation & AI", keys: ["bot", "automations", "ai", "knowledgeBase"] },
    { label: "الإدارة", labelEn: "Administration", keys: ["reports", "operations", "settings", "integrations", "developers", "employees", "teams", "workHours", "branding"] }
  ];
  const connected = integrationStatus === "connected";
  const linkedChannels: Array<{ key: ConversationChannel; label: string; connected: boolean }> = [
    { key: "whatsapp", label: getChannelName("whatsapp", language), connected },
    { key: "instagram", label: getChannelName("instagram", language), connected: instagramStatus === "connected" },
    { key: "facebook", label: getChannelName("facebook", language), connected: facebookStatus === "connected" },
    { key: "telegram", label: getChannelName("telegram", language), connected: telegramStatus === "connected" },
    { key: "x", label: getChannelName("x", language), connected: xStatus === "connected" },
    { key: "google_maps", label: getChannelName("google_maps", language), connected: googleMapsStatus === "connected" },
    { key: "email", label: getChannelName("email", language), connected: emailStatus === "connected" }
  ];
  const visibleLinkedChannels = linkedChannels.filter((channel) => channel.connected);

  return (
    <aside id="dashboard-mobile-drawer" className="dashboard-sidebar" ref={drawerRef} role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? "true" : undefined} aria-label={mobileOpen ? (isEnglish ? "Dashboard menu" : "قائمة لوحة التحكم") : undefined}>
      <div className="dashboard-drawer-head">
        <strong>{isEnglish ? "Menu" : "القائمة"}</strong>
        <button ref={closeRef} type="button" aria-label={isEnglish ? "Close menu" : "إغلاق القائمة"} onClick={onClose}>×</button>
      </div>
      <div className="sidebar-brand" aria-label={branding.name}>
        <Image src={branding.logoDataUrl} alt={branding.name} width={46} height={25} priority unoptimized={branding.logoDataUrl.startsWith("data:")} />
      </div>
      <div className="tenant-card">
        <b>{isEnglish ? "Account" : "حساب العميل"}</b>
        <span>{planName ? planDisplayName(planName, isEnglish ? "en" : "ar") : (isEnglish ? "No plan selected" : "لم يتم تحديد الباقة")}</span>
      </div>
      <nav className="dashboard-nav">
        <button
          ref={searchTriggerRef}
          className="sidebar-search-trigger"
          type="button"
          aria-label={isEnglish ? "Search navigation" : "البحث في القائمة"}
          aria-expanded={navigationSearchOpen}
          onClick={() => { hideSidebarTooltip(); setNavigationSearchOpen((current) => !current); }}
          onMouseEnter={(event) => showSidebarTooltip(event, isEnglish ? "Search navigation" : "البحث في القائمة")}
          onMouseLeave={hideSidebarTooltip}
          onFocus={(event) => showSidebarTooltip(event, isEnglish ? "Search navigation" : "البحث في القائمة")}
          onBlur={hideSidebarTooltip}
        >
          <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
        </button>
        {navigationSearchOpen && typeof document !== "undefined"
          ? createPortal(
            <div ref={searchPopoverRef} className={`sidebar-search-popover${isEnglish ? " lang-en" : ""}`}>
              <label><span>{isEnglish ? "Go to" : "انتقل إلى"}</span><input autoFocus value={navigationSearch} onChange={(event) => setNavigationSearch(event.target.value)} placeholder={isEnglish ? "Search sections..." : "ابحث عن قسم..."} /></label>
              <div>
                {visibleNavItems.filter((item) => `${item.label} ${navItemLabelsEn[item.key]}`.toLowerCase().includes(navigationSearch.trim().toLowerCase())).map((item) => (
                  <button key={item.key} type="button" onClick={() => { if (itemLocked(item)) { promptForView(item.key, labelFor(item)); } else { onChangeView(navTarget(item)); } setNavigationSearchOpen(false); setNavigationSearch(""); }}><DashboardNavIcon view={item.key} /><span>{labelFor(item)}</span></button>
                ))}
                {visibleLinkedChannels.filter((channel) => channel.label.toLowerCase().includes(navigationSearch.trim().toLowerCase())).map((channel) => (
                  <button key={channel.key} type="button" onClick={() => { onChangeChannel(channel.key); setNavigationSearchOpen(false); setNavigationSearch(""); }}><span className={`nav-channel-dot ${channel.key}`} aria-hidden="true"><ChannelIcon id={channel.key} /></span><span>{channel.label}</span></button>
                ))}
              </div>
            </div>,
            document.body
          )
          : null}
        {navigationGroups.map((group) => {
          const groupItems = visibleNavItems
            .filter((item) => group.keys.includes(item.key))
            .sort((a, b) => group.keys.indexOf(a.key) - group.keys.indexOf(b.key));
          if (!groupItems.length) return null;
          return (
          <div className="dashboard-nav-cluster" key={group.label} aria-label={isEnglish ? group.labelEn : group.label}>
            <span className="dashboard-nav-group-label">{isEnglish ? group.labelEn : group.label}</span>
            {groupItems.map((item) => (
            <button
              key={item.key}
              className={`${itemActive(item) && (item.key !== "inbox" || selectedChannel === "all") ? "active" : ""}${itemLocked(item) ? " plan-locked" : ""}`}
              type="button"
              onClick={() => {
                hideSidebarTooltip();
                if (itemLocked(item)) { promptForView(item.key, labelFor(item)); return; }
                onChangeView(navTarget(item));
              }}
              onMouseEnter={(event) => showSidebarTooltip(event, labelFor(item))}
              onMouseLeave={hideSidebarTooltip}
              onFocus={(event) => showSidebarTooltip(event, labelFor(item))}
              onBlur={hideSidebarTooltip}
              aria-label={labelFor(item)}
            >
              <DashboardNavIcon view={item.key} />
              <span className="dashboard-nav-label">{labelFor(item)}</span>
            </button>
            ))}
          </div>
          );
        })}
      </nav>
      <div className="dashboard-mobile-extras">
        <PwaInstallButton showLabel />
        <button type="button" onClick={() => { onClose(); onOpenProfile(); }}>{isEnglish ? "Profile" : "الملف الشخصي"}</button>
        <Link href="/dashboard/support" onClick={onClose}>{isEnglish ? "Support" : "الدعم الفني"}</Link>
        <Link href="/dashboard/development" onClick={onClose}>{isEnglish ? "Development" : "تطوير المنصة"}</Link>
        {canManageBilling ? <Link href="/billing" onClick={onClose}>{isEnglish ? "Plans and billing" : "الباقات والاشتراك"}</Link> : null}
      </div>
      {sidebarTooltip && typeof document !== "undefined"
        ? createPortal(
          <span
            className="sidebar-tooltip-portal"
            role="tooltip"
            style={{ top: sidebarTooltip.top, left: sidebarTooltip.left, right: sidebarTooltip.right }}
          >
            {sidebarTooltip.label}
          </span>,
          document.body
        )
        : null}
    </aside>
  );
}
