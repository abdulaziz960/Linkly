"use client";

import { useState } from "react";
import { useAdminNotifications } from "../useAdminNotifications";
import { statusClass } from "../utils";

const TYPE_FILTERS: Array<{ value: "all" | "renewal" | "log"; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "renewal", label: "تجديد" },
  { value: "log", label: "سجلات" }
];

export default function NotificationsView() {
  const { items, unreadCount, unreadIds, soundEnabled, setSoundEnabled, markAllRead, refresh } = useAdminNotifications();
  const [typeFilter, setTypeFilter] = useState<"all" | "renewal" | "log">("all");

  const visibleItems = typeFilter === "all" ? items : items.filter((item) => item.type === typeFilter);

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div>
          <h2>الإشعارات ({visibleItems.length})</h2>
          <p>{unreadCount > 0 ? `${unreadCount} إشعار جديد لم تتم مراجعته.` : "لا يوجد إشعارات جديدة."}</p>
        </div>
        <div className="admin-card-actions">
          <button type="button" onClick={() => refresh()}>
            تحديث
          </button>
          <button type="button" onClick={markAllRead} disabled={unreadCount === 0}>
            تحديد الكل كمقروء
          </button>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-filter-chips">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`admin-filter-chip ${typeFilter === filter.value ? "active" : ""}`}
              onClick={() => setTypeFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="admin-sound-toggle">
          <input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} />
          🔔 صوت عند وصول إشعار جديد
        </label>
      </div>

      <div className="admin-list">
        {visibleItems.map((item) => (
          <div className="admin-notification-row" key={item.id}>
            <span className={`admin-pill ${statusClass(item.level)}`}>{item.level}</span>
            <div className="admin-notification-body">
              <div className="admin-notification-title">
                <strong>{item.title}</strong>
                {unreadIds.has(item.id) ? <span className="admin-pill is-danger">جديد</span> : null}
              </div>
              <span>{item.message}</span>
            </div>
            <span className="admin-notification-at">{item.at}</span>
          </div>
        ))}
        {!visibleItems.length ? <p className="admin-empty-state">لا توجد إشعارات لعرضها.</p> : null}
      </div>
    </section>
  );
}
