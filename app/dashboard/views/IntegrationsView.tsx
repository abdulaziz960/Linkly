"use client";

import { confirmDialog } from "../../../lib/ui-dialogs";

import CustomSelect from "../../components/CustomSelect";
import TikTokAdsSettings from "../components/TikTokAdsSettings";
import MetaAdsSettings from "../components/MetaAdsSettings";
import SnapAdsSettings from "../components/SnapAdsSettings";
import SnapAdAccountPicker from "../components/SnapAdAccountPicker";
import QuickWelcomeTemplate from "../components/QuickWelcomeTemplate";
import PlatformActivityModal from "../components/PlatformActivityModal";
import TikTokAdAccountPicker, { type TikTokAdvertiser } from "../components/TikTokAdAccountPicker";
import { UsersIcon } from "../components/ActionIcons";
import StoreSettings from "../components/StoreSettings";
import { useEffect, useRef, useState } from "react";
import { PageHero } from "../components/PageHero";
import { useLanguage } from "../i18n";
import { usePlanAccess } from "../plan-access-context";
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
  tiktok: "/api/tiktok-ads/connect"
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
  const { language, t } = useLanguage();
  const [settingsByChannel, setSettingsByChannel] = useState<Partial<Record<LeadChannel, IntegrationSettings>>>({});
  const [eventsEnabled, setEventsEnabled] = useState<Partial<Record<Platform, boolean>>>({});
  const [templates, setTemplates] = useState<Array<{ name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Platform | null>(null);
  const [tab, setTab] = useState<Tab>("receive");
  const [storeOpen, setStoreOpen] = useState<"salla" | "zid" | "shopify" | null>(null);
  const storeDialogRef = useRef<HTMLDialogElement>(null);
  const storeTriggerRef = useRef<HTMLButtonElement>(null);
  const [storeConnected, setStoreConnected] = useState<Partial<Record<"salla" | "zid" | "shopify", boolean>>>({});
  const [tiktokLeads, setTiktokLeads] = useState<{ configured: boolean; authorized: boolean; connected: boolean; advertisers: TikTokAdvertiser[]; selectedId: string } | null>(null);
  const [activity, setActivity] = useState<{ platform: Platform; kind: "leads" | "events" } | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const dialog = storeDialogRef.current;
    if (!storeOpen || !dialog) return;
    const trigger = storeTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [storeOpen]);

  function closeStoreSettings() {
    setStoreOpen(null);
    loadStoreConnections();
  }

  function loadStoreConnections() {
    (["salla", "zid", "shopify"] as const).forEach((store) => {
      fetch(`/api/store-integrations/${store}/connection`, { cache: "no-store" })
        .then((response) => response.json())
        .then((result: { ok?: boolean; data?: { connection?: { status?: string } } }) => {
          if (result?.ok) setStoreConnected((current) => ({ ...current, [store]: result.data?.connection?.status === "connected" }));
        })
        .catch(() => null);
    });
  }

  const [sallaPending, setSallaPending] = useState<{ merchantName: string } | null>(null);

  useEffect(() => {
    loadStoreConnections();
    // A store installed from Salla with this owner's email waits for a confirmation here.
    fetch("/api/salla/claim", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { pending?: { merchantName?: string } | null }) => setSallaPending(result?.pending ? { merchantName: result.pending.merchantName || "" } : null))
      .catch(() => null);
  }, []);

  async function claimSalla() {
    const response = await fetch("/api/salla/claim", { method: "POST" });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (response.ok) {
      setSallaPending(null);
      loadStoreConnections();
      setNotice({ type: "success", message: t("تم ربط متجر سلة بحسابك.", "Your Salla store is now linked to your account.") });
    } else {
      setNotice({ type: "error", message: result.error || t("تعذر الربط.", "Could not link the store.") });
    }
  }

  function loadTemplates() {
    fetch("/api/templates")
      .then((response) => response.json())
      .then((result: { ok: boolean; data?: Array<{ name: string; status?: string }> }) => {
        if (!result?.ok) return;
        setTemplates((result.data || []).filter((template) => template.status === "معتمد").map((template) => ({ name: template.name })));
      })
      .catch(() => null);
  }

  // Meta Lead Ads connection results come back as ?meta=<result>.
  useEffect(() => {
    const meta = new URLSearchParams(window.location.search).get("meta") || "";
    const failures: Record<string, { ar: string; en: string }> = {
      "leads-not-configured": { ar: "ربط نماذج ميتا غير مكتمل الإعداد على الخادم.", en: "Lead Ads linking isn't fully configured on the server." },
      "leads-token-error": { ar: "رفضت ميتا إكمال الربط. أعد المحاولة، وإن تكرر الخطأ تواصل مع الدعم.", en: "Meta rejected the connection. Try again, and contact support if it repeats." },
      "leads-no-page": { ar: "لم تُرجع ميتا أي صفحة لحسابك. تأكد أنك اخترت صفحة في نافذة ميتا وأنك مدير لها، ثم أعد المحاولة.", en: "Meta returned no Page for your account. Make sure you picked a Page you manage in Meta's dialog, then try again." },
      "channel-in-use": { ar: "هذه الصفحة مرتبطة بمساحة عمل أخرى في حسابك. افصلها منها أولًا.", en: "This Page is linked to another workspace in your account. Unlink it there first." }
    };
    const failure = failures[meta];
    if (!failure) return;
    setNotice({ type: "error", message: t(failure.ar, failure.en) });
    window.history.replaceState(null, "", "/dashboard?view=integrations");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The connect/callback routes come back here with ?snapchat=<result> or ?tiktok=<result>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const platform = params.get("snapchat") ? "snapchat" : params.get("tiktok") ? "tiktok" : null;
    if (!platform) return;
    const result = params.get(platform) || "";
    const name = platform === "snapchat" ? t("سناب شات", "Snapchat") : t("تيك توك", "TikTok");
    const messages: Record<string, { type: "success" | "error"; ar: string; en: string }> = {
      connected: { type: "success", ar: `تم ربط ${name} بنجاح.`, en: `${name} connected.` },
      "missing-credentials": { type: "error", ar: `ربط ${name} غير مفعّل بعد: لم تُضبط بيانات التطبيق لدى المنصة. تواصل مع الدعم.`, en: `${name} linking isn't enabled yet: the app credentials aren't configured. Contact support.` },
      forbidden: { type: "error", ar: "لا تملك صلاحية ربط التكاملات.", en: "You don't have permission to connect integrations." },
      "plan-upgrade-needed": { type: "error", ar: `ربط ${name} غير متاح في باقتك الحالية.`, en: `${name} isn't included in your current plan.` },
      "invalid-state": { type: "error", ar: "انتهت مهلة الربط. أعد المحاولة.", en: "The connection timed out. Try again." },
      "token-error": { type: "error", ar: `رفض ${name} طلب الربط. أعد المحاولة.`, en: `${name} rejected the connection. Try again.` },
      choose: { type: "success", ar: `تم تفويض ${name}. اختر الحساب الإعلاني من القائمة ليبدأ وصول العملاء.`, en: `${name} authorized. Choose the ad account to start receiving leads.` },
      "no-advertiser": { type: "error", ar: `لم يمنح ${name} الوصول لأي حساب إعلاني. أعد الربط واختر حسابك الإعلاني.`, en: `${name} didn't grant access to any ad account. Connect again and pick your ad account.` },
      "subscription-error": { type: "error", ar: `ربطنا ${name} لكن تعذّر الاشتراك في وصول العملاء. تأكد أنك مدير (Admin) للحساب الإعلاني وأعد المحاولة.`, en: `${name} linked, but subscribing to new leads failed. Make sure you are an Admin of the ad account and try again.` }
    };
    const entry = messages[result] ?? { type: result === "connected" ? "success" : "error", ar: `تعذّر ربط ${name} (${result}).`, en: `Could not connect ${name} (${result}).` };
    setNotice({ type: entry.type, message: t(entry.ar, entry.en) });
    // After TikTok authorizes, the ad account is picked right in its dialog.
    if (platform === "tiktok" && (result === "choose" || result === "connected")) { setTab("receive"); setOpen("tiktok"); }
    window.history.replaceState(null, "", "/dashboard?view=integrations");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    fetch("/api/tiktok-ads/connection", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; data?: { configured: boolean; authorized: boolean; connected: boolean; advertisers: TikTokAdvertiser[]; selectedId: string } }) => { if (!cancelled && result?.ok && result.data) setTiktokLeads(result.data); })
      .catch(() => null);
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

  async function saveLeadAdsSettings(channel: LeadChannel, next: Partial<IntegrationSettings>) {
    const current = settingsByChannel[channel];
    if (!current) return;
    const merged = { ...current, ...next };
    setSettingsByChannel((prev) => ({ ...prev, [channel]: merged }));
    setSaving(true);
    try {
      await fetch(`/api/settings/integration?channel=${channel}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged)
      });
    } finally {
      setSaving(false);
    }
  }

  async function disconnectTikTok() {
    if (!(await confirmDialog(t("فك الربط سيوقف استقبال العملاء من تيك توك حتى تربطه من جديد. هل تريد المتابعة؟", "Unlinking stops receiving customers from TikTok until you connect it again. Continue?"), { tone: "danger", confirmLabel: t("فك الربط", "Unlink"), cancelLabel: t("تراجع", "Cancel") }))) return;
    setSaving(true);
    try {
      const response = await fetch("/api/tiktok-ads/connection", { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || t("تعذر فك الربط.", "Could not unlink."));
      setTiktokLeads((current) => (current ? { ...current, authorized: false, connected: false, advertisers: [], selectedId: "" } : current));
      setNotice({ type: "success", message: t("تم فك الربط.", "Unlinked.") });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : t("تعذر فك الربط.", "Could not unlink.") });
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(channel: LeadChannel) {
    if (!(await confirmDialog(t("فك الربط سيوقف استقبال العملاء من هذه المنصة حتى تربطها من جديد. هل تريد المتابعة؟", "Unlinking stops receiving customers from this platform until you connect it again. Continue?"), { tone: "danger", confirmLabel: t("فك الربط", "Unlink"), cancelLabel: t("تراجع", "Cancel") }))) return;
    setSaving(true);
    try {
      const response = await fetch("/api/settings/integration/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || t("تعذر فك الربط.", "Could not unlink."));
      setSettingsByChannel((current) => (current[channel] ? { ...current, [channel]: { ...current[channel]!, status: "pending", leadAdsEnabled: 0 } } : current));
      setNotice({ type: "success", message: t("تم فك الربط.", "Unlinked.") });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : t("تعذر فك الربط.", "Could not unlink.") });
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
  const leadsConnected = open === "tiktok" ? Boolean(tiktokLeads?.connected) : currentSettings?.status === "connected";
  // TikTok authorized but no ad account chosen yet: the dialog still shows Unlink and the picker.
  const showUnlink = open === "tiktok" ? Boolean(tiktokLeads?.authorized) : leadsConnected;

  // Plans below the large one link Salla only: the ad platforms stay a large-plan feature.
  const adIntegrations = usePlanAccess().access.adIntegrations;

  return (
    <section className="page-stack settings-page">
      {adIntegrations ? (
      <>
      <PageHero
        eyebrow={t("الإعدادات والربط", "SETTINGS & CONNECTIONS")}
        title={t("التكاملات", "Integrations")}
        description={t("اربط منصات الإعلانات لاستقبال العملاء المحتملين، وأرسل إليها نتائج المحادثات لتتحسن حملاتك.", "Connect your ad platforms to receive leads and send them conversation results so your campaigns improve.")}
        chips={[t(`${platforms.filter((platform) => settingsByChannel[leadChannelOf[platform.id]]?.status === "connected").length} منصة متصلة`, `${platforms.filter((platform) => settingsByChannel[leadChannelOf[platform.id]]?.status === "connected").length} connected`), t(`${platforms.filter((platform) => eventsEnabled[platform.id]).length} أحداث مفعّلة`, `${platforms.filter((platform) => eventsEnabled[platform.id]).length} events on`)]}
      />
      {notice ? <div className={`automation-feedback ${notice.type}`} role="status">{notice.message}</div> : null}

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
                  {statusPill(platform.id === "tiktok" ? Boolean(tiktokLeads?.connected) : receiving, t("الاستقبال: متصل", "Receiving: connected"), t("الاستقبال: غير متصل", "Receiving: not connected"))}
                  {statusPill(Boolean(eventsEnabled[platform.id]), t("الأحداث: مفعّلة", "Events: on"), t("الأحداث: متوقفة", "Events: off"))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="btn primary" type="button" onClick={() => openPlatform(platform.id, "receive")} disabled={loading}>
                  {t("إعداد", "Set up")}
                </button>
                <button className="icon-btn" type="button" title={t("عملاء المنصة", "Platform customers")} aria-label={t("عملاء المنصة", "Platform customers")} onClick={() => setActivity({ platform: platform.id, kind: "leads" })}>
                  {UsersIcon}
                </button>
                <button className="icon-btn" type="button" title={t("سجل التحويلات", "Conversions log")} aria-label={t("سجل التحويلات", "Conversions log")} onClick={() => setActivity({ platform: platform.id, kind: "events" })}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      </>
      ) : null}

      {sallaPending ? (
        <div className="account-note" role="status" style={{ marginBottom: 12 }}>
          <b>{t("متجر سلة بانتظار الربط", "A Salla store is waiting to be linked")}</b>
          <p>{t(`ثبّت أحدهم تطبيق Linkly من متجر سلة${sallaPending.merchantName ? ` (${sallaPending.merchantName})` : ""} باستخدام بريدك. اربطه بهذا الحساب؟ يبقى الدفع على اشتراكك الحالي في Linkly.`, `Linkly was installed from a Salla store${sallaPending.merchantName ? ` (${sallaPending.merchantName})` : ""} using your email. Link it to this account? Billing stays on your current Linkly subscription.`)}</p>
          <button className="btn primary" type="button" onClick={claimSalla}>{t("ربط المتجر", "Link the store")}</button>
        </div>
      ) : null}

      <div className="channels-overview-head" style={{ marginTop: adIntegrations ? 8 : 0 }}>
        <div>
          <h2>{adIntegrations ? t("المتاجر الإلكترونية: سلة وزد وشوبيفاي", "E-commerce stores: Salla and Zid, plus Shopify") : t("تكامل سلة وزد", "Salla and Zid integrations")}</h2>
          <p>{adIntegrations ? t("اربط متجرك لتتابع طلبات العملاء وسلاتهم المتروكة وترسل إشعارات واتساب.", "Connect your store to follow orders and abandoned carts and send WhatsApp notifications.") : t("اربط متجرك في سلة لمتابعة الطلبات والسلات المتروكة. ربط زد يبدأ من باقة المؤسسات الكبيرة.", "Connect your Salla store to follow orders and abandoned carts. Zid requires Large Enterprises or above.")}</p>
        </div>
      </div>

      <div className="channel-grid">
        {[
          { id: "salla", logo: "/brands/salla.png", title: t("سلة", "Salla"), description: t("طلبات المتجر والعملاء والسلات المتروكة، وإشعارات الطلب على واتساب.", "Store orders, customers and abandoned carts, with order updates on WhatsApp.") },
          { id: "zid", logo: "/brands/zid.svg", title: t("زد", "Zid"), description: t("طلبات المتجر والعملاء والسلات المتروكة، وإشعارات الطلب على واتساب.", "Store orders, customers and abandoned carts, with order updates on WhatsApp.") },
          { id: "shopify", logo: "/brands/shopify.svg", title: t("شوبيفاي", "Shopify"), description: t("طلبات المتجر والعملاء والسلات المتروكة، وإشعارات الطلب على واتساب.", "Store orders, customers and abandoned carts, with order updates on WhatsApp.") }
        ].filter((store) => adIntegrations || store.id === "salla").map((store) => (
          <div key={store.id} className="meta-test-card">
            <div>
              <span className="channel-icon" aria-hidden="true" style={{ display: "grid", placeItems: "center", background: "var(--surface-soft, #f3f7f6)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={store.logo} alt="" width={36} height={36} style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 8 }} />
              </span>
              <h3>{store.title}</h3>
              <p>{store.description}</p>
              {statusPill(Boolean(storeConnected[store.id as "salla" | "zid" | "shopify"]), t("متصل", "Connected"), t("غير متصل", "Not connected"))}
            </div>
            <button
              className="btn primary"
              type="button"
              aria-haspopup="dialog"
              onClick={(event) => {
                storeTriggerRef.current = event.currentTarget;
                setStoreOpen(store.id as "salla" | "zid" | "shopify");
              }}
            >{t(`إعدادات متجر ${store.title}`, `${store.title} store settings`)}</button>
          </div>
        ))}
      </div>

      {storeOpen ? (
        <dialog
          ref={storeDialogRef}
          className="store-settings-dialog"
          dir={language === "en" ? "ltr" : "rtl"}
          aria-labelledby="store-settings-title"
          onCancel={(event) => { event.preventDefault(); closeStoreSettings(); }}
          onClick={(event) => { if (event.target === event.currentTarget) closeStoreSettings(); }}
        >
          <div className="account-modal form-modal">
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={closeStoreSettings}>×</button>
              <h2 id="store-settings-title">{storeOpen === "salla" ? t("إعدادات متجر سلة", "Salla store settings") : storeOpen === "shopify" ? t("إعدادات متجر شوبيفاي", "Shopify store settings") : t("إعدادات متجر زد", "Zid store settings")}</h2>
            </header>
            <div className="account-modal-body">
              <StoreSettings store={storeOpen} onSaved={closeStoreSettings} />
            </div>
          </div>
        </dialog>
      ) : null}

      {activity ? (
        <PlatformActivityModal
          platform={activity.platform}
          kind={activity.kind}
          title={`${activity.kind === "leads" ? t("عملاء", "Customers of") : t("سجل تحويلات", "Conversions of")} ${platforms.find((platform) => platform.id === activity.platform)?.title ?? ""}`}
          onClose={() => setActivity(null)}
        />
      ) : null}

      {open && current ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpen(null)}>
          <div className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={current.title} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setOpen(null)}>×</button>
              <h2>{current.title}</h2>
            </header>
            <div className="account-modal-body" style={{ gridAutoRows: "max-content", alignContent: "start" }}>
              <div className="pipeline-tabs" role="tablist" aria-label={t("أقسام التكامل", "Integration sections")} style={{ marginTop: 0, marginBottom: 14 }}>
                <button type="button" role="tab" aria-selected={tab === "receive"} onClick={() => setTab("receive")}>{t("استقبال العملاء", "Receive customers")}</button>
                <button type="button" role="tab" aria-selected={tab === "events"} onClick={() => setTab("events")}>{t("ربط الأحداث", "Event feedback")}</button>
              </div>

              {tab === "events" ? (
                open === "meta" ? <MetaAdsSettings /> : open === "tiktok" ? <TikTokAdsSettings /> : <SnapAdsSettings />
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  <p style={{ margin: 0, lineHeight: 1.8, opacity: 0.8 }}>
                    {open === "meta"
                      ? t("عند ملء العميل لنموذج إعلانك يصل مباشرة إلى لنكلي كعميل محتمل ومحادثة، ويُرسل له قالب ترحيب على واتساب.", "When a customer fills in your ad form, it arrives in Linkly as a lead and conversation, and a welcome template is sent on WhatsApp.")
                      : open === "tiktok"
                      ? t("اربط حسابك الإعلاني في تيك توك، وكل عميل يملأ نموذج Instant Form يصل مباشرة إلى لنكلي كعميل محتمل ومحادثة، مع ترحيب على واتساب إن فعّلته (يلزم أن تكون مديرًا للحساب الإعلاني).", "Link your TikTok ad account and every Instant Form lead arrives in Linkly as a lead and conversation, with a WhatsApp welcome if you turn it on (you must be an Admin of the ad account).")
                      : t("عند ملء العميل لنموذج إعلانك يصل مباشرة إلى لنكلي كعميل محتمل، ويمكنك إرسال رسالة ترحيب له على واتساب (يلزم رقم جوال في النموذج وقالب معتمد وواتساب مربوط).", "When a customer fills in your ad form, it arrives in Linkly as a lead, and you can send them a WhatsApp welcome (needs a phone field in the form, an approved template and a connected WhatsApp).")}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <button className="btn primary" type="button" onClick={() => connect(leadChannelOf[open])} disabled={loading}>
                      {showUnlink ? t("إعادة الربط", "Reconnect") : t("ربط", "Connect")}
                    </button>
                    {showUnlink ? (
                      <button className="btn danger" type="button" style={{ background: "#b91c1c", borderColor: "#b91c1c", color: "#fff" }} onClick={() => void (open === "tiktok" ? disconnectTikTok() : disconnect(leadChannelOf[open]))} disabled={saving || loading}>
                        {t("فك الربط", "Unlink")}
                      </button>
                    ) : null}
                    {statusPill(leadsConnected, t("متصل", "Connected"), t("غير متصل", "Not connected"))}
                  </div>

                  {open === "snapchat" && leadsConnected ? <SnapAdAccountPicker /> : null}
                  {open === "tiktok" && tiktokLeads?.authorized ? (
                    <TikTokAdAccountPicker advertisers={tiktokLeads.advertisers} selectedId={tiktokLeads.selectedId} onSelected={(advertiserId) => setTiktokLeads((current) => (current ? { ...current, connected: true, selectedId: advertiserId } : current))} />
                  ) : null}

                  {(open === "meta" || open === "snapchat" || open === "tiktok") && leadsConnected && currentSettings ? (
                    <>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={currentSettings.leadAdsEnabled === 1}
                          disabled={saving}
                          onChange={(event) => saveLeadAdsSettings(leadChannelOf[open], { leadAdsEnabled: event.target.checked ? 1 : 0 })}
                        />
                        {open === "snapchat" || open === "tiktok" ? t("إرسال رسالة ترحيب على واتساب فور وصول العميل", "Send a WhatsApp welcome as soon as the lead arrives") : t("تفعيل الترحيب التلقائي من Lead Ads", "Enable automatic Lead Ads welcome")}
                      </label>
                      {currentSettings.leadAdsEnabled === 1 ? (
                        <div className="meta-test-grid">
                          <label>
                            {t("قالب الترحيب", "Welcome template")}
                            {templates.length ? (
                              <CustomSelect
                                value={currentSettings.leadWelcomeTemplateName}
                                disabled={saving}
                                onChange={(value) => saveLeadAdsSettings(leadChannelOf[open], { leadWelcomeTemplateName: value })}
                                options={[{ value: "", label: t("اختر قالبًا", "Choose a template") }, ...(currentSettings.leadWelcomeTemplateName && !templates.some((template) => template.name === currentSettings.leadWelcomeTemplateName) ? [{ value: currentSettings.leadWelcomeTemplateName, label: `${currentSettings.leadWelcomeTemplateName} (${t("قيد المراجعة", "pending")})` }] : []), ...templates.map((template) => ({ value: template.name, label: template.name }))]}
                              />
                            ) : (
                              <p className="meta-test-warning">{t("ما فيه قوالب معتمدة على حسابك بعد.", "Your account has no approved templates yet.")}</p>
                            )}
                          </label>
                        </div>
                      ) : null}
                      {currentSettings.leadAdsEnabled === 1 ? <QuickWelcomeTemplate onCreated={loadTemplates} autoOpen={!currentSettings.leadWelcomeTemplateName} onSubmitted={(name) => void saveLeadAdsSettings(leadChannelOf[open], { leadWelcomeTemplateName: name })} /> : null}
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
