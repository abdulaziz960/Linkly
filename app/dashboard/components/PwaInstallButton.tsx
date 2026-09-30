"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../i18n";
import { usePwaInstall } from "../hooks/usePwaInstall";

/**
 * "ثبّت التطبيق على جهازك" (see conversation with the user) - a single
 * button in the dashboard's top-links row (and sidebar, via showLabel) that
 * installs the PWA (or, on iOS where no install API exists, walks the user
 * through the manual Share-sheet steps) and subscribes the device to Web
 * Push, so new messages/replies notify even when the tab/app isn't open.
 * Hides itself once both are already done, and entirely on a browser with
 * no Push API support at all. See also PwaInstallCoachmark, the proactive
 * banner that points new visitors at whichever instance of this button is
 * actually visible on their device.
 */
export default function PwaInstallButton({ showLabel = false }: { showLabel?: boolean }) {
  const { t } = useLanguage();
  const { supported, installed, done, busy, isIos, install } = usePwaInstall();
  const [showIosHelp, setShowIosHelp] = useState(false);

  function handleClick() {
    if (isIos && !installed) {
      setShowIosHelp(true);
      return;
    }
    install();
  }

  if (!supported || done) return null;

  const label = installed ? t("فعّل الإشعارات", "Enable notifications") : t("ثبّت التطبيق", "Install app");

  return (
    <>
      <button
        type="button"
        className="sidebar-billing-link is-pwa-install"
        onClick={handleClick}
        disabled={busy}
        data-tooltip={label}
        aria-label={label}
      >
        <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="2" width="14" height="20" rx="2.5" />
          <path d="M9 18h6M12 6v7m0 0-3-3m3 3 3-3" />
        </svg>
        {showLabel ? <span>{label}</span> : null}
      </button>

      {showIosHelp && typeof document !== "undefined"
        ? createPortal(
          <div className="modal-backdrop ios-install-backdrop" role="presentation" onClick={() => setShowIosHelp(false)}>
            <div className="account-modal ios-install-modal" role="dialog" aria-modal="true" aria-label={t("تثبيت التطبيق", "Install the app")} onClick={(event) => event.stopPropagation()}>
              <header className="modal-head">
                <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setShowIosHelp(false)}>×</button>
                <h2>{t("ثبّت Linkly على آيفون", "Install Linkly on iPhone")}</h2>
              </header>
              <div className="account-modal-body">
                <p>{t("لتثبيت التطبيق واستقبال الإشعارات - اتبع هذه الخطوات:", "To install the app and receive notifications - follow these steps:")}</p>
                <ol>
                  <li>{t("اضغط على أيقونة المشاركة ⬆️ بأسفل سفاري", "Tap the Share icon ⬆️ at the bottom of Safari")}</li>
                  <li>{t("اختر \"إضافة إلى الشاشة الرئيسية\"", "Choose \"Add to Home Screen\"")}</li>
                  <li>{t("ادخل التطبيق بعد تثبيته، سيظهر لك زر تفعيل الإشعارات - اضغط عليه وستصلك إشعارات المحادثات في مركز الإشعارات", "Open the app after installing it - you'll see a button to enable notifications. Tap it and you'll receive conversation alerts in Notification Center")}</li>
                </ol>
              </div>
              <footer className="modal-foot"><button className="btn primary" type="button" onClick={() => setShowIosHelp(false)}>{t("فهمت", "Got it")}</button></footer>
            </div>
          </div>,
          document.body
        )
        : null}
    </>
  );
}
