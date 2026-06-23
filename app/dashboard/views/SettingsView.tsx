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
  pending: "بانتظار الإكمال",
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

const channels = [
  { id: "whatsapp", icon: "☏", title: "واتساب", description: "Support your customers on WhatsApp", active: true },
  { id: "facebook", icon: "●", title: "فيسبوك", description: "Connect your Facebook page", active: false },
  { id: "website", icon: "▣", title: "الموقع الإلكتروني", description: "Create a live-chat widget", active: false },
  { id: "instagram", icon: "◎", title: "Instagram", description: "Connect your instagram account", active: false },
  { id: "telegram", icon: "✈", title: "تيليجرام", description: "Configure Telegram channel using Bot token", active: false },
  { id: "email", icon: "✉", title: "البريد الإلكتروني", description: "Connect with Gmail, Outlook, or other providers", active: false }
];

const providers = [
  { id: "cloud", icon: "☏", title: "واتساب السحابية", description: "Quick setup through Meta", active: true },
  { id: "twilio", icon: "◎", title: "تويليو", description: "Connect via Twilio credentials", active: false }
];

const publicAppUrl = "https://audiencew.vercel.app";

export default function SettingsView() {
  const [settings, setSettings] = useState<IntegrationSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState("");
  const [wizardStep, setWizardStep] = useState(1);
  const showIntegrationData = wizardStep >= 3 || settings.status === "connected";

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return settings.webhookUrl;
    if (settings.webhookUrl.startsWith("http")) return settings.webhookUrl;
    return `${window.location.origin}${settings.webhookUrl}`;
  }, [settings.webhookUrl]);

  useEffect(() => {
    fetch("/api/settings/integration")
      .then((response) => response.json())
      .then((data: IntegrationSettings) => setSettings(data))
      .finally(() => setLoading(false));
  }, []);

  function updateField(field: keyof IntegrationSettings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/settings/integration", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    const data = await response.json();
    setSettings(data);
    setSaving(false);
  }

  function openMetaWindow() {
    if (typeof window === "undefined") return;

    if (!settings.appId) {
      window.open("https://developers.facebook.com/apps/", "audiencew-meta-apps", "width=1100,height=820");
      return;
    }

    const redirectOrigin = window.location.hostname === "localhost" ? publicAppUrl : window.location.origin;
    const redirectUri = `${redirectOrigin}/dashboard`;
    const metaUrl = new URL("https://www.facebook.com/v22.0/dialog/oauth");
    metaUrl.searchParams.set("app_id", settings.appId);
    metaUrl.searchParams.set("client_id", settings.appId);
    metaUrl.searchParams.set("redirect_uri", redirectUri);
    metaUrl.searchParams.set("response_type", "code");
    metaUrl.searchParams.set("scope", "business_management,whatsapp_business_management,whatsapp_business_messaging");
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
    window.open(metaUrl.toString(), "audiencew-meta-connect", "width=960,height=780");
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
                <span>{channel.icon}</span>
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
              if (wizardStep === 3) openMetaWindow();
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
              <select value={settings.status} onChange={(event) => updateField("status", event.target.value)}>
                <option value="connected">متصل</option>
                <option value="pending">بانتظار الإكمال</option>
                <option value="not_connected">غير متصل</option>
              </select>
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
              <input value={settings.accessToken} onChange={(event) => updateField("accessToken", event.target.value)} placeholder="يحفظ لاحقًا بشكل مشفر في النسخة الإنتاجية" />
            </label>
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
