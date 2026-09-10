"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { ChannelIcon } from "./SettingsView";
import type { IntegrationSettings } from "../types";

type AdChannel = "facebook" | "snapchat" | "tiktok";

const connectUrls: Record<AdChannel, string> = {
  facebook: "/api/meta/connect?channel=facebook",
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

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      (["facebook", "snapchat", "tiktok"] as AdChannel[]).map((channel) =>
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
    const current = settingsByChannel.facebook;
    if (!current) return;
    const merged = { ...current, ...next };
    setSettingsByChannel((prev) => ({ ...prev, facebook: merged }));
    setSaving(true);
    try {
      await fetch("/api/settings/integration?channel=facebook", {
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
      id: "facebook",
      title: t("ميتا (فيسبوك وانستقرام)", "Meta (Facebook & Instagram)"),
      description: t("استقبل العملاء المحتملين من إعلانات Lead Ads تلقائيًا على واتساب.", "Automatically receive leads from Lead Ads into WhatsApp.")
    },
    {
      id: "snapchat",
      title: t("سناب شات", "Snapchat"),
      description: t("استقبل عملاء نماذج إعلانات سناب شات المحتملين.", "Receive leads from Snapchat Lead Generation Ads.")
    },
    {
      id: "tiktok",
      title: t("تيك توك", "TikTok"),
      description: t("اربط حساب تيك توك لإدارة المحادثات والتعليقات.", "Connect your TikTok account to manage messages and comments.")
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
                <span className={`channel-icon channel-icon-${card.id === "facebook" ? "facebook" : card.id}`}>
                  <ChannelIcon id={card.id === "facebook" ? "facebook" : card.id} />
                </span>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                {badge ? <span className={badge.className}>{badge.label}</span> : null}
              </div>
              <button className="btn primary" type="button" onClick={() => connect(card.id)} disabled={loading}>
                {settings?.status === "connected" ? t("إعادة الربط", "Reconnect") : t("ربط", "Connect")}
              </button>

              {card.id === "facebook" && settings?.status === "connected" ? (
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
                          <select
                            value={settings.leadWelcomeTemplateName}
                            disabled={saving}
                            onChange={(event) => saveLeadAdsSettings({ leadWelcomeTemplateName: event.target.value })}
                          >
                            <option value="">{t("اختر قالبًا", "Choose a template")}</option>
                            {templates.map((template) => (
                              <option key={template.name} value={template.name}>{template.name}</option>
                            ))}
                          </select>
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
      </div>
    </section>
  );
}
