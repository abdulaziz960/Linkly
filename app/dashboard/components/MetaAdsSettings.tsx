"use client";

import CustomSelect from "../../components/CustomSelect";
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { stageDisplayLabel } from "../stage-labels";

type Settings = {
  datasetId: string; datasetName: string; adAccountId: string; adAccountName: string;
  hasToken: boolean; tokenKind: "oauth" | "manual"; tokenExpiresAt: string; tokenExpired: boolean;
  testEventCode: string; enabled: boolean; mapping: Record<string, string>; updatedAt: string;
};
type EventLog = { conversation_id: string; status: string; event_name: string; ok: number; message: string; created_at: string };
type Account = { id: string; name: string; datasets: Array<{ id: string; name: string }> };

/** Meta Ads: sign in with Meta, pick the ad account and dataset (pixel), and choose which event each stage sends. */
export default function MetaAdsSettings() {
  const { t, language } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [manualDatasetId, setManualDatasetId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [showManual, setShowManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function apply(next: Settings) {
    setSettings(next);
    setAccountId(next.adAccountId);
    setDatasetId(next.datasetId);
    setManualDatasetId(next.datasetId);
    setTestEventCode(next.testEventCode);
    setEnabled(next.enabled);
    setMapping(next.mapping);
  }

  const loadAssets = useCallback(async () => {
    try {
      const response = await fetch("/api/meta-ads/assets", { cache: "no-store" });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { accounts: Account[] } } | null;
      if (response.ok && result?.ok && result.data) setAccounts(result.data.accounts);
      else if (result?.error) setFeedback({ type: "error", text: result.error });
    } catch {
      setFeedback({ type: "error", text: t("تعذر الاتصال بميتا", "Could not reach Meta") });
    }
  }, [t]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/meta-ads/settings", { cache: "no-store" });
      const result = await response.json().catch(() => null) as { ok?: boolean; data?: { settings: Settings; statuses: string[]; events: EventLog[] } } | null;
      if (response.ok && result?.ok && result.data) {
        apply(result.data.settings);
        setStatuses(result.data.statuses);
        setEvents(result.data.events);
        if (result.data.settings.hasToken && result.data.settings.tokenKind === "oauth" && !result.data.settings.tokenExpired) void loadAssets();
      }
    } catch {
      // The card simply stays empty.
    }
  }, [loadAssets]);

  useEffect(() => {
    void load();
    // The sign-in popup tells the opener when it finishes.
    function onMessage(event: MessageEvent) {
      if (event.origin === window.location.origin && (event.data as { type?: string } | null)?.type === "audiencew:meta-connected") void load();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [load]);

  function signIn() {
    setFeedback(null);
    window.open("/api/meta-ads/connect", "meta-ads-connect", "width=620,height=760");
  }

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { settings?: Settings; ok?: boolean; message?: string } } | null;
    return { ok: response.ok && Boolean(result?.ok), error: result?.error, data: result?.data };
  }

  async function save(overrides: Record<string, unknown> = {}) {
    setBusy(true);
    setFeedback(null);
    try {
      const account = accounts?.find((item) => item.id === accountId);
      const dataset = account?.datasets.find((item) => item.id === datasetId);
      const body: Record<string, unknown> = { testEventCode, enabled, mapping, ...overrides };
      if (!("datasetId" in overrides)) {
        if (settings?.tokenKind === "oauth" && accounts) {
          body.adAccountId = accountId;
          body.adAccountName = account?.name ?? "";
          body.datasetId = datasetId;
          body.datasetName = dataset?.name ?? "";
        } else {
          body.datasetId = manualDatasetId;
          if (accessToken) body.accessToken = accessToken;
        }
      }
      const result = await request("/api/meta-ads/settings", { method: "PUT", body: JSON.stringify(body) });
      if (!result.ok || !result.data?.settings) {
        setFeedback({ type: "error", text: result.error || t("تعذر الحفظ", "Could not save") });
        return false;
      }
      apply(result.data.settings);
      setAccessToken("");
      const downgraded = enabled && !result.data.settings.enabled;
      setFeedback({
        type: downgraded ? "error" : "success",
        text: downgraded ? t("حُفظت الإعدادات لكن لم يُفعَّل الإرسال: اختر الـ Dataset وسجّل الدخول أو ضع الرمز أولًا.", "Saved, but sending is off: choose a dataset and sign in or add a token first.") : t("تم الحفظ", "Saved")
      });
      return true;
    } catch {
      setFeedback({ type: "error", text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!(await save())) return;
    setBusy(true);
    try {
      const result = await request("/api/meta-ads/test", { method: "POST" });
      setFeedback({ type: result.data?.ok ? "success" : "error", text: result.data?.message || result.error || t("تعذر الإرسال", "Could not send") });
    } catch {
      setFeedback({ type: "error", text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const result = await request("/api/meta-ads/settings", { method: "DELETE" });
      if (result.ok && result.data?.settings) {
        apply(result.data.settings);
        setAccounts(null);
        setFeedback({ type: "success", text: t("تم فصل الربط", "Disconnected") });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return null;

  const box: React.CSSProperties = { border: "1px solid var(--line, #dfe7e5)", borderRadius: 14, padding: 16, background: "var(--surface, #fff)", display: "grid", gap: 14 };
  const fieldLabel: React.CSSProperties = { display: "grid", gap: 6, fontWeight: 700, fontSize: 14 };
  const input: React.CSSProperties = { width: "100%", minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", background: "var(--surface, #fff)", color: "inherit", font: "inherit", fontWeight: 600 };
  const hint: React.CSSProperties = { fontWeight: 400, fontSize: 12.5, opacity: 0.7, lineHeight: 1.6 };
  const sectionTitle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800 };

  const signedIn = settings.hasToken && settings.tokenKind === "oauth" && !settings.tokenExpired;
  const selectedAccount = accounts?.find((item) => item.id === accountId);
  const accountOptions = (accounts ?? []).map((item) => ({ value: item.id, label: item.name }));
  const datasetOptions = (selectedAccount?.datasets ?? []).map((item) => ({ value: item.id, label: item.name }));
  const connectedLabel = settings.datasetId
    ? `${settings.datasetName || settings.datasetId}${settings.adAccountName ? ` — ${settings.adAccountName}` : ""}`
    : "";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ margin: 0, lineHeight: 1.8, opacity: 0.8 }}>
        {t("عند تغيير مرحلة العميل (مؤهل، تم البيع...) نرسل الحدث المقابل إلى Meta فتتعلّم حملاتك أي المحادثات تحوّلت إلى عملاء فعليين. يُرسل فقط للمحادثات التي بدأت من إعلان (نقر إلى واتساب).", "When a customer's stage changes (qualified, sold...) we send the matching event to Meta so your campaigns learn which conversations became real customers. Only conversations that began from an ad (click-to-WhatsApp) are sent.")}
      </p>

      <section style={box}>
        <h4 style={sectionTitle}>{t("ربط حساب ميتا", "Meta account")}</h4>
        {settings.tokenExpired ? (
          <p className="meta-test-feedback error" style={{ margin: 0 }}>{t("انتهت صلاحية الدخول مع ميتا. سجّل الدخول من جديد.", "Your Meta sign-in expired. Sign in again.")}</p>
        ) : null}
        {connectedLabel ? <p style={{ margin: 0, fontWeight: 700 }}>{t("المربوط حاليًا:", "Connected:")} <span dir="ltr">{connectedLabel}</span></p> : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button className="primary-action" type="button" disabled={busy} onClick={signIn}>
            {signedIn ? t("إعادة تسجيل الدخول مع ميتا", "Sign in with Meta again") : t("تسجيل الدخول مع ميتا", "Sign in with Meta")}
          </button>
          {settings.hasToken ? <button className="soft-action" type="button" disabled={busy} onClick={() => void disconnect()}>{t("فصل الربط", "Disconnect")}</button> : null}
        </div>

        {signedIn ? (
          accounts ? (
            accounts.length ? (
              <>
                <label style={fieldLabel}>
                  {t("الحساب الإعلاني", "Ad account")}
                  <CustomSelect value={accountId} onChange={(value) => { setAccountId(value); setDatasetId(""); }} placeholder={t("اختر الحساب الإعلاني", "Choose an ad account")} options={accountOptions} />
                </label>
                <label style={fieldLabel}>
                  {t("البيكسل / Dataset", "Pixel / dataset")}
                  <CustomSelect value={datasetId} onChange={setDatasetId} disabled={!accountId} placeholder={t("اختر البيكسل", "Choose a pixel")} options={datasetOptions} />
                  {accountId && datasetOptions.length === 0 ? <span style={hint}>{t("لا يوجد بيكسل على هذا الحساب. أنشئ Dataset من Events Manager ثم أعد المحاولة.", "No pixel on this account. Create a dataset in Events Manager and try again.")}</span> : null}
                </label>
              </>
            ) : (
              <span style={hint}>{t("لا توجد حسابات إعلانية متاحة لهذا الدخول.", "No ad accounts are available for this sign-in.")}</span>
            )
          ) : (
            <span style={hint}>{t("جارٍ جلب الحسابات الإعلانية…", "Loading ad accounts…")}</span>
          )
        ) : null}

        <button type="button" className="soft-action" style={{ justifySelf: "start" }} onClick={() => setShowManual((value) => !value)}>
          {showManual ? t("إخفاء الإدخال اليدوي", "Hide manual entry") : t("إدخال يدوي (Dataset ID + رمز)", "Manual entry (Dataset ID + token)")}
        </button>
        {showManual ? (
          <>
            <label style={fieldLabel}>
              Dataset ID
              <input dir="ltr" style={input} value={manualDatasetId} onChange={(event) => setManualDatasetId(event.target.value)} placeholder="1234567890123456" />
            </label>
            <label style={fieldLabel}>
              {t("رمز الوصول (System User)", "Access token (System User)")}
              <input dir="ltr" type="password" autoComplete="off" style={input} value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder={settings.hasToken ? t("محفوظ — اتركه فارغًا للإبقاء عليه", "Saved — leave blank to keep it") : "EAAB…"} />
              <span style={hint}>{t("يُخزَّن مشفّرًا ولا يُعرض مرة أخرى. الرمز اليدوي من System User لا تنتهي صلاحيته.", "Stored encrypted and never shown again. A System User token does not expire.")}</span>
            </label>
          </>
        ) : null}

        <label style={fieldLabel}>
          {t("رمز أحداث الاختبار (اختياري)", "Test event code (optional)")}
          <input dir="ltr" style={input} value={testEventCode} onChange={(event) => setTestEventCode(event.target.value)} placeholder="TEST12345" />
          <span style={hint}>{t("من تبويب Test events في Events Manager. عند تعبئته تظهر الأحداث هناك ولا تُحتسب في الحملة. أفرغه بعد الاختبار.", "From the Test events tab in Events Manager. While set, events show there and are not counted. Clear it after testing.")}</span>
        </label>
      </section>

      <section style={box}>
        <div>
          <h4 style={sectionTitle}>{t("الحدث المرسل لكل مرحلة", "Event sent for each stage")}</h4>
          <span style={hint}>{t("اترك الحقل فارغًا إذا لا تريد إرسال شيء لتلك المرحلة. تُستخدم الأسماء نفسها لعملاء النقر إلى واتساب ولعملاء نماذج Lead Ads (بحدث CRM مرتبط بمعرّف الليد).", "Leave a field blank to send nothing for that stage. The same names are used for click-to-WhatsApp customers and for Lead Ads form customers (as a CRM event tied to the lead id).")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 0.8fr) 1.4fr", gap: "10px 12px", alignItems: "center" }}>
          <b style={{ fontSize: 12.5, opacity: 0.7 }}>{t("المرحلة", "Stage")}</b>
          <b style={{ fontSize: 12.5, opacity: 0.7 }}>{t("حدث Meta", "Meta event")}</b>
          {statuses.map((status) => (
            <div key={status} style={{ display: "contents" }}>
              <span style={{ fontWeight: 700 }}>{stageDisplayLabel(status, language === "en" ? "en" : "ar")}</span>
              <input dir="ltr" style={input} aria-label={status} value={mapping[status] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [status]: event.target.value }))} placeholder="Lead / Purchase" />
            </div>
          ))}
        </div>
      </section>

      <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} style={{ width: 18, height: 18 }} />
        {t("تفعيل إرسال الأحداث إلى Meta", "Send events to Meta")}
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button className="primary-action" type="button" disabled={busy} onClick={() => void save()}>{t("حفظ", "Save")}</button>
        <button className="soft-action" type="button" disabled={busy || !(settings.hasToken || accessToken)} onClick={() => void sendTest()}>{t("إرسال حدث تجريبي", "Send a test event")}</button>
      </div>

      {feedback ? <p className={`meta-test-feedback ${feedback.type}`} style={{ margin: 0 }}>{feedback.text}</p> : null}

      {events.length ? (
        <section style={box}>
          <h4 style={sectionTitle}>{t("آخر الأحداث المرسلة", "Recent events")}</h4>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {events.map((event, index) => (
              <li key={`${event.created_at}-${index}`} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 13.5 }}>
                <span style={{ padding: "2px 10px", borderRadius: 999, fontWeight: 700, fontSize: 12.5, background: event.ok ? "#dff3e8" : "#fbe0dc", color: event.ok ? "#14804a" : "#c0392b" }}>
                  {event.ok ? t("نجح", "OK") : t("فشل", "Failed")}
                </span>
                <b dir="ltr">{event.event_name}</b>
                <span style={{ opacity: 0.75 }}>{stageDisplayLabel(event.status, language === "en" ? "en" : "ar")}</span>
                {!event.ok && event.message ? <span style={{ opacity: 0.75 }}>— {event.message}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
