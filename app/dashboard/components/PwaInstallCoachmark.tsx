"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { usePwaInstall } from "../hooks/usePwaInstall";

const DISMISSED_KEY = "linkly-pwa-coachmark-dismissed-v1";

/**
 * A one-time, dismissible banner shown to anyone who opens the dashboard,
 * pointing them at installing the app / enabling notifications - see
 * conversation with the user: the sidebar's install row is hidden inside
 * the closed mobile menu and the top-links icon disappears under 1180px, so
 * a first-time phone visitor had no visible prompt at all. This renders
 * in-flow above the active view on every screen size instead. iOS and
 * Android/desktop get different copy, since only iOS requires the manual
 * "Add to Home Screen" steps before notifications work.
 */
export default function PwaInstallCoachmark() {
  const { t } = useLanguage();
  const { supported, installed, done, busy, isIos, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true);
  const [showIosSteps, setShowIosSteps] = useState(false);

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

  function handlePrimaryClick() {
    if (isIos && !installed) {
      setShowIosSteps(true);
      return;
    }
    install();
  }

  if (!supported || done || dismissed) return null;

  const title = isIos && !installed
    ? t("ثبّت التطبيق لتصلك تنبيهات المحادثات", "Install the app to get conversation alerts")
    : t("فعّل الإشعارات لتصلك تنبيهات المحادثات", "Enable notifications to get conversation alerts");
  const body = isIos && !installed
    ? t("على الآيفون، آبل تتطلب تثبيت التطبيق أولًا قبل أي إشعار.", "On iPhone, Apple requires installing the app first before any notification.")
    : t("مثل تنبيه تصعيد محادثة لم يُرد عليها خلال 30 دقيقة.", "Like an alert when a conversation goes unanswered for 30 minutes.");
  const primaryLabel = isIos && !installed
    ? t("عرض الخطوات", "Show steps")
    : installed
      ? t("فعّل الإشعارات", "Enable notifications")
      : t("ثبّت وفعّل", "Install and enable");

  return (
    <div className="pwa-coachmark" role="note">
      <div className="pwa-coachmark-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
      </div>
      <div className="pwa-coachmark-copy">
        <p className="pwa-coachmark-title">{title}</p>
        {showIosSteps ? (
          <ol className="pwa-coachmark-steps">
            <li>{t("اضغط على أيقونة المشاركة ⬆️ بأسفل سفاري", "Tap the Share icon ⬆️ at the bottom of Safari")}</li>
            <li>{t("اختر \"إضافة إلى الشاشة الرئيسية\"", "Choose \"Add to Home Screen\"")}</li>
            <li>{t("افتح Linkly من الأيقونة الجديدة، وارجع تفتح هذه الرسالة لتفعيل الإشعارات", "Open Linkly from the new icon, then come back to this message to enable notifications")}</li>
          </ol>
        ) : (
          <p className="pwa-coachmark-body">{body}</p>
        )}
      </div>
      <div className="pwa-coachmark-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={handlePrimaryClick}>{primaryLabel}</button>
        <button type="button" className="icon-btn icon-btn-close" aria-label={t("إغلاق", "Close")} onClick={dismiss}>×</button>
      </div>
    </div>
  );
}
