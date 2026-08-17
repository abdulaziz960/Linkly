"use client";

import { Fragment } from "react";
import type { ConversationChannel, ConversationChannelFilter, DashboardUser, ViewKey } from "../types";
import { navItems } from "../data/navigation";
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
  onChangeView: (view: ViewKey) => void;
  onChangeChannel: (channel: ConversationChannel) => void;
  onOpenProfile: () => void;
};

function getInitial(name: string) {
  return name.trim().charAt(0) || "ع";
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
  onChangeView,
  onChangeChannel,
  onOpenProfile
}: DashboardSidebarProps) {
  const visibleNavItems = navItems.filter((item) => allowedViews.includes(item.key));
  const connected = integrationStatus === "connected";
  const linkedChannels: Array<{ key: ConversationChannel; label: string; connected: boolean }> = [
    { key: "whatsapp", label: "واتساب", connected },
    { key: "instagram", label: "Instagram", connected: instagramStatus === "connected" },
    { key: "facebook", label: "فيسبوك", connected: facebookStatus === "connected" },
    { key: "telegram", label: "تيليجرام", connected: telegramStatus === "connected" },
    { key: "google_maps", label: "خرائط Google", connected: googleMapsStatus === "connected" },
    { key: "email", label: "البريد الإلكتروني", connected: emailStatus === "connected" }
  ];
  const visibleLinkedChannels = linkedChannels.filter((channel) => channel.connected);

  return (
    <aside className="dashboard-sidebar">
      <div className="brand">
        <span className="brand-mark">
          <img src="/assets/audiencew-logo.png" alt="" />
        </span>
        AudienceW
      </div>
      <div className="tenant-card">
        <b>حساب العميل</b>
        <span>لم يتم تحديد الباقة</span>
      </div>
      <nav className="dashboard-nav">
        {visibleNavItems.map((item) => (
          <Fragment key={item.key}>
            <button
              className={activeView === item.key && (item.key !== "inbox" || selectedChannel === "all") ? "active" : ""}
              type="button"
              onClick={() => onChangeView(item.key)}
            >
              {item.label}
            </button>
            {item.key === "inbox" ? (
              <div className="nav-channel-group">
                <span>قنوات التواصل</span>
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
                  <small>لا توجد قنوات مربوطة</small>
                )}
              </div>
            ) : null}
          </Fragment>
        ))}
      </nav>
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
