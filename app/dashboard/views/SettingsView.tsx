"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { IntegrationSettings } from "../types";

type MetaSignupData = {
  business_id?: string;
  waba_id?: string;
  whatsapp_business_account_id?: string;
  phone_number_id?: string;
  phone_number?: string;
};

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
  xConsumerKey: "",
  xConsumerSecret: "",
  xBearerToken: "",
  xAccessToken: "",
  xAccessTokenSecret: "",
  googleAccountId: "",
  googleLocationId: "",
  googleRefreshToken: "",
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
    title: "اكتمل الربط",
    description: "أصبح كل شيء جاهزًا الآن."
  }
];

export type ChannelId = "whatsapp" | "facebook" | "website" | "instagram" | "telegram" | "x" | "email" | "google_maps" | "tiktok" | "sms";

const channels: Array<{ id: ChannelId; title: string; description: string; active: boolean }> = [
  { id: "whatsapp", title: "واتساب", description: "Support your customers on WhatsApp", active: true },
  { id: "facebook", title: "فيسبوك", description: "Connect your Facebook page", active: true },
  { id: "website", title: "الموقع الإلكتروني", description: "Create a live-chat widget", active: true },
  { id: "instagram", title: "Instagram", description: "Connect your instagram account", active: true },
  { id: "telegram", title: "تيليجرام", description: "Configure Telegram channel using Bot token", active: true },
  { id: "x", title: "X", description: "ربط حساب X عبر OAuth", active: true },
  { id: "email", title: "البريد الإلكتروني", description: "استقبال وردود البريد عبر Webhook", active: true },
  { id: "google_maps", title: "خرائط Google", description: "Connect your Google Business Profile", active: true },
  { id: "tiktok", title: "TikTok", description: "بانتظار موافقة TikTok على Business Messaging", active: true },
  { id: "sms", title: "SMS", description: "إرسال واستقبال رسائل SMS عبر Unifonic", active: true }
];

const providers = [
  { id: "cloud", icon: "☏", title: "واتساب السحابية", description: "Quick setup through Meta", active: true },
  { id: "twilio", icon: "◎", title: "تويليو", description: "Connect via Twilio credentials", active: false }
];

const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://audiencew.audience.sa";
const publicMetaAppId = process.env.NEXT_PUBLIC_META_APP_ID || "1296230909161568";
const publicMetaConfigId = process.env.NEXT_PUBLIC_META_CONFIG_ID || "1428169365888624";

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

  if (id === "x") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.7 2h3.1l-6.9 7.9L23 22h-6.4l-5-7.4L5.8 22H2.7l7.4-8.5L2.3 2h6.6l4.5 6.7L18.7 2Zm-1.1 17.9h1.7L8 4H6.2l11.4 15.9Z" />
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

  if (id === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16.6 5.82c-.86-.86-1.35-2.03-1.35-3.24h-3.15v13.6c0 1.46-1.19 2.65-2.65 2.65a2.65 2.65 0 0 1 0-5.3c.27 0 .53.04.78.11V10.5a5.8 5.8 0 0 0-.78-.05 5.8 5.8 0 1 0 5.8 5.8V9.4a7.34 7.34 0 0 0 4.3 1.38V7.62a4.32 4.32 0 0 1-2.95-1.8Z" />
      </svg>
    );
  }

  if (id === "sms") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4.4 3.3A.6.6 0 0 1 3.6 20V6a1 1 0 0 1 1-1Z" />
        <path d="M7.5 9.5h9M7.5 12.8h6" />
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
  const [selectedChannel, setSelectedChannel] = useState<"whatsapp" | "instagram" | "facebook" | "telegram" | "x" | "google_maps" | "email" | "website" | "tiktok" | "sms">("whatsapp");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState("");
  const [wizardStep, setWizardStep] = useState(1);
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const metaSignupDataRef = useRef<MetaSignupData>({});
  const hasSelectedChannelRef = useRef(false);
  const isInstagram = selectedChannel === "instagram";
  const isFacebook = selectedChannel === "facebook";
  const isTelegram = selectedChannel === "telegram";
  const isX = selectedChannel === "x";
  const isGoogleMaps = selectedChannel === "google_maps";
  const isEmail = selectedChannel === "email";
  const isWebsite = selectedChannel === "website";
  const isTikTok = selectedChannel === "tiktok";
  const isSms = selectedChannel === "sms";
  const isWhatsApp = selectedChannel === "whatsapp";
  const isConnected = settings.status === "connected";
  const showIntegrationData = (isTelegram || isGoogleMaps || isEmail || isWebsite ? wizardStep >= 4 : wizardStep >= 3) || isConnected;

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return settings.webhookUrl;
    if (settings.webhookUrl.startsWith("http")) return settings.webhookUrl;
    return `${window.location.origin}${settings.webhookUrl}`;
  }, [settings.webhookUrl]);
  const telegramBotLink = useMemo(() => {
    if (!isTelegram || settings.status !== "connected") return "";
    const username = settings.wabaName.trim().replace(/^@/, "");
    if (!username) return "";
    return `https://t.me/${username}`;
  }, [isTelegram, settings.status, settings.wabaName]);
  const currentWizardSteps = useMemo(() => {
    const channelName = isWebsite ? "الموقع الإلكتروني" : isEmail ? "البريد الإلكتروني" : isGoogleMaps ? "خرائط Google" : isX ? "X" : isTelegram ? "تيليجرام" : isFacebook ? "فيسبوك" : isInstagram ? "Instagram" : "واتساب";

    return wizardSteps.map((step, index) => {
      if (index === 0) {
        return {
          ...step,
          description: `اختر قناة ${channelName} أو أي قناة تريد ربطها مع حسابك.`
        };
      }

      if (index === 1) {
        return isEmail
          ? {
              title: "تجهيز البريد",
              description: "احفظ بريد الإرسال ورابط استقبال الرسائل."
            }
          : isGoogleMaps
          ? {
              title: "تجهيز Google",
              description: "الربط يتم مباشرة من حساب Google الخاص بالنشاط."
            }
          : isX
          ? {
              title: "إنشاء تطبيق X",
              description: "جهز تطبيق X Developer بصلاحيات الرسائل والردود."
            }
          : isFacebook
          ? {
              title: "ربط صفحة فيسبوك",
              description: "سجل الدخول عبر Meta واختر صفحة Facebook."
            }
          : isTelegram
          ? {
              title: "إنشاء بوت تيليجرام",
              description: "أنشئ بوت من BotFather ثم انسخ Bot Token."
            }
          : isInstagram
            ? {
                title: "إنشاء قناة Instagram",
                description: "قم بالمصادقة على حساب Instagram المرتبط بصفحة Facebook."
              }
            : step;
      }

      if (index === 2) {
        return isEmail
          ? {
              title: "ربط Webhook",
              description: "اربط مزود البريد أو Zapier برابط الاستقبال."
            }
          : isGoogleMaps
          ? {
              title: "ربط Google",
              description: "اضغط ربط Google واختر النشاط التجاري."
            }
          : isX
          ? {
              title: "ربط X",
              description: "أدخل مفاتيح X وسيتم تجهيز روابط Callback و Webhook."
            }
          : isFacebook
          ? {
              title: "فتح نافذة Meta",
              description: "اختر صفحة Facebook ووافق على صلاحيات Messenger."
            }
          : isTelegram
          ? {
              title: "ربط Telegram",
              description: "أدخل Bot Token وسيتم تفعيل Webhook تلقائياً."
            }
          : isInstagram
            ? {
                title: "ربط Instagram",
                description: "افتح نافذة Meta واختر حساب Instagram والصلاحيات."
              }
            : step;
      }

      return {
        title: isConnected ? step.title : "بانتظار اكتمال الربط",
        description: isConnected ? `أصبحت قناة ${channelName} جاهزة الآن.` : `لم تكتمل قناة ${channelName} بعد.`
      };
    });
  }, [isConnected, isEmail, isFacebook, isGoogleMaps, isInstagram, isTelegram, isX]);

  useEffect(() => {
    const isFirstLoad = !hasSelectedChannelRef.current;
    hasSelectedChannelRef.current = true;
    setLoading(true);
    fetch(`/api/settings/integration?channel=${selectedChannel}`)
      .then((response) => response.json())
      .then((data: IntegrationSettings) => {
        setSettings(data);
        if (data.status === "connected") {
          setWizardStep(4);
        } else if (!isFirstLoad) {
          setWizardStep(selectedChannel === "instagram" || selectedChannel === "facebook" || selectedChannel === "telegram" || selectedChannel === "x" ? 3 : selectedChannel === "google_maps" || selectedChannel === "email" ? 4 : 2);
        }
        onIntegrationChange?.(data);
      })
      .finally(() => setLoading(false));
  }, [onIntegrationChange, selectedChannel]);

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
      if (event.origin === window.location.origin && (event.data as { type?: string } | null)?.type === "audiencew:meta-connected") {
        setLoading(true);
        const response = await fetch(`/api/settings/integration?channel=${selectedChannel}`);
        const data = await response.json() as IntegrationResponse;
        setSettings(data);
        onIntegrationChange?.(data);
        setSaveFeedback({
          type: data.status === "connected" ? "success" : "error",
          text: data.connectionMessage || (data.status === "connected" ? "تم الاتصال بنجاح" : "الربط غير مكتمل")
        });
        setWizardStep(4);
        setLoading(false);
        return;
      }

      if (!["https://www.facebook.com", "https://web.facebook.com", "https://business.facebook.com"].includes(event.origin)) return;

      const payload = readMetaMessage(event.data) as {
        type?: string;
        event?: string;
        data?: MetaSignupData;
      } | null;

      if (selectedChannel !== "whatsapp" || payload?.type !== "WA_EMBEDDED_SIGNUP" || payload.event !== "FINISH") return;

      const metaData = payload.data ?? {};
      metaSignupDataRef.current = metaData;
      const patch: Partial<IntegrationSettings> = {
        status: "pending",
        wabaId: metaData.waba_id || metaData.whatsapp_business_account_id || settings.wabaId,
        phoneNumberId: metaData.phone_number_id || settings.phoneNumberId,
        phoneNumber: metaData.phone_number || settings.phoneNumber
      };

      const response = await fetch(`/api/settings/integration?channel=${selectedChannel}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const updatedSettings = await response.json() as IntegrationResponse;
      setSettings(updatedSettings);
      onIntegrationChange?.(updatedSettings);
      setSaveFeedback({ type: "success", text: "تم استلام بيانات الرقم من Meta، جاري إكمال الربط." });
      setWizardStep(4);
    }

    window.addEventListener("message", handleMetaMessage);
    return () => window.removeEventListener("message", handleMetaMessage);
  }, [selectedChannel, settings.phoneNumber, settings.phoneNumberId, settings.wabaId]);

  function updateField(field: keyof IntegrationSettings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function persistSettings() {
    const response = await fetch(`/api/settings/integration?channel=${selectedChannel}`, {
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
    const response = await fetch(`/api/settings/integration?channel=${selectedChannel}`, {
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
        accessToken: "",
        googleAccountId: "",
        googleLocationId: "",
        googleRefreshToken: ""
      })
    });
    const data = await response.json() as IntegrationResponse;
    setSettings(data);
    onIntegrationChange?.(data);
    setWizardStep(selectedChannel === "instagram" || selectedChannel === "facebook" || selectedChannel === "telegram" || selectedChannel === "x" ? 3 : selectedChannel === "google_maps" || selectedChannel === "email" ? 4 : 2);
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

  async function openMetaWindow() {
    if (typeof window === "undefined") return false;

    if (selectedChannel === "whatsapp") {
      const appId = settings.appId || publicMetaAppId;
      const configId = settings.configId || publicMetaConfigId;

      if (!appId) {
        window.alert("تحتاج App ID من تطبيق Meta لتشغيل الربط المباشر. احفظه في إعدادات Vercel ثم حاول من جديد.");
        return false;
      }

      if (!configId) {
        window.alert("تحتاج Configuration ID من Meta لتشغيل Embedded Signup وإنشاء/ربط حافظة الأعمال والرقم تلقائياً.");
        return false;
      }

      const metaUrl = "/api/meta/whatsapp-onboard";
      const metaWindow = window.open(metaUrl, "audiencew-meta-connect", "width=960,height=780");
      if (!metaWindow) {
        window.location.href = metaUrl;
      }

      return true;
    }

    const metaUrl = `/api/meta/connect?channel=${selectedChannel}`;
    const metaWindow = window.open(metaUrl, "audiencew-meta-connect", "width=960,height=780");
    if (!metaWindow) {
      window.location.href = metaUrl;
    }
    return true;
  }

  async function connectXAccount() {
    if (!settings.appId.trim() || !settings.configId.trim()) {
      window.alert("احفظ OAuth 2.0 Client ID و Client Secret لتطبيق AudienceW أولًا، وبعدها اضغط ربط X.");
      setWizardStep(4);
      return;
    }

    await persistSettings();
    window.location.href = "/api/x/connect";
  }

  async function connectGoogleMaps() {
    window.location.href = "/api/google/connect";
  }

  async function syncGoogleReviews() {
    const response = await fetch("/api/google/reviews/sync", { method: "POST" });
    const result = await response.json().catch(() => null) as { ok?: boolean; synced?: number; error?: string } | null;
    if (response.ok && result?.ok) {
      setSaveFeedback({ type: "success", text: `تمت مزامنة ${result.synced ?? 0} تقييم من Google` });
    } else {
      setSaveFeedback({ type: "error", text: result?.error || "تعذر مزامنة تقييمات Google" });
    }
  }

  function renderWizardContent() {
    if (isConnected) {
      return (
        <div className="meta-wizard-panel">
          <div className="meta-wizard-title">
            <h3>اختر قناة</h3>
            <p>القنوات المتصلة تعرض بيانات الربط مباشرة بدون خطوات ربط جديدة.</p>
          </div>
          <div className="channel-grid">
            {channels.map((channel) => {
              const selected = channel.id === selectedChannel;

              return (
                <button
                  className={`channel-card ${selected ? "selected" : ""} ${channel.active ? "" : "disabled"}`}
                  key={channel.id}
                  type="button"
                  disabled={!channel.active}
                  onClick={() => {
                    if (channel.id === "whatsapp" || channel.id === "instagram" || channel.id === "facebook" || channel.id === "telegram" || channel.id === "x" || channel.id === "google_maps" || channel.id === "email" || channel.id === "website" || channel.id === "tiktok" || channel.id === "sms") {
                      setSelectedChannel(channel.id);
                      setWizardStep(4);
                    }
                  }}
                >
                  <span className={`channel-icon channel-icon-${channel.id}`}>
                    <ChannelIcon id={channel.id} />
                  </span>
                  <b>{channel.title}</b>
                  <small>{channel.id === "x" ? "غير متاح حالياً" : selected ? "القناة متصلة، بياناتها ظاهرة بالأسفل" : channel.description}</small>
                </button>
              );
            })}
          </div>
          <div className="connected-channel-note">
            <b>{isWebsite ? "ودجت الموقع جاهز" : isEmail ? "البريد الإلكتروني متصل" : isGoogleMaps ? "خرائط Google متصلة" : isX ? "X جاهز للربط" : isTelegram ? "تيليجرام متصل" : isFacebook ? "فيسبوك متصل" : isInstagram ? "Instagram متصل" : "واتساب متصل"}</b>
            <span>يمكنك تعديل البيانات أو مسح الربط من قسم بيانات الربط والويبهوك بالأسفل.</span>
            {!isEmail && !isGoogleMaps && !isX && !isTelegram && !isWebsite ? (
              <button type="button" onClick={openMetaWindow}>
                {isFacebook ? "ربط صفحة Facebook" : isInstagram ? "ربط Instagram" : "ربط واتساب جديد"}
              </button>
            ) : null}
          </div>
        </div>
      );
    }

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
                className={`channel-card ${channel.id === selectedChannel ? "selected" : ""} ${channel.active ? "" : "disabled"}`}
                key={channel.id}
                type="button"
                disabled={!channel.active}
                onClick={() => {
                  if (channel.id === "whatsapp" || channel.id === "instagram" || channel.id === "facebook" || channel.id === "telegram" || channel.id === "x" || channel.id === "google_maps" || channel.id === "email" || channel.id === "website" || channel.id === "tiktok" || channel.id === "sms") {
                    setSelectedChannel(channel.id);
                    setWizardStep(channel.id === "instagram" || channel.id === "facebook" || channel.id === "telegram" || channel.id === "x" || channel.id === "tiktok" || channel.id === "sms" || channel.id === "google_maps" ? 3 : channel.id === "email" || channel.id === "website" ? 4 : 2);
                  }
                }}
              >
                <span className={`channel-icon channel-icon-${channel.id}`}>
                  <ChannelIcon id={channel.id} />
                </span>
                <b>{channel.title}</b>
                <small>{channel.id === "x" ? "غير متاح حالياً" : channel.description}</small>
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
      if (isEmail) {
        return (
          <div className="meta-wizard-panel">
            <div className="meta-signup-card">
              <span className="provider-round-icon">@</span>
              <h3>ربط البريد الإلكتروني</h3>
              <p>اربط أي مزود بريد عبر Webhook. أي رسالة تصل للرابط ستظهر كمحادثة بريد داخل المنصة، والرد يرسل عبر Resend.</p>
              <div className="telegram-steps">
                <div><span>1</span><b>احفظ بريد الإرسال</b><small>اكتب اسم المرسل والبريد الذي سيظهر للعميل.</small></div>
                <div><span>2</span><b>انسخ Webhook</b><small>استخدم {publicAppUrl}/api/email/inbound في Zapier أو Make.</small></div>
                <div><span>3</span><b>أضف Secret Token</b><small>أرسله في Header باسم x-audiencew-email-secret.</small></div>
                <div><span>4</span><b>جرّب رسالة</b><small>أرسل بيانات from و subject و text وستظهر في المحادثات.</small></div>
              </div>
              <button type="button" onClick={() => setWizardStep(4)}>
                إدخال بيانات البريد
              </button>
            </div>
          </div>
        );
      }

      if (isGoogleMaps) {
        return (
          <div className="meta-wizard-panel">
            <div className="meta-signup-card">
              <span className="provider-round-icon">G</span>
              <h3>ربط خرائط Google</h3>
              <p>اربط Google Business Profile حتى تظهر تقييمات الموقع داخل صندوق المحادثات وتقدر ترد عليها من المنصة.</p>
              <div className="google-business-summary">
                <div>
                  <span>حالة الربط</span>
                  <b>{statusLabel[settings.status]}</b>
                </div>
                <div>
                  <span>النشاط التجاري</span>
                  <b>{settings.wabaName || settings.businessName || "لم يتم تحديد النشاط بعد"}</b>
                </div>
                <p>{settings.phoneNumber || "اضغط ربط Google واختر الحساب الذي يدير النشاط التجاري."}</p>
              </div>
              <button type="button" onClick={connectGoogleMaps}>
                ربط Google
              </button>
            </div>
          </div>
        );
      }

      if (isTelegram) {
        return (
          <div className="meta-wizard-panel">
            <div className="meta-signup-card">
              <span className="provider-round-icon">✈</span>
              <h3>ربط تيليجرام عبر Bot Token</h3>
              <p>تيليجرام يربط عبر بوت رسمي. خذ Bot Token من BotFather مرة واحدة، والمنصة تتولى تفعيل الاستقبال تلقائياً.</p>
              <div className="telegram-steps">
                <div><span>1</span><b>افتح BotFather</b><small>من تطبيق تيليجرام ابحث عن BotFather الرسمي.</small></div>
                <div><span>2</span><b>أنشئ بوت جديد</b><small>ارسل /newbot، ثم اختر اسم و username ينتهي بـ bot.</small></div>
                <div><span>3</span><b>انسخ Bot Token</b><small>الصق التوكن هنا واضغط حفظ الإعدادات.</small></div>
                <div><span>4</span><b>جرّب الرسائل</b><small>أرسل /start للبوت وستظهر المحادثة داخل المنصة.</small></div>
              </div>
              <button type="button" onClick={() => setWizardStep(4)}>
                إدخال بيانات تيليجرام
              </button>
            </div>
          </div>
        );
      }

      if (isX) {
        return (
          <div className="meta-wizard-panel">
            <div className="meta-signup-card">
              <span className="provider-round-icon">X</span>
              <h3>ربط X مباشرة</h3>
              <p>تطبيق AudienceW يستخدم OAuth. العميل يضغط ربط X، يسجل الدخول، يوافق على الصلاحيات، ثم يرجع للمنصة بدون إدخال مفاتيح.</p>
              <div className="telegram-steps">
                <div><span>1</span><b>تطبيق AudienceW</b><small>يتم ضبط مفاتيح التطبيق مرة واحدة من طرف المنصة.</small></div>
                <div><span>2</span><b>ربط العميل</b><small>العميل يضغط زر الربط ويسجل دخوله في X.</small></div>
                <div><span>3</span><b>حفظ تلقائي</b><small>نحفظ التوكن واسم الحساب بعد الرجوع من X.</small></div>
                <div><span>4</span><b>المحادثات</b><small>بعد تفعيل Webhook تظهر رسائل X داخل صندوق المحادثات.</small></div>
              </div>
              <button type="button" onClick={connectXAccount}>
                ربط X
              </button>
              <button className="secondary-action" type="button" onClick={() => setWizardStep(4)}>
                إعداد تطبيق AudienceW
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="meta-wizard-panel">
          <div className="meta-signup-card">
            <span className="provider-round-icon">{isInstagram ? "◎" : isFacebook ? "f" : "☏"}</span>
            <h3>{isInstagram ? "Connect Instagram with Meta" : isFacebook ? "Connect Facebook Page" : "Quick setup with Meta"}</h3>
            <p>
              {isInstagram
                ? "اربط حساب Instagram Business أو Creator المرتبط بصفحة Facebook حتى تظهر الرسائل والتعليقات داخل صندوق المحادثات."
                : isFacebook
                  ? "اربط صفحة Facebook حتى تظهر رسائل Messenger داخل صندوق المحادثات وتقدر ترد عليها من المنصة."
                : "Use the WhatsApp Embedded Signup flow to quickly connect new numbers. You will be redirected to Meta to log into your WhatsApp Business account. Having admin access will help make the setup smooth and easy."}
            </p>
            <ul>
              <li>{isInstagram ? "Instagram professional account required" : isFacebook ? "Facebook Page admin access required" : "No manual configuration required"}</li>
              <li>Secure OAuth based authentication</li>
              <li>{isInstagram ? "Messages and comments will use the Meta webhook" : isFacebook ? "Messenger messages will use the Meta webhook" : "Automatic webhook and phone number configuration"}</li>
            </ul>
            <button className={!isInstagram && !isFacebook ? "facebook-login-button" : undefined} type="button" onClick={openMetaWindow}>
              {isInstagram ? "Connect Instagram" : isFacebook ? "Connect Facebook" : "Login with Facebook"}
            </button>
          </div>
        </div>
      );
    }

    const summaryTitle = isConnected ? "أصبح كل شيء جاهزًا" : isGoogleMaps ? "بانتظار تفعيل الوصول" : "لم يكتمل الربط بعد";
    const summaryText = isConnected
      ? isEmail
        ? "بعد حفظ بيانات البريد، استخدم رابط الويبهوك لاستقبال الرسائل داخل صندوق المحادثات والرد عليها من المنصة."
        : isGoogleMaps
          ? "تم حفظ حساب النشاط التجاري والموقع، وستظهر تقييمات خرائط Google داخل صندوق المحادثات."
        : isX
          ? "بعد حفظ مفاتيح X ستكون القناة جاهزة للمرحلة التالية: تفعيل استقبال الرسائل الخاصة والردود على التغريدات."
        : isTelegram
          ? "بعد حفظ Bot Token سيتم التحقق من البوت وتفعيل Webhook تلقائياً، وستظهر المحادثة عند وصول أول رسالة من تيليجرام."
        : isFacebook
          ? "بعد إكمال ربط Facebook سيتم حفظ الصفحة والصلاحيات، وستظهر القناة في صندوق المحادثات عند استقبال أول رسالة."
        : isInstagram
          ? "بعد إكمال ربط Instagram سيتم حفظ الحساب والصلاحيات، وستظهر القناة في صندوق المحادثات عند استقبال أول حدث."
        : "بعد إكمال نافذة Meta سيتم حفظ حافظة الأعمال، حساب واتساب، رقم الهاتف، والصلاحيات في بيانات الربط."
      : isGoogleMaps
        ? settings.phoneNumber || "تمت مصادقة Google، لكن لم يكتمل تفعيل قراءة بيانات النشاط التجاري بعد. بعد موافقة Google Business Profile API اضغط ربط Google مرة أخرى لاختيار الحساب والموقع."
      : "أكمل الربط أولاً حتى تصبح القناة جاهزة داخل المنصة.";

    return (
      <div className="meta-wizard-panel">
        <div className={`meta-summary-card ${isConnected ? "ready" : "pending"}`}>
          <span>{isConnected ? "✓" : "!"}</span>
          <h3>{summaryTitle}</h3>
              <p>{summaryText}</p>
              <div className="summary-list">
                <b>{settings.businessName || "حافظة الأعمال"}</b>
                <b>{settings.wabaName || (isEmail ? "قناة البريد" : isGoogleMaps ? "موقع Google" : isX ? "حساب X" : isTelegram ? "بوت Telegram" : isFacebook ? "صفحة Facebook" : isInstagram ? "حساب Instagram" : "حساب واتساب للأعمال")}</b>
                <b>{isEmail ? settings.phoneNumber || "بريد الإرسال" : isGoogleMaps ? settings.googleLocationId || "Google Location ID" : isX ? settings.wabaId || "X Account ID" : isTelegram ? settings.phoneNumber || "Bot ID" : isFacebook ? settings.wabaId || "Facebook Page ID" : isInstagram ? settings.wabaId || "Instagram Account ID" : settings.phoneNumber || "رقم واتساب"}</b>
              </div>
        </div>
      </div>
    );
  }

  return (
    <section className="page-stack settings-page">
      <div className="settings-onboarding">
        <aside className="meta-wizard-rail settings-rail">
          {currentWizardSteps.map((step, index) => {
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
          {!isConnected ? (
            <div className="settings-onboarding-actions">
              <button className="btn soft" type="button" disabled={wizardStep === 1} onClick={() => setWizardStep((step) => Math.max(1, step - 1))}>
                عودة
              </button>
              {!(isGoogleMaps && wizardStep === 3) ? <button className="btn primary" type="button" onClick={() => {
                if (wizardStep === 3 && isGoogleMaps) {
                  connectGoogleMaps();
                  return;
                }
                if (wizardStep === 3 && !isTelegram && !isX && !isGoogleMaps) {
                  openMetaWindow();
                  return;
                }
                setWizardStep((step) => Math.min(4, step + 1));
              }}>
                {wizardStep === 3 ? (isGoogleMaps ? "ربط Google" : isTelegram || isX ? "إدخال البيانات" : "فتح نافذة Meta") : wizardStep === 4 ? "إنهاء" : "التالي"}
              </button> : null}
            </div>
          ) : null}
        </div>
      </div>

      {showIntegrationData && (
        <form className="settings-form" onSubmit={saveSettings}>
          {isTelegram ? (
            <div className="telegram-help-card">
              <div>
                <h3>طريقة ربط تيليجرام</h3>
                <p>الربط يتم عن طريق بوت تيليجرام. لا تحتاج تسجيل دخول، فقط انسخ Bot Token من BotFather واحفظه هنا.</p>
              </div>
              <ol>
                <li>افتح تيليجرام وابحث عن BotFather الرسمي.</li>
                <li>اكتب /newbot واختر اسم البوت واسم المستخدم.</li>
                <li>انسخ Bot Token الذي يعطيك إياه BotFather.</li>
                <li>الصق التوكن في خانة Bot Token واضغط حفظ الإعدادات.</li>
                <li>أرسل /start للبوت من تيليجرام حتى تظهر المحادثة في المنصة.</li>
              </ol>
            </div>
          ) : null}
          {isX ? (
            <div className="telegram-help-card">
              <div>
                <h3>إعداد تطبيق AudienceW على X</h3>
                <p>هذه البيانات تضبط تطبيق المنصة مرة واحدة. بعد ذلك كل عميل يربط X بزر مباشر بدون إدخال مفاتيح.</p>
              </div>
              <ol>
                <li>أنشئ App واحد باسم AudienceW داخل X Developer Portal.</li>
                <li>فعّل OAuth 2.0 وصلاحيات Read / Write / Direct Messages حسب المتاح.</li>
                <li>انسخ OAuth 1.0 Secret Key واحفظه في خانة Consumer Secret، فهو المطلوب لاختبار CRC.</li>
                <li>أضف Callback URL: {publicAppUrl}/api/x/callback</li>
                <li>أضف Webhook URL إذا كان متاحًا: {publicAppUrl}/api/x/webhook</li>
                <li>احفظ بيانات التطبيق هنا، ثم استخدم زر ربط X للمصادقة بحساب العميل.</li>
              </ol>
            </div>
          ) : null}
          {isTikTok ? (
            <div className="telegram-help-card">
              <div>
                <h3>ربط TikTok Business Messaging</h3>
                <p>هذه القناة قيد التجهيز - إرسال واستقبال الرسائل الفعلي بينتظر موافقة TikTok على صلاحية Business Messaging Partner لحسابك. تقدر تحفظ بيانات التطبيق الآن وتكمل التفعيل بعد ما توافق عليك TikTok.</p>
              </div>
              <ol>
                <li>سجّل حساب TikTok Business وقدّم على TikTok API for Business.</li>
                <li>اطلب صلاحية "Business Messaging" كـ Messaging Partner من TikTok.</li>
                <li>بعد الموافقة، انسخ App Key وApp Secret وAccess Token واحفظهم هنا.</li>
              </ol>
            </div>
          ) : null}
          {isSms ? (
            <div className="telegram-help-card">
              <div>
                <h3>ربط SMS عبر Unifonic</h3>
                <p>الإرسال الصادر جاهز ويشتغل مباشرة بمجرد حفظ البيانات. استقبال ردود العملاء (SMS ثنائي الاتجاه) لسه قيد التجهيز.</p>
              </div>
              <ol>
                <li>أنشئ حساب على <a href="https://www.unifonic.com" target="_blank" rel="noreferrer">Unifonic</a> وسجّل نشاطك التجاري.</li>
                <li>من لوحة Unifonic، انسخ AppSid الخاص بتطبيقك.</li>
                <li>سجّل اسم مرسل (Sender ID) معتمد، وانسخه بالأسفل.</li>
                <li>احفظ الإعدادات - الرد على أي محادثة SMS من هنا بيرسل فعلياً عبر Unifonic.</li>
              </ol>
            </div>
          ) : null}
          {isEmail ? (
            <div className="telegram-help-card">
              <div>
                <h3>ربط Gmail مباشرة (موصى به)</h3>
                <p>اربط حساب Gmail عبر OAuth لإرسال واستقبال الرسائل تلقائياً بدون إعداد Webhook يدوي.</p>
              </div>
              <a className="btn primary" href="/api/email/oauth/gmail" style={{ display: "inline-block", width: "fit-content" }}>
                ربط Gmail
              </a>
            </div>
          ) : null}
          {isEmail ? (
            <div className="telegram-help-card">
              <div>
                <h3>طريقة ربط البريد الإلكتروني عبر Webhook (بديل)</h3>
                <p>استخدم Webhook البريد مع Zapier أو Make أو أي مزود يدعم إرسال Webhook عند وصول بريد جديد.</p>
              </div>
              <ol>
                <li>احفظ اسم المرسل وبريد الإرسال في الحقول أدناه.</li>
                <li>أضف Resend API Key في Vercel باسم RESEND_API_KEY أو الصقه هنا للاختبار.</li>
                <li>انسخ رابط Webhook وأرسله من مزود البريد عند وصول رسالة جديدة.</li>
                <li>أضف Secret Token في Header باسم x-audiencew-email-secret.</li>
                <li>أي رسالة تحتوي from و subject و text ستظهر في المحادثات كقناة بريد.</li>
              </ol>
            </div>
          ) : null}
          {isWebsite ? (
            <div className="telegram-help-card">
              <div>
                <h3>ودجت الدردشة الحية لموقعك</h3>
                <p>انسخ الكود التالي والصقه قبل إغلاق وسم &lt;/body&gt; في أي صفحة بموقعك. راح تظهر فقاعة دردشة لكل زوار الموقع، ورسائلهم بتظهر مباشرة هنا كمحادثات قناة "الموقع الإلكتروني".</p>
              </div>
              <div className="copy-row">
                <span>{`<script src="${publicAppUrl}/widget.js" data-site-key="${settings.verifyToken}" async></script>`}</span>
                <button
                  type="button"
                  onClick={() => copyValue("website-embed", `<script src="${publicAppUrl}/widget.js" data-site-key="${settings.verifyToken}" async></script>`)}
                >
                  {copied === "website-embed" ? "تم النسخ" : "نسخ الكود"}
                </button>
              </div>
              <ol>
                <li>افتح محرر موقعك (أو نظام إدارة المحتوى) وأضف الكود بالأعلى في كل الصفحات.</li>
                <li>الزائر يكتب اسمه وبريده أول مرة، بعدها تظهر له نافذة الدردشة مباشرة.</li>
                <li>ردودك من هذه اللوحة تصل للزائر خلال ثوانٍ داخل نفس النافذة.</li>
              </ol>
            </div>
          ) : null}
          <div className="settings-form-head">
            <div>
              <h2>{isWebsite ? "ودجت الموقع الإلكتروني" : isGoogleMaps ? "ربط Google Business" : isWhatsApp ? "ربط واتساب" : "بيانات الربط والويبهوك"}</h2>
              <p>{isWebsite ? "مفتاح الموقع أدناه فريد لحسابك ومُضمّن تلقائياً بكود التضمين بالأعلى." : isEmail ? "هذه البيانات تحفظ قناة البريد الإلكتروني وتستخدم في استقبال الرسائل عبر Webhook وإرسال الردود عبر Resend." : isGoogleMaps ? "لا تحتاج إدخال حقول هنا. اضغط ربط Google واختر حساب النشاط التجاري، وسيتم حفظ بيانات الربط تلقائياً بعد الموافقة." : isX ? "هذه بيانات تطبيق AudienceW على X. العميل لن يدخل هذه المفاتيح؛ سيضغط ربط X فقط ويتم حفظ حسابه تلقائيًا." : isTikTok ? "احفظ بيانات تطبيق TikTok الآن؛ الإرسال والاستقبال الفعلي يبدأ بعد موافقة TikTok على صلاحية Business Messaging." : isSms ? "بيانات Unifonic لإرسال رسائل SMS للعملاء. استقبال الردود قيد التجهيز." : isTelegram ? "هذه البيانات تحفظ ربط Telegram وتفعّل الويبهوك تلقائياً لاستقبال الرسائل داخل المنصة." : isFacebook ? "هذه البيانات تحفظ صفحة Facebook وتستخدم في استقبال وإرسال رسائل Messenger داخل المنصة." : isInstagram ? "هذه البيانات تحفظ ربط Instagram وتستخدم في استقبال الرسائل والتعليقات داخل المنصة." : "اربط حساب واتساب من نافذة Meta. سيتم حفظ بيانات الحساب والرقم تلقائياً بعد اكتمال الربط."}</p>
            </div>
            <span className={`connection-pill ${settings.status}`}>{statusLabel[settings.status]}</span>
            {!isWebsite ? <button className="soft-action" disabled={saving || loading} type="button" onClick={resetIntegrationData}>
              مسح بيانات الربط
            </button> : null}
            {!isGoogleMaps && !isWhatsApp && !isWebsite ? <button className="primary-action" disabled={saving || loading} type="submit">
              {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </button> : null}
          </div>

          {!isGoogleMaps && !isWebsite ? <div className="settings-fields">
            {!isWhatsApp ? <label>
              اسم النشاط التجاري
              <input value={settings.businessName} onChange={(event) => updateField("businessName", event.target.value)} />
            </label> : null}
            <label>
              {isEmail ? "اسم قناة البريد" : isX ? "اسم حساب X" : isTikTok ? "اسم حساب TikTok" : isSms ? "اسم قناة SMS" : isTelegram ? "اسم بوت Telegram" : isFacebook ? "اسم صفحة Facebook" : isInstagram ? "اسم حساب Instagram" : "حساب واتساب للأعمال"}
              <input value={settings.wabaName} onChange={(event) => updateField("wabaName", event.target.value)} readOnly={isWhatsApp} placeholder={isWhatsApp ? "يظهر بعد اكتمال الربط من Meta" : undefined} />
            </label>
            {!isInstagram && !isFacebook && !isTelegram && !isX && !isEmail && !isTikTok && !isSms ? <label>
              رقم واتساب
              <input value={settings.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} readOnly={isWhatsApp} placeholder="يظهر بعد اكتمال الربط من Meta" />
            </label> : null}
            <label>
              حالة الربط
              <div className={`connection-status-box ${settings.status}`}>
                <b>{statusLabel[settings.status]}</b>
                <span>
                  {settings.status === "connected"
                    ? isEmail
                      ? "تم حفظ البريد ورابط الويبهوك."
                    : isX
                      ? "تم حفظ مفاتيح X. التفعيل الكامل يعتمد على صلاحيات API."
                      : isTikTok
                      ? "تم حفظ بيانات TikTok."
                      : isSms
                      ? "تم حفظ بيانات Unifonic. الرد على أي محادثة SMS يرسل رسالة فعلية."
                      : isGoogleMaps
                        ? "تم حفظ حساب خرائط Google والموقع."
                      : isFacebook
                      ? "تم التحقق من صفحة Facebook والربط جاهز."
                      : isTelegram
                      ? "تم التحقق من Bot Token وتفعيل Webhook."
                      : "تم التحقق من بيانات Meta والربط جاهز."
                    : "احفظ الإعدادات بعد تعبئة البيانات وسيتم التحقق تلقائيًا."}
                </span>
              </div>
            </label>
            {isEmail ? (
              <>
                <label>
                  بريد الإرسال
                  <input dir="ltr" type="email" value={settings.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} placeholder="support@example.com" />
                </label>
                <label>
                  Resend API Key اختياري
                  <input dir="ltr" value={settings.accessToken} onChange={(event) => updateField("accessToken", event.target.value)} placeholder="يمكن تركه فارغاً إذا أضفته في Vercel" />
                </label>
                <label>
                  Secret Token
                  <input dir="ltr" value={settings.verifyToken} onChange={(event) => updateField("verifyToken", event.target.value)} placeholder="audiencew_email_secret" />
                </label>
              </>
            ) : isTelegram ? (
              <>
                <label>
                  Bot Token
                  <input dir="ltr" value={settings.accessToken} onChange={(event) => updateField("accessToken", event.target.value)} placeholder="123456:ABC..." />
                </label>
                <label>
                  Secret Token اختياري
                  <input dir="ltr" value={settings.verifyToken} onChange={(event) => updateField("verifyToken", event.target.value)} placeholder="audiencew_telegram_secret" />
                </label>
              </>
            ) : isGoogleMaps ? (
              <>
                <label>
                  Google Client ID
                  <input dir="ltr" value={settings.appId} onChange={(event) => updateField("appId", event.target.value)} placeholder="Google OAuth Client ID" />
                </label>
                <label>
                  Google Client Secret
                  <input dir="ltr" value={settings.configId} onChange={(event) => updateField("configId", event.target.value)} placeholder="Google OAuth Client Secret" />
                </label>
                <label>
                  Google Account ID
                  <input dir="ltr" value={settings.googleAccountId} onChange={(event) => updateField("googleAccountId", event.target.value)} placeholder="accounts/..." />
                </label>
                <label>
                  Google Location ID
                  <input dir="ltr" value={settings.googleLocationId} onChange={(event) => updateField("googleLocationId", event.target.value)} placeholder="locations/..." />
                </label>
                <label>
                  Refresh Token
                  <input dir="ltr" value={settings.googleRefreshToken} onChange={(event) => updateField("googleRefreshToken", event.target.value)} placeholder="يتم حفظه تلقائياً بعد الربط" />
                </label>
              </>
            ) : isX ? (
              <>
                <label>
                  OAuth 2.0 Client ID
                  <input dir="ltr" value={settings.appId} onChange={(event) => updateField("appId", event.target.value)} placeholder="X OAuth Client ID" />
                </label>
                <label>
                  OAuth 2.0 Client Secret
                  <input dir="ltr" value={settings.configId} onChange={(event) => updateField("configId", event.target.value)} placeholder="X OAuth Client Secret" />
                </label>
                <label>
                  Consumer Key
                  <input dir="ltr" value={settings.xConsumerKey} onChange={(event) => updateField("xConsumerKey", event.target.value)} placeholder="OAuth 1.0 Consumer Key" />
                </label>
                <label>
                  Consumer Secret / OAuth 1.0 Secret Key
                  <input dir="ltr" value={settings.xConsumerSecret} onChange={(event) => updateField("xConsumerSecret", event.target.value)} placeholder="OAuth 1.0 Secret Key" />
                </label>
                <label>
                  Bearer Token
                  <input dir="ltr" value={settings.xBearerToken} onChange={(event) => updateField("xBearerToken", event.target.value)} />
                </label>
                <label>
                  OAuth 1.0 Access Token
                  <input dir="ltr" value={settings.xAccessToken} onChange={(event) => updateField("xAccessToken", event.target.value)} />
                </label>
                <label>
                  OAuth 1.0 Access Token Secret
                  <input dir="ltr" value={settings.xAccessTokenSecret} onChange={(event) => updateField("xAccessTokenSecret", event.target.value)} />
                </label>
                <label>
                  Account / User ID اختياري
                  <input dir="ltr" value={settings.wabaId} onChange={(event) => updateField("wabaId", event.target.value)} placeholder="@username أو User ID" />
                </label>
                <label>
                  Webhook Secret
                  <input dir="ltr" value={settings.verifyToken} onChange={(event) => updateField("verifyToken", event.target.value)} placeholder="audiencew_x_secret" />
                </label>
              </>
            ) : isTikTok ? (
              <>
                <label>
                  App Key
                  <input dir="ltr" value={settings.appId} onChange={(event) => updateField("appId", event.target.value)} placeholder="TikTok App Key" />
                </label>
                <label>
                  App Secret
                  <input dir="ltr" value={settings.configId} onChange={(event) => updateField("configId", event.target.value)} placeholder="TikTok App Secret" />
                </label>
                <label>
                  Access Token
                  <input dir="ltr" value={settings.accessToken} onChange={(event) => updateField("accessToken", event.target.value)} placeholder="يصدر بعد موافقة TikTok" />
                </label>
              </>
            ) : isSms ? (
              <>
                <label>
                  AppSid
                  <input dir="ltr" value={settings.appId} onChange={(event) => updateField("appId", event.target.value)} placeholder="Unifonic AppSid" />
                </label>
                <label>
                  Sender ID
                  <input dir="ltr" value={settings.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} placeholder="اسم أو رقم المرسل المعتمد" />
                </label>
              </>
            ) : null}
          </div> : null}

          {isGoogleMaps ? (
            <div className="x-connect-card">
              <div>
                <h3>بيانات النشاط التجاري</h3>
                <p>{settings.phoneNumber || "بعد إكمال الربط ستظهر هنا بيانات النشاط التجاري والموقع المرتبط."}</p>
              </div>
              <button className="soft-action" disabled={saving || loading || settings.status !== "connected"} type="button" onClick={syncGoogleReviews}>
                مزامنة التقييمات
              </button>
            </div>
          ) : null}

          {isX ? (
            <div className="x-connect-card">
              <div>
                <h3>ربط حساب X للعميل</h3>
                <p>بعد حفظ Client ID و Client Secret لتطبيق AudienceW، اضغط ربط X. العميل سيسجل الدخول ويوافق على الصلاحيات، ثم يرجع للمنصة تلقائيًا.</p>
              </div>
              <button className="primary-action" disabled={saving || loading} type="button" onClick={connectXAccount}>
                ربط X مباشرة
              </button>
            </div>
          ) : null}

          {saveFeedback && <p className={`settings-save-feedback ${saveFeedback.type}`}>{saveFeedback.text}</p>}

          {telegramBotLink ? (
            <div className="telegram-link-card">
              <div>
                <h3>رابط تيليجرام للعملاء</h3>
                <p>هذا هو الرابط الذي ترسله للعملاء. أي عميل يفتحه ويرسل للبوت ستظهر محادثته داخل المنصة.</p>
              </div>
              <div className="copy-row">
                <span>{telegramBotLink}</span>
                <button type="button" onClick={() => copyValue("telegram-link", telegramBotLink)}>
                  {copied === "telegram-link" ? "تم النسخ" : "نسخ الرابط"}
                </button>
              </div>
              <small>للتجربة: افتح الرابط، اضغط Start أو أرسل /start، ثم ارجع لصفحة المحادثات.</small>
            </div>
          ) : null}

          {!isInstagram && !isFacebook && !isTelegram && !isX && !isGoogleMaps && !isEmail && !isWebsite && settings.status === "connected" ? <div className="meta-test-card">
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
          </div> : null}

          {!isGoogleMaps && !isWhatsApp && !isWebsite ? <div className="webhook-card">
            <div>
              <h3>إعدادات الويبهوك</h3>
              <p>{isEmail ? "انسخ هذا الرابط مع Secret Token وضعه في Zapier أو Make أو مزود البريد لإرسال الرسائل الواردة إلى المنصة." : isGoogleMaps ? "هذا الرابط يستخدمه النظام لمزامنة تقييمات Google عند الطلب أو بشكل دوري داخل المنصة." : isX ? "استخدم هذا الرابط كـ Webhook URL في X عند توفر Account Activity API. Webhook Secret يحمي الطلبات." : isTelegram ? "سيتم تفعيل هذا الرابط تلقائياً في Telegram عند حفظ Bot Token. Secret Token يحمي الويبهوك من الطلبات غير المعروفة." : isFacebook ? "انسخ رابط الويبهوك و Verify Token وضعها في إعدادات تطبيق Meta لاستقبال رسائل Facebook Messenger." : isInstagram ? "انسخ رابط الويبهوك و Verify Token وضعها في إعدادات تطبيق Meta لاستقبال رسائل وتعليقات Instagram." : "انسخ رابط الويبهوك و Verify Token وضعها في إعدادات تطبيق Meta لاستقبال رسائل WhatsApp."}</p>
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
                {copied === "token" ? "تم النسخ" : isTelegram || isX || isEmail ? "نسخ Secret Token" : "نسخ التوكن"}
              </button>
            </div>
          </div> : null}
        </form>
      )}
    </section>
  );
}
