"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { IntegrationSettings } from "../types";

const emptySettings: IntegrationSettings = {
  id: "meta-whatsapp",
  provider: "whatsapp_cloud",
  status: "pending",
  businessName: "",
  wabaName: "",
  phoneNumber: "",
  phoneNumberId: "",
  wabaId: "",
  appId: "",
  configId: "",
  verifyToken: "",
  accessToken: "",
  webhookUrl: "/api/meta/webhook",
  updatedAt: "-"
};

const statusLabel: Record<IntegrationSettings["status"], string> = {
  connected: "متصل",
  pending: "غير مكتمل",
  not_connected: "غير متصل"
};

const wizardSteps = [
  {
    title: "اختر قناة",
    description: "اختر الخدمة التي تود ربطها مع حسابك في AudienceW."
  },
  {
    title: "إنشاء قناة تواصل",
    description: "قم بالمصادقة على حسابك وإنشاء قناة التواصل."
  },
  {
    title: "ربط Meta",
    description: "افتح نافذة Meta واختر حافظة الأعمال وحساب واتساب والرقم."
  },
  {
    title: "Voila!",
    description: "أصبح كل شيء جاهزًا الآن."
  }
];

export type ChannelId = "whatsapp" | "facebook" | "website" | "instagram" | "telegram" | "email" | "google_maps";

const channels: Array<{ id: ChannelId; title: string; description: string; active: boolean }> = [
  { id: "whatsapp", title: "واتساب", description: "Support your customers on WhatsApp", active: true },
  { id: "facebook", title: "فيسبوك", description: "Connect your Facebook page", active: false },
  { id: "website", title: "الموقع الإلكتروني", description: "Create a live-chat widget", active: false },
  { id: "instagram", title: "Instagram", description: "Connect your instagram account", active: false },
  { id: "telegram", title: "تيليجرام", description: "Configure Telegram channel using Bot token", active: false },
  { id: "email", title: "البريد الإلكتروني", description: "Connect with Gmail, Outlook, or other providers", active: false },
  { id: "google_maps", title: "خرائط Google", description: "Connect your Google Maps business profile", active: false }
];

const providers = [
  { id: "cloud", icon: "☏", title: "واتساب السحابية", description: "Quick setup through Meta", active: true },
  { id: "twilio", icon: "◎", title: "تويليو", description: "Connect via Twilio credentials", active: false }
];

const publicAppUrl = "https://audiencew.vercel.app";

type IntegrationResponse = IntegrationSettings & {
  connectionMessage?: string;
  missingFields?: string[];
};

type SettingsViewProps = {
  onIntegrationChange?: (settings: IntegrationSettings) => void;
};

export function ChannelIcon({ id }: { id: ChannelId }) {
  if (id === "whatsapp") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35Zm-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26C2.16 6.44 6.6 2 12.05 2c2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.89-9.88 9.89ZM20.46 3.49A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.42Z" />
      </svg>
    );
  }

  if (id === "facebook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.4 8.05h2.35V4.18A27.4 27.4 0 0 0 13.33 4c-3.39 0-5.7 2.07-5.7 5.87v3.3H3.8v4.33h3.83V24h4.62v-6.5h3.62l.57-4.33h-4.19V10.3c0-1.25.34-2.25 2.15-2.25Z" />
      </svg>
    );
  }

  if (id === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="4.8" />
        <circle cx="12" cy="12" r="3.6" />
        <circle cx="16.9" cy="7.1" r="1.1" />
      </svg>
    );
  }

  if (id === "telegram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m21.7 4.5-3.06 14.42c-.23 1.02-.84 1.28-1.7.8l-4.7-3.46-2.26 2.18c-.25.25-.46.46-.95.46l.34-4.78L18.08 6.4c.38-.34-.08-.53-.58-.2L6.78 12.95l-4.62-1.44c-1-.31-1.02-1 .21-1.48L20.44 3.1c.84-.31 1.57.2 1.26 1.4Z" />
      </svg>
    );
  }

  if (id === "email") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2.2" />
        <path d="m4.2 6.8 7.8 6.1 7.8-6.1" />
      </svg>
    );
  }

  if (id === "google_maps") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s6.4-5.62 6.4-11.13A6.4 6.4 0 0 0 5.6 9.87C5.6 15.38 12 21 12 21Z" />
        <circle cx="12" cy="9.9" r="2.2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h14v9H8.8L5 18.5V6Z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

export default function SettingsView({ onIntegrationChange }: SettingsViewProps) {
  const [settings, setSettings] = useState<IntegrationSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState("");
  const [wizardStep, setWizardStep] = useState(1);
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const showIntegrationData = wizardStep >= 3 || settings.status === "connected";

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return settings.webhookUrl;
    if (settings.webhookUrl.startsWith("http")) return settings.webhookUrl;
    return `${window.location.origin}${settings.webhookUrl}`;
  }, [settings.webhookUrl]);

  useEffect(() => {
    fetch("/api/settings/integration")
      .then((response) => response.json())
      .then((data: IntegrationSettings) => {
        setSettings(data);
        onIntegrationChange?.(data);
      })
      .finally(() => setLoading(false));
  }, [onIntegrationChange]);

  useEffect(() => {
    function readMetaMessage(data: unknown) {
      if (typeof data === "string") {
        try {
          return JSON.parse(data);
        } catch {
          return null;
        }
      }
      return data && typeof data === "object" ? data : null;
    }

    async function handleMetaMessage(event: MessageEvent) {
      if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;

      const payload = readMetaMessage(event.data) as {
        type?: string;
        event?: string;
        data?: {
          business_id?: string;
          waba_id?: string;
          whatsapp_business_account_id?: string;
          phone_number_id?: string;
          phone_number?: string;
        };
      } | null;

      if (payload?.type !== "WA_EMBEDDED_SIGNUP" || payload.event !== "FINISH") return;

      const metaData = payload.data ?? {};
      const patch: Partial<IntegrationSettings> = {
        status: "connected",
        wabaId: metaData.waba_id || metaData.whatsapp_business_account_id || settings.wabaId,
        phoneNumberId: metaData.phone_number_id || settings.phoneNumberId,
        phoneNumber: metaData.phone_number || settings.phoneNumber
      };

      const response = await fetch("/api/settings/integration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const updatedSettings = await response.json() as IntegrationResponse;
      setSettings(updatedSettings);
      onIntegrationChange?.(updatedSettings);
      setSaveFeedback({ type: "success", text: updatedSettings.connectionMessage || "تم تحديث حالة الربط" });
      setWizardStep(4);
    }

    window.addEventListener("message", handleMetaMessage);
    return () => window.removeEventListener("message", handleMetaMessage);
  }, [settings.phoneNumber, settings.phoneNumberId, settings.wabaId]);

  function updateField(field: keyof IntegrationSettings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function persistSettings() {
    const response = await fetch("/api/settings/integration", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    const data = await response.json() as IntegrationResponse;
    setSettings(data);
    onIntegrationChange?.(data);
    setSaveFeedback({
      type: data.status === "connected" ? "success" : "error",
      text: data.connectionMessage || (data.status === "connected" ? "تم الاتصال بنجاح" : "الربط غير مكتمل")
    });
    return data;
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await persistSettings();
    setSaving(false);
  }

  async function resetIntegrationData() {
    setSaving(true);
    const response = await fetch("/api/settings/integration", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reset: true,
        status: "pending",
        businessName: "",
        wabaName: "",
        phoneNumber: "",
        phoneNumberId: "",
        wabaId: "",
        accessToken: ""
      })
    });
    const data = await response.json() as IntegrationResponse;
    setSettings(data);
    onIntegrationChange?.(data);
    setSaveFeedback({ type: "error", text: data.connectionMessage || "تم مسح بيانات الربط" });
    setSaving(false);
  }

  async function sendTestMessage() {
    setTestSending(true);
    setTestFeedback(null);

    const missingField =
      !settings.phoneNumberId.trim()
        ? "Phone Number ID"
        : !settings.accessToken.trim()
          ? "Access Token"
          : !testRecipient.trim()
            ? "رقم المستلم"
            : !testMessage.trim()
              ? "نص الرسالة"
              : "";

    if (missingField) {
      setTestFeedback({ type: "error", text: `${missingField} مطلوب قبل إرسال رسالة اختبار` });
      setTestSending(false);
      return;
    }

    await persistSettings();

    const response = await fetch("/api/meta/test-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneNumberId: settings.phoneNumberId,
        accessToken: settings.accessToken,
        to: testRecipient,
        message: testMessage
      })
    });
    const result = await response.json();

    if (response.ok && result.ok) {
      setTestFeedback({ type: "success", text: "تم إرسال رسالة الاختبار. إذا رد العميل ستظهر محادثته داخل صندوق الوارد." });
    } else {
      setTestFeedback({ type: "error", text: result.error || "تعذر إرسال رسالة الاختبار" });
    }

    setTestSending(false);
  }

  function openMetaWindow() {
    if (typeof window === "undefined") return false;

    if (!settings.appId) {
      const metaAppsWindow = window.open("https://developers.facebook.com/apps/", "audiencew-meta-apps", "width=1100,height=820");
      if (!metaAppsWindow) window.location.href = "https://developers.facebook.com/apps/";
      return true;
    }

    const redirectOrigin = window.location.hostname === "localhost" ? publicAppUrl : window.location.origin;
    const redirectUri = `${redirectOrigin}/api/meta/callback`;
    const metaUrl = new URL("https://www.facebook.com/v22.0/dialog/oauth");
    metaUrl.searchParams.set("app_id", settings.appId);
    metaUrl.searchParams.set("client_id", settings.appId);
    metaUrl.searchParams.set("redirect_uri", redirectUri);
    metaUrl.searchParams.set("response_type", "code");
    metaUrl.searchParams.set("scope", "whatsapp_business_management,whatsapp_business_messaging");
    if (settings.configId) {
      metaUrl.searchParams.set("config_id", settings.configId);
    }
    metaUrl.searchParams.set(
      "extras",
      JSON.stringify({
        feature: "whatsapp_embedded_signup",
        setup: {
          business: {
            name: settings.businessName
          }
        }
      })
    );
    const metaWindow = window.open(metaUrl.toString(), "audiencew-meta-connect", "width=960,height=780");
    if (!metaWindow) {
      window.location.href = metaUrl.toString();
    }
    return true;
  }

  function renderWizardContent() {
    if (wizardStep === 1) {
      return (
        <div className="meta-wizard-panel">
          <div className="meta-wizard-title">
            <h3>اختر قناة</h3>
            <p>اختر الخدمة التي تريد ربطها مع المنصة.</p>
          </div>
          <div className="channel-grid">
            {channels.map((channel) => (
              <button
                className={`channel-card ${channel.active ? "selected" : "disabled"}`}
                key={channel.id}
                type="button"
                disabled={!channel.active}
                onClick={() => setWizardStep(2)}
              >
                <span className={`channel-icon channel-icon-${channel.id}`}>
                  <ChannelIcon id={channel.id} />
                </span>
                <b>{channel.title}</b>
                <small>{channel.description}</small>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (wizardStep === 2) {
      return (
        <div className="meta-wizard-panel">
          <div className="meta-wizard-title ltr-title">
            <h3>Select your API provider</h3>
            <p>Choose your WhatsApp provider. You can connect directly through Meta which requires no setup, or connect through Twilio using your account credentials.</p>
          </div>
          <div className="api-provider-grid">
            {providers.map((provider) => (
              <button
                className={`api-provider-card ${provider.active ? "selected" : ""}`}
                key={provider.id}
                type="button"
                disabled={!provider.active}
                onClick={() => setWizardStep(3)}
              >
                <span>{provider.icon}</span>
                <b>{provider.title}</b>
                <small>{provider.description}</small>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (wizardStep === 3) {
      return (
        <div className="meta-wizard-panel">
          <div className="meta-signup-card">
            <span className="provider-round-icon">☏</span>
            <h3>Quick setup with Meta</h3>
            <p>Use the WhatsApp Embedded Signup flow to quickly connect new numbers. You will be redirected to Meta to log into your WhatsApp Business account. Having admin access will help make the setup smooth and easy.</p>
            <ul>
              <li>No manual configuration required</li>
              <li>Secure OAuth based authentication</li>
              <li>Automatic webhook and phone number configuration</li>
            </ul>
            {!settings.configId && (
              <div className="meta-warning">
                أضف Configuration ID من Meta قبل فتح نافذة الربط حتى يعمل Embedded Signup بشكل صحيح.
              </div>
            )}
            <button type="button" onClick={openMetaWindow}>
              Connect with WhatsApp Business
            </button>
            <div className="manual-link">If your number is already connected to WhatsApp Business Platform API, you can use the manual setup flow later.</div>
          </div>
        </div>
      );
    }

    return (
      <div className="meta-wizard-panel">
        <div className="meta-summary-card">
          <span>✓</span>
          <h3>أصبح كل شيء جاهزًا</h3>
          <p>بعد إكمال نافذة Meta سيتم حفظ حافظة الأعمال، حساب واتساب، رقم الهاتف، والصلاحيات في بيانات الربط.</p>
          <div className="summary-list">
            <b>{settings.businessName || "حافظة الأعمال"}</b>
            <b>{settings.wabaName || "حساب واتساب للأعمال"}</b>
            <b>{settings.phoneNumber || "رقم واتساب"}</b>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="page-stack settings-page">
      <div className="settings-onboarding">
        <aside className="meta-wizard-rail settings-rail">
          {wizardSteps.map((step, index) => {
            const stepNumber = index + 1;
            const done = wizardStep > stepNumber;
            const active = wizardStep === stepNumber;
            return (
              <button className={active ? "active" : done ? "done" : ""} key={step.title} type="button" onClick={() => setWizardStep(stepNumber)}>
                <span>{done ? "✓" : stepNumber}</span>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </button>
            );
          })}
        </aside>

        <div className="settings-onboarding-main">
          {renderWizardContent()}
          <div className="settings-onboarding-actions">
            <button className="btn soft" type="button" disabled={wizardStep === 1} onClick={() => setWizardStep((step) => Math.max(1, step - 1))}>
              عودة
            </button>
            <button className="btn primary" type="button" onClick={() => {
              if (wizardStep === 3) {
                openMetaWindow();
                return;
              }
              setWizardStep((step) => Math.min(4, step + 1));
            }}>
              {wizardStep === 3 ? "فتح نافذة Meta" : wizardStep === 4 ? "إنهاء" : "التالي"}
            </button>
          </div>
        </div>
      </div>

      {showIntegrationData && (
        <form className="settings-form" onSubmit={saveSettings}>
          <div className="settings-form-head">
            <div>
              <h2>بيانات الربط والويبهوك</h2>
              <p>هذه البيانات تحفظ ربط Meta الحالي وتستخدم في استقبال رسائل WhatsApp داخل المنصة.</p>
            </div>
            <span className={`connection-pill ${settings.status}`}>{statusLabel[settings.status]}</span>
            <button className="soft-action" disabled={saving || loading} type="button" onClick={resetIntegrationData}>
              مسح بيانات الربط
            </button>
            <button className="primary-action" disabled={saving || loading} type="submit">
              {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </button>
          </div>

          <div className="settings-fields">
            <label>
              اسم النشاط التجاري
              <input value={settings.businessName} onChange={(event) => updateField("businessName", event.target.value)} />
            </label>
            <label>
              حساب واتساب للأعمال
              <input value={settings.wabaName} onChange={(event) => updateField("wabaName", event.target.value)} />
            </label>
            <label>
              رقم واتساب
              <input value={settings.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} />
            </label>
            <label>
              حالة الربط
              <div className={`connection-status-box ${settings.status}`}>
                <b>{statusLabel[settings.status]}</b>
                <span>
                  {settings.status === "connected"
                    ? "تم التحقق من بيانات Meta والربط جاهز."
                    : "احفظ الإعدادات بعد تعبئة البيانات وسيتم التحقق تلقائيًا."}
                </span>
              </div>
            </label>
            <label>
              App ID
              <input value={settings.appId} onChange={(event) => updateField("appId", event.target.value)} placeholder="ضع App ID من Meta" />
            </label>
            <label>
              Configuration ID
              <input value={settings.configId} onChange={(event) => updateField("configId", event.target.value)} placeholder="ضع Configuration ID من Facebook Login for Business" />
            </label>
            <label>
              WABA ID
              <input value={settings.wabaId} onChange={(event) => updateField("wabaId", event.target.value)} />
            </label>
            <label>
              Phone Number ID
              <input value={settings.phoneNumberId} onChange={(event) => updateField("phoneNumberId", event.target.value)} />
            </label>
            <label>
              Access Token
              <input value={settings.accessToken} onChange={(event) => updateField("accessToken", event.target.value)} />
            </label>
          </div>

          {saveFeedback && <p className={`settings-save-feedback ${saveFeedback.type}`}>{saveFeedback.text}</p>}

          <div className="meta-test-card">
            <div>
              <h3>تجربة رقم التست</h3>
              <p>أضف رقمك في قائمة أرقام الاختبار داخل Meta، ثم أرسل رسالة للتأكد من الإرسال والاستقبال.</p>
            </div>
            <div className="meta-test-grid">
              <label>
                رقم المستلم
                <input
                  dir="ltr"
                  inputMode="tel"
                  placeholder="9665xxxxxxxx"
                  value={testRecipient}
                  onChange={(event) => setTestRecipient(event.target.value)}
                />
              </label>
              <label>
                نص الرسالة
                <textarea value={testMessage} onChange={(event) => setTestMessage(event.target.value)} />
              </label>
            </div>
            <div className="meta-test-actions">
              <button className="primary-action" disabled={testSending || !testRecipient.trim()} type="button" onClick={sendTestMessage}>
                {testSending ? "جاري الإرسال..." : "إرسال رسالة اختبار"}
              </button>
              <small>الاستقبال يحتاج أن يكون الويبهوك مفعّلًا على رابط الاستضافة.</small>
            </div>
            {testFeedback && <p className={`meta-test-feedback ${testFeedback.type}`}>{testFeedback.text}</p>}
          </div>

          <div className="webhook-card">
            <div>
              <h3>إعدادات الويبهوك</h3>
              <p>انسخ رابط الويبهوك و Verify Token وضعها في إعدادات تطبيق Meta لاستقبال رسائل WhatsApp.</p>
            </div>
            <div className="copy-row">
              <span>{webhookUrl}</span>
              <button type="button" onClick={() => copyValue("webhook", webhookUrl)}>
                {copied === "webhook" ? "تم النسخ" : "نسخ الرابط"}
              </button>
            </div>
            <div className="copy-row">
              <span>{settings.verifyToken}</span>
              <button type="button" onClick={() => copyValue("token", settings.verifyToken)}>
                {copied === "token" ? "تم النسخ" : "نسخ التوكن"}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
