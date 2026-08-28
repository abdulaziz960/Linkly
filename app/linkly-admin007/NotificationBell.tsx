"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AdminNotification } from "./useAdminNotifications";
import { useAdminNotifications } from "./useAdminNotifications";
import { statusClass } from "./utils";
import { useLanguage } from "./i18n";

function levelLabel(level: string, t: (ar: string, en: string) => string) {
  if (level === "معلومة") return t("معلومة", "Info");
  if (level === "تنبيه") return t("تنبيه", "Alert");
  if (level === "خطأ") return t("خطأ", "Error");
  return level;
}

function targetHref(item: AdminNotification) {
  if (item.type === "renewal") return "/linkly-admin007/alerts";
  return `/linkly-admin007/logs?client=${item.tenantId}`;
}

export default function NotificationBell() {
  const { t } = useLanguage();
  const { items, unreadCount, markAllRead } = useAdminNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleToggle() {
    setOpen((current) => {
      const next = !current;
      if (next) markAllRead();
      return next;
    });
  }

  return (
    <div className="admin-notif-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="admin-notif-bell"
        onClick={handleToggle}
        aria-label={t("الإشعارات", "Notifications")}
        aria-expanded={open}
        aria-controls="admin-notification-list"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 ? <span className="admin-nav-badge admin-notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>

      {open ? (
        <div id="admin-notification-list" className="admin-notif-dropdown">
          <div className="admin-notif-dropdown-head">{t("الإشعارات", "Notifications")}</div>
          <div className="admin-notif-dropdown-list">
            {items.slice(0, 10).map((item) => (
              <Link key={item.id} href={targetHref(item)} className="admin-notif-dropdown-row" onClick={() => setOpen(false)}>
                <span className={`admin-pill ${statusClass(item.level)}`}>{levelLabel(item.level, t)}</span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                </div>
              </Link>
            ))}
            {!items.length ? <p className="admin-empty-state">{t("لا توجد إشعارات حاليًا.", "No notifications right now.")}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
