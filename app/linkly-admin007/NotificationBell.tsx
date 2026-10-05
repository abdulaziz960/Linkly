"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AdminNotification } from "./useAdminNotifications";
import { useAdminNotifications } from "./useAdminNotifications";
import Icon from "./ds/Icon";
import { Badge, type Tone } from "./ds/primitives";

const LEVEL: Record<string, { label: string; tone: Tone }> = {
  "معلومة": { label: "معلومة", tone: "info" },
  "تنبيه": { label: "تنبيه", tone: "warning" },
  "خطأ": { label: "عاجل", tone: "danger" }
};

function targetHref(item: AdminNotification) {
  if (item.type === "renewal") return "/linkly-admin007/alerts";
  // The logs page hides error-level rows, so an error would open an empty list; send it to the client instead.
  if (item.level === "خطأ" && item.tenantId) return `/linkly-admin007/clients/${item.tenantId}`;
  return `/linkly-admin007/logs?client=${item.tenantId}`;
}

export default function NotificationBell() {
  const { items, actionableCount, unreadIds, markRead, markAllRead, soundEnabled, setSoundEnabled } = useAdminNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="ds-popover-wrap" ref={wrapRef}>
      <button
        type="button"
        className="ds-icon-btn"
        aria-label={actionableCount ? `الإشعارات، ${actionableCount} تحتاج متابعة` : "الإشعارات"}
        aria-expanded={open}
        aria-controls="admin-notification-list"
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="bell" size={19} />
        {actionableCount > 0 ? <span className="ds-dot" aria-hidden="true">{actionableCount > 9 ? "9+" : actionableCount}</span> : null}
      </button>

      {open ? (
        <div id="admin-notification-list" className="ds-popover">
          <div className="ds-popover-head">
            <span>الإشعارات</span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--ds-text-muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} />
              تنبيه صوتي
            </label>
            {actionableCount > 0 ? <button type="button" className="ds-link-btn" onClick={markAllRead}>تحديد الكل كمقروء</button> : null}
          </div>
          <div className="ds-popover-list">
            {items.slice(0, 8).map((item) => {
              const level = LEVEL[item.level] ?? LEVEL["معلومة"];
              return (
                <Link key={item.id} href={targetHref(item)} className="ds-popover-row" onClick={() => { markRead(item.id); setOpen(false); }} style={unreadIds.has(item.id) ? undefined : { opacity: 0.65 }}>
                  <Badge tone={level.tone}>{level.label}</Badge>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                  </div>
                </Link>
              );
            })}
            {!items.length ? (
              <div className="ds-state"><span className="ds-state-icon"><Icon name="checkCircle" size={22} /></span><strong>لا توجد إشعارات</strong><p>كل شيء يسير بشكل طبيعي حاليًا.</p></div>
            ) : null}
          </div>
          {items.length ? <Link href="/linkly-admin007/logs" className="ds-popover-foot" onClick={() => setOpen(false)}>عرض جميع السجلات</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
