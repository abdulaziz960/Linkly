"use client";

import type { ViewKey } from "../types";
import { navItems } from "../data/navigation";

type DashboardSidebarProps = {
  activeView: ViewKey;
  profileStatus: "متصل" | "غير متصل";
  onChangeView: (view: ViewKey) => void;
  onOpenProfile: () => void;
};

export default function DashboardSidebar({ activeView, profileStatus, onChangeView, onOpenProfile }: DashboardSidebarProps) {
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
        <span className="account-avatar">ع</span>
        <span>
          <b>عبدالعزيز الكيالي</b>
          <small>مالك الحساب</small>
          <em className={profileStatus === "متصل" ? "online" : "offline"}>{profileStatus}</em>
        </span>
      </button>
    </aside>
  );
}
