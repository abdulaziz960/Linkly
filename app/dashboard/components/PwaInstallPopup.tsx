"use client";

import { useState } from "react";
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
export default function PwaInstallPopup() {
  const { t, language } = useLanguage();
  const { supported, installed, busy, isIos, install } = usePwaInstall();
  const [open, setOpen] = useState(true);
  const [showIosSteps, setShowIosSteps] = useState(false);

  if (!supported || installed || !open || typeof document === "undefined") return null;

  function handlePrimaryClick() {
    if (isIos) {
      setShowIosSteps(true);
      return;
    }
    install();
  }

  return createPortal(
    <div className="modal-backdrop ios-install-backdrop" role="presentation" dir={language === "en" ? "ltr" : "rtl"} onClick={() => setOpen(false)}>
      <div className="account-modal ios-install-modal" role="dialog" aria-modal="true" aria-label={t("تثبيت التطبيق", "Install the app")} onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setOpen(false)}>×</button>
          <h2>{t("ثبّت تطبيق Linkly", "Install the Linkly app")}</h2>
        </header>
        <div className="account-modal-body">
          {isIos && showIosSteps ? (
            <>
              <p>{t("اتبع هذه الخطوات لتثبيت التطبيق:", "Follow these steps to install the app:")}</p>
              <ol>
                <li>{t("اضغط على أيقونة المشاركة ⬆️ بأسفل سفاري", "Tap the Share icon ⬆️ at the bottom of Safari")}</li>
                <li>{t("اختر \"إضافة إلى الشاشة الرئيسية\"", "Choose \"Add to Home Screen\"")}</li>
                <li>{t("افتح Linkly من الأيقونة الجديدة على شاشتك الرئيسية", "Open Linkly from the new icon on your home screen")}</li>
              </ol>
            </>
          ) : (
            <p>{t("ثبّت التطبيق على جهازك للوصول السريع وتلقي إشعارات المحادثات فور وصولها.", "Install the app on your device for quick access and to receive conversation alerts as soon as they arrive.")}</p>
          )}
        </div>
        <footer className="modal-foot">
          <button className="btn soft" type="button" onClick={() => setOpen(false)}>{t("لاحقًا", "Later")}</button>
          {isIos && showIosSteps ? null : (
            <button className="btn primary" type="button" disabled={busy} onClick={handlePrimaryClick}>
              {isIos ? t("عرض الخطوات", "Show steps") : t("تثبيت الآن", "Install now")}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}
