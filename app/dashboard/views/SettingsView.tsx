"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { IntegrationSettings } from "../types";
import { useLanguage } from "../i18n";

type MetaSignupData = {
  business_id?: string;
  waba_id?: string;
  whatsapp_business_account_id?: string;
  phone_number_id?: string;
  phone_number?: string;
};

type FacebookSdk = {
  init: (options: { appId: string; xfbml: boolean; version: string }) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>
  ) => void;
};

type FacebookWindow = typeof window & { FB?: FacebookSdk; fbAsyncInit?: () => void };

const businessVerticalOptions: Array<{ value: string; ar: string; en: string }> = [
  { value: "OTHER", ar: "أخرى", en: "Other" },
  { value: "AUTO", ar: "سيارات", en: "Automotive" },
  { value: "BEAUTY", ar: "تجميل وعناية", en: "Beauty, Spa and Salon" },
  { value: "APPAREL", ar: "ملابس وأزياء", en: "Clothing and Apparel" },
  { value: "EDU", ar: "تعليم", en: "Education" },
  { value: "ENTERTAIN", ar: "ترفيه", en: "Entertainment" },
  { value: "EVENT_PLAN", ar: "تنظيم فعاليات", en: "Event Planning" },
  { value: "FINANCE", ar: "مالية ومصرفية", en: "Finance and Banking" },
  { value: "GROCERY", ar: "بقالة وأغذية", en: "Food and Grocery" },
  { value: "GOVT", ar: "قطاع حكومي", en: "Public Service" },
  { value: "HOTEL", ar: "فنادق وضيافة", en: "Hotel and Lodging" },
  { value: "HEALTH", ar: "صحة وطب", en: "Medical and Health" },
  { value: "NONPROFIT", ar: "غير ربحي", en: "Non-profit" },
  { value: "PROF_SERVICES", ar: "خدمات مهنية", en: "Professional Services" },
  { value: "RETAIL", ar: "تجزئة وتسوق", en: "Shopping and Retail" },
  { value: "TRAVEL", ar: "سفر ونقل", en: "Travel and Transportation" },
  { value: "RESTAURANT", ar: "مطاعم", en: "Restaurant" },
  { value: "NOT_A_BIZ", ar: "ليس نشاطًا تجاريًا", en: "Not A Business" }
];

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

type TFn = (ar: string, en: string) => string;

function statusLabel(status: IntegrationSettings["status"], t: TFn) {
  const labels: Record<IntegrationSettings["status"], string> = {
    connected: t("متصل", "Connected"),
    pending: t("غير مكتمل", "Incomplete"),
    not_connected: t("غير متصل", "Not connected")
  };
  return labels[status];
}

function getWizardSteps(t: TFn) {
  return [
    {
      title: t("اختر قناة", "Choose a channel"),
      description: t("اختر الخدمة التي تود ربطها مع حسابك في Linkly.", "Choose the service you want to connect to your Linkly account.")
    },
    {
      title: t("إنشاء قناة تواصل", "Create a communication channel"),
      description: t("قم بالمصادقة على حسابك وإنشاء قناة التواصل.", "Authenticate your account and create the communication channel.")
    },
    {
      title: t("ربط Meta", "Connect Meta"),
      description: t("افتح نافذة Meta واختر حافظة الأعمال وحساب واتساب والرقم.", "Open the Meta window and choose your business portfolio, WhatsApp account, and number.")
    },
    {
      title: t("اكتمل الربط", "Connection complete"),
      description: t("أصبح كل شيء جاهزًا الآن.", "Everything is ready now.")
    }
  ];
}

export type ChannelId = "whatsapp" | "facebook" | "website" | "instagram" | "telegram" | "x" | "email" | "gmail" | "google_maps" | "tiktok" | "sms";
// The channel picker/wizard never selects the raw "email" record directly —
// Gmail is the only UI-facing channel for it (see apiChannel()) — so the
// selectable subset excludes it.
type SelectableChannelId = Exclude<ChannelId, "email">;

function getChannels(t: TFn): Array<{ id: SelectableChannelId; title: string; description: string; active: boolean }> {
  return [
    { id: "whatsapp", title: t("واتساب", "WhatsApp"), description: t("ادعم عملاءك عبر واتساب", "Support your customers on WhatsApp"), active: true },
    { id: "facebook", title: t("فيسبوك", "Facebook"), description: t("اربط صفحتك على فيسبوك", "Connect your Facebook page"), active: true },
    { id: "website", title: t("الموقع الإلكتروني", "Website"), description: t("أنشئ ودجت دردشة مباشرة", "Create a live-chat widget"), active: true },
    { id: "instagram", title: "Instagram", description: t("اربط حساب Instagram الخاص بك", "Connect your Instagram account"), active: true },
    { id: "telegram", title: t("تيليجرام", "Telegram"), description: t("اضبط قناة Telegram باستخدام Bot Token", "Configure Telegram channel using Bot token"), active: true },
    { id: "x", title: "X", description: t("ربط حساب X عبر OAuth", "Connect your X account via OAuth"), active: true },
    { id: "gmail", title: "Gmail", description: t("ربط Gmail مباشرة عبر OAuth", "Connect Gmail directly via OAuth"), active: true },
    { id: "google_maps", title: t("خرائط Google", "Google Maps"), description: t("اربط ملف نشاطك التجاري على Google", "Connect your Google Business Profile"), active: true },
    { id: "tiktok", title: "TikTok", description: t("بانتظار موافقة TikTok على Business Messaging", "Waiting for TikTok's Business Messaging approval"), active: true },
    { id: "sms", title: "SMS", description: t("إرسال واستقبال رسائل SMS عبر Unifonic", "Send and receive SMS messages via Unifonic"), active: true }
  ];
}

// Gmail is shown as its own channel card, but still reads/writes the single
// shared "email" integration record on the backend.
function apiChannel(channel: ChannelId) {
  return channel === "gmail" ? "email" : channel;
}

// Channels the auto-reply bot engine currently supports (lib/bot-engine.ts).
const botSupportedChannels: ChannelId[] = ["whatsapp", "telegram", "instagram", "facebook", "x", "website"];

const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://audiencew.audience.sa";
// WhatsApp Embedded Signup always uses Linkly's own tech-provider Meta app,
// never the per-tenant Instagram/Facebook app id from NEXT_PUBLIC_META_APP_ID.
const techProviderMetaAppId = "1296230909161568";
const techProviderMetaConfigId = "1428169365888624";

let facebookSdkPromise: Promise<void> | null = null;

function loadFacebookSdk(appId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as FacebookWindow;
  if (w.FB) return Promise.resolve();
  if (facebookSdkPromise) return facebookSdkPromise;

  facebookSdkPromise = new Promise((resolve) => {
    w.fbAsyncInit = () => {
      const sdk = w.FB;
      if (!sdk) return;
      sdk.init({ appId, xfbml: false, version: "v26.0" });
      resolve();
    };

    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return facebookSdkPromise;
}

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

  if (id === "gmail") {
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
  const { t } = useLanguage();
  const channels = useMemo(() => getChannels(t), [t]);
  const wizardSteps = useMemo(() => getWizardSteps(t), [t]);
  const [settings, setSettings] = useState<IntegrationSettings>(emptySettings);
  const [selectedChannel, setSelectedChannel] = useState<SelectableChannelId>(() => {
    // Popups fall back to a full-page redirect (e.g. "?meta=tiktok-callback")
    // when window.opener isn't available instead of just closing themselves,
    // so land on the channel that was actually just connected instead of
    // always defaulting to WhatsApp.
    if (typeof window === "undefined") return "whatsapp";
    const meta = new URLSearchParams(window.location.search).get("meta") || "";
    if (meta === "instagram-callback") return "instagram";
    if (meta === "facebook-callback") return "facebook";
    if (meta === "tiktok-callback") return "tiktok";
    if (meta === "callback") return "whatsapp";
    return "whatsapp";
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState("");
  const [wizardStep, setWizardStep] = useState(1);
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [businessProfile, setBusinessProfile] = useState({ about: "", address: "", description: "", email: "", vertical: "", website1: "", website2: "" });
  const [businessProfilePictureUrl, setBusinessProfilePictureUrl] = useState("");
  const [businessProfilePictureDataUrl, setBusinessProfilePictureDataUrl] = useState("");
  const [businessProfileLoading, setBusinessProfileLoading] = useState(false);
  const [businessProfileSaving, setBusinessProfileSaving] = useState(false);
  const [businessProfileFeedback, setBusinessProfileFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [oauthEmailStatus, setOauthEmailStatus] = useState<{ provider: "webhook" | "gmail"; status: "connected" | "not_connected" | "pending"; emailAddress: string } | null>(null);
  const [channelBotEnabled, setChannelBotEnabled] = useState(false);
  const [channelBotLoading, setChannelBotLoading] = useState(false);
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [overviewStatuses, setOverviewStatuses] = useState<Partial<Record<ChannelId, IntegrationSettings>>>({});
  const [overviewLoading, setOverviewLoading] = useState(true);
  const metaSignupDataRef = useRef<MetaSignupData>({});
  const hasSelectedChannelRef = useRef(false);
  const isInstagram = selectedChannel === "instagram";
  const isFacebook = selectedChannel === "facebook";
  const isTelegram = selectedChannel === "telegram";
  const isX = selectedChannel === "x";
  const isGoogleMaps = selectedChannel === "google_maps";
  const isGmail = selectedChannel === "gmail";
  const isEmail = isGmail;
  const isWebsite = selectedChannel === "website";
  const isTikTok = selectedChannel === "tiktok";
  const isSms = selectedChannel === "sms";
  const isWhatsApp = selectedChannel === "whatsapp";
  const isConnected = isGmail
    ? oauthEmailStatus?.status === "connected" && oauthEmailStatus.provider === selectedChannel
    : settings.status === "connected";
  const showIntegrationData = (isTelegram || isGoogleMaps || isEmail || isWebsite ? wizardStep >= 4 : wizardStep >= 3) || isConnected;
  // Gmail hides the manual Webhook setup UI once OAuth is actually connected.
  const hideManualEmailSetup = isGmail && isConnected;

  useEffect(() => {
    setShowWebhookToken(false);
  }, [selectedChannel]);

  useEffect(() => {
    if (isWhatsApp) {
      void loadFacebookSdk(techProviderMetaAppId);
    }
  }, [isWhatsApp, settings.appId]);

  useEffect(() => {
    if (isWhatsApp && settings.status === "connected") {
      void loadBusinessProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWhatsApp, settings.status]);

  useEffect(() => {
    if (!isGmail) return;
    fetch("/api/email/integration")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setOauthEmailStatus(data))
      .catch(() => {});
  }, [isGmail]);

  // Overview list at the top of the page ("القنوات المربوطة") needs the
  // connection status of every channel at once, not just the one currently
  // selected in the wizard below — fetch them all in parallel on mount.
  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    Promise.all(
      channels.map((channel) =>
        fetch(`/api/settings/integration?channel=${apiChannel(channel.id)}`)
          .then((response) => (response.ok ? response.json() : null))
          .then((data: IntegrationSettings | null) => [channel.id, data] as const)
          .catch(() => [channel.id, null] as const)
      )
    ).then((entries) => {
      if (cancelled) return;
      const map: Partial<Record<ChannelId, IntegrationSettings>> = {};
      entries.forEach(([id, data]) => {
        if (data) map[id] = data;
      });
      setOverviewStatuses(map);
      setOverviewLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the overview row for the channel currently open in the wizard in
  // sync the moment it connects/disconnects, without waiting on a refetch.
  useEffect(() => {
    setOverviewStatuses((current) => ({ ...current, [selectedChannel]: settings }));
  }, [selectedChannel, settings]);

  const overviewGmailAddress = isGmail ? oauthEmailStatus?.emailAddress : undefined;
  const isChannelConnected = (channel: ChannelId) => {
    if (channel === "gmail") {
      return channel === selectedChannel ? isConnected : overviewStatuses.gmail?.status === "connected";
    }
    return overviewStatuses[channel]?.status === "connected";
  };
  const connectedOverviewChannels = channels.filter((channel) => isChannelConnected(channel.id));
  const comingSoonChannels: Array<{ id: string; title: string }> = [
    { id: "linkedin", title: t("لينكد إن", "LinkedIn") },
    { id: "youtube", title: t("يوتيوب", "YouTube") }
  ];

  function goToChannelSetup(channelId: SelectableChannelId) {
    setSelectedChannel(channelId);
    setWizardStep(
      channelId === "instagram" || channelId === "facebook" || channelId === "telegram" || channelId === "x" || channelId === "tiktok" || channelId === "sms" || channelId === "whatsapp" || channelId === "google_maps"
        ? 3
        : 4
    );
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("channel-wizard-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

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
    const channelName = isWebsite ? t("الموقع الإلكتروني", "Website") : isTikTok ? "TikTok" : isSms ? "SMS" : isGmail ? "Gmail" : isGoogleMaps ? t("خرائط Google", "Google Maps") : isX ? "X" : isTelegram ? t("تيليجرام", "Telegram") : isFacebook ? t("فيسبوك", "Facebook") : isInstagram ? "Instagram" : t("واتساب", "WhatsApp");

    return wizardSteps.map((step, index) => {
      if (index === 0) {
        return {
          ...step,
          description: t(`اختر قناة ${channelName} أو أي قناة تريد ربطها مع حسابك.`, `Choose ${channelName} or any other channel you want to connect to your account.`)
        };
      }

      if (index === 1) {
        return isEmail
          ? {
              title: t("تجهيز البريد", "Set up email"),
              description: t("احفظ بريد الإرسال ورابط استقبال الرسائل.", "Save the sender email and the inbound message link.")
            }
          : isGoogleMaps
          ? {
              title: t("تجهيز Google", "Set up Google"),
              description: t("الربط يتم مباشرة من حساب Google الخاص بالنشاط.", "The connection is made directly from the business's Google account.")
            }
          : isX
          ? {
              title: t("إنشاء تطبيق X", "Create an X app"),
              description: t("جهز تطبيق X Developer بصلاحيات الرسائل والردود.", "Set up an X Developer app with messaging and reply permissions.")
            }
          : isFacebook
          ? {
              title: t("ربط صفحة فيسبوك", "Connect a Facebook page"),
              description: t("سجل الدخول عبر Meta واختر صفحة Facebook.", "Log in via Meta and choose your Facebook page.")
            }
          : isTelegram
          ? {
              title: t("إنشاء بوت تيليجرام", "Create a Telegram bot"),
              description: t("أنشئ بوت من BotFather ثم انسخ Bot Token.", "Create a bot via BotFather, then copy the Bot Token.")
            }
          : isInstagram
            ? {
                title: t("إنشاء قناة Instagram", "Create an Instagram channel"),
                description: t("قم بالمصادقة على حساب Instagram المرتبط بصفحة Facebook.", "Authenticate the Instagram account linked to your Facebook page.")
              }
            : isTikTok
              ? {
                  title: t("تقديم على TikTok API", "Apply to the TikTok API"),
                  description: t("أنشئ حساب TikTok Business واطلب صلاحية Business Messaging.", "Create a TikTok Business account and request Business Messaging access.")
                }
            : isSms
              ? {
                  title: t("إنشاء حساب Unifonic", "Create a Unifonic account"),
                  description: t("سجّل حساب Unifonic وسجّل نشاطك التجاري.", "Sign up for Unifonic and register your business.")
                }
            : step;
      }

      if (index === 2) {
        return isEmail
          ? {
              title: t("ربط Webhook", "Connect a webhook"),
              description: t("اربط مزود البريد أو Zapier برابط الاستقبال.", "Connect your email provider or Zapier to the inbound link.")
            }
          : isGoogleMaps
          ? {
              title: t("ربط Google", "Connect Google"),
              description: t("اضغط ربط Google واختر النشاط التجاري.", "Click Connect Google and choose the business.")
            }
          : isX
          ? {
              title: t("ربط X", "Connect X"),
              description: t("أدخل مفاتيح X وسيتم تجهيز روابط Callback و Webhook.", "Enter your X keys and the Callback and Webhook URLs will be prepared.")
            }
          : isFacebook
          ? {
              title: t("فتح نافذة Meta", "Open the Meta window"),
              description: t("اختر صفحة Facebook ووافق على صلاحيات Messenger.", "Choose your Facebook page and approve Messenger permissions.")
            }
          : isTelegram
          ? {
              title: t("ربط Telegram", "Connect Telegram"),
              description: t("أدخل Bot Token وسيتم تفعيل Webhook تلقائياً.", "Enter the Bot Token and the webhook will be activated automatically.")
            }
          : isInstagram
            ? {
                title: t("ربط Instagram", "Connect Instagram"),
                description: t("افتح نافذة Meta واختر حساب Instagram والصلاحيات.", "Open the Meta window and choose the Instagram account and permissions.")
              }
            : isTikTok
              ? {
                  title: t("بيانات TikTok", "TikTok credentials"),
                  description: t("احفظ App Key وApp Secret وAccess Token بعد الموافقة.", "Save the App Key, App Secret, and Access Token after approval.")
                }
            : isSms
              ? {
                  title: t("بيانات Unifonic", "Unifonic credentials"),
                  description: t("أدخل AppSid واسم المرسل (Sender ID).", "Enter the AppSid and the Sender ID.")
                }
            : step;
      }

      return {
        title: isConnected ? step.title : t("بانتظار اكتمال الربط", "Waiting for the connection to complete"),
        description: isConnected ? t(`أصبحت قناة ${channelName} جاهزة الآن.`, `The ${channelName} channel is now ready.`) : t(`لم تكتمل قناة ${channelName} بعد.`, `The ${channelName} channel isn't set up yet.`)
      };
    });
  }, [isConnected, isEmail, isFacebook, isGmail, isGoogleMaps, isInstagram, isTelegram, isX, isTikTok, isSms, isWebsite, wizardSteps, t]);

  useEffect(() => {
    const isFirstLoad = !hasSelectedChannelRef.current;
    hasSelectedChannelRef.current = true;
    setLoading(true);
    fetch(`/api/settings/integration?channel=${apiChannel(selectedChannel)}`)
      .then((response) => response.json())
      .then((data: IntegrationSettings) => {
        setSettings(data);
        if (data.status === "connected") {
          setWizardStep(4);
        } else if (!isFirstLoad) {
          setWizardStep(selectedChannel === "instagram" || selectedChannel === "facebook" || selectedChannel === "telegram" || selectedChannel === "x" || selectedChannel === "tiktok" || selectedChannel === "sms" || selectedChannel === "whatsapp" ? 3 : selectedChannel === "google_maps" || selectedChannel === "gmail" || selectedChannel === "website" ? 4 : 2);
        }
        onIntegrationChange?.(data);
      })
      .finally(() => setLoading(false));
  }, [onIntegrationChange, selectedChannel]);

  useEffect(() => {
    if (!botSupportedChannels.includes(selectedChannel)) {
      setChannelBotEnabled(false);
      return;
    }

    let cancelled = false;
    fetch(`/api/bot/settings?channel=${selectedChannel}`)
      .then((response) => response.json())
      .then((data: { ok: boolean; data?: { enabled: boolean } }) => {
        if (!cancelled && data.ok) setChannelBotEnabled(Boolean(data.data?.enabled));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedChannel]);

  async function toggleChannelBot(target?: boolean) {
    if (!botSupportedChannels.includes(selectedChannel)) return;
    const next = target ?? !channelBotEnabled;
    if (next === channelBotEnabled) return;
    setChannelBotEnabled(next);
    setChannelBotLoading(true);
    await fetch(`/api/bot/settings?channel=${selectedChannel}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next })
    }).catch(() => {});
    setChannelBotLoading(false);
  }

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
      console.log("[Linkly debug] window message event", { origin: event.origin, data: event.data });

      if (event.origin === window.location.origin && (event.data as { type?: string } | null)?.type === "audiencew:meta-connected") {
        setLoading(true);
        const response = await fetch(`/api/settings/integration?channel=${apiChannel(selectedChannel)}`);
        const data = await response.json() as IntegrationResponse;
        setSettings(data);
        onIntegrationChange?.(data);
        setSaveFeedback({
          type: data.status === "connected" ? "success" : "error",
          text: data.connectionMessage || (data.status === "connected" ? t("تم الاتصال بنجاح", "Connected successfully") : t("الربط غير مكتمل", "The connection isn't complete"))
        });
        setWizardStep(4);
        setLoading(false);
        return;
      }

      if (!["https://www.facebook.com", "https://web.facebook.com", "https://business.facebook.com"].includes(event.origin)) {
        console.log("[Linkly debug] ignored postMessage from unexpected origin", event.origin, event.data);
        return;
      }

      const payload = readMetaMessage(event.data) as {
        type?: string;
        event?: string;
        data?: MetaSignupData;
      } | null;

      console.log("[Linkly debug] meta postMessage received", { origin: event.origin, raw: event.data, parsed: payload, selectedChannel });

      if (selectedChannel !== "whatsapp" || payload?.type !== "WA_EMBEDDED_SIGNUP" || payload.event !== "FINISH") return;

      const metaData = payload.data ?? {};
      metaSignupDataRef.current = metaData;
      const patch: Partial<IntegrationSettings> = {
        status: "pending",
        wabaId: metaData.waba_id || metaData.whatsapp_business_account_id || settings.wabaId,
        phoneNumberId: metaData.phone_number_id || settings.phoneNumberId,
        phoneNumber: metaData.phone_number || settings.phoneNumber
      };

      const response = await fetch(`/api/settings/integration?channel=${apiChannel(selectedChannel)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const updatedSettings = await response.json() as IntegrationResponse;
      setSettings(updatedSettings);
      onIntegrationChange?.(updatedSettings);
      setSaveFeedback({ type: "success", text: t("تم استلام بيانات الرقم من Meta، جاري إكمال الربط.", "Received the number data from Meta — finishing the connection.") });
      setWizardStep(4);
    }

    window.addEventListener("message", handleMetaMessage);
    return () => window.removeEventListener("message", handleMetaMessage);
  }, [onIntegrationChange, selectedChannel, settings.phoneNumber, settings.phoneNumberId, settings.wabaId]);

  function updateField(field: keyof IntegrationSettings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function persistSettings() {
    const response = await fetch(`/api/settings/integration?channel=${apiChannel(selectedChannel)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    const data = await response.json() as IntegrationResponse;
    setSettings(data);
    onIntegrationChange?.(data);
    setSaveFeedback({
      type: data.status === "connected" ? "success" : "error",
      text: data.connectionMessage || (data.status === "connected" ? t("تم الاتصال بنجاح", "Connected successfully") : t("الربط غير مكتمل", "The connection isn't complete"))
    });
    return data;
  }

  async function regenerateWebhookToken() {
    const nextToken = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `audiencew_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setSaving(true);
    const response = await fetch(`/api/settings/integration?channel=${apiChannel(selectedChannel)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, verifyToken: nextToken })
    });
    const data = await response.json() as IntegrationResponse;
    setSettings(data);
    onIntegrationChange?.(data);
    setShowWebhookToken(true);
    setSaveFeedback({ type: "success", text: t("تم إنشاء توكن جديد والتوكن القديم لم يعد يعمل — حدّثه في إعدادات الويبهوك الخارجية قبل ما ينقطع الاستقبال.", "A new token was generated and the old one no longer works — update it in your external webhook settings before receiving stops.") });
    setSaving(false);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await persistSettings();
    setSaving(false);
  }

  async function resetIntegrationData() {
    setSaving(true);
    // Meta channels (whatsapp/instagram/facebook) derive appId/configId from a
    // shared fallback chain (per-tenant value -> env var), and a stale saved
    // value here has repeatedly caused connect attempts to silently use the
    // wrong Meta app. Clear it on reset so the correct fallback takes over.
    // Other channels (X, Google Maps, TikTok's stored env, SMS) store real
    // per-tenant app credentials the user typed in themselves, so those must
    // survive a reset.
    const isMetaChannel = selectedChannel === "whatsapp" || selectedChannel === "instagram" || selectedChannel === "facebook";
    const response = await fetch(`/api/settings/integration?channel=${apiChannel(selectedChannel)}`, {
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
        googleRefreshToken: "",
        ...(isMetaChannel ? { appId: "", configId: "" } : {})
      })
    });
    const data = await response.json() as IntegrationResponse;
    setSettings(data);
    onIntegrationChange?.(data);
    setWizardStep(selectedChannel === "instagram" || selectedChannel === "facebook" || selectedChannel === "telegram" || selectedChannel === "x" || selectedChannel === "tiktok" || selectedChannel === "sms" || selectedChannel === "whatsapp" ? 3 : selectedChannel === "google_maps" || selectedChannel === "gmail" || selectedChannel === "website" ? 4 : 2);
    setSaveFeedback({ type: "error", text: data.connectionMessage || t("تم مسح بيانات الربط", "The connection data was cleared") });
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
            ? t("رقم المستلم", "Recipient number")
            : !testMessage.trim()
              ? t("نص الرسالة", "Message text")
              : "";

    if (missingField) {
      setTestFeedback({ type: "error", text: t(`${missingField} مطلوب قبل إرسال رسالة اختبار`, `${missingField} is required before sending a test message`) });
      setTestSending(false);
      return;
    }

    try {
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
      const result = await response.json().catch(() => null);

      if (response.ok && result?.ok) {
        setTestFeedback({ type: "success", text: t("تم إرسال رسالة الاختبار. إذا رد العميل ستظهر محادثته داخل صندوق الوارد.", "The test message was sent. If the customer replies, their conversation will appear in the inbox.") });
      } else {
        setTestFeedback({ type: "error", text: result?.error || t("تعذر إرسال رسالة الاختبار", "Couldn't send the test message") });
      }
    } catch {
      setTestFeedback({ type: "error", text: t("تعذر الاتصال بالسيرفر، تأكد من اتصالك بالإنترنت وحاول من جديد", "Couldn't reach the server, check your internet connection and try again") });
    } finally {
      setTestSending(false);
    }
  }

  async function loadBusinessProfile() {
    setBusinessProfileLoading(true);
    setBusinessProfileFeedback(null);
    try {
      const response = await fetch("/api/meta/business-profile");
      const result = await response.json().catch(() => null);
      if (response.ok && result?.ok) {
        const profile = result.data || {};
        const websites: string[] = Array.isArray(profile.websites) ? profile.websites : [];
        setBusinessProfile({
          about: profile.about || "",
          address: profile.address || "",
          description: profile.description || "",
          email: profile.email || "",
          vertical: profile.vertical || "",
          website1: websites[0] || "",
          website2: websites[1] || ""
        });
        setBusinessProfilePictureUrl(profile.profile_picture_url || "");
      } else {
        setBusinessProfileFeedback({ type: "error", text: result?.error || t("تعذر جلب الملف التجاري من Meta", "Couldn't load the business profile from Meta") });
      }
    } catch {
      setBusinessProfileFeedback({ type: "error", text: t("تعذر الاتصال بالسيرفر، تأكد من اتصالك بالإنترنت وحاول من جديد", "Couldn't reach the server, check your internet connection and try again") });
    } finally {
      setBusinessProfileLoading(false);
    }
  }

  async function handleBusinessProfilePictureChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setBusinessProfilePictureDataUrl(dataUrl);
      setBusinessProfilePictureUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function saveBusinessProfile() {
    setBusinessProfileSaving(true);
    setBusinessProfileFeedback(null);

    try {
      const response = await fetch("/api/meta/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          about: businessProfile.about,
          address: businessProfile.address,
          description: businessProfile.description,
          email: businessProfile.email,
          vertical: businessProfile.vertical,
          websites: [businessProfile.website1, businessProfile.website2],
          profilePictureDataUrl: businessProfilePictureDataUrl || undefined
        })
      });
      const result = await response.json().catch(() => null);

      if (response.ok && result?.ok) {
        setBusinessProfileFeedback({ type: "success", text: t("تم حفظ الملف التجاري بنجاح.", "The business profile was saved successfully.") });
        setBusinessProfilePictureDataUrl("");
        void loadBusinessProfile();
      } else {
        setBusinessProfileFeedback({ type: "error", text: result?.error || t("تعذر حفظ الملف التجاري", "Couldn't save the business profile") });
      }
    } catch {
      setBusinessProfileFeedback({ type: "error", text: t("تعذر الاتصال بالسيرفر، تأكد من اتصالك بالإنترنت وحاول من جديد", "Couldn't reach the server, check your internet connection and try again") });
    } finally {
      setBusinessProfileSaving(false);
    }
  }

  async function openMetaWindow() {
    if (typeof window === "undefined") return false;

    if (selectedChannel === "whatsapp") {
      const appId = techProviderMetaAppId;
      const configId = techProviderMetaConfigId;

      if (!appId) {
        window.alert(t("تحتاج App ID من تطبيق Meta لتشغيل الربط المباشر. احفظه في إعدادات Vercel ثم حاول من جديد.", "You need an App ID from your Meta app to run the direct connection. Save it in Vercel's settings, then try again."));
        return false;
      }

      if (!configId) {
        window.alert(t("تحتاج Configuration ID من Meta لتشغيل Embedded Signup وإنشاء/ربط حافظة الأعمال والرقم تلقائياً.", "You need a Configuration ID from Meta to run Embedded Signup and automatically create/link the business portfolio and number."));
        return false;
      }

      await loadFacebookSdk(appId);
      const w = window as FacebookWindow;
      if (!w.FB) {
        window.alert(t("تعذر تحميل نافذة Meta. تأكد من اتصالك بالإنترنت وحاول من جديد.", "Couldn't load the Meta window. Check your internet connection and try again."));
        return false;
      }

      w.FB.login(
        (response: { authResponse?: { code?: string } }) => {
          const code = response?.authResponse?.code;
          if (!code) return;

          fetch(`/api/meta/callback?channel=whatsapp&code=${encodeURIComponent(code)}`, {
            headers: { Accept: "application/json" }
          })
            .then((res) => res.json())
            .then(() => undefined)
            .finally(() => {
              window.postMessage({ type: "audiencew:meta-connected" }, window.location.origin);
            });
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            sessionInfoVersion: "3",
            version: "v3",
            featureType: "whatsapp_business_app_onboarding",
            is_hosted_es: true
          }
        }
      );

      return true;
    }

    const metaUrl = `/api/meta/connect?channel=${selectedChannel}`;
    const metaWindow = window.open(metaUrl, "audiencew-meta-connect", "width=960,height=780");
    if (!metaWindow) {
      window.location.assign(new URL(metaUrl, window.location.origin).toString());
    }
    return true;
  }

  async function connectXAccount() {
    if (!settings.appId.trim() || !settings.configId.trim()) {
      window.alert(t("احفظ OAuth 2.0 Client ID و Client Secret لتطبيق Linkly أولًا، وبعدها اضغط ربط X.", "Save the OAuth 2.0 Client ID and Client Secret for the Linkly app first, then click Connect X."));
      setWizardStep(4);
      return;
    }

    await persistSettings();
    window.location.assign(new URL("/api/x/connect", window.location.origin).toString());
  }

  function connectTikTokAccount() {
    if (typeof window === "undefined") return;
    const tiktokWindow = window.open("/api/tiktok/connect", "audiencew-tiktok-connect", "width=520,height=760");
    if (!tiktokWindow) {
      window.location.assign(new URL("/api/tiktok/connect", window.location.origin).toString());
    }
  }

  async function connectGoogleMaps() {
    window.location.assign(new URL("/api/google/connect", window.location.origin).toString());
  }

  async function syncGoogleReviews() {
    const response = await fetch("/api/google/reviews/sync", { method: "POST" });
    const result = await response.json().catch(() => null) as { ok?: boolean; synced?: number; error?: string } | null;
    if (response.ok && result?.ok) {
      setSaveFeedback({ type: "success", text: t(`تمت مزامنة ${result.synced ?? 0} تقييم من Google`, `Synced ${result.synced ?? 0} reviews from Google`) });
    } else {
      setSaveFeedback({ type: "error", text: result?.error || t("تعذر مزامنة تقييمات Google", "Couldn't sync Google reviews") });
    }
  }

  function renderWizardContent() {
    if (isConnected) {
      return (
        <div className="meta-wizard-panel">
          <div className="meta-wizard-title">
            <h3>{t("اختر قناة", "Choose a channel")}</h3>
            <p>{t("القنوات المتصلة تعرض بيانات الربط مباشرة بدون خطوات ربط جديدة.", "Connected channels show their connection data directly, without new setup steps.")}</p>
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
                    if (channel.id === "whatsapp" || channel.id === "instagram" || channel.id === "facebook" || channel.id === "telegram" || channel.id === "x" || channel.id === "google_maps" || channel.id === "gmail" || channel.id === "website" || channel.id === "tiktok" || channel.id === "sms") {
                      setSelectedChannel(channel.id);
                      setWizardStep(4);
                    }
                  }}
                >
                  <span className={`channel-icon channel-icon-${channel.id}`}>
                    <ChannelIcon id={channel.id} />
                  </span>
                  <b>{channel.title}</b>
                  <small>{selected ? t("القناة متصلة، بياناتها ظاهرة بالأسفل", "This channel is connected — its data is shown below") : channel.description}</small>
                </button>
              );
            })}
          </div>
          <div className="connected-channel-note">
            <b>{isWebsite ? t("ودجت الموقع جاهز", "Website widget ready") : isSms ? t("SMS متصل", "SMS connected") : isTikTok ? t("TikTok متصل", "TikTok connected") : isGmail ? t("Gmail متصل", "Gmail connected") : isGoogleMaps ? t("خرائط Google متصلة", "Google Maps connected") : isX ? t("X جاهز للربط", "X ready to connect") : isTelegram ? t("تيليجرام متصل", "Telegram connected") : isFacebook ? t("فيسبوك متصل", "Facebook connected") : isInstagram ? t("Instagram متصل", "Instagram connected") : t("واتساب متصل", "WhatsApp connected")}</b>
            <span>
              {isGmail && oauthEmailStatus?.emailAddress
                ? t(`الحساب المتصل: ${oauthEmailStatus.emailAddress}`, `Connected account: ${oauthEmailStatus.emailAddress}`)
                : t("يمكنك تعديل البيانات أو مسح الربط من قسم بيانات الربط والويبهوك بالأسفل.", "You can edit the data or clear the connection from the connection and webhook section below.")}
            </span>
            {!isEmail && !isGoogleMaps && !isX && !isTelegram && !isWebsite && !isSms ? (
              <button type="button" onClick={isTikTok ? connectTikTokAccount : openMetaWindow}>
                {isTikTok ? t("ربط حساب TikTok آخر", "Connect another TikTok account") : isFacebook ? t("ربط صفحة Facebook", "Connect a Facebook page") : isInstagram ? t("ربط Instagram", "Connect Instagram") : t("ربط واتساب جديد", "Connect a new WhatsApp number")}
              </button>
            ) : null}
          </div>
          {botSupportedChannels.includes(selectedChannel) ? (
            <div className="channel-bot-picker">
              <span>{t("وكيل الرد التلقائي لهذه القناة", "Auto-reply agent for this channel")}</span>
              <div className="channel-bot-toggle" role="group" aria-label={t("وكيل الرد التلقائي لهذه القناة", "Auto-reply agent for this channel")}>
                <button
                  type="button"
                  className={!channelBotEnabled ? "active" : ""}
                  disabled={channelBotLoading}
                  onClick={() => toggleChannelBot(false)}
                >
                  {t("بدون (رد يدوي فقط)", "Off (manual replies only)")}
                </button>
                <button
                  type="button"
                  className={channelBotEnabled ? "active" : ""}
                  disabled={channelBotLoading}
                  onClick={() => toggleChannelBot(true)}
                >
                  {t("الرد الآلي مفعّل", "Auto-reply enabled")}
                </button>
              </div>
              <small>{t('عدّل خطوات الرد من صفحة "الرد الآلي" في القائمة الجانبية.', 'Edit the reply flow from the "Auto-Reply" page in the sidebar.')}</small>
            </div>
          ) : null}
        </div>
      );
    }

    if (wizardStep === 1) {
      return (
        <div className="meta-wizard-panel">
          <div className="meta-wizard-title">
            <h3>{t("اختر قناة", "Choose a channel")}</h3>
            <p>{t("اختر الخدمة التي تريد ربطها مع المنصة.", "Choose the service you want to connect to the platform.")}</p>
          </div>
          <div className="channel-grid">
            {channels.map((channel) => (
              <button
                className={`channel-card ${channel.id === selectedChannel ? "selected" : ""} ${channel.active ? "" : "disabled"}`}
                key={channel.id}
                type="button"
                disabled={!channel.active}
                onClick={() => {
                  if (channel.id === "whatsapp" || channel.id === "instagram" || channel.id === "facebook" || channel.id === "telegram" || channel.id === "x" || channel.id === "google_maps" || channel.id === "gmail" || channel.id === "website" || channel.id === "tiktok" || channel.id === "sms") {
                    setSelectedChannel(channel.id);
                    // Step 2 doesn't exist for any channel - go straight to
                    // the real connect step (3), or step 4 for channels
                    // whose only "setup" is entering data directly.
                    setWizardStep(channel.id === "instagram" || channel.id === "facebook" || channel.id === "telegram" || channel.id === "x" || channel.id === "tiktok" || channel.id === "sms" || channel.id === "whatsapp" || channel.id === "google_maps" ? 3 : 4);
                  }
                }}
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

    if (wizardStep === 3) {
      if (isEmail) {
        return (
          <div className="meta-wizard-panel">
            <div className="meta-signup-card">
              <span className="provider-round-icon">@</span>
              <h3>{t("ربط البريد الإلكتروني", "Connect email")}</h3>
              <p>{t("اربط أي مزود بريد عبر Webhook. أي رسالة تصل للرابط ستظهر كمحادثة بريد داخل المنصة.", "Connect any email provider via webhook. Any message that reaches the link will appear as an email conversation in the platform.")}</p>
              <div className="telegram-steps">
                <div><span>1</span><b>{t("احفظ بريد الإرسال", "Save the sending address")}</b><small>{t("اكتب اسم المرسل والبريد الذي سيظهر للعميل.", "Enter the sender name and the email address customers will see.")}</small></div>
                <div><span>2</span><b>{t("انسخ Webhook", "Copy the webhook")}</b><small>{t(`استخدم ${publicAppUrl}/api/email/inbound في Zapier أو Make.`, `Use ${publicAppUrl}/api/email/inbound in Zapier or Make.`)}</small></div>
                <div><span>3</span><b>{t("أضف Secret Token", "Add a Secret Token")}</b><small>{t("أرسله في Header باسم x-audiencew-email-secret.", "Send it in a header named x-audiencew-email-secret.")}</small></div>
                <div><span>4</span><b>{t("جرّب رسالة", "Try a message")}</b><small>{t("أرسل بيانات from و subject و text وستظهر في المحادثات.", "Send the from, subject, and text fields, and it will appear in the conversations.")}</small></div>
              </div>
              <button type="button" onClick={() => setWizardStep(4)}>
                {t("إدخال بيانات البريد", "Enter email details")}
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
              <h3>{t("ربط خرائط Google", "Connect Google Maps")}</h3>
              <p>{t("اربط Google Business Profile حتى تظهر تقييمات الموقع داخل صندوق المحادثات وتقدر ترد عليها من المنصة.", "Connect your Google Business Profile so location reviews appear in the inbox and you can reply to them from the platform.")}</p>
              <div className="google-business-summary">
                <div>
                  <span>{t("حالة الربط", "Connection status")}</span>
                  <b>{statusLabel(settings.status, t)}</b>
                </div>
                <div>
                  <span>{t("النشاط التجاري", "Business")}</span>
                  <b>{settings.wabaName || settings.businessName || t("لم يتم تحديد النشاط بعد", "No business selected yet")}</b>
                </div>
                <p>{settings.phoneNumber || t("اضغط ربط Google واختر الحساب الذي يدير النشاط التجاري.", "Click Connect Google and choose the account that manages the business.")}</p>
              </div>
              <button type="button" onClick={connectGoogleMaps}>
                {t("ربط Google", "Connect Google")}
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
              <h3>{t("ربط تيليجرام عبر Bot Token", "Connect Telegram via Bot Token")}</h3>
              <p>{t("تيليجرام يربط عبر بوت رسمي. خذ Bot Token من BotFather مرة واحدة، والمنصة تتولى تفعيل الاستقبال تلقائياً.", "Telegram connects through an official bot. Get the Bot Token from BotFather once, and the platform handles activating receiving automatically.")}</p>
              <div className="telegram-steps">
                <div><span>1</span><b>{t("افتح BotFather", "Open BotFather")}</b><small>{t("من تطبيق تيليجرام ابحث عن BotFather الرسمي.", "From the Telegram app, search for the official BotFather.")}</small></div>
                <div><span>2</span><b>{t("أنشئ بوت جديد", "Create a new bot")}</b><small>{t("ارسل /newbot، ثم اختر اسم و username ينتهي بـ bot.", "Send /newbot, then choose a name and a username ending in bot.")}</small></div>
                <div><span>3</span><b>{t("انسخ Bot Token", "Copy the Bot Token")}</b><small>{t("الصق التوكن هنا واضغط حفظ الإعدادات.", "Paste the token here and click Save Settings.")}</small></div>
                <div><span>4</span><b>{t("جرّب الرسائل", "Try messaging")}</b><small>{t("أرسل /start للبوت وستظهر المحادثة داخل المنصة.", "Send /start to the bot and the conversation will appear in the platform.")}</small></div>
              </div>
              <button type="button" onClick={() => setWizardStep(4)}>
                {t("إدخال بيانات تيليجرام", "Enter Telegram details")}
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
              <h3>{t("ربط X مباشرة", "Connect X directly")}</h3>
              <p>{t("تطبيق Linkly يستخدم OAuth. العميل يضغط ربط X، يسجل الدخول، يوافق على الصلاحيات، ثم يرجع للمنصة بدون إدخال مفاتيح.", "The Linkly app uses OAuth. The customer clicks Connect X, logs in, approves the permissions, then returns to the platform without entering any keys.")}</p>
              <div className="telegram-steps">
                <div><span>1</span><b>{t("تطبيق Linkly", "Linkly app")}</b><small>{t("يتم ضبط مفاتيح التطبيق مرة واحدة من طرف المنصة.", "The app keys are configured once by the platform.")}</small></div>
                <div><span>2</span><b>{t("ربط العميل", "Customer connects")}</b><small>{t("العميل يضغط زر الربط ويسجل دخوله في X.", "The customer clicks the connect button and logs into X.")}</small></div>
                <div><span>3</span><b>{t("حفظ تلقائي", "Automatic save")}</b><small>{t("نحفظ التوكن واسم الحساب بعد الرجوع من X.", "We save the token and account name after returning from X.")}</small></div>
                <div><span>4</span><b>{t("المحادثات", "Conversations")}</b><small>{t("بعد تفعيل Webhook تظهر رسائل X داخل صندوق المحادثات.", "Once the webhook is activated, X messages appear in the inbox.")}</small></div>
              </div>
              <button type="button" onClick={connectXAccount}>
                {t("ربط X", "Connect X")}
              </button>
              <button className="secondary-action" type="button" onClick={() => setWizardStep(4)}>
                {t("إعداد تطبيق Linkly", "Configure the Linkly app")}
              </button>
            </div>
          </div>
        );
      }

      if (isTikTok) {
        return (
          <div className="meta-wizard-panel">
            <div className="meta-signup-card">
              <span className="provider-round-icon">T</span>
              <h3>{t("ربط حساب TikTok", "Connect a TikTok account")}</h3>
              <p>{t("سجّل الدخول بحساب TikTok الخاص بنشاطك التجاري وسيتم حفظ بيانات الحساب تلقائياً. إرسال واستقبال الرسائل والتعليقات الفعلي يبدأ بعد موافقة TikTok على صلاحية Business Messaging لحسابنا.", "Log in with your business's TikTok account and the account details will be saved automatically. Actual message and comment sending/receiving starts once TikTok approves Business Messaging access for our account.")}</p>
              <button type="button" onClick={connectTikTokAccount}>
                {t("تسجيل الدخول عبر TikTok", "Log in with TikTok")}
              </button>
            </div>
          </div>
        );
      }

      if (isSms) {
        return (
          <div className="meta-wizard-panel">
            <div className="meta-signup-card">
              <span className="provider-round-icon">#</span>
              <h3>{t("ربط SMS عبر Unifonic", "Connect SMS via Unifonic")}</h3>
              <p>{t("اربط حساب Unifonic لإرسال رسائل SMS لعملائك. استقبال الردود قيد التجهيز، لكن الإرسال يشتغل مباشرة بعد حفظ AppSid واسم المرسل.", "Connect a Unifonic account to send SMS messages to your customers. Receiving replies is still in development, but sending works right away once you save the AppSid and Sender ID.")}</p>
              <button type="button" onClick={() => setWizardStep(4)}>
                {t("إدخال بيانات Unifonic", "Enter Unifonic details")}
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="meta-wizard-panel">
          <div className="meta-signup-card">
            <span className={`provider-round-icon${!isInstagram && !isFacebook ? " channel-icon-whatsapp" : ""}`}>
              {isInstagram ? "◎" : isFacebook ? "f" : <ChannelIcon id="whatsapp" />}
            </span>
            <h3>{isInstagram ? t("ربط Instagram عبر Meta", "Connect Instagram with Meta") : isFacebook ? t("ربط صفحة Facebook", "Connect Facebook Page") : t("إعداد سريع عبر Meta", "Quick setup with Meta")}</h3>
            <p>
              {isInstagram
                ? t("اربط حساب Instagram Business أو Creator المرتبط بصفحة Facebook حتى تظهر الرسائل والتعليقات داخل صندوق المحادثات.", "Connect the Instagram Business or Creator account linked to your Facebook page so messages and comments appear in the inbox.")
                : isFacebook
                  ? t("اربط صفحة Facebook حتى تظهر رسائل Messenger داخل صندوق المحادثات وتقدر ترد عليها من المنصة.", "Connect your Facebook page so Messenger messages appear in the inbox and you can reply to them from the platform.")
                : t("استخدم رحلة WhatsApp Embedded Signup لربط أرقام جديدة بسرعة. سيتم تحويلك إلى Meta لتسجيل الدخول إلى حساب WhatsApp Business الخاص بك. توفر صلاحية المسؤول (Admin) يجعل الإعداد أسهل وأسرع.", "Use the WhatsApp Embedded Signup flow to quickly connect new numbers. You will be redirected to Meta to log into your WhatsApp Business account. Having admin access will help make the setup smooth and easy.")}
            </p>
            <ul>
              <li>{isInstagram ? t("يتطلب حساب Instagram احترافي (Professional)", "Instagram professional account required") : isFacebook ? t("يتطلب صلاحية مسؤول على صفحة Facebook", "Facebook Page admin access required") : t("لا حاجة لأي إعداد يدوي", "No manual configuration required")}</li>
              <li>{t("مصادقة آمنة عبر OAuth", "Secure OAuth based authentication")}</li>
              <li>{isInstagram ? t("الرسائل والتعليقات ستستخدم ويبهوك Meta", "Messages and comments will use the Meta webhook") : isFacebook ? t("رسائل Messenger ستستخدم ويبهوك Meta", "Messenger messages will use the Meta webhook") : t("إعداد تلقائي للويبهوك ورقم الهاتف", "Automatic webhook and phone number configuration")}</li>
            </ul>
            <button className={!isInstagram && !isFacebook ? "facebook-login-button" : undefined} type="button" onClick={openMetaWindow}>
              {isInstagram ? t("ربط Instagram", "Connect Instagram") : isFacebook ? t("ربط Facebook", "Connect Facebook") : t("تسجيل الدخول عبر Facebook", "Login with Facebook")}
            </button>
          </div>
        </div>
      );
    }

    const summaryTitle = isConnected ? t("أصبح كل شيء جاهزًا", "Everything is ready") : isGoogleMaps ? t("بانتظار تفعيل الوصول", "Waiting for access to be activated") : t("لم يكتمل الربط بعد", "The connection isn't complete yet");
    const summaryText = isConnected
      ? isEmail
        ? t("بعد حفظ بيانات البريد، استخدم رابط الويبهوك لاستقبال الرسائل داخل صندوق المحادثات والرد عليها من المنصة.", "After saving your email details, use the webhook link to receive messages in the inbox and reply to them from the platform.")
        : isGoogleMaps
          ? t("تم حفظ حساب النشاط التجاري والموقع، وستظهر تقييمات خرائط Google داخل صندوق المحادثات.", "The business account and location have been saved, and Google Maps reviews will appear in the inbox.")
        : isX
          ? t("بعد حفظ مفاتيح X ستكون القناة جاهزة للمرحلة التالية: تفعيل استقبال الرسائل الخاصة والردود على التغريدات.", "After saving your X keys, the channel will be ready for the next stage: enabling DM receiving and replies to tweets.")
        : isTelegram
          ? t("بعد حفظ Bot Token سيتم التحقق من البوت وتفعيل Webhook تلقائياً، وستظهر المحادثة عند وصول أول رسالة من تيليجرام.", "After saving the Bot Token, the bot will be verified and the webhook activated automatically, and the conversation will appear once the first Telegram message arrives.")
        : isFacebook
          ? t("بعد إكمال ربط Facebook سيتم حفظ الصفحة والصلاحيات، وستظهر القناة في صندوق المحادثات عند استقبال أول رسالة.", "After completing the Facebook connection, the page and permissions will be saved, and the channel will appear in the inbox once the first message arrives.")
        : isInstagram
          ? t("بعد إكمال ربط Instagram سيتم حفظ الحساب والصلاحيات، وستظهر القناة في صندوق المحادثات عند استقبال أول حدث.", "After completing the Instagram connection, the account and permissions will be saved, and the channel will appear in the inbox once the first event arrives.")
        : isTikTok
          ? t("تم حفظ بيانات TikTok. الإرسال والاستقبال الفعلي يبدأ بعد موافقة TikTok على صلاحية Business Messaging.", "The TikTok details have been saved. Actual sending and receiving starts once TikTok approves Business Messaging access.")
        : isSms
          ? t("تم حفظ بيانات Unifonic. الرد على أي محادثة SMS من المنصة يرسل رسالة فعلية الآن.", "The Unifonic details have been saved. Replying to any SMS conversation from the platform now sends an actual message.")
        : t("بعد إكمال نافذة Meta سيتم حفظ حافظة الأعمال، حساب واتساب، رقم الهاتف، والصلاحيات في بيانات الربط.", "After completing the Meta window, the business portfolio, WhatsApp account, phone number, and permissions will be saved to the connection data.")
      : isGoogleMaps
        ? settings.phoneNumber || t("تمت مصادقة Google، لكن لم يكتمل تفعيل قراءة بيانات النشاط التجاري بعد. بعد موافقة Google Business Profile API اضغط ربط Google مرة أخرى لاختيار الحساب والموقع.", "Google authentication succeeded, but reading the business data hasn't been activated yet. Once Google Business Profile API access is approved, click Connect Google again to choose the account and location.")
      : isTikTok
        ? t("احفظ App Key وApp Secret وAccess Token بعد ما توافق عليك TikTok.", "Save the App Key, App Secret, and Access Token once TikTok approves you.")
      : isSms
        ? t("أدخل AppSid واسم المرسل (Sender ID) من حساب Unifonic.", "Enter the AppSid and Sender ID from your Unifonic account.")
      : t("أكمل الربط أولاً حتى تصبح القناة جاهزة داخل المنصة.", "Finish the connection first to make the channel ready in the platform.");

    return (
      <div className="meta-wizard-panel">
        <div className={`meta-summary-card ${isConnected ? "ready" : "pending"}`}>
          <span>{isConnected ? "✓" : "!"}</span>
          <h3>{summaryTitle}</h3>
              <p>{summaryText}</p>
              {isEmail ? (
                isConnected ? (
                  <div className="summary-list">
                    <b>{oauthEmailStatus?.emailAddress || t("قناة البريد", "Email channel")}</b>
                  </div>
                ) : null
              ) : (
                <div className="summary-list">
                  <b>{settings.businessName || t("حافظة الأعمال", "Business portfolio")}</b>
                  <b>{settings.wabaName || (isGoogleMaps ? t("موقع Google", "Google location") : isX ? t("حساب X", "X account") : isTikTok ? t("حساب TikTok", "TikTok account") : isSms ? t("قناة SMS", "SMS channel") : isTelegram ? t("بوت Telegram", "Telegram bot") : isFacebook ? t("صفحة Facebook", "Facebook page") : isInstagram ? t("حساب Instagram", "Instagram account") : t("حساب واتساب للأعمال", "WhatsApp Business account"))}</b>
                  <b dir="ltr">{isGoogleMaps ? settings.googleLocationId || "Google Location ID" : isX ? settings.wabaId || "X Account ID" : isTikTok ? settings.appId || "TikTok App Key" : isSms ? settings.phoneNumber || "Sender ID" : isTelegram ? settings.phoneNumber || "Bot ID" : isFacebook ? settings.wabaId || "Facebook Page ID" : isInstagram ? settings.wabaId || "Instagram Account ID" : settings.phoneNumber || t("رقم واتساب", "WhatsApp number")}</b>
                </div>
              )}
        </div>
      </div>
    );
  }

  return (
    <section className="page-stack settings-page">
      <div className="channels-overview">
        <div className="channels-overview-head">
          <div>
            <h2>{t("القنوات", "Channels")}</h2>
            <p>{t("اربط حساباتك على وسائل التواصل لينشر الذكاء الصناعي بدلاً عنك", "Connect your social accounts so the AI agent can respond on your behalf")}</p>
          </div>
          <button type="button" className="btn primary channels-overview-add" onClick={() => goToChannelSetup(selectedChannel)}>
            <span aria-hidden="true">+</span>
            {t("اربط قناة جديدة", "Connect a new channel")}
          </button>
        </div>

        <div className="channels-overview-list">
          <div className="channels-overview-list-title">
            {t("القنوات المربوطة", "Connected channels")}
            <span>{connectedOverviewChannels.length}</span>
          </div>

          {overviewLoading ? (
            <p className="channels-overview-empty">{t("جاري تحميل القنوات...", "Loading channels...")}</p>
          ) : connectedOverviewChannels.length === 0 ? (
            <p className="channels-overview-empty">{t("لا توجد قنوات مربوطة بعد — اختر قناة من الأسفل لربطها.", "No channels connected yet — pick one below to connect it.")}</p>
          ) : (
            connectedOverviewChannels.map((channel) => {
              const data = overviewStatuses[channel.id];
              const handle =
                channel.id === "gmail"
                  ? overviewGmailAddress
                  : data?.phoneNumber || data?.wabaName || data?.businessName;
              const lastSync = data?.updatedAt && data.updatedAt !== "-" ? data.updatedAt : t("—", "—");

              return (
                <div className="channel-row" key={channel.id}>
                  <span className={`channel-icon channel-icon-${channel.id}`}>
                    <ChannelIcon id={channel.id} />
                  </span>
                  <div className="channel-row-info">
                    <b>{channel.title}</b>
                    {handle ? <span dir="ltr">{handle}</span> : null}
                  </div>
                  <span className="channel-row-status connected">{t("متصل", "Connected")}</span>
                  <span className="channel-row-sync">{t("آخر مزامنة", "Last sync")}: {lastSync}</span>
                  <button type="button" className="channel-row-settings" onClick={() => goToChannelSetup(channel.id)}>
                    <span aria-hidden="true">⚙️</span>
                    {t("إعدادات القناة", "Channel settings")}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="channels-overview-grid">
          <div className="channels-overview-list-title">{t("ربط قناة جديدة", "Connect a new channel")}</div>
          <div className="channel-connect-grid">
            {channels.map((channel) => {
              const connected = isChannelConnected(channel.id);
              return (
                <div className="channel-connect-card" key={channel.id}>
                  <span className={`channel-icon channel-icon-${channel.id}`}>
                    <ChannelIcon id={channel.id} />
                  </span>
                  <b>{channel.title}</b>
                  <small>{channel.description}</small>
                  <button type="button" className={connected ? "connected" : ""} onClick={() => goToChannelSetup(channel.id)}>
                    {connected ? t("متصل — إدارة", "Connected — manage") : t("ربط", "Connect")}
                  </button>
                </div>
              );
            })}

            {comingSoonChannels.map((channel) => (
              <div className="channel-connect-card locked" key={channel.id}>
                <span className="channel-icon channel-icon-locked" aria-hidden="true">🔒</span>
                <b>{channel.title}</b>
                <small>{t("قريباً", "Coming soon")}</small>
                <button type="button" disabled>{t("قريباً", "Coming soon")}</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div id="channel-wizard-anchor" className={`settings-onboarding ${isConnected ? "connected" : ""}`}>
        {!isConnected ? (
          <aside className="meta-wizard-rail settings-rail">
            {(isWebsite || isEmail
              ? [
                  { ...currentWizardSteps[0], target: 1 },
                  { ...currentWizardSteps[3], target: 4 }
                ]
              : [
                  { ...currentWizardSteps[0], target: 1 },
                  { ...currentWizardSteps[2], target: 3 },
                  { ...currentWizardSteps[3], target: 4 }
                ]
            ).map((step, index) => {
              const displayNumber = index + 1;
              const done = wizardStep > step.target;
              const active = wizardStep === step.target;
              return (
                <button className={active ? "active" : done ? "done" : ""} key={step.title} type="button" onClick={() => setWizardStep(step.target)}>
                  <span>{done ? "✓" : displayNumber}</span>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </button>
              );
            })}
          </aside>
        ) : null}

        <div className="settings-onboarding-main">
          {renderWizardContent()}
          {!isConnected ? (
            <div className="settings-onboarding-actions">
              {wizardStep !== 4 && !((isGoogleMaps || isWhatsApp || isInstagram || isFacebook) && wizardStep === 3) ? <button className="btn primary" type="button" onClick={() => {
                if (wizardStep === 3 && isGoogleMaps) {
                  connectGoogleMaps();
                  return;
                }
                setWizardStep((step) => Math.min(4, step + 1));
              }}>
                {wizardStep === 3 ? (isGoogleMaps ? t("ربط Google", "Connect Google") : t("إدخال البيانات", "Enter details")) : t("التالي", "Next")}
              </button> : null}
              <button className="btn soft" type="button" disabled={wizardStep === 1} onClick={() => setWizardStep((step) => {
                if (isWebsite || isEmail) return 1;
                const prev = Math.max(1, step - 1);
                return prev === 2 ? 1 : prev;
              })}>
                {t("عودة", "Back")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showIntegrationData && (
        <form className="settings-form" onSubmit={saveSettings}>
          {isTelegram ? (
            <div className="telegram-help-card">
              <div>
                <h3>{t("طريقة ربط تيليجرام", "How to connect Telegram")}</h3>
                <p>{t("الربط يتم عن طريق بوت تيليجرام. لا تحتاج تسجيل دخول، فقط انسخ Bot Token من BotFather واحفظه هنا.", "The connection is made through a Telegram bot. No login is needed — just copy the Bot Token from BotFather and save it here.")}</p>
              </div>
              <ol>
                <li>{t("افتح تيليجرام وابحث عن BotFather الرسمي.", "Open Telegram and search for the official BotFather.")}</li>
                <li>{t("اكتب /newbot واختر اسم البوت واسم المستخدم.", "Type /newbot and choose the bot's name and username.")}</li>
                <li>{t("انسخ Bot Token الذي يعطيك إياه BotFather.", "Copy the Bot Token that BotFather gives you.")}</li>
                <li>{t("الصق التوكن في خانة Bot Token واضغط حفظ الإعدادات.", "Paste the token into the Bot Token field and click Save Settings.")}</li>
                <li>{t("أرسل /start للبوت من تيليجرام حتى تظهر المحادثة في المنصة.", "Send /start to the bot from Telegram so the conversation appears in the platform.")}</li>
              </ol>
            </div>
          ) : null}
          {isX ? (
            <div className="telegram-help-card">
              <div>
                <h3>{t("إعداد تطبيق Linkly على X", "Set up the Linkly app on X")}</h3>
                <p>{t("هذه البيانات تضبط تطبيق المنصة مرة واحدة. بعد ذلك كل عميل يربط X بزر مباشر بدون إدخال مفاتيح.", "This data configures the platform's app once. After that, every customer connects X with a single button, without entering any keys.")}</p>
              </div>
              <ol>
                <li>{t("أنشئ App واحد باسم Linkly داخل X Developer Portal.", "Create a single app named Linkly in the X Developer Portal.")}</li>
                <li>{t("فعّل OAuth 2.0 وصلاحيات Read / Write / Direct Messages حسب المتاح.", "Enable OAuth 2.0 and Read / Write / Direct Messages permissions as available.")}</li>
                <li>{t("انسخ OAuth 1.0 Secret Key واحفظه في خانة Consumer Secret، فهو المطلوب لاختبار CRC.", "Copy the OAuth 1.0 Secret Key and save it in the Consumer Secret field — it's required for the CRC check.")}</li>
                <li>{t(`أضف Callback URL: ${publicAppUrl}/api/x/callback`, `Add Callback URL: ${publicAppUrl}/api/x/callback`)}</li>
                <li>{t(`أضف Webhook URL إذا كان متاحًا: ${publicAppUrl}/api/x/webhook`, `Add Webhook URL if available: ${publicAppUrl}/api/x/webhook`)}</li>
                <li>{t("احفظ بيانات التطبيق هنا، ثم استخدم زر ربط X للمصادقة بحساب العميل.", "Save the app details here, then use the Connect X button to authenticate the customer's account.")}</li>
              </ol>
            </div>
          ) : null}
          {isTikTok ? (
            <div className="telegram-help-card">
              <div>
                <h3>{t("ربط TikTok Business Messaging", "Connect TikTok Business Messaging")}</h3>
                <p>{t("هذه القناة قيد التجهيز - إرسال واستقبال الرسائل الفعلي بينتظر موافقة TikTok على صلاحية Business Messaging Partner لحسابك. تقدر تحفظ بيانات التطبيق الآن وتكمل التفعيل بعد ما توافق عليك TikTok.", "This channel is still being set up — actual message sending and receiving is waiting for TikTok to approve Business Messaging Partner access for our account. You can save the app details now and finish activation once TikTok approves you.")}</p>
              </div>
              <ol>
                <li>{t("سجّل حساب TikTok Business وقدّم على TikTok API for Business.", "Register a TikTok Business account and apply to the TikTok API for Business.")}</li>
                <li>{t('اطلب صلاحية "Business Messaging" كـ Messaging Partner من TikTok.', 'Request "Business Messaging" access as a Messaging Partner from TikTok.')}</li>
                <li>{t("بعد الموافقة، انسخ App Key وApp Secret وAccess Token واحفظهم هنا.", "After approval, copy the App Key, App Secret, and Access Token and save them here.")}</li>
              </ol>
            </div>
          ) : null}
          {isSms ? (
            <div className="telegram-help-card">
              <div>
                <h3>{t("ربط SMS عبر Unifonic", "Connect SMS via Unifonic")}</h3>
                <p>{t("الإرسال الصادر جاهز ويشتغل مباشرة بمجرد حفظ البيانات. استقبال ردود العملاء (SMS ثنائي الاتجاه) لسه قيد التجهيز.", "Outbound sending is ready and works as soon as you save the details. Receiving customer replies (two-way SMS) is still being built.")}</p>
              </div>
              <ol>
                <li>{t("أنشئ حساب على", "Create an account on")} <a href="https://www.unifonic.com" target="_blank" rel="noreferrer">Unifonic</a> {t("وسجّل نشاطك التجاري.", "and register your business.")}</li>
                <li>{t("من لوحة Unifonic، انسخ AppSid الخاص بتطبيقك.", "From the Unifonic dashboard, copy your app's AppSid.")}</li>
                <li>{t("سجّل اسم مرسل (Sender ID) معتمد، وانسخه بالأسفل.", "Register an approved Sender ID and copy it below.")}</li>
                <li>{t("احفظ الإعدادات - الرد على أي محادثة SMS من هنا بيرسل فعلياً عبر Unifonic.", "Save the settings — replying to any SMS conversation from here actually sends via Unifonic.")}</li>
              </ol>
            </div>
          ) : null}
          {isGmail ? (
            <div className="provider-connect-card">
              <span className="provider-connect-icon gmail" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M3 6.5 12 13l9-6.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 6.2A1.2 1.2 0 0 1 4.2 5h15.6A1.2 1.2 0 0 1 21 6.2v11.6a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 17.8Z" fill="none" stroke="#fff" strokeWidth="1.8" />
                </svg>
              </span>
              <div className="provider-connect-copy">
                <h3>{t("ربط Gmail مباشرة", "Connect Gmail directly")}</h3>
                <p>{t("اربط حساب Gmail عبر OAuth لإرسال واستقبال الرسائل تلقائياً بدون إعداد Webhook يدوي.", "Connect a Gmail account via OAuth to send and receive messages automatically, without any manual webhook setup.")}</p>
              </div>
              <a className="btn primary" href="/api/email/oauth/gmail">
                {t("ربط Gmail", "Connect Gmail")}
              </a>
            </div>
          ) : null}
          {isEmail && !hideManualEmailSetup ? (
            <div className="telegram-help-card">
              <div>
                <h3>{t("طريقة ربط البريد الإلكتروني عبر Webhook (بديل)", "How to connect email via webhook (alternative)")}</h3>
                <p>{t("استخدم Webhook البريد مع Zapier أو Make أو أي مزود يدعم إرسال Webhook عند وصول بريد جديد.", "Use the email webhook with Zapier, Make, or any provider that supports sending a webhook when a new email arrives.")}</p>
              </div>
              <ol>
                <li>{t("احفظ اسم المرسل وبريد الإرسال في الحقول أدناه.", "Save the sender name and email address in the fields below.")}</li>
                <li>{t("انسخ رابط Webhook وأرسله من مزود البريد عند وصول رسالة جديدة.", "Copy the webhook link and send it from your email provider when a new message arrives.")}</li>
                <li>{t("أضف Secret Token في Header باسم x-audiencew-email-secret.", "Add the Secret Token in a header named x-audiencew-email-secret.")}</li>
                <li>{t("أي رسالة تحتوي from و subject و text ستظهر في المحادثات كقناة بريد.", "Any message containing from, subject, and text will appear in the conversations as an email channel.")}</li>
              </ol>
            </div>
          ) : null}
          {isWebsite ? (
            <div className="telegram-help-card">
              <div>
                <h3>{t("ودجت الدردشة الحية لموقعك", "Your website's live-chat widget")}</h3>
                <p>{t('انسخ الكود التالي والصقه قبل إغلاق وسم </body> في أي صفحة بموقعك. راح تظهر فقاعة دردشة لكل زوار الموقع، ورسائلهم بتظهر مباشرة هنا كمحادثات قناة "الموقع الإلكتروني".', 'Copy the code below and paste it right before the closing </body> tag on any page of your site. A chat bubble will appear for every visitor, and their messages will appear here directly as conversations on the "Website" channel.')}</p>
              </div>
              <div className="copy-row">
                <span>{`<script src="${publicAppUrl}/widget.js" data-site-key="${settings.verifyToken}" async></script>`}</span>
                <button
                  type="button"
                  onClick={() => copyValue("website-embed", `<script src="${publicAppUrl}/widget.js" data-site-key="${settings.verifyToken}" async></script>`)}
                >
                  {copied === "website-embed" ? t("تم النسخ", "Copied") : t("نسخ الكود", "Copy code")}
                </button>
              </div>
              <ol>
                <li>{t("افتح محرر موقعك (أو نظام إدارة المحتوى) وأضف الكود بالأعلى في كل الصفحات.", "Open your site editor (or CMS) and add the code above to every page.")}</li>
                <li>{t("الزائر يكتب اسمه وبريده أول مرة، بعدها تظهر له نافذة الدردشة مباشرة.", "The visitor enters their name and email the first time, then the chat window appears directly.")}</li>
                <li>{t("ردودك من هذه اللوحة تصل للزائر خلال ثوانٍ داخل نفس النافذة.", "Your replies from this dashboard reach the visitor within seconds, inside the same window.")}</li>
              </ol>
            </div>
          ) : null}
          <div className="settings-form-head">
            <div>
              <h2>{isWebsite ? t("ودجت الموقع الإلكتروني", "Website widget") : isGoogleMaps ? t("ربط Google Business", "Connect Google Business") : isWhatsApp ? t("ربط واتساب", "Connect WhatsApp") : hideManualEmailSetup ? t("حساب البريد المرتبط", "Connected email account") : t("بيانات الربط والويبهوك", "Connection and webhook details")}</h2>
              <p>{isWebsite ? t("مفتاح الموقع أدناه فريد لحسابك ومُضمّن تلقائياً بكود التضمين بالأعلى.", "The site key below is unique to your account and is already embedded in the code above.") : hideManualEmailSetup ? t("الحساب متصل عبر OAuth ويعمل تلقائيًا بدون إعدادات إضافية. اضغط مسح بيانات الربط لفصل الحساب.", "The account is connected via OAuth and works automatically without extra settings. Click Clear Connection Data to disconnect it.") : isEmail ? t("هذه البيانات تحفظ قناة البريد الإلكتروني وتستخدم في استقبال الرسائل عبر Webhook.", "This data saves the email channel and is used to receive messages via webhook.") : isGoogleMaps ? t("لا تحتاج إدخال حقول هنا. اضغط ربط Google واختر حساب النشاط التجاري، وسيتم حفظ بيانات الربط تلقائياً بعد الموافقة.", "You don't need to fill in any fields here. Click Connect Google and choose the business account, and the connection data will be saved automatically after approval.") : isX ? t("هذه بيانات تطبيق Linkly على X. العميل لن يدخل هذه المفاتيح؛ سيضغط ربط X فقط ويتم حفظ حسابه تلقائيًا.", "This is the Linkly app's data on X. The customer won't enter these keys; they'll just click Connect X and their account will be saved automatically.") : isTikTok ? t("احفظ بيانات تطبيق TikTok الآن؛ الإرسال والاستقبال الفعلي يبدأ بعد موافقة TikTok على صلاحية Business Messaging.", "Save the TikTok app details now; actual sending and receiving starts once TikTok approves Business Messaging access.") : isSms ? t("بيانات Unifonic لإرسال رسائل SMS للعملاء. استقبال الردود قيد التجهيز.", "Unifonic details for sending SMS messages to customers. Receiving replies is still being built.") : isTelegram ? t("هذه البيانات تحفظ ربط Telegram وتفعّل الويبهوك تلقائياً لاستقبال الرسائل داخل المنصة.", "This data saves the Telegram connection and activates the webhook automatically to receive messages in the platform.") : isFacebook ? t("هذه البيانات تحفظ صفحة Facebook وتستخدم في استقبال وإرسال رسائل Messenger داخل المنصة.", "This data saves the Facebook page and is used to send and receive Messenger messages in the platform.") : isInstagram ? t("هذه البيانات تحفظ ربط Instagram وتستخدم في استقبال الرسائل والتعليقات داخل المنصة.", "This data saves the Instagram connection and is used to receive messages and comments in the platform.") : t("اربط حساب واتساب من نافذة Meta. سيتم حفظ بيانات الحساب والرقم تلقائياً بعد اكتمال الربط.", "Connect a WhatsApp account from the Meta window. The account and number details will be saved automatically once the connection is complete.")}</p>
            </div>
            <span className={`connection-pill ${isEmail ? (isConnected ? "connected" : "pending") : settings.status}`}>
              {isEmail ? (isConnected ? statusLabel("connected", t) : statusLabel("pending", t)) : statusLabel(settings.status, t)}
            </span>
            {!isWebsite ? <button className="soft-action" disabled={saving || loading} type="button" onClick={resetIntegrationData}>
              {t("مسح بيانات الربط", "Clear connection data")}
            </button> : null}
            {!isGoogleMaps && !isWhatsApp && !isWebsite && !(hideManualEmailSetup) ? <button className="primary-action" disabled={saving || loading} type="submit">
              {saving ? t("جاري الحفظ...", "Saving...") : t("حفظ الإعدادات", "Save settings")}
            </button> : null}
            {isWhatsApp ? <button className="primary-action" disabled={saving || loading} type="button" onClick={async () => { setSaving(true); await persistSettings(); setSaving(false); }}>
              {saving ? t("جاري التحقق...", "Checking...") : t("تحقق من الحالة", "Check status")}
            </button> : null}
          </div>

          {!isGoogleMaps && !isWebsite && !(hideManualEmailSetup) ? <div className="settings-fields">
            {!isWhatsApp ? <label>
              {t("اسم النشاط التجاري", "Business name")}
              <input value={settings.businessName} onChange={(event) => updateField("businessName", event.target.value)} />
            </label> : null}
            <label>
              {isEmail ? t("اسم قناة البريد", "Email channel name") : isX ? t("اسم حساب X", "X account name") : isTikTok ? t("اسم حساب TikTok", "TikTok account name") : isSms ? t("اسم قناة SMS", "SMS channel name") : isTelegram ? t("اسم بوت Telegram", "Telegram bot name") : isFacebook ? t("اسم صفحة Facebook", "Facebook page name") : isInstagram ? t("اسم حساب Instagram", "Instagram account name") : t("حساب واتساب للأعمال", "WhatsApp Business account")}
              <input value={settings.wabaName} onChange={(event) => updateField("wabaName", event.target.value)} readOnly={isWhatsApp} placeholder={isWhatsApp ? t("يظهر بعد اكتمال الربط من Meta", "Appears once the connection with Meta is complete") : undefined} />
            </label>
            {!isInstagram && !isFacebook && !isTelegram && !isX && !isEmail && !isTikTok && !isSms ? <label>
              {t("رقم واتساب", "WhatsApp number")}
              <input dir="ltr" value={settings.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} readOnly={isWhatsApp} placeholder={t("يظهر بعد اكتمال الربط من Meta", "Appears once the connection with Meta is complete")} />
            </label> : null}
            <label>
              {t("حالة الربط", "Connection status")}
              <div className={`connection-status-box ${settings.status}`}>
                <b>{statusLabel(settings.status, t)}</b>
                <span>
                  {settings.status === "connected"
                    ? isEmail
                      ? t("تم حفظ البريد ورابط الويبهوك.", "The email and webhook link have been saved.")
                    : isX
                      ? t("تم حفظ مفاتيح X. التفعيل الكامل يعتمد على صلاحيات API.", "The X keys have been saved. Full activation depends on API permissions.")
                      : isTikTok
                      ? t("تم حفظ بيانات TikTok.", "The TikTok details have been saved.")
                      : isSms
                      ? t("تم حفظ بيانات Unifonic. الرد على أي محادثة SMS يرسل رسالة فعلية.", "The Unifonic details have been saved. Replying to any SMS conversation sends an actual message.")
                      : isGoogleMaps
                        ? t("تم حفظ حساب خرائط Google والموقع.", "The Google Maps account and location have been saved.")
                      : isFacebook
                      ? t("تم التحقق من صفحة Facebook والربط جاهز.", "The Facebook page has been verified and the connection is ready.")
                      : isTelegram
                      ? t("تم التحقق من Bot Token وتفعيل Webhook.", "The Bot Token has been verified and the webhook activated.")
                      : t("تم التحقق من بيانات Meta والربط جاهز.", "The Meta details have been verified and the connection is ready.")
                    : t("احفظ الإعدادات بعد تعبئة البيانات وسيتم التحقق تلقائيًا.", "Save the settings after filling in the data, and it will be verified automatically.")}
                </span>
              </div>
            </label>
            {isEmail ? (
              <>
                <label>
                  {t("بريد الإرسال", "Sending email address")}
                  <input dir="ltr" type="email" value={settings.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} placeholder="support@example.com" />
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
                  {t("Secret Token اختياري", "Secret Token (optional)")}
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
                  <input dir="ltr" value={settings.googleRefreshToken} onChange={(event) => updateField("googleRefreshToken", event.target.value)} placeholder={t("يتم حفظه تلقائياً بعد الربط", "Saved automatically after connecting")} />
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
                  {t("Account / User ID اختياري", "Account / User ID (optional)")}
                  <input dir="ltr" value={settings.wabaId} onChange={(event) => updateField("wabaId", event.target.value)} placeholder={t("@username أو User ID", "@username or User ID")} />
                </label>
                <label>
                  Webhook Secret
                  <input dir="ltr" value={settings.verifyToken} onChange={(event) => updateField("verifyToken", event.target.value)} placeholder="audiencew_x_secret" />
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
                  <input dir="ltr" value={settings.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} placeholder={t("اسم أو رقم المرسل المعتمد", "Approved sender name or number")} />
                </label>
              </>
            ) : null}
          </div> : null}

          {isGoogleMaps ? (
            <div className="x-connect-card">
              <div>
                <h3>{t("بيانات النشاط التجاري", "Business details")}</h3>
                <p>{settings.phoneNumber || t("بعد إكمال الربط ستظهر هنا بيانات النشاط التجاري والموقع المرتبط.", "Once the connection is complete, the business and location details will appear here.")}</p>
              </div>
              <button className="soft-action" disabled={saving || loading || settings.status !== "connected"} type="button" onClick={syncGoogleReviews}>
                {t("مزامنة التقييمات", "Sync reviews")}
              </button>
            </div>
          ) : null}

          {isX ? (
            <div className="x-connect-card">
              <div>
                <h3>{t("ربط حساب X للعميل", "Connect the customer's X account")}</h3>
                <p>{t("بعد حفظ Client ID و Client Secret لتطبيق Linkly، اضغط ربط X. العميل سيسجل الدخول ويوافق على الصلاحيات، ثم يرجع للمنصة تلقائيًا.", "After saving the Client ID and Client Secret for the Linkly app, click Connect X. The customer will log in, approve the permissions, then return to the platform automatically.")}</p>
              </div>
              <button className="primary-action" disabled={saving || loading} type="button" onClick={connectXAccount}>
                {t("ربط X مباشرة", "Connect X directly")}
              </button>
            </div>
          ) : null}

          {saveFeedback && <p className={`settings-save-feedback ${saveFeedback.type}`}>{saveFeedback.text}</p>}

          {telegramBotLink ? (
            <div className="telegram-link-card">
              <div>
                <h3>{t("رابط تيليجرام للعملاء", "Telegram link for customers")}</h3>
                <p>{t("هذا هو الرابط الذي ترسله للعملاء. أي عميل يفتحه ويرسل للبوت ستظهر محادثته داخل المنصة.", "This is the link you send to customers. Any customer who opens it and messages the bot will have their conversation appear in the platform.")}</p>
              </div>
              <div className="copy-row">
                <span>{telegramBotLink}</span>
                <button type="button" onClick={() => copyValue("telegram-link", telegramBotLink)}>
                  {copied === "telegram-link" ? t("تم النسخ", "Copied") : t("نسخ الرابط", "Copy link")}
                </button>
              </div>
              <small>{t("للتجربة: افتح الرابط، اضغط Start أو أرسل /start، ثم ارجع لصفحة المحادثات.", "To test: open the link, press Start or send /start, then go back to the conversations page.")}</small>
            </div>
          ) : null}

          {!isInstagram && !isFacebook && !isTelegram && !isX && !isGoogleMaps && !isEmail && !isWebsite && !isTikTok && !isSms && settings.status === "connected" ? <div className="meta-test-card">
            <div>
              <h3>{t("تجربة رقم التست", "Test number trial")}</h3>
              <p>{t("أضف رقمك في قائمة أرقام الاختبار داخل Meta، ثم أرسل رسالة للتأكد من الإرسال والاستقبال.", "Add your number to the test number list in Meta, then send a message to confirm sending and receiving work.")}</p>
              <p className="meta-test-warning">{t("⚠️ واتساب لا يسلّم رسائل نصية حرة إلا لأرقام راسلت رقم الأعمال أولاً خلال آخر 24 ساعة. إذا الرقم المستلم ما راسلك قبل، خلّه يرسل لك أي رسالة أولاً ثم جرّب مرة ثانية — وإلا الإرسال يظهر ناجحًا هنا لكن الرسالة ما توصله فعليًا.", "⚠️ WhatsApp only delivers free-form text messages to numbers that messaged your business number first within the last 24 hours. If the recipient hasn't messaged you before, have them send you any message first, then try again — otherwise this will show as sent here but the message won't actually reach them.")}</p>
            </div>
            <div className="meta-test-grid">
              <label>
                {t("رقم المستلم", "Recipient number")}
                <input
                  dir="ltr"
                  inputMode="tel"
                  placeholder="9665xxxxxxxx"
                  value={testRecipient}
                  onChange={(event) => setTestRecipient(event.target.value)}
                />
              </label>
              <label>
                {t("نص الرسالة", "Message text")}
                <textarea value={testMessage} onChange={(event) => setTestMessage(event.target.value)} />
              </label>
            </div>
            <div className="meta-test-actions">
              <button className="primary-action" disabled={testSending || !testRecipient.trim()} type="button" onClick={sendTestMessage}>
                {testSending ? t("جاري الإرسال...", "Sending...") : t("إرسال رسالة اختبار", "Send test message")}
              </button>
              <small>{t("الاستقبال يحتاج أن يكون الويبهوك مفعّلًا على رابط الاستضافة.", "Receiving requires the webhook to be active on your hosting URL.")}</small>
            </div>
            {testFeedback && <p className={`meta-test-feedback ${testFeedback.type}`}>{testFeedback.text}</p>}
          </div> : null}

          {isWhatsApp && settings.status === "connected" ? <div className="business-profile-card">
            <div>
              <h3>{t("الملف التجاري لواتساب", "WhatsApp business profile")}</h3>
              <p>{t("هذه البيانات تظهر لعملائك داخل واتساب عند فتح محادثة معك: الصورة، النبذة، العنوان، والتواصل.", "This is what your customers see inside WhatsApp when they open a conversation with you: photo, about, address, and contact details.")}</p>
            </div>

            <div className="business-profile-picture-row">
              <label>{t("الصورة الشخصية", "Profile picture")}</label>
              <div className="business-profile-picture-field">
                {businessProfilePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={businessProfilePictureUrl} alt="" className="business-profile-picture-preview" />
                ) : (
                  <span className="business-profile-picture-placeholder" aria-hidden="true">AW</span>
                )}
                <label className="soft-action business-profile-picture-upload">
                  {t("تغيير الصورة", "Change profile picture")}
                  <input type="file" accept="image/*" onChange={handleBusinessProfilePictureChange} hidden />
                </label>
              </div>
            </div>

            <div className="business-profile-grid">
              <label>
                {t("رقم الهاتف", "Phone number")}
                <input dir="ltr" value={settings.phoneNumber} readOnly placeholder={t("يظهر بعد اكتمال الربط من Meta", "Appears once the connection with Meta is complete")} />
              </label>
              <label>
                {t("نبذة", "About")}
                <input value={businessProfile.about} maxLength={139} onChange={(event) => setBusinessProfile((current) => ({ ...current, about: event.target.value }))} />
              </label>
              <label>
                {t("عنوان النشاط", "Business address")}
                <input value={businessProfile.address} onChange={(event) => setBusinessProfile((current) => ({ ...current, address: event.target.value }))} />
              </label>
              <label>
                {t("وصف النشاط", "Business description")}
                <input value={businessProfile.description} onChange={(event) => setBusinessProfile((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <label>
                {t("بريد التواصل التجاري", "Email for business contact")}
                <input dir="ltr" type="email" value={businessProfile.email} onChange={(event) => setBusinessProfile((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label>
                {t("مجال النشاط", "Business industry")}
                <select value={businessProfile.vertical} onChange={(event) => setBusinessProfile((current) => ({ ...current, vertical: event.target.value }))}>
                  <option value="">{t("اختر المجال", "Choose an industry")}</option>
                  {businessVerticalOptions.map((option) => (
                    <option key={option.value} value={option.value}>{t(option.ar, option.en)}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("موقع النشاط 1", "Business website 1")}
                <input dir="ltr" value={businessProfile.website1} onChange={(event) => setBusinessProfile((current) => ({ ...current, website1: event.target.value }))} placeholder="https://example.com" />
              </label>
              <label>
                {t("موقع النشاط 2", "Business website 2")}
                <input dir="ltr" value={businessProfile.website2} onChange={(event) => setBusinessProfile((current) => ({ ...current, website2: event.target.value }))} placeholder="https://example.com" />
              </label>
            </div>

            <div className="business-profile-actions">
              <button className="primary-action" disabled={businessProfileSaving || businessProfileLoading} type="button" onClick={saveBusinessProfile}>
                {businessProfileSaving ? t("جاري الحفظ...", "Saving...") : t("حفظ الملف التجاري", "Save business profile")}
              </button>
              <button className="soft-action" disabled={businessProfileLoading || businessProfileSaving} type="button" onClick={loadBusinessProfile}>
                {businessProfileLoading ? t("جاري التحديث...", "Refreshing...") : t("تحديث من Meta", "Refresh from Meta")}
              </button>
            </div>
            {businessProfileFeedback && <p className={`meta-test-feedback ${businessProfileFeedback.type}`}>{businessProfileFeedback.text}</p>}
          </div> : null}

          {!isGoogleMaps && !isWebsite && !isInstagram && !isFacebook && !isWhatsApp && !(hideManualEmailSetup) ? <div className="webhook-card">
            <div>
              <h3>{t("إعدادات الويبهوك", "Webhook settings")} — {isEmail ? (isGmail ? "Gmail" : t("البريد الإلكتروني", "Email")) : isTikTok ? "TikTok" : isSms ? "SMS" : isX ? "X" : isTelegram ? t("تيليجرام", "Telegram") : isFacebook ? t("فيسبوك", "Facebook") : isInstagram ? "Instagram" : t("واتساب", "WhatsApp")}</h3>
              <p>{isEmail ? t("انسخ هذا الرابط مع Secret Token وضعه في Zapier أو Make أو مزود البريد لإرسال الرسائل الواردة إلى المنصة.", "Copy this link along with the Secret Token and add it to Zapier, Make, or your email provider to send inbound messages to the platform.") : isGoogleMaps ? t("هذا الرابط يستخدمه النظام لمزامنة تقييمات Google عند الطلب أو بشكل دوري داخل المنصة.", "The system uses this link to sync Google reviews on demand or periodically within the platform.") : isX ? t("استخدم هذا الرابط كـ Webhook URL في X عند توفر Account Activity API. Webhook Secret يحمي الطلبات.", "Use this link as the Webhook URL in X when the Account Activity API is available. The Webhook Secret protects the requests.") : isTelegram ? t("سيتم تفعيل هذا الرابط تلقائياً في Telegram عند حفظ Bot Token. Secret Token يحمي الويبهوك من الطلبات غير المعروفة.", "This link will be activated automatically in Telegram once you save the Bot Token. The Secret Token protects the webhook from unknown requests.") : isFacebook ? t("انسخ رابط الويبهوك و Verify Token وضعها في إعدادات تطبيق Meta لاستقبال رسائل Facebook Messenger.", "Copy the webhook link and Verify Token and add them to your Meta app settings to receive Facebook Messenger messages.") : isInstagram ? t("انسخ رابط الويبهوك و Verify Token وضعها في إعدادات تطبيق Meta لاستقبال رسائل وتعليقات Instagram.", "Copy the webhook link and Verify Token and add them to your Meta app settings to receive Instagram messages and comments.") : isTikTok ? t("انسخ رابط الويبهوك و Verify Token وضعها في إعدادات تطبيق TikTok لاستقبال رسائل وتعليقات TikTok بعد موافقة Business Messaging.", "Copy the webhook link and Verify Token and add them to your TikTok app settings to receive TikTok messages and comments once Business Messaging is approved.") : isSms ? t("انسخ رابط الويبهوك و Verify Token وضعها في إعدادات Unifonic لاستقبال ردود العملاء عبر SMS.", "Copy the webhook link and Verify Token and add them to your Unifonic settings to receive customer replies via SMS.") : t("انسخ رابط الويبهوك و Verify Token وضعها في إعدادات تطبيق Meta لاستقبال رسائل WhatsApp.", "Copy the webhook link and Verify Token and add them to your Meta app settings to receive WhatsApp messages.")}</p>
            </div>
            <div className="webhook-field">
              <span className="webhook-field-label">{t("رابط الويبهوك", "Webhook link")}</span>
              <div className="copy-row">
                <span>{webhookUrl}</span>
                <button type="button" onClick={() => copyValue("webhook", webhookUrl)}>
                  {copied === "webhook" ? t("تم النسخ", "Copied") : t("نسخ الرابط", "Copy link")}
                </button>
              </div>
            </div>
            <div className="webhook-field">
              <span className="webhook-field-label">{isTelegram || isX || isEmail ? "Secret Token" : "Verify Token"}</span>
              <div className="copy-row">
                <button type="button" className="webhook-token-value" onClick={() => setShowWebhookToken((current) => !current)} title={showWebhookToken ? t("اضغط للإخفاء", "Click to hide") : t("اضغط للإظهار", "Click to show")}>
                  {showWebhookToken ? settings.verifyToken : "•".repeat(Math.min(settings.verifyToken.length || 24, 32))}
                </button>
                <button type="button" onClick={() => copyValue("token", settings.verifyToken)}>
                  {copied === "token" ? t("تم النسخ", "Copied") : isTelegram || isX || isEmail ? t("نسخ Secret Token", "Copy Secret Token") : t("نسخ التوكن", "Copy token")}
                </button>
              </div>
              <button type="button" className="webhook-token-regenerate" disabled={saving} onClick={regenerateWebhookToken}>
                <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0 1 15.4-6.36L21 8M3 12a9 9 0 0 0 15.4 6.36L21 16M21 8V3M21 8h-5M21 16v5M21 16h-5" />
                </svg>
                {t("استبدال التوكن", "Regenerate token")}
              </button>
            </div>
          </div> : null}
        </form>
      )}
    </section>
  );
}
