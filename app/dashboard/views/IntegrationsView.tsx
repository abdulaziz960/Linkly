"use client";

import CustomSelect from "../../components/CustomSelect";
import TikTokAdsSettings from "../components/TikTokAdsSettings";
import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { ChannelIcon } from "./SettingsView";
import type { IntegrationSettings } from "../types";

type AdChannel = "meta_leads" | "snapchat" | "tiktok";

const connectUrls: Record<AdChannel, string> = {
  // A connection kept separate from the "facebook" Messenger channel (see
  // app/api/meta/connect) - enabling Lead Ads must never implicitly turn on
  // the still-locked, unreviewed Messenger channel, or vice versa.
  meta_leads: "/api/meta/connect?channel=meta_leads",
  snapchat: "/api/snapchat/connect",
  tiktok: "/api/tiktok/connect"
};

function statusBadge(status: string, t: (ar: string, en: string) => string) {
  if (status === "connected") return { label: t("متصل", "Connected"), className: "status-pill assigned" };
  return { label: t("غير متصل", "Not connected"), className: "status-pill unassigned" };
}

export default function IntegrationsView() {
  const { t } = useLanguage();
  const [settingsByChannel, setSettingsByChannel] = useState<Partial<Record<AdChannel, IntegrationSettings>>>({});
  const [templates, setTemplates] = useState<Array<{ name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tiktokAdsOpen, setTiktokAdsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      (["meta_leads", "snapchat", "tiktok"] as AdChannel[]).map((channel) =>
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

  function connect(channel: AdChannel) {
    window.location.assign(connectUrls[channel]);
  }

  const cards: Array<{ id: AdChannel; title: string; description: string }> = [
    {
      id: "meta_leads",
      title: t("ميتا (فيسبوك وإنستغرام)", "Meta (Facebook & Instagram)"),
      description: t("استقبل العملاء المحتملين من إعلانات Lead Ads تلقائيًا على واتساب.", "Automatically receive leads from Lead Ads into WhatsApp.")
    },
    {
      id: "snapchat",
      title: t("سناب شات", "Snapchat"),
      description: t("استقبل عملاء نماذج إعلانات سناب شات المحتملين.", "Receive leads from Snapchat Lead Generation Ads.")
    }
  ];

  return (
    <section className="page-stack settings-page">
      <div className="channels-overview-head">
        <div>
          <h2>{t("التكاملات", "Integrations")}</h2>
          <p>{t("اربط تطبيقات الإعلانات (ميتا، سناب شات، تيك توك) لاستقبال العملاء المحتملين تلقائيًا.", "Connect your ad platforms (Meta, Snapchat, TikTok) to automatically receive leads.")}</p>
        </div>
      </div>

      <div className="channel-grid">
        {cards.map((card) => {
          const settings = settingsByChannel[card.id];
          const badge = settings ? statusBadge(settings.status, t) : null;
          return (
            <div key={card.id} className="meta-test-card">
              <div>
                <span className={`channel-icon channel-icon-${card.id === "meta_leads" ? "facebook" : card.id}`}>
                  <ChannelIcon id={card.id === "meta_leads" ? "facebook" : card.id} />
                </span>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                {badge ? <span className={badge.className}>{badge.label}</span> : null}
              </div>
              <button className="btn primary" type="button" onClick={() => connect(card.id)} disabled={loading}>
                {settings?.status === "connected" ? t("إعادة الربط", "Reconnect") : t("ربط", "Connect")}
              </button>

              {card.id === "meta_leads" && settings?.status === "connected" ? (
                <>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={settings.leadAdsEnabled === 1}
                      disabled={saving}
                      onChange={(event) => saveLeadAdsSettings({ leadAdsEnabled: event.target.checked ? 1 : 0 })}
                    />
                    {t("تفعيل الترحيب التلقائي من Lead Ads", "Enable automatic Lead Ads welcome")}
                  </label>
                  {settings.leadAdsEnabled === 1 ? (
                    <div className="meta-test-grid">
                      <label>
                        {t("قالب الترحيب", "Welcome template")}
                        {templates.length ? (
                          <CustomSelect
                            value={settings.leadWelcomeTemplateName}
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
          );
        })}

        <div className="meta-test-card">
          <div>
            <span className="channel-icon channel-icon-tiktok">
              <ChannelIcon id="tiktok" />
            </span>
            <h3>{t("إعلانات تيك توك: ربط الأحداث", "TikTok Ads: event feedback")}</h3>
            <p>{t("أرسل حالة العميل المحتمل (مؤهل، مهتم، تم البيع...) إلى TikTok لتتعلّم حملاتك.", "Send the lead status (qualified, interested, sold...) to TikTok so your campaigns learn.")}</p>
          </div>
          <button className="btn primary" type="button" onClick={() => setTiktokAdsOpen(true)}>
            {t("إعداد ربط الأحداث", "Set up event feedback")}
          </button>
        </div>
      </div>

      {tiktokAdsOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setTiktokAdsOpen(false)}>
          <div className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("إعلانات TikTok", "TikTok Ads")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setTiktokAdsOpen(false)}>×</button>
              <h2>{t("إعلانات TikTok", "TikTok Ads")}</h2>
            </header>
            <div className="account-modal-body">
              <TikTokAdsSettings />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
