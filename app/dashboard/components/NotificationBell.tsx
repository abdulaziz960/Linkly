"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n";
import { formatDateTime } from "../../../lib/time";

const SEEN_AT_KEY = "linkly-notifications-seen-at";

export type NotificationItem = {
  id: string;
  conversationId: string;
  customer: string;
  text: string;
  createdAt: string;
};

/**
 * In-app notification center (see conversation with the user) - a bell in
 * the top-links row, between the install button and the profile button,
 * listing recent alerts (currently just SLA escalations - any future
 * system_* message type can feed the same list). "Unread" is a per-device
 * localStorage timestamp rather than a server-tracked read state: simpler,
 * and consistent with how PwaInstallCoachmark already remembers a dismiss
 * on this device rather than server-side.
 */
export default function NotificationBell({ notifications, onOpenNotification }: { notifications: NotificationItem[]; onOpenNotification: (conversationId: string) => void }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setSeenAt(Number(localStorage.getItem(SEEN_AT_KEY)) || 0);
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next) {
        const now = Date.now();
        setSeenAt(now);
        try {
          localStorage.setItem(SEEN_AT_KEY, String(now));
        } catch {}
      }
      return next;
    });
  }

  const unreadCount = notifications.filter((item) => new Date(item.createdAt).getTime() > seenAt).length;

  return (
    <div className="notification-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="sidebar-billing-link is-notifications"
        onClick={toggleOpen}
        data-tooltip={t("الإشعارات", "Notifications")}
        aria-label={t("الإشعارات", "Notifications")}
        aria-expanded={open}
      >
        <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount ? <span className="notification-bell-badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="notification-bell-panel" role="menu">
          <div className="notification-bell-panel-head">
            <span>{t("الإشعارات", "Notifications")}</span>
          </div>
          {notifications.length ? (
            <ul>
              {notifications.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-label={`${item.customer} — ${item.text}`}
                    onClick={() => {
                      setOpen(false);
                      onOpenNotification(item.conversationId);
                    }}
                  >
                    <b>{item.customer}</b>
                    <span className="notification-bell-text">{item.text}</span>
                    <small>{formatDateTime(item.createdAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notification-bell-empty">{t("لا توجد إشعارات حاليًا", "No notifications right now")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
