"use client";

import CustomSelect from "../../components/CustomSelect";
import TikTokAdsSettings from "../components/TikTokAdsSettings";
import MetaAdsSettings from "../components/MetaAdsSettings";
import SnapAdsSettings from "../components/SnapAdsSettings";
import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { ChannelIcon } from "./SettingsView";
import type { IntegrationSettings } from "../types";

/**
 * One card per ad platform. Each opens a dialog with two tabs:
 *  - "Receive customers": lead forms / leads coming into Linkly (Meta Lead Ads, Snapchat Lead Gen, TikTok via Zapier).
 *  - "Event feedback": stage changes sent back to the platform's pixel so campaigns learn.
 */
type Platform = "meta" | "tiktok" | "snapchat";
type Tab = "receive" | "events";
type LeadChannel = "meta_leads" | "snapchat" | "tiktok";

const leadChannelOf: Record<Platform, LeadChannel> = { meta: "meta_leads", tiktok: "tiktok", snapchat: "snapchat" };

const connectUrls: Record<LeadChannel, string> = {
  // A connection kept separate from the "facebook" Messenger channel (see
  // app/api/meta/connect) - enabling Lead Ads must never implicitly turn on
  // the still-locked, unreviewed Messenger channel, or vice versa.
  meta_leads: "/api/meta/connect?channel=meta_leads",
  snapchat: "/api/snapchat/connect",
  tiktok: "/api/tiktok/connect"
};

const eventsSettingsUrls: Record<Platform, string> = {
  meta: "/api/meta-ads/settings",
  tiktok: "/api/tiktok-ads/settings",
  snapchat: "/api/snap-ads/settings"
};

const iconOf = { meta: "facebook", tiktok: "tiktok", snapchat: "snapchat" } as const;

function statusPill(on: boolean, onLabel: string, offLabel: string) {
  return <span className={`status-pill ${on ? "assigned" : "unassigned"}`}>{on ? onLabel : offLabel}</span>;
}

export default function IntegrationsView() {
  const { t } = useLanguage();
  const [settingsByChannel, setSettingsByChannel] = useState<Partial<Record<LeadChannel, IntegrationSettings>>>({});
  const [eventsEnabled, setEventsEnabled] = useState<Partial<Record<Platform, boolean>>>({});
  const [templates, setTemplates] = useState<Array<{ name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Platform | null>(null);
  const [tab, setTab] = useState<Tab>("receive");

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      (["meta_leads", "snapchat", "tiktok"] as LeadChannel[]).map((channel) =>
        fetch(`/api/settings/integration?channel=${channel}`)
          .then((response) => response.json())
          .then((data) => [channel, data] as const)
      )
    )
      .then((entries) => {
        if (cancelled) return;
        setSettingsByChannel(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Whether event feedback is switched on, for the badge on each card.
    (["meta", "tiktok", "snapchat"] as Platform[]).forEach((platform) => {
      fetch(eventsSettingsUrls[platform], { cache: "no-store" })
        .then((response) => response.json())
        .then((result: { ok?: boolean; data?: { settings?: { enabled?: boolean } } }) => {
          if (!cancelled && result?.ok) setEventsEnabled((current) => ({ ...current, [platform]: Boolean(result.data?.settings?.enabled) }));
        })
        .catch(() => null);
    });
    fetch("/api/templates")
      .then((response) => response.json())
      .then((result: { ok: boolean; data?: Array<{ name: string; status?: string }> }) => {
        if (cancelled || !result?.ok) return;
        setTemplates((result.data || []).filter((template) => template.status === "معتمد").map((template) => ({ name: template.name })));
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveLeadAdsSettings(next: Partial<IntegrationSettings>) {
    const current = settingsByChannel.meta_leads;
    if (!current) return;
    const merged = { ...current, ...next };
    setSettingsByChannel((prev) => ({ ...prev, meta_leads: merged }));
    setSaving(true);
    try {
      await fetch("/api/settings/integration?channel=meta_leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged)
      });
    } finally {
      setSaving(false);
    }
  }

  function connect(channel: LeadChannel) {
    window.location.assign(connectUrls[channel]);
  }

  function openPlatform(platform: Platform, nextTab: Tab) {
    setTab(nextTab);
    setOpen(platform);
  }

  const platforms: Array<{ id: Platform; title: string; description: string; receiveLabel: string }> = [
    {
      id: "meta",
      title: t("ميتا (فيسبوك وإنستغرام)", "Meta (Facebook & Instagram)"),
      description: t("استقبل عملاء نماذج Lead Ads، وأخبر ميتا أي المحادثات تحوّلت إلى مبيعات.", "Receive Lead Ads customers, and tell Meta which conversations became sales."),
      receiveLabel: t("نماذج Lead Ads", "Lead Ads forms")
    },
    {
      id: "tiktok",
      title: t("تيك توك", "TikTok"),
      description: t("استقبل عملاء النماذج عبر Zapier، وأخبر TikTok أي المحادثات تحوّلت إلى مبيعات.", "Receive form leads through Zapier, and tell TikTok which conversations became sales."),
      receiveLabel: t("نماذج Lead Generation", "Lead Generation forms")
    },
    {
      id: "snapchat",
      title: t("سناب شات", "Snapchat"),
      description: t("استقبل عملاء نماذج Lead Gen، وأخبر سناب أي المحادثات تحوّلت إلى مبيعات.", "Receive Lead Gen customers, and tell Snapchat which conversations became sales."),
      receiveLabel: t("نماذج Lead Gen", "Lead Gen forms")
    }
  ];

  const current = platforms.find((platform) => platform.id === open) ?? null;
  const currentSettings = open ? settingsByChannel[leadChannelOf[open]] : undefined;

  return (
    <section className="page-stack settings-page">
      <div className="channels-overview-head">
        <div>
          <h2>{t("التكاملات", "Integrations")}</h2>
          <p>{t("اربط منصات الإعلانات لاستقبال العملاء المحتملين، وأرسل إليها نتائج المحادثات لتتحسن حملاتك.", "Connect your ad platforms to receive leads and send conversation outcomes back so your campaigns improve.")}</p>
        </div>
      </div>

      <div className="channel-grid">
        {platforms.map((platform) => {
          const settings = settingsByChannel[leadChannelOf[platform.id]];
          const receiving = settings?.status === "connected";
          return (
            <div key={platform.id} className="meta-test-card">
              <div>
                <span className={`channel-icon channel-icon-${iconOf[platform.id]}`}>
                  <ChannelIcon id={iconOf[platform.id]} />
                </span>
                <h3>{platform.title}</h3>
                <p>{platform.description}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {platform.id === "tiktok"
                    ? null
                    : statusPill(receiving, t("الاستقبال: متصل", "Receiving: connected"), t("الاستقبال: غير متصل", "Receiving: not connected"))}
                  {statusPill(Boolean(eventsEnabled[platform.id]), t("الأحداث: مفعّلة", "Events: on"), t("الأحداث: متوقفة", "Events: off"))}
                </div>
              </div>
              <button className="btn primary" type="button" onClick={() => openPlatform(platform.id, "receive")} disabled={loading}>
                {t("إعداد", "Set up")}
              </button>
            </div>
          );
        })}
      </div>

      {open && current ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpen(null)}>
          <div className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={current.title} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setOpen(null)}>×</button>
              <h2>{current.title}</h2>
            </header>
            <div className="account-modal-body">
              <div className="pipeline-tabs" role="tablist" aria-label={t("أقسام التكامل", "Integration sections")} style={{ marginTop: 0, marginBottom: 14 }}>
                <button type="button" role="tab" aria-selected={tab === "receive"} onClick={() => setTab("receive")}>{t("استقبال العملاء", "Receive customers")}</button>
                <button type="button" role="tab" aria-selected={tab === "events"} onClick={() => setTab("events")}>{t("ربط الأحداث", "Event feedback")}</button>
              </div>

              {tab === "events" ? (
                open === "meta" ? <MetaAdsSettings /> : open === "tiktok" ? <TikTokAdsSettings /> : <SnapAdsSettings />
              ) : open === "tiktok" ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <p style={{ margin: 0, lineHeight: 1.8 }}>
                    {t("نماذج TikTok Lead Generation تصل حاليًا عبر Zapier: مشغّل «TikTok Lead Generation — New Lead» ثم Webhooks by Zapier إلى لنكلي.", "TikTok Lead Generation forms currently arrive through Zapier: the “TikTok Lead Generation — New Lead” trigger, then Webhooks by Zapier to Linkly.")}
                  </p>
                  <p style={{ margin: 0, lineHeight: 1.8, opacity: 0.75 }}>
                    {t("الرابط والترويسة والجسم الجاهزة في صفحة «العملاء المحتملون» ← «ربط منصة خارجية». سيُضاف الربط المباشر بعد اعتماد تطبيق TikTok Marketing API.", "The ready URL, header and body are on the “Leads” page → “External platform”. The direct connection comes after the TikTok Marketing API app is approved.")}
                  </p>
                  <a className="btn primary" href="/dashboard?view=pipeline" style={{ justifySelf: "start" }}>{t("فتح صفحة العملاء المحتملين", "Open the Leads page")}</a>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  <p style={{ margin: 0, lineHeight: 1.8, opacity: 0.8 }}>
                    {open === "meta"
                      ? t("عند ملء العميل لنموذج إعلانك يصل مباشرة إلى لنكلي كعميل محتمل ومحادثة، ويُرسل له قالب ترحيب على واتساب.", "When a customer fills in your ad form, it arrives in Linkly as a lead and conversation, and a welcome template is sent on WhatsApp.")
                      : t("عند ملء العميل لنموذج إعلانك يصل مباشرة إلى لنكلي كعميل محتمل.", "When a customer fills in your ad form, it arrives in Linkly as a lead.")}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <button className="btn primary" type="button" onClick={() => connect(leadChannelOf[open])} disabled={loading}>
                      {currentSettings?.status === "connected" ? t("إعادة الربط", "Reconnect") : t("ربط", "Connect")}
                    </button>
                    {statusPill(currentSettings?.status === "connected", t("متصل", "Connected"), t("غير متصل", "Not connected"))}
                  </div>

                  {open === "meta" && currentSettings?.status === "connected" ? (
                    <>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={currentSettings.leadAdsEnabled === 1}
                          disabled={saving}
                          onChange={(event) => saveLeadAdsSettings({ leadAdsEnabled: event.target.checked ? 1 : 0 })}
                        />
                        {t("تفعيل الترحيب التلقائي من Lead Ads", "Enable automatic Lead Ads welcome")}
                      </label>
                      {currentSettings.leadAdsEnabled === 1 ? (
                        <div className="meta-test-grid">
                          <label>
                            {t("قالب الترحيب", "Welcome template")}
                            {templates.length ? (
                              <CustomSelect
                                value={currentSettings.leadWelcomeTemplateName}
                                disabled={saving}
                                onChange={(value) => saveLeadAdsSettings({ leadWelcomeTemplateName: value })}
                                options={[{ value: "", label: t("اختر قالبًا", "Choose a template") }, ...templates.map((template) => ({ value: template.name, label: template.name }))]}
                              />
                            ) : (
                              <p className="meta-test-warning">{t("ما فيه قوالب معتمدة على حسابك بعد.", "Your account has no approved templates yet.")}</p>
                            )}
                          </label>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
