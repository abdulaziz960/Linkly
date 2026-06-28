"use client";

import type { DashboardUser, ViewKey } from "../types";
import { navItems } from "../data/navigation";

type DashboardSidebarProps = {
  activeView: ViewKey;
  user: DashboardUser;
  profileStatus: "متصل" | "غير متصل";
  onChangeView: (view: ViewKey) => void;
  onOpenProfile: () => void;
};

function getInitial(name: string) {
  return name.trim().charAt(0) || "ع";
}

export default function DashboardSidebar({ activeView, user, profileStatus, onChangeView, onOpenProfile }: DashboardSidebarProps) {
  return (
    <aside className="dashboard-sidebar">
      <div className="brand">
        <span className="brand-mark">
          <img src="/assets/audiencew-logo.png" alt="" />
        </span>
        AudienceW
      </div>
      <div className="tenant-card">
        <b>موقع الماجدية</b>
        <span>باقة النمو</span>
      </div>
      <nav className="dashboard-nav">
        {navItems.map((item) => (
          <button
            className={activeView === item.key ? "active" : ""}
            key={item.key}
            type="button"
            onClick={() => onChangeView(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <b>حالة الربط</b>
        <span>WhatsApp Cloud API متصل وجاهز لاستقبال الرسائل.</span>
      </div>
      <button className="account-btn" type="button" onClick={onOpenProfile}>
        <span className="account-avatar">{getInitial(user.name)}</span>
        <span>
          <b>{user.name}</b>
          <small>{user.role}</small>
          <em className={profileStatus === "متصل" ? "online" : "offline"}>{profileStatus}</em>
        </span>
      </button>
    </aside>
  );
}
