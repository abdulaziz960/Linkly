"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { usePwaInstall } from "../hooks/usePwaInstall";

const DISMISSED_KEY = "linkly-pwa-coachmark-dismissed-v1";

/**
 * A one-time, dismissible banner shown to anyone who opens the dashboard,
 * pointing them at enabling notifications - see conversation with the
 * user: the sidebar's install row is hidden inside the closed mobile menu
 * and the top-links icon disappears under 1180px, so a first-time phone
 * visitor had no visible prompt at all. This renders in-flow above the
 * active view on every screen size instead.
 *
 * Only handles the post-install "enable notifications" nudge - the
 * pre-install case is now PwaInstallPopup's job (an immediate modal on
 * dashboard entry, per the user's later request), so this never fires for
 * someone who hasn't installed yet and the two never show at once.
 */
export default function PwaInstallCoachmark() {
  const { t } = useLanguage();
  const { supported, installed, done, busy, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  }

  if (!supported || !installed || done || dismissed) return null;

  return (
    <div className="pwa-coachmark" role="note">
      <div className="pwa-coachmark-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
      </div>
      <div className="pwa-coachmark-copy">
        <p className="pwa-coachmark-title">{t("فعّل الإشعارات لتصلك تنبيهات المحادثات", "Enable notifications to get conversation alerts")}</p>
        <p className="pwa-coachmark-body">{t("مثل تنبيه تصعيد محادثة لم يُرد عليها خلال 30 دقيقة.", "Like an alert when a conversation goes unanswered for 30 minutes.")}</p>
      </div>
      <div className="pwa-coachmark-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={install}>{t("فعّل الإشعارات", "Enable notifications")}</button>
        <button type="button" className="icon-btn icon-btn-close" aria-label={t("إغلاق", "Close")} onClick={dismiss}>×</button>
      </div>
    </div>
  );
}
