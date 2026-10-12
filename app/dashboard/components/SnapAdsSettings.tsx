"use client";

import CustomSelect from "../../components/CustomSelect";
import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { stageDisplayLabel } from "../stage-labels";

type Settings = { pixelId: string; hasToken: boolean; actionSource: string; enabled: boolean; sendAll: boolean; mapping: Record<string, string>; updatedAt: string };
type EventLog = { conversation_id: string; status: string; event_name: string; ok: number; message: string; created_at: string };

/** Snapchat Ads: the Pixel ID + Conversions API token, and which Snap event each stage sends. */
export default function SnapAdsSettings() {
  const { t, language } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [actionSource, setActionSource] = useState("WEB");
  const [enabled, setEnabled] = useState(false);
  const [sendAll, setSendAll] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function apply(next: Settings) {
    setSettings(next);
    setPixelId(next.pixelId);
    setActionSource(next.actionSource || "WEB");
    setEnabled(next.enabled);
    setSendAll(next.sendAll);
    setMapping(next.mapping);
  }

  async function load() {
    try {
      const response = await fetch("/api/snap-ads/settings", { cache: "no-store" });
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

  async function persist(): Promise<boolean> {
    const response = await fetch("/api/snap-ads/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pixelId, accessToken, actionSource, enabled, sendAll, mapping })
    });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { settings: Settings } } | null;
    if (!response.ok || !result?.ok || !result.data) {
      setFeedback({ type: "error", text: result?.error || t("تعذر الحفظ", "Could not save") });
      return false;
    }
    apply(result.data.settings);
    setAccessToken("");
    const downgraded = enabled && !result.data.settings.enabled;
    setFeedback({
      type: downgraded ? "error" : "success",
      text: downgraded ? t("حُفظت الإعدادات لكن لم يُفعَّل الإرسال: أضف Pixel ID ورمز الوصول أولًا.", "Saved, but sending is off: add the Pixel ID and token first.") : t("تم الحفظ", "Saved")
    });
    return true;
  }

  async function save() {
    setBusy(true);
    setFeedback(null);
    try {
      await persist();
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
      // The test uses the SAVED settings, so save what is on screen first.
      if (!(await persist())) return;
      const response = await fetch("/api/snap-ads/test", { method: "POST" });
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
  const input: React.CSSProperties = { width: "100%", minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", background: "var(--surface, #fff)", color: "inherit", font: "inherit", fontWeight: 600 };
  const hint: React.CSSProperties = { fontWeight: 400, fontSize: 12.5, opacity: 0.7, lineHeight: 1.6 };
  const sectionTitle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ margin: 0, lineHeight: 1.8, opacity: 0.8 }}>
        {t("عند تغيير مرحلة العميل (مؤهل، تم البيع...) نرسل الحدث المقابل إلى Snapchat عبر Conversions API فتتعلّم حملاتك أي العملاء صاروا مبيعات فعلية. يُرسل رقم الجوال مشفّرًا (SHA-256) فقط.", "When a customer's stage changes (qualified, sold...) we send the matching event to Snapchat through the Conversions API so your campaigns learn who became a real sale. Only the SHA-256 hash of the phone is sent.")}
      </p>

      <section style={box}>
        <h4 style={sectionTitle}>{t("بيانات الربط", "Connection")}</h4>
        <label style={fieldLabel}>
          Snap Pixel ID
          <input dir="ltr" style={input} value={pixelId} onChange={(event) => setPixelId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          <span style={hint}>{t("من Events Manager في Snap Ads Manager.", "From Events Manager in Snap Ads Manager.")}</span>
        </label>
        <label style={fieldLabel}>
          {t("رمز Conversions API", "Conversions API token")}
          <input dir="ltr" type="password" autoComplete="off" style={input} value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder={settings.hasToken ? t("محفوظ — اتركه فارغًا للإبقاء عليه", "Saved — leave blank to keep it") : ""} />
          <span style={hint}>{t("يُخزَّن مشفّرًا ولا يُعرض مرة أخرى.", "Stored encrypted and never shown again.")}</span>
        </label>
        <label style={fieldLabel}>
          {t("مصدر الحدث", "Event source")}
          <CustomSelect value={actionSource} onChange={setActionSource} options={[
            { value: "WEB", label: t("الويب (WEB)", "Web (WEB)") },
            { value: "OFFLINE", label: t("غير متصل (OFFLINE)", "Offline (OFFLINE)") }
          ]} />
          <span style={hint}>{t("اختر ما يطابق نوع الحدث في Events Manager الخاص بك.", "Choose what matches the event type in your Events Manager.")}</span>
        </label>
      </section>

      <section style={box}>
        <div>
          <h4 style={sectionTitle}>{t("الحدث المرسل لكل مرحلة", "Event sent for each stage")}</h4>
          <span style={hint}>{t("اترك الحقل فارغًا إذا لا تريد إرسال شيء لتلك المرحلة. أمثلة: SIGN_UP، PURCHASE، SAVE، START_CHECKOUT.", "Leave a field blank to send nothing for that stage. Examples: SIGN_UP, PURCHASE, SAVE, START_CHECKOUT.")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 0.8fr) 1.4fr", gap: "10px 12px", alignItems: "center" }}>
          <b style={{ fontSize: 12.5, opacity: 0.7 }}>{t("المرحلة", "Stage")}</b>
          <b style={{ fontSize: 12.5, opacity: 0.7 }}>{t("حدث Snapchat", "Snapchat event")}</b>
          {statuses.map((status) => (
            <div key={status} style={{ display: "contents" }}>
              <span style={{ fontWeight: 700 }}>{stageDisplayLabel(status, language === "en" ? "en" : "ar")}</span>
              <input dir="ltr" style={input} aria-label={status} value={mapping[status] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [status]: event.target.value }))} placeholder="SIGN_UP / PURCHASE" />
            </div>
          ))}
        </div>
      </section>

      <label style={{ display: "grid", gap: 4, cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}>
          <input type="checkbox" checked={sendAll} onChange={(event) => setSendAll(event.target.checked)} style={{ width: 18, height: 18 }} />
          {t("أرسل لكل المحادثات، وليس محادثات الإعلانات فقط", "Send for every conversation, not only ad conversations")}
        </span>
        <span style={{ fontWeight: 400, fontSize: 12.5, opacity: 0.7, lineHeight: 1.6 }}>
          {t("الافتراضي: تُرسل الأحداث فقط للمحادثات التي جاءت من إعلان. تفعيل هذا يرسل رقم جوال (مشفّر) كل عميل تتغير مرحلته، حتى من لم يأتِ من إعلان.", "By default events are sent only for conversations that came from an ad. Turning this on sends the (hashed) phone of every customer whose stage changes, even ones that did not come from an ad.")}
        </span>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} style={{ width: 18, height: 18 }} />
        {t("تفعيل إرسال الأحداث إلى Snapchat", "Send events to Snapchat")}
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button className="primary-action" type="button" disabled={busy} onClick={() => void save()}>{t("حفظ", "Save")}</button>
        <button className="soft-action" type="button" disabled={busy || !(settings.hasToken || accessToken)} onClick={() => void sendTest()}>{t("التحقق بحدث تجريبي", "Validate with a test event")}</button>
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
