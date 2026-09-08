"use client";

import { useEffect, useState, type FormEvent } from "react";
import { aiProviders, type AiSettingsPublic } from "../../../lib/ai-types";
import { useLanguage } from "../i18n";

type Usage = { id: string; createdAt: string; provider: string; model: string; operation: string; status: string; inputTokens: number | null; outputTokens: number | null; estimatedCost: number | null };
type Payload = { settings: AiSettingsPublic; dailyUsed: number; monthlyUsed: number; events: Usage[] };

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
  function update(patch: Partial<AiSettingsPublic>) { setData((current) => current ? { ...current, settings: { ...current.settings, ...patch } } : current); }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setFeedback("");
    try {
      const response = await fetch("/api/ai/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, apiKey }) });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error || t("تعذر الحفظ", "Couldn't save"));
      update(body.data); setApiKey(""); setFeedback(t("تم حفظ إعدادات AI", "AI settings saved"));
    } catch (error) { setFeedback(error instanceof Error ? error.message : t("تعذر الحفظ", "Couldn't save")); }
    finally { setSaving(false); }
  }
  return <section className="panel ai-settings-view">
    <div className="panel-head"><div><h2>{t("مساعد AI للموظف", "Employee AI Copilot")}</h2><p>{t("اقتراح رد، إعادة صياغة، تصحيح، ترجمة، تلخيص، تحليل المشاعر والخطوة التالية.", "Reply suggestions, rewriting, correction, translation, summaries, sentiment and next steps.")}</p></div></div>
    <div className="panel-body">
      {feedback ? <p role="status">{feedback}</p> : null}
      {!settings || !data ? <p>{feedback ? "" : t("جارٍ التحميل…", "Loading…")}</p> : <>
        <form onSubmit={save} className="ai-settings-form">
          <label><input type="checkbox" checked={settings.enabled} onChange={(event) => update({ enabled: event.target.checked })} />{t("تفعيل مساعد الموظف", "Enable Copilot")}</label>
          <label>{t("المزود", "Provider")}<select value={settings.provider} onChange={(event) => { update({ provider: event.target.value as AiSettingsPublic["provider"], model: "", hasKey: false, inputRate: null, outputRate: null }); setApiKey(""); }}>{aiProviders.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
          <label>{t("معرّف الموديل", "Model ID")}<input required value={settings.model} maxLength={150} onChange={(event) => update({ model: event.target.value })} dir="ltr" /></label>
          <label>{t("مفتاح API", "API key")}<input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.hasKey ? t("محفوظ — اتركه فارغاً للاحتفاظ به", "Saved — leave blank to retain") : t("أدخل المفتاح", "Enter key")} /></label>
          <p>{t("يُحفظ المفتاح مشفراً على الخادم ولا يُعرض بعد الحفظ. تغيير المزود يتطلب مفتاحاً جديداً.", "The key is encrypted on the server and never returned after saving. Switching providers requires a new key.")}</p>
          <label>{t("تعليمات أسلوب الرد", "Reply style guidance")}<textarea value={settings.prompt} maxLength={4000} onChange={(event) => update({ prompt: event.target.value })} /></label>
          <label>{t("الحد اليومي للطلبات", "Daily request limit")}<input type="number" min={0} max={100000} required value={settings.dailyLimit} onChange={(event) => update({ dailyLimit: Number(event.target.value) })} /></label>
          <label>{t("الحد الشهري للطلبات", "Monthly request limit")}<input type="number" min={0} max={1000000} required value={settings.monthlyLimit} onChange={(event) => update({ monthlyLimit: Number(event.target.value) })} /></label>
          <p>{t(`الاستخدام اليومي: ${data.dailyUsed} · الشهري: ${data.monthlyUsed}. الحدود بتوقيت UTC وتشمل المحاولات الفاشلة.`, `Used today: ${data.dailyUsed} · This month: ${data.monthlyUsed}. UTC periods; failed attempts count.`)}</p>
          <label>{t("سعر مليون توكن إدخال (USD، اختياري)", "Input price per million tokens (USD, optional)")}<input type="number" min={0} max={100000} step="any" value={settings.inputRate ?? ""} onChange={(event) => update({ inputRate: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <label>{t("سعر مليون توكن إخراج (USD، اختياري)", "Output price per million tokens (USD, optional)")}<input type="number" min={0} max={100000} step="any" value={settings.outputRate ?? ""} onChange={(event) => update({ outputRate: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <p>{t("التكلفة تقديرية حسب الأسعار المدخلة واستهلاك المزود؛ تظهر «غير متاح» عند غيابها.", "Cost is estimated from your rates and provider usage; unavailable when either is missing.")}</p>
          <button className="btn primary" disabled={saving} type="submit">{saving ? t("جارٍ الحفظ…", "Saving…") : t("حفظ إعدادات AI", "Save AI settings")}</button>
        </form>
        <h3>{t("آخر 50 طلباً", "Latest 50 requests")}</h3>
        <div className="table-wrap"><table className="report-table"><thead><tr>{[t("الوقت", "Time"), t("المزود", "Provider"), t("العملية", "Operation"), t("الحالة", "Status"), t("التكلفة التقديرية USD", "Estimated cost USD")].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.events.map((entry) => <tr key={entry.id}><td>{entry.createdAt}</td><td>{entry.provider} / {entry.model}</td><td>{entry.operation}</td><td>{entry.status}</td><td>{entry.estimatedCost === null ? t("غير متاح", "N/A") : entry.estimatedCost.toFixed(6)}</td></tr>)}</tbody></table>{!data.events.length ? <p>{t("لا طلبات بعد. افتح محادثة وجرّب مساعد AI.", "No requests yet. Open a conversation and try Copilot.")}</p> : null}</div>
      </>}
    </div>
  </section>;
}
