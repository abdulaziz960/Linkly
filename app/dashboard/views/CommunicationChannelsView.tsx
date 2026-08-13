"use client";

import { useEffect, useState } from "react";

import type { IntegrationSettings } from "../types";
import { ChannelIcon, type ChannelId } from "./SettingsView";

type ChannelStatus = "connected" | "not_connected" | "coming_soon";

const channelStatusLabel: Record<ChannelStatus, string> = {
  connected: "متصلة",
  not_connected: "غير مربوطة",
  coming_soon: "قريبًا"
};

const channels: Array<{
  id: ChannelId;
  title: string;
  description: string;
  status: ChannelStatus;
}> = [
  {
    id: "whatsapp",
    title: "واتساب",
    description: "استقبال وإرسال محادثات WhatsApp Cloud API داخل صندوق المحادثات.",
    status: "not_connected"
  },
  {
    id: "instagram",
    title: "Instagram",
    description: "رسائل إنستقرام والتعليقات بعد تفعيل ربط Meta.",
    status: "coming_soon"
  },
  {
    id: "facebook",
    title: "فيسبوك",
    description: "رسائل وتعليقات صفحة Facebook المرتبطة بحسابك.",
    status: "coming_soon"
  },
  {
    id: "google_maps",
    title: "خرائط Google",
    description: "إدارة استفسارات ومراجعات ملف النشاط التجاري.",
    status: "coming_soon"
  },
  {
    id: "website",
    title: "الموقع الإلكتروني",
    description: "ودجت محادثة للموقع يظهر ضمن قنوات التواصل.",
    status: "coming_soon"
  },
  {
    id: "telegram",
    title: "تيليجرام",
    description: "ربط بوت أو قناة تيليجرام لاستقبال الرسائل.",
    status: "coming_soon"
  },
  {
    id: "email",
    title: "البريد الإلكتروني",
    description: "ربط Gmail أو Outlook أو مزود بريد آخر.",
    status: "coming_soon"
  }
];

type CommunicationChannelsViewProps = {
  integrationStatus: IntegrationSettings["status"];
};

export default function CommunicationChannelsView({ integrationStatus }: CommunicationChannelsViewProps) {
  const [email, setEmail] = useState<{ provider: "webhook" | "gmail" | "outlook"; status: ChannelStatus; senderName: string; emailAddress: string; webhookSecret: string } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [resendKey, setResendKey] = useState("");
  const [testingKey, setTestingKey] = useState(false);
  useEffect(() => {
    fetch("/api/email/integration").then((response) => response.ok ? response.json() : null).then(setEmail).catch(() => null);
  }, []);
  const visibleChannels = channels.map((channel) => (
    channel.id === "whatsapp"
      ? { ...channel, status: integrationStatus === "connected" ? "connected" as const : "not_connected" as const }
      : channel.id === "email" && email
        ? { ...channel, status: email.status }
      : channel
  ));
  const connectedCount = visibleChannels.filter((channel) => channel.status === "connected").length;

  return (
    <section className="page-stack communication-channels-page">
      <div className="channels-hero">
        <div>
          <span>قنوات التواصل</span>
          <h2>كل قنوات العميل في مكان واحد</h2>
          <p>أي قناة يتم ربطها تظهر هنا، وبعدها تدخل محادثاتها وتعليقاتها إلى صندوق المحادثات حسب نوع القناة.</p>
        </div>
        <div className="channels-summary">
          <b>{connectedCount}</b>
          <span>قناة مربوطة</span>
        </div>
      </div>

      <div className="channels-grid">
        {visibleChannels.map((channel) => (
          <article className={`communication-channel-card ${channel.status}`} key={channel.id}>
            <span className={`channel-icon channel-icon-${channel.id}`}>
              <ChannelIcon id={channel.id} />
            </span>
            <div>
              <b>{channel.title}</b>
              <small>{channel.description}</small>
            </div>
            <em>{channelStatusLabel[channel.status]}</em>
          </article>
        ))}
      </div>
      <article className="communication-channel-card email-setup-card">
        <span className="channel-icon channel-icon-email"><ChannelIcon id="email" /></span>
        <div>
          <b>ربط البريد الإلكتروني عبر Webhook</b>
          <small>استخدم Webhook البريد مع Zapier أو Make أو أي مزود يدعم إرسال Webhook عند وصول بريد جديد.</small>
        </div>
        <div className="email-manual-connect">
          <label>اسم المرسل<input value={email?.senderName || ""} onChange={(event) => setEmail((current) => current ? { ...current, senderName: event.target.value } : current)} placeholder="فريق AudienceW" /></label>
          <label>بريد الإرسال<input value={email?.emailAddress || ""} onChange={(event) => setEmail((current) => current ? { ...current, emailAddress: event.target.value } : current)} placeholder="support@yourcompany.com" type="email" /></label>
          <button type="button" onClick={async () => {
            if (!email?.emailAddress) return setFeedback("أدخل عنوان البريد أولاً.");
            const response = await fetch("/api/email/integration", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "webhook", senderName: email.senderName, emailAddress: email.emailAddress }) });
            if (!response.ok) return setFeedback("تعذر حفظ العنوان.");
            setEmail(await response.json()); setFeedback("تم حفظ بريد الاستقبال.");
          }}>حفظ بيانات المرسل</button>
          {feedback && <small>{feedback}</small>}
        </div>
        <div className="email-resend">
          <b>إرسال البريد عبر Resend</b>
          <small>أضف <code>RESEND_API_KEY</code> في Vercel للإرسال الفعلي، أو الصق المفتاح هنا لاختباره فقط. لا يتم حفظ المفتاح في المنصة.</small>
          <input value={resendKey} onChange={(event) => setResendKey(event.target.value)} placeholder="re_…" type="password" autoComplete="off" />
          <button type="button" disabled={testingKey} onClick={async () => {
            setTestingKey(true); setFeedback("");
            const response = await fetch("/api/email/test-resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: resendKey }) });
            const result = await response.json(); setFeedback(result.message || result.error || "تعذر الاختبار."); setTestingKey(false);
          }}>{testingKey ? "جارٍ التحقق…" : "اختبار مفتاح Resend"}</button>
        </div>
        <div className="email-webhook">
          <b>إعداد Webhook لدى Zapier أو Make</b>
          <ol>
            <li>انسخ رابط الـWebhook وأضفه في خطوة الإرسال عند وصول بريد جديد.</li>
            <li>أضف Secret Token في Header باسم <code>x-audiencew-email-secret</code>.</li>
            <li>أرسل بيانات <code>from</code> و<code>subject</code> و<code>text</code>؛ ستظهر الرسالة في المحادثات كقناة بريد.</li>
          </ol>
          <small>رابط Webhook</small>
          <code>{typeof window === "undefined" ? "/api/email/webhook" : `${window.location.origin}/api/email/webhook`}</code>
          <small>Secret Token</small>
          <code>{email?.webhookSecret || "جارٍ تحميل المفتاح…"}</code>
        </div>
      </article>
    </section>
  );
}
