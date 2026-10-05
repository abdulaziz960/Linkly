"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../i18n";
import { usePwaInstall } from "../hooks/usePwaInstall";

/**
 * Pops open automatically the moment the dashboard loads, if the app isn't
 * installed yet - the user explicitly asked for an immediate popup on
 * entry rather than another dismissible banner. Unlike PwaInstallCoachmark
 * (which nags about enabling notifications even after install and stays
 * permanently dismissed via localStorage), this is install-only, has no
 * permanent-dismiss flag, and reappears every fresh dashboard load until
 * the app is actually installed - "لاحقًا" only closes it for this visit.
 * See PwaInstallCoachmark, which now only handles the post-install
 * notifications nudge so the two never show the same message at once.
 */
const DISMISSED_KEY = "linkly-pwa-install-popup-dismissed";

export default function PwaInstallPopup() {
  const { t, language } = useLanguage();
  const { supported, installed, busy, isIos, canPrompt, install } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  // "Later" must hold for the whole visit: remember it for the session so a
  // remount of the dashboard (view switch, refresh of state) cannot reopen it.
  useEffect(() => {
    try {
      if (!window.sessionStorage.getItem(DISMISSED_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!supported || installed || !open || typeof document === "undefined") return null;

  function close() {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
    setOpen(false);
  }

  async function handlePrimaryClick() {
    // Without a browser install prompt (iOS, or Chrome not offering one) the
    // button used to do nothing visible - show manual steps instead.
    if (isIos || !canPrompt) {
      setShowSteps(true);
      return;
    }
    await install();
    close();
  }

  return createPortal(
    <div className="modal-backdrop ios-install-backdrop" role="presentation" dir={language === "en" ? "ltr" : "rtl"} onClick={close}>
      <div className="account-modal ios-install-modal" role="dialog" aria-modal="true" aria-label={t("تثبيت التطبيق", "Install the app")} onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={close}>×</button>
          <h2>{t("ثبّت تطبيق Linkly", "Install the Linkly app")}</h2>
        </header>
        <div className="account-modal-body">
          {showSteps ? (
            <>
              <p>{t("اتبع هذه الخطوات لتثبيت التطبيق:", "Follow these steps to install the app:")}</p>
              <ol>
                <li>{isIos ? t("اضغط على أيقونة المشاركة ⬆️ بأسفل سفاري", "Tap the Share icon ⬆️ at the bottom of Safari") : t("افتح قائمة المتصفح ⋮ أو أيقونة التثبيت في شريط العنوان", "Open the browser menu ⋮ or the install icon in the address bar")}</li>
                <li>{isIos ? t("اختر \"إضافة إلى الشاشة الرئيسية\"", "Choose \"Add to Home Screen\"") : t("اختر \"تثبيت التطبيق\" أو \"Install\"", "Choose \"Install app\"")}</li>
                <li>{t("افتح Linkly من الأيقونة الجديدة على شاشتك الرئيسية", "Open Linkly from the new icon on your home screen")}</li>
              </ol>
            </>
          ) : (
            <p>{t("ثبّت التطبيق على جهازك للوصول السريع وتلقي إشعارات المحادثات فور وصولها.", "Install the app on your device for quick access and to receive conversation alerts as soon as they arrive.")}</p>
          )}
        </div>
        <footer className="modal-foot">
          <button className="btn soft" type="button" onClick={close}>{t("لاحقًا", "Later")}</button>
          {showSteps ? null : (
            <button className="btn primary" type="button" disabled={busy} onClick={handlePrimaryClick}>
              {isIos || !canPrompt ? t("عرض الخطوات", "Show steps") : t("تثبيت الآن", "Install now")}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}
