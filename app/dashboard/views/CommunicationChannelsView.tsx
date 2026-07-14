"use client";

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
  const visibleChannels = channels.map((channel) => (
    channel.id === "whatsapp"
      ? { ...channel, status: integrationStatus === "connected" ? "connected" as const : "not_connected" as const }
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
    </section>
  );
}
