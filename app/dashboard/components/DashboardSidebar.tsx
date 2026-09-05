"use client";

import { useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { getChannelName } from "../../channel-names";
import type { ConversationChannel, ConversationChannelFilter, DashboardUser, ViewKey } from "../types";
import { navItems, navItemLabelsEn } from "../data/navigation";
import { ChannelIcon } from "../views/SettingsView";

type DashboardSidebarProps = {
  activeView: ViewKey;
  allowedViews: ViewKey[];
  integrationStatus: "connected" | "not_connected" | "pending";
  instagramStatus: "connected" | "not_connected" | "pending";
  facebookStatus: "connected" | "not_connected" | "pending";
  telegramStatus: "connected" | "not_connected" | "pending";
  xStatus: "connected" | "not_connected" | "pending";
  googleMapsStatus: "connected" | "not_connected" | "pending";
  emailStatus: "connected" | "not_connected" | "pending";
  user: DashboardUser;
  planName: string;
  profileLogo?: string;
  profileStatus: "متصل" | "مشغول" | "غير متصل";
  selectedChannel: ConversationChannelFilter;
  language?: "ar" | "en";
  onChangeView: (view: ViewKey) => void;
  onChangeChannel: (channel: ConversationChannel) => void;
  onOpenProfile: () => void;
};

function getInitial(name: string) {
  return name.trim().charAt(0) || "ع";
}

type SidebarTooltipState = {
  label: string;
  top: number;
  left?: number;
  right?: number;
};

function DashboardNavIcon({ view }: { view: ViewKey }) {
  const paths: Partial<Record<ViewKey, ReactNode>> = {
    inbox: <><path d="M4 5h16v11H8l-4 3V5Z" /><path d="M8 9h8M8 12h5" /></>,
    contacts: <><circle cx="12" cy="8" r="3" /><path d="M5.5 19c.7-4 3-6 6.5-6s5.8 2 6.5 6" /></>,
    tags: <path d="m4 12 8-8h7v7l-8 8-7-7Zm11-4h.01" />,
    bot: <><rect x="5" y="7" width="14" height="11" rx="3" /><path d="M12 3v4M9 12h.01M15 12h.01M9 15h6" /></>,
    automations: <><path d="m13 2-7 11h6l-1 9 7-12h-6l1-8Z" /></>,
    campaigns: <><path d="m4 13 12-5v8L4 11v2Z" /><path d="M7 13v6h3v-5" /></>,
    segments: <><circle cx="7" cy="7" r="3" /><circle cx="17" cy="7" r="3" /><circle cx="12" cy="17" r="3" /></>,
    templates: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    quickReplies: <><path d="M5 5h14v11H9l-4 3V5Z" /><path d="m13 8-3 4h3l-2 3" /></>,
    workHours: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    reports: <><path d="M5 20V9M12 20V4M19 20v-7" /></>,
    teams: <><circle cx="8" cy="9" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M2.5 19c.5-4 2.5-6 5.5-6s5 2 5.5 6M14 14c3 0 5 1.5 5.5 4.5" /></>,
    employees: <><rect x="4" y="5" width="16" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M6.5 16c.5-2 1.3-3 2.5-3s2 1 2.5 3M14 10h3M14 14h3" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a8 8 0 0 0-1.7 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.4-1.1a8 8 0 0 0 1.7 1l.4 3.1h5l.4-3.1a8 8 0 0 0 1.7-1L19 18l2-3.5-2.1-1.5c.1-.3.1-.7.1-1Z" /></>
  };

  return <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[view]}</svg>;
}

export default function DashboardSidebar({
  activeView,
  allowedViews,
  integrationStatus,
  instagramStatus,
  facebookStatus,
  telegramStatus,
  xStatus,
  googleMapsStatus,
  emailStatus,
  user,
  planName,
  profileLogo,
  profileStatus,
  selectedChannel,
  language = "ar",
  onChangeView,
  onChangeChannel,
  onOpenProfile
}: DashboardSidebarProps) {
  const [navigationSearchOpen, setNavigationSearchOpen] = useState(false);
  const [navigationSearch, setNavigationSearch] = useState("");
  const [sidebarTooltip, setSidebarTooltip] = useState<SidebarTooltipState | null>(null);
  const isEnglish = language === "en";
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
  const visibleNavItems = navItems.filter((item) => allowedViews.includes(item.key));
  const navigationGroups: Array<{ label: string; labelEn: string; keys: ViewKey[] }> = [
    { label: "التواصل", labelEn: "Communication", keys: ["inbox", "quickReplies", "workHours", "bot", "automations"] },
    { label: "التسويق", labelEn: "Marketing", keys: ["campaigns", "segments", "templates"] },
    { label: "إدارة العملاء", labelEn: "Customers", keys: ["contacts", "tags"] },
    { label: "الفريق", labelEn: "Team", keys: ["teams", "employees"] },
    { label: "التحليلات والإعدادات", labelEn: "Insights & settings", keys: ["reports", "settings"] }
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
    <aside className="dashboard-sidebar">
      <div className="sidebar-top-links">
        <Link
          className="sidebar-billing-link"
          href="/dashboard/support"
          onMouseEnter={(event) => showSidebarTooltip(event, isEnglish ? "Support" : "الدعم الفني")}
          onMouseLeave={hideSidebarTooltip}
          onFocus={(event) => showSidebarTooltip(event, isEnglish ? "Support" : "الدعم الفني")}
          onBlur={hideSidebarTooltip}
          aria-label={isEnglish ? "Support" : "الدعم الفني"}
        >
          <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2-2.4 3.6M12 17h.01" />
          </svg>
        </Link>
        <Link
          className="sidebar-billing-link"
          href="/dashboard/development"
          onMouseEnter={(event) => showSidebarTooltip(event, isEnglish ? "Development" : "تطوير المنصة")}
          onMouseLeave={hideSidebarTooltip}
          onFocus={(event) => showSidebarTooltip(event, isEnglish ? "Development" : "تطوير المنصة")}
          onBlur={hideSidebarTooltip}
          aria-label={isEnglish ? "Development" : "تطوير المنصة"}
        >
          <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 17l-5-5 5-5M15 7l5 5-5 5" />
          </svg>
        </Link>
        {user.role === "مالك الحساب" ? (
          <Link
            className="sidebar-billing-link"
            href="/billing"
            onMouseEnter={(event) => showSidebarTooltip(event, isEnglish ? "Plans and billing" : "الباقات والاشتراك")}
            onMouseLeave={hideSidebarTooltip}
            onFocus={(event) => showSidebarTooltip(event, isEnglish ? "Plans and billing" : "الباقات والاشتراك")}
            onBlur={hideSidebarTooltip}
            aria-label={isEnglish ? "Plans and billing" : "الباقات والاشتراك"}
          >
            <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="M3 10h18M7 15h4" />
            </svg>
          </Link>
        ) : null}
      </div>
      <div className="sidebar-brand" aria-label="Linkly">
        <Image src="/assets/linkly-logo.png" alt="Linkly" width={46} height={25} priority />
      </div>
      <div className="tenant-card">
        <b>{isEnglish ? "Account" : "حساب العميل"}</b>
        <span>{planName || (isEnglish ? "No plan selected" : "لم يتم تحديد الباقة")}</span>
      </div>
      <nav className="dashboard-nav">
        <button
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
        {navigationSearchOpen ? (
          <div className="sidebar-search-popover">
            <label><span>{isEnglish ? "Go to" : "انتقل إلى"}</span><input autoFocus value={navigationSearch} onChange={(event) => setNavigationSearch(event.target.value)} placeholder={isEnglish ? "Search sections..." : "ابحث عن قسم..."} /></label>
            <div>
              {visibleNavItems.filter((item) => `${item.label} ${navItemLabelsEn[item.key]}`.toLowerCase().includes(navigationSearch.trim().toLowerCase())).map((item) => (
                <button key={item.key} type="button" onClick={() => { onChangeView(item.key); setNavigationSearchOpen(false); setNavigationSearch(""); }}><DashboardNavIcon view={item.key} /><span>{isEnglish ? navItemLabelsEn[item.key] : item.label}</span></button>
              ))}
              {visibleLinkedChannels.filter((channel) => channel.label.toLowerCase().includes(navigationSearch.trim().toLowerCase())).map((channel) => (
                <button key={channel.key} type="button" onClick={() => { onChangeChannel(channel.key); setNavigationSearchOpen(false); setNavigationSearch(""); }}><span className={`nav-channel-dot ${channel.key}`} aria-hidden="true"><ChannelIcon id={channel.key} /></span><span>{channel.label}</span></button>
              ))}
            </div>
          </div>
        ) : null}
        {navigationGroups.map((group) => {
          const groupItems = visibleNavItems.filter((item) => group.keys.includes(item.key));
          if (!groupItems.length) return null;
          return (
          <div className="dashboard-nav-cluster" key={group.label} aria-label={isEnglish ? group.labelEn : group.label}>
            <span className="dashboard-nav-group-label">{isEnglish ? group.labelEn : group.label}</span>
            {groupItems.map((item) => (
            <button
              key={item.key}
              className={activeView === item.key && (item.key !== "inbox" || selectedChannel === "all") ? "active" : ""}
              type="button"
              onClick={() => { hideSidebarTooltip(); onChangeView(item.key); }}
              onMouseEnter={(event) => showSidebarTooltip(event, isEnglish ? navItemLabelsEn[item.key] : item.label)}
              onMouseLeave={hideSidebarTooltip}
              onFocus={(event) => showSidebarTooltip(event, isEnglish ? navItemLabelsEn[item.key] : item.label)}
              onBlur={hideSidebarTooltip}
              aria-label={isEnglish ? navItemLabelsEn[item.key] : item.label}
            >
              <DashboardNavIcon view={item.key} />
            </button>
            ))}
          </div>
          );
        })}
      </nav>
      <button
        className="account-btn"
        type="button"
        onClick={() => { hideSidebarTooltip(); onOpenProfile(); }}
        onMouseEnter={(event) => showSidebarTooltip(event, isEnglish ? "Profile" : "الملف الشخصي")}
        onMouseLeave={hideSidebarTooltip}
        onFocus={(event) => showSidebarTooltip(event, isEnglish ? "Profile" : "الملف الشخصي")}
        onBlur={hideSidebarTooltip}
        aria-label={isEnglish ? "Profile" : "الملف الشخصي"}
      >
        <span className={`account-avatar ${profileLogo ? "has-logo" : ""}`}>
          {profileLogo ? <Image src={profileLogo} alt="" width={38} height={38} unoptimized /> : getInitial(user.name)}
        </span>
        <span>
          <b>{user.name}</b>
          <small>{user.role}</small>
          <em className={profileStatus === "متصل" ? "online" : profileStatus === "مشغول" ? "busy" : "offline"}>
            {isEnglish
              ? profileStatus === "متصل"
                ? "Online"
                : profileStatus === "مشغول"
                  ? "Busy"
                  : "Offline"
              : profileStatus}
          </em>
        </span>
      </button>
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
