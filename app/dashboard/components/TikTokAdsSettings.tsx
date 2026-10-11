"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Settings = { eventSetId: string; hasToken: boolean; eventSource: string; testEventCode: string; enabled: boolean; mapping: Record<string, string>; updatedAt: string };
type EventLog = { conversation_id: string; status: string; event_name: string; ok: number; message: string; created_at: string };

/** TikTok Ads: the Event Set + token, and which TikTok event each lead status sends. */
export default function TikTokAdsSettings() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [eventSetId, setEventSetId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [eventSource, setEventSource] = useState("crm");
  const [enabled, setEnabled] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function apply(next: Settings) {
    setSettings(next);
    setEventSetId(next.eventSetId);
    setTestEventCode(next.testEventCode);
    setEventSource(next.eventSource || "crm");
    setEnabled(next.enabled);
    setMapping(next.mapping);
  }

  async function load() {
    try {
      const response = await fetch("/api/tiktok-ads/settings", { cache: "no-store" });
      const result = await response.json().catch(() => null) as { ok?: boolean; data?: { settings: Settings; statuses: string[]; events: EventLog[] } } | null;
      if (response.ok && result?.ok && result.data) {
        apply(result.data.settings);
        setStatuses(result.data.statuses);
        setEvents(result.data.events);
      }
    } catch {
      // The card simply stays empty.
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/tiktok-ads/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventSetId, accessToken, testEventCode, eventSource, enabled, mapping })
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { settings: Settings } } | null;
      if (!response.ok || !result?.ok || !result.data) {
        setFeedback({ type: "error", text: result?.error || t("تعذر الحفظ", "Could not save") });
      } else {
        apply(result.data.settings);
        setAccessToken("");
        const downgraded = enabled && !result.data.settings.enabled;
        setFeedback({ type: downgraded ? "error" : "success", text: downgraded ? t("حُفظت الإعدادات لكن لم يُفعَّل الإرسال: أضف Event Set ID ورمز الوصول أولًا.", "Saved, but sending stays off: add the Event Set ID and access token first.") : t("تم الحفظ", "Saved") });
      }
    } catch {
      setFeedback({ type: "error", text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/tiktok-ads/test", { method: "POST" });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { ok: boolean; message: string } } | null;
      setFeedback({ type: result?.data?.ok ? "success" : "error", text: result?.data?.message || result?.error || t("تعذر الإرسال", "Could not send") });
    } catch {
      setFeedback({ type: "error", text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return null;

  const box: React.CSSProperties = { border: "1px solid var(--line, #dfe7e5)", borderRadius: 14, padding: 16, background: "var(--surface, #fff)", display: "grid", gap: 14 };
  const fieldLabel: React.CSSProperties = { display: "grid", gap: 6, fontWeight: 700, fontSize: 14 };
  const input: React.CSSProperties = { width: "100%", minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", background: "var(--surface, #fff)", color: "inherit", font: "inherit", fontWeight: 500 };
  const hint: React.CSSProperties = { fontWeight: 400, fontSize: 12.5, opacity: 0.7, lineHeight: 1.6 };
  const sectionTitle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ margin: 0, lineHeight: 1.8, opacity: 0.8 }}>
        {t("عند تغيير حالة العميل المحتمل في المحادثة (مؤهل، مهتم...) نرسل الحدث المقابل إلى TikTok لتتعلّم حملاتك من يتحوّل إلى عميل فعلي.", "When a conversation's lead status changes (qualified, interested...), the matching event is sent to TikTok so your campaigns learn who becomes a real customer.")}
      </p>

      <section style={box}>
        <h4 style={sectionTitle}>{t("بيانات الربط", "Connection")}</h4>
        <label style={fieldLabel}>
          Event Set ID
          <input dir="ltr" style={input} value={eventSetId} onChange={(event) => setEventSetId(event.target.value)} placeholder="CTM12345" />
        </label>
        <label style={fieldLabel}>
          {t("نوع المصدر", "Source type")}
          <select style={input} value={eventSource} onChange={(event) => setEventSource(event.target.value)}>
            <option value="web">{t("Pixel (web) — معرّف Pixel من 20 حرفًا", "Pixel (web) — a 20-character Pixel code")}</option>
            <option value="crm">{t("CRM — معرّف مجموعة أحداث CRM/المراسلة", "CRM — a CRM / messaging event set ID")}</option>
            <option value="app">{t("تطبيق (app)", "App")}</option>
            <option value="offline">{t("أحداث غير متصلة (offline)", "Offline events")}</option>
          </select>
          <span style={hint}>{t("يجب أن يطابق نوع المعرّف أعلاه، وإلا ترفض TikTok الطلب (event_source_id).", "Must match the ID above, otherwise TikTok rejects the request (event_source_id).")}</span>
        </label>
        <label style={fieldLabel}>
          {t("رمز الوصول (Access Token)", "Access token")}
          <input dir="ltr" type="password" autoComplete="off" style={input} value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder={settings.hasToken ? t("محفوظ — اتركه فارغًا للإبقاء عليه", "Saved — leave blank to keep it") : ""} />
          <span style={hint}>{t("يُخزَّن مشفّرًا ولا يُعرض مرة أخرى.", "Stored encrypted and never shown again.")}</span>
        </label>
        <label style={fieldLabel}>
          {t("رمز أحداث الاختبار (اختياري)", "Test event code (optional)")}
          <input dir="ltr" style={input} value={testEventCode} onChange={(event) => setTestEventCode(event.target.value)} placeholder="TEST12345" />
          <span style={hint}>{t("عند تعبئته تظهر الأحداث في تبويب Test events في TikTok ولا تُحتسب في الحملة.", "When set, events appear under Test events in TikTok and are not counted for the campaign.")}</span>
        </label>
      </section>

      <section style={box}>
        <div>
          <h4 style={sectionTitle}>{t("الحدث المرسل لكل حالة", "Event sent for each status")}</h4>
          <span style={hint}>{t("اترك الحقل فارغًا إذا لا تريد إرسال شيء لتلك الحالة.", "Leave a field blank to send nothing for that status.")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 0.8fr) 1.4fr", gap: "10px 12px", alignItems: "center" }}>
          <b style={{ fontSize: 12.5, opacity: 0.7 }}>{t("حالة العميل", "Lead status")}</b>
          <b style={{ fontSize: 12.5, opacity: 0.7 }}>{t("حدث TikTok", "TikTok event")}</b>
          {statuses.map((status) => (
            <div key={status} style={{ display: "contents" }}>
              <span style={{ fontWeight: 700 }}>{status}</span>
              <input dir="ltr" style={input} aria-label={status} value={mapping[status] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [status]: event.target.value }))} placeholder="Lead / Purchase" />
            </div>
          ))}
        </div>
      </section>

      <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} style={{ width: 18, height: 18 }} />
        {t("تفعيل إرسال الأحداث إلى TikTok", "Send events to TikTok")}
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button className="primary-action" type="button" disabled={busy} onClick={() => void save()}>{t("حفظ", "Save")}</button>
        <button className="soft-action" type="button" disabled={busy || !settings.hasToken} onClick={() => void sendTest()}>{t("إرسال حدث تجريبي", "Send a test event")}</button>
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
                <span style={{ opacity: 0.75 }}>{event.status}</span>
                {!event.ok && event.message ? <span style={{ opacity: 0.75 }}>— {event.message}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
