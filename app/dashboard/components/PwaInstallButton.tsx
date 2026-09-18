"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function isIos(): boolean {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * "ثبّت التطبيق على جهازك" (see conversation with the user) - a single
 * button in the dashboard's top-links row that installs the PWA (or, on
 * iOS where no install API exists, walks the user through the manual
 * Share-sheet steps) and subscribes the device to Web Push, so new
 * messages/replies notify even when the tab/app isn't open. Hides itself
 * once both are already done, and entirely on a browser with no Push API
 * support at all.
 */
export default function PwaInstallButton() {
  const { t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [supported, setSupported] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    setInstalled(isStandalone());

    navigator.serviceWorker.register("/service-worker.js")
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setSubscribed(Boolean(subscription)))
      .catch(() => {});

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function enableNotifications() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const keyResponse = await fetch("/api/push/vapid-public-key").then((res) => res.json()).catch(() => null);
      const publicKey: string = keyResponse?.ok ? keyResponse.data.publicKey : "";
      if (!publicKey) return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON())
      });
      setSubscribed(true);
    } catch (error) {
      console.error("Failed to enable push notifications", error);
    }
  }

  async function handleClick() {
    if (isIos() && !installed) {
      setShowIosHelp(true);
      return;
    }

    setBusy(true);
    try {
      if (deferredPrompt) {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        setDeferredPrompt(null);
      }
      await enableNotifications();
    } finally {
      setBusy(false);
    }
  }

  if (!supported || (installed && subscribed)) return null;

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
      </button>

      {showIosHelp ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowIosHelp(false)}>
          <div className="account-modal" role="dialog" aria-modal="true" aria-label={t("تثبيت التطبيق", "Install the app")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setShowIosHelp(false)}>×</button>
              <h2>{t("ثبّت Linkly على آيفون", "Install Linkly on iPhone")}</h2>
            </header>
            <div className="account-modal-body">
              <p>{t("آبل ما تسمح بالتثبيت التلقائي من المتصفح - اتبع هذه الخطوات مرة وحدة:", "Apple doesn't allow automatic installation from the browser - follow these steps once:")}</p>
              <ol>
                <li>{t("اضغط على أيقونة المشاركة ⬆️ بأسفل سفاري", "Tap the Share icon ⬆️ at the bottom of Safari")}</li>
                <li>{t("اختر \"إضافة إلى الشاشة الرئيسية\"", "Choose \"Add to Home Screen\"")}</li>
                <li>{t("افتح Linkly من الأيقونة الجديدة، وارجع تضغط هذا الزر لتفعيل الإشعارات", "Open Linkly from the new icon, then come back and tap this button again to enable notifications")}</li>
              </ol>
            </div>
            <footer className="modal-foot"><button className="btn primary" type="button" onClick={() => setShowIosHelp(false)}>{t("فهمت", "Got it")}</button></footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
