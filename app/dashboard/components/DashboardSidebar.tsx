"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
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

function DashboardNavIcon({ view }: { view: ViewKey }) {
  const paths: Partial<Record<ViewKey, ReactNode>> = {
    inbox: <><path d="M4 5h16v11H8l-4 3V5Z" /><path d="M8 9h8M8 12h5" /></>,
    contacts: <><circle cx="12" cy="8" r="3" /><path d="M5.5 19c.7-4 3-6 6.5-6s5.8 2 6.5 6" /></>,
    tags: <path d="m4 12 8-8h7v7l-8 8-7-7Zm11-4h.01" />,
    bot: <><rect x="5" y="7" width="14" height="11" rx="3" /><path d="M12 3v4M9 12h.01M15 12h.01M9 15h6" /></>,
    automations: <><path d="m13 2-7 11h6l-1 9 7-12h-6l1-8Z" /></>,
    campaigns: <><path d="m4 13 12-5v8L4 11v2Z" /><path d="M7 13v6h3v-5" /></>,
    templates: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    quickReplies: <><path d="M5 5h14v11H9l-4 3V5Z" /><path d="m13 8-3 4h3l-2 3" /></>,
    workHours: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    reports: <><path d="M5 20V9M12 20V4M19 20v-7" /></>,
    leads: <><circle cx="9" cy="8" r="3" /><path d="M3 19c.5-4 2.5-6 6-6" /><path d="M16 11v6M13 14h6" /></>,
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
  profileStatus,
  selectedChannel,
  language = "ar",
  onChangeView,
  onChangeChannel,
  onOpenProfile
}: DashboardSidebarProps) {
  const isEnglish = language === "en";
  const visibleNavItems = navItems.filter((item) => allowedViews.includes(item.key));
  const connected = integrationStatus === "connected";
  const linkedChannels: Array<{ key: ConversationChannel; label: string; connected: boolean }> = [
    { key: "whatsapp", label: "واتساب", connected },
    { key: "instagram", label: "Instagram", connected: instagramStatus === "connected" },
    { key: "facebook", label: "فيسبوك", connected: facebookStatus === "connected" },
    { key: "telegram", label: "تيليجرام", connected: telegramStatus === "connected" },
    { key: "x", label: "X", connected: xStatus === "connected" },
    { key: "google_maps", label: "خرائط Google", connected: googleMapsStatus === "connected" },
    { key: "email", label: "البريد الإلكتروني", connected: emailStatus === "connected" }
  ];
  const visibleLinkedChannels = linkedChannels.filter((channel) => channel.connected);

  return (
    <aside className="dashboard-sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Image src="/assets/audiencew-logo.png" alt="" width={44} height={44} />
        </span>
        AudienceW
      </div>
      <div className="tenant-card">
        <b>{isEnglish ? "Account" : "حساب العميل"}</b>
        <span>{isEnglish ? "No plan selected" : "لم يتم تحديد الباقة"}</span>
      </div>
      <nav className="dashboard-nav">
        {visibleNavItems.map((item) => (
          <Fragment key={item.key}>
            <button
              className={activeView === item.key && (item.key !== "inbox" || selectedChannel === "all") ? "active" : ""}
              type="button"
              onClick={() => onChangeView(item.key)}
              title={isEnglish ? navItemLabelsEn[item.key] : item.label}
            >
              <DashboardNavIcon view={item.key} />
              <span className="dashboard-nav-label">{isEnglish ? navItemLabelsEn[item.key] : item.label}</span>
            </button>
            {item.key === "inbox" ? (
              <div className="nav-channel-group">
                <span>{isEnglish ? "Channels" : "قنوات التواصل"}</span>
                {visibleLinkedChannels.length ? (
                  visibleLinkedChannels.map((channel) => (
                    <button
                      className={activeView === "inbox" && selectedChannel === channel.key ? "active channel-active" : ""}
                      key={channel.key}
                      type="button"
                      onClick={() => onChangeChannel(channel.key)}
                    >
                      <span className={`nav-channel-dot ${channel.key}`} aria-hidden="true">
                        <ChannelIcon id={channel.key} />
                      </span>
                      {channel.label}
                    </button>
                  ))
                ) : (
                  <small>{isEnglish ? "No channels connected" : "لا توجد قنوات مربوطة"}</small>
                )}
              </div>
            ) : null}
          </Fragment>
        ))}
      </nav>
      <Link className="sidebar-billing-link" href="/billing" title={isEnglish ? "Plans and billing" : "الباقات والاشتراك"}>
        <span aria-hidden="true">◈</span><b>{isEnglish ? "Plans & billing" : "الباقات والاشتراك"}</b>
      </Link>
      <button className="account-btn" type="button" onClick={onOpenProfile}>
        <span className="account-avatar">{getInitial(user.name)}</span>
        <span>
          <b>{user.name}</b>
          <small>{user.role}</small>
          <em className={profileStatus === "متصل" ? "online" : profileStatus === "مشغول" ? "busy" : "offline"}>{profileStatus}</em>
        </span>
      </button>
    </aside>
  );
}
