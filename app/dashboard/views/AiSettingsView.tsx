"use client";

import { confirmDialog } from "../../../lib/ui-dialogs";

import CustomSelect from "../../components/CustomSelect";
import { useEffect, useState, type FormEvent } from "react";
import { aiProviders, type AiSettingsPublic } from "../../../lib/ai-types";
import type { AiUsageSummary } from "../../../lib/ai-usage-summary";
import { ECONOMY_MODEL } from "../../../lib/ai-economy";
import { useLanguage } from "../i18n";
import { KpiRow, PageHero } from "../components/PageHero";

type Usage = { id: string; createdAt: string; provider: string; model: string; operation: string; status: string; inputTokens: number | null; outputTokens: number | null; estimatedCost: number | null };
type Payload = { settings: AiSettingsPublic; dailyUsed: number; monthlyUsed: number; events: Usage[]; summary?: AiUsageSummary };

export default function AiSettingsView() {
  const { t } = useLanguage();
  const [data, setData] = useState<Payload | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/settings", { signal: controller.signal }).then((response) => response.json()).then((body) => {
      if (body.ok) setData(body.data); else setFeedback(body.error || "تعذر تحميل الإعدادات");
    }).catch(() => { if (!controller.signal.aborted) setFeedback("تعذر تحميل الإعدادات"); });
    return () => controller.abort();
  }, []);
  const settings = data?.settings;
  const [managedSaving, setManagedSaving] = useState(false);
  function update(patch: Partial<AiSettingsPublic>) { setData((current) => current ? { ...current, settings: { ...current.settings, ...patch } } : current); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    // Checked here so the owner gets a clear reason instead of a silent no-op later in the inbox.
    if (!Number.isInteger(settings.dailyLimit) || !Number.isInteger(settings.monthlyLimit) || settings.dailyLimit < 0 || settings.monthlyLimit < 0) {
      setFeedback(t("الحدان اليومي والشهري يجب أن يكونا أرقامًا صحيحة غير سالبة.", "Daily and monthly limits must be whole numbers, zero or more."));
      return;
    }
    if (settings.dailyLimit > settings.monthlyLimit) {
      setFeedback(t("الحد اليومي لا يمكن أن يتجاوز الحد الشهري.", "The daily limit cannot exceed the monthly limit."));
      return;
    }
    if (settings.enabled && !settings.hasKey && !apiKey.trim() && !settings.managedAvailable) {
      setFeedback(t("أدخل مفتاح API أولًا: باقتك الحالية لا تشمل المساعد المُدار من Linkly.", "Enter an API key first: your current plan does not include the Linkly-managed assistant."));
      return;
    }
    setSaving(true); setFeedback("");
    try {
      const response = await fetch("/api/ai/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, apiKey }) });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error || t("تعذر الحفظ", "Couldn't save"));
      update(body.data); setApiKey(""); setFeedback(t("تم حفظ إعدادات AI", "AI settings saved"));
    } catch (error) { setFeedback(error instanceof Error ? error.message : t("تعذر الحفظ", "Couldn't save")); }
    finally { setSaving(false); }
  }
  // Explicitly switching to managed mode clears BYOK on the server; a
  // normal blank-key save must continue to retain the existing key.
  async function saveManaged(enabled: boolean) {
    if (!settings) return;
    setManagedSaving(true); setFeedback("");
    try {
      const response = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gemini", model: ECONOMY_MODEL, enabled, useManaged: true,
          prompt: settings.prompt, dailyLimit: settings.managedDailyLimit, monthlyLimit: settings.managedMonthlyLimit,
          inputRate: settings.inputRate, outputRate: settings.outputRate, apiKey: ""
        })
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error || t("تعذر الحفظ", "Couldn't save"));
      update(body.data);
      setFeedback(enabled ? t("تم تفعيل مساعد AI", "AI Copilot enabled") : t("تم إيقاف مساعد AI", "AI Copilot disabled"));
    } catch (error) { setFeedback(error instanceof Error ? error.message : t("تعذر الحفظ", "Couldn't save")); }
    finally { setManagedSaving(false); }
  }
  return <section className="ai-settings-view">
    <PageHero eyebrow={t("الذكاء الاصطناعي", "Artificial intelligence")} title={t("إعدادات المساعد", "Assistant settings")} description={t("اقتراح رد، إعادة صياغة، تصحيح، ترجمة، تلخيص، تحليل المشاعر والخطوة التالية.", "Reply suggestions, rewriting, correction, translation, summaries, sentiment and next steps.")} />
    {data?.summary ? <KpiRow items={[
      { tone: "t", label: t("طلبات آخر 30 يوماً", "Requests, 30 days"), value: data.summary.total },
      { tone: "g", label: t("نسبة النجاح", "Success rate"), value: data.summary.successRate === null ? "—" : `${data.summary.successRate}%` },
      { tone: "p", label: t("الاستخدام اليومي", "Used today"), value: data.dailyUsed, note: t(`الشهري ${data.monthlyUsed}`, `${data.monthlyUsed} this month`) },
      { tone: "o", label: t("التكلفة التقديرية USD", "Estimated cost USD"), value: data.summary.costUsd.toFixed(4) }
    ]} /> : null}
    <div className="panel">
    <div className="panel-body">
      {feedback ? <p role="status">{feedback}</p> : null}
      {!settings || !data ? <p>{feedback ? "" : t("جارٍ التحميل…", "Loading…")}</p> : <>
        {settings.managedAvailable ? (
          <div className="ai-managed-panel">
            <div>
              <h3>{settings.managedLocal ? t("مساعد محلي — دون رسوم API", "Local Copilot — no API fees") : t("مساعد Linkly — Gemini Flash-Lite", "Linkly Copilot — Gemini Flash-Lite")}</h3>
              <p>{t(`مشمول ضمن باقتك الحالية - بدون حاجة لمفتاح API خاص بك. الحد: ${settings.managedDailyLimit} يوميًا / ${settings.managedMonthlyLimit} شهريًا.`, `Included with your current plan - no API key of your own needed. Limit: ${settings.managedDailyLimit}/day, ${settings.managedMonthlyLimit}/month.`)}</p>
              {!settings.managedReady ? <p className="ai-managed-warning">{t("لم تكتمل إعدادات خادم المساعد بعد. تواصل مع إدارة المنصة.", "The assistant server is not configured yet. Contact the platform administrator.")}</p> : null}
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!settings.hasKey && settings.enabled}
                disabled={managedSaving || settings.hasKey || (!settings.managedReady && !settings.enabled)}
                onChange={(event) => saveManaged(event.target.checked)}
              />
              {t("تفعيل", "Enable")}
            </label>
          </div>
        ) : (
          <div className="ai-managed-panel">
            <div>
              <h3>{t("مساعد AI مُدار من Linkly", "Linkly-managed AI Copilot")}</h3>
              <p>{t("اربط مفتاح API الخاص بك من القسم أدناه. المساعد المُدار (بدون مفتاح) متاح من باقة المؤسسات الصغيرة.", "Connect your own API key below. The managed assistant (no key) starts at the Small Enterprises plan.")}</p>
            </div>
          </div>
        )}
        {settings.managedAvailable && settings.hasKey ? <button type="button" className="btn secondary" disabled={managedSaving || !settings.managedReady} onClick={async () => { if (await confirmDialog(t("سيُحذف مفتاح المزود المحفوظ وتنتقل إلى المساعد المُدار. متابعة؟", "Remove your saved provider key and switch to managed AI?"), { tone: "danger", cancelLabel: t("تراجع", "Cancel") })) void saveManaged(true); }}>{t("إزالة المفتاح والانتقال للمساعد المُدار", "Remove key and switch to managed AI")}</button> : null}
        <h3>{t("مفتاحك الخاص", "Your own key")}</h3>
        <form onSubmit={save} className="ai-settings-form">
          <label className="ai-settings-checkbox ai-enable-row"><input type="checkbox" checked={settings.enabled} onChange={(event) => update({ enabled: event.target.checked })} />{t("تفعيل مساعد الموظف", "Enable Copilot")}</label>
                    <label>{t("المزود", "Provider")}<CustomSelect ariaLabel={t("المزود", "Provider")} value={settings.provider} onChange={(value) => { update({ provider: value as AiSettingsPublic["provider"], model: "", hasKey: false, inputRate: null, outputRate: null }); setApiKey(""); }} options={aiProviders.map((provider) => ({ value: provider, label: provider }))} /></label>
          <label>{t("معرّف الموديل", "Model ID")}<input required value={settings.model} maxLength={150} onChange={(event) => update({ model: event.target.value })} dir="ltr" /></label>
          <label>{t("مفتاح API", "API key")}<input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.hasKey ? t("محفوظ — اتركه فارغاً للاحتفاظ به", "Saved — leave blank to retain") : t("أدخل المفتاح", "Enter key")} /></label>
          <label>{t("تعليمات أسلوب الرد", "Reply style guidance")}<textarea value={settings.prompt} maxLength={4000} onChange={(event) => update({ prompt: event.target.value })} /></label>
          <details className="ai-advanced"><summary>{t("خيارات متقدمة: الحدود والتكلفة", "Advanced: limits and cost")}</summary><div className="ai-advanced-grid">
          <label>{t("الحد اليومي للطلبات", "Daily request limit")}<input type="number" min={0} max={100000} required value={settings.dailyLimit} onChange={(event) => update({ dailyLimit: Number(event.target.value) })} /></label>
          <label>{t("الحد الشهري للطلبات", "Monthly request limit")}<input type="number" min={0} max={1000000} required value={settings.monthlyLimit} onChange={(event) => update({ monthlyLimit: Number(event.target.value) })} /></label>
          <label>{t("سعر مليون توكن إدخال (USD، اختياري)", "Input price per million tokens (USD, optional)")}<input type="number" min={0} max={100000} step="any" value={settings.inputRate ?? ""} onChange={(event) => update({ inputRate: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <label>{t("سعر مليون توكن إخراج (USD، اختياري)", "Output price per million tokens (USD, optional)")}<input type="number" min={0} max={100000} step="any" value={settings.outputRate ?? ""} onChange={(event) => update({ outputRate: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          </div></details>
          <button className="btn primary" disabled={saving} type="submit">{saving ? t("جارٍ الحفظ…", "Saving…") : t("حفظ إعدادات AI", "Save AI settings")}</button>
        </form>
        <details className="ai-advanced ai-usage"><summary>{t("سجل الاستخدام", "Usage log")}</summary>
        {data.summary ? <>
          <div className="table-wrap"><table className="report-table"><tbody>
            <tr><th>{t("إجمالي الطلبات", "Total requests")}</th><td>{data.summary.total}</td></tr>
            <tr><th>{t("نسبة النجاح", "Success rate")}</th><td>{data.summary.successRate === null ? t("غير متاح", "N/A") : `${data.summary.successRate}% (${data.summary.succeeded + data.summary.handoff} / ${data.summary.succeeded + data.summary.handoff + data.summary.failed})`}</td></tr>
            <tr><th>{t("حُوّلت للموظف (لا إجابة في قاعدة المعرفة)", "Handed to staff (no knowledge-base answer)")}</th><td>{data.summary.handoff}</td></tr>
            <tr><th>{t("الرد الآلي للعملاء", "Customer auto-replies")}</th><td>{data.summary.autoReply}</td></tr>
            <tr><th>{t("مساعد الموظفين", "Employee copilot")}</th><td>{data.summary.employee}</td></tr>
            <tr><th>{t("التكلفة التقديرية USD", "Estimated cost USD")}</th><td>{data.summary.costUsd.toFixed(4)}{data.summary.costUnknown ? t(` (+${data.summary.costUnknown} طلب بلا تقدير)`, ` (+${data.summary.costUnknown} unpriced)`) : ""}</td></tr>
            {data.summary.byOperation.map((item) => <tr key={item.operation}><th>{item.operation}</th><td>{item.count}</td></tr>)}
          </tbody></table></div>
        </> : null}
        <h3>{t("آخر 50 طلباً", "Latest 50 requests")}</h3>
        <div className="table-wrap"><table className="report-table"><thead><tr>{[t("الوقت", "Time"), t("المزود", "Provider"), t("العملية", "Operation"), t("الحالة", "Status"), t("التكلفة التقديرية USD", "Estimated cost USD")].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.events.map((entry) => <tr key={entry.id}><td>{entry.createdAt}</td><td>{entry.provider} / {entry.model}</td><td>{entry.operation}</td><td>{entry.status}</td><td>{entry.estimatedCost === null ? t("غير متاح", "N/A") : entry.estimatedCost.toFixed(6)}</td></tr>)}</tbody></table>{!data.events.length ? <p>{t("لا طلبات بعد.", "No requests yet.")}</p> : null}</div>
        </details>
      </>}
    </div>
    </div>
  </section>;
}
