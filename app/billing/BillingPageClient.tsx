"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import BillingClient from "./BillingClient";
import { useStoredLanguage } from "../useStoredLanguage";

type Plan = { id: string; name: string; monthlyPrice: number; employeeLimit: number; messageQuota: number };
type Subscription = { plan: string; status: string; createdAt?: string; renewalAt?: string; cancelledAt?: string; autoRenewEnabled?: number; savedCardLast4?: string; savedCardBrand?: string } | null;

const copy = {
  ar: {
    backToDashboard: "→ العودة للوحة العميل",
    stepLabel: "الخطوة 3 من 3",
    heading: "اختر الباقة المناسبة لفريقك",
    subheading: "اشتراك شهري مرن، ويمكنك تغيير الباقة لاحقًا.",
    currentPlan: "اشتراكك الحالي:",
    startDate: "بداية الاشتراك",
    renewalDate: "موعد التجديد القادم",
    expiredDate: "انتهى بتاريخ",
    cancelled: "ملغى",
    cancelledNotice: (date: string) => `تم إلغاء الاشتراك. وصولك مستمر حتى ${date}، ولن نرسل لك تذكيرات تجديد بعدها.`,
    cancelAction: "إلغاء الاشتراك",
    resumeAction: "تراجع عن الإلغاء",
    cancelConfirm: "سيبقى وصولك متاحًا حتى نهاية الفترة المدفوعة، ولن يتجدد الاشتراك تلقائيًا بعدها. متأكد؟",
    actionError: "تعذر تنفيذ الطلب",
    autoRenewOn: (card: string) => `التجديد التلقائي مفعّل${card ? ` - بطاقة تنتهي بـ ${card}` : ""}`,
    autoRenewDisable: "إيقاف التجديد التلقائي",
    autoRenewDisableConfirm: "سيتوقف الشحن التلقائي وسيتوجب عليك التجديد يدويًا كل شهر. متأكد؟",
    blockedSuspended: "تم إيقاف حسابك من فريق Linkly. اختر باقة وأكمل الدفع لإعادة تفعيله، أو تواصل معنا إذا كان هذا خطأ.",
    blockedTrialEnded: "انتهت فترتك التجريبية. اختر باقة وأكمل الدفع لمتابعة استخدام حسابك.",
    blockedRenewalLapsed: "انتهت فترة اشتراكك المدفوعة ولم يتم التجديد. جدّد باقتك لمتابعة استخدام حسابك - بياناتك محفوظة بالكامل."
  },
  en: {
    backToDashboard: "→ Back to dashboard",
    stepLabel: "Step 3 of 3",
    heading: "Choose the right plan for your team",
    subheading: "A flexible monthly subscription — you can change your plan later.",
    currentPlan: "Your current subscription:",
    startDate: "Subscription start",
    renewalDate: "Next renewal due",
    expiredDate: "Ended on",
    cancelled: "Cancelled",
    cancelledNotice: (date: string) => `Subscription cancelled. Access continues until ${date}, and you won't get renewal reminders after that.`,
    cancelAction: "Cancel subscription",
    resumeAction: "Undo cancellation",
    cancelConfirm: "Access stays available until the end of the paid period, and it won't auto-renew after that. Are you sure?",
    actionError: "Couldn't complete the request",
    autoRenewOn: (card: string) => `Auto-renew is on${card ? ` - card ending in ${card}` : ""}`,
    autoRenewDisable: "Turn off auto-renew",
    autoRenewDisableConfirm: "Automatic charging will stop and you'll need to renew manually each month. Are you sure?",
    blockedSuspended: "Your account has been suspended by the Linkly team. Choose a plan and complete payment to reactivate it, or contact us if this is a mistake.",
    blockedTrialEnded: "Your trial period has ended. Choose a plan and complete payment to keep using your account.",
    blockedRenewalLapsed: "Your paid subscription period has ended and was not renewed. Renew your plan to keep using your account - all your data is intact."
  }
} as const;

function formatDate(value: string | undefined, lang: "ar" | "en") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(date);
}

function subscriptionStatusLabel(status: string, lang: "ar" | "en") {
  if (lang === "ar") return status;
  if (status === "نشط") return "Active";
  if (status === "تجربة") return "Trial";
  if (status === "متوقف") return "Suspended";
  return status;
}

export default function BillingPageClient({
  plans,
  subscription,
  expired,
  isTestMode,
  branding
}: {
  plans: Plan[];
  subscription: Subscription;
  expired: boolean;
  isTestMode: boolean;
  branding: { name: string; logoDataUrl: string };
}) {
  const [lang, setLang] = useStoredLanguage("ar");
  const text = copy[lang];
  const [cancelledAt, setCancelledAt] = useState(subscription?.cancelledAt || "");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [autoRenewEnabled, setAutoRenewEnabled] = useState(Boolean(subscription?.autoRenewEnabled));
  const [autoRenewLoading, setAutoRenewLoading] = useState(false);
  const [autoRenewError, setAutoRenewError] = useState("");
  const blockedReason = expired
    ? subscription?.status === "متوقف"
      ? text.blockedSuspended
      : subscription?.status === "نشط"
        ? text.blockedRenewalLapsed
        : text.blockedTrialEnded
    : "";

  async function toggleCancel(action: "cancel" | "resume") {
    if (action === "cancel" && !window.confirm(text.cancelConfirm)) return;
    setCancelLoading(true);
    setCancelError("");
    const response = await fetch("/api/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; subscription?: { cancelledAt?: string } };
    setCancelLoading(false);
    if (!response.ok) {
      setCancelError(payload.error || text.actionError);
      return;
    }
    setCancelledAt(payload.subscription?.cancelledAt || "");
  }

  async function disableAutoRenew() {
    if (!window.confirm(text.autoRenewDisableConfirm)) return;
    setAutoRenewLoading(true);
    setAutoRenewError("");
    const response = await fetch("/api/billing/auto-renew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable" })
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setAutoRenewLoading(false);
    if (!response.ok) {
      setAutoRenewError(payload.error || text.actionError);
      return;
    }
    setAutoRenewEnabled(false);
  }

  return (
    <main className="billing-page" dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="billing-header">
        <Link href="/dashboard">{text.backToDashboard}</Link>
        <div className="billing-lang-toggle">
          <button type="button" aria-pressed={lang === "ar"} className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>العربية</button>
          <button type="button" aria-pressed={lang === "en"} className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
        </div>
        <div><Image src={branding.logoDataUrl} alt="" width={64} height={35} unoptimized={branding.logoDataUrl.startsWith("data:")} /><b>{branding.name}</b></div>
      </header>
      <section className="billing-hero">
        <span>{text.stepLabel}</span>
        <h1>{text.heading}</h1>
        <p>{text.subheading}</p>
        {blockedReason ? <div className="current-plan blocked">{blockedReason}</div> : null}
        {subscription ? (
          <div className="current-plan">
            {text.currentPlan} <b>{subscription.plan}</b>
            <em>{cancelledAt ? text.cancelled : subscriptionStatusLabel(subscription.status, lang)}</em>
            {subscription.createdAt ? <span className="current-plan-date">{text.startDate}: {formatDate(subscription.createdAt, lang)}</span> : null}
            {subscription.renewalAt ? (
              <span className="current-plan-date">
                {expired ? text.expiredDate : text.renewalDate}: {formatDate(subscription.renewalAt, lang)}
              </span>
            ) : null}
          </div>
        ) : null}
        {subscription?.status === "نشط" && !expired ? (
          <div className="current-plan-cancel">
            {cancelledAt ? (
              <>
                <p className="current-plan-cancel-notice">{text.cancelledNotice(formatDate(subscription.renewalAt, lang))}</p>
                <button type="button" disabled={cancelLoading} onClick={() => toggleCancel("resume")}>{text.resumeAction}</button>
              </>
            ) : (
              <button type="button" className="current-plan-cancel-link" disabled={cancelLoading} onClick={() => toggleCancel("cancel")}>{text.cancelAction}</button>
            )}
            {cancelError ? <p className="billing-error">{cancelError}</p> : null}
          </div>
        ) : null}
        {autoRenewEnabled && !cancelledAt ? (
          <div className="current-plan-cancel">
            <p className="current-plan-autorenew-notice">{text.autoRenewOn(subscription?.savedCardLast4 || "")}</p>
            <button type="button" className="current-plan-cancel-link" disabled={autoRenewLoading} onClick={disableAutoRenew}>{text.autoRenewDisable}</button>
            {autoRenewError ? <p className="billing-error">{autoRenewError}</p> : null}
          </div>
        ) : null}
      </section>
      <BillingClient plans={plans} currentPlan={subscription?.plan || ""} lang={lang} isTestMode={isTestMode} />
    </main>
  );
}
