"use client";

import { Fragment, FormEvent, useEffect, useState } from "react";
import type { ApiKeySummary, WebhookDeliverySummary, WebhookSummary } from "../types";
import { useLanguage } from "../i18n";

const EVENT_OPTIONS: Array<{ value: string; ar: string; en: string }> = [
  { value: "message.received", ar: "استلام رسالة", en: "Message received" },
  { value: "conversation.closed", ar: "إغلاق محادثة", en: "Conversation closed" },
  { value: "lead.created", ar: "عميل محتمل جديد", en: "New lead" }
];

export default function DevelopersView() {
  const { t } = useLanguage();
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [revealedSecret, setRevealedSecret] = useState("");
  const [webhookError, setWebhookError] = useState("");
  const [deliveriesByWebhook, setDeliveriesByWebhook] = useState<Record<string, WebhookDeliverySummary[]>>({});
  const [expandedWebhook, setExpandedWebhook] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const [keysResponse, webhooksResponse] = await Promise.all([fetch("/api/developer/keys"), fetch("/api/developer/webhooks")]);
      const keysBody = await keysResponse.json().catch(() => null);
      const webhooksBody = await webhooksResponse.json().catch(() => null);
      if (keysResponse.ok && keysBody?.ok) setApiKeys(keysBody.data ?? []);
      if (webhooksResponse.ok && webhooksBody?.ok) setWebhooks(webhooksBody.data ?? []);
    } catch {
      // Non-critical - lists simply stay as-is on a transient failure.
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setKeyError("");
    const response = await fetch("/api/developer/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName || t("مفتاح API", "API key") })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      setKeyError(payload?.error || t("تعذر إنشاء المفتاح", "Could not create the key"));
      return;
    }
    setRevealedKey(payload.data.rawKey);
    setNewKeyName("");
    await loadAll();
  }

  async function revokeKey(id: string) {
    if (!window.confirm(t("إلغاء هذا المفتاح؟ لن يعمل بعد الآن.", "Revoke this key? It will stop working immediately."))) return;
    await fetch(`/api/developer/keys/${id}`, { method: "DELETE" });
    await loadAll();
  }

  function toggleEvent(value: string) {
    setWebhookEvents((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  async function createWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWebhookError("");
    const response = await fetch("/api/developer/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, events: webhookEvents })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      setWebhookError(payload?.error || t("تعذر إنشاء الـ Webhook", "Could not create the webhook"));
      return;
    }
    setRevealedSecret(payload.data.secret);
    setWebhookUrl("");
    setWebhookEvents([]);
    await loadAll();
  }

  async function toggleWebhookActive(webhook: WebhookSummary) {
    await fetch(`/api/developer/webhooks/${webhook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !webhook.active })
    });
    await loadAll();
  }

  async function deleteWebhook(webhook: WebhookSummary) {
    if (!window.confirm(t(`حذف الـ Webhook ${webhook.url}؟`, `Delete the webhook to ${webhook.url}?`))) return;
    await fetch(`/api/developer/webhooks/${webhook.id}`, { method: "DELETE" });
    await loadAll();
  }

  async function toggleDeliveries(webhookId: string) {
    if (expandedWebhook === webhookId) {
      setExpandedWebhook("");
      return;
    }
    setExpandedWebhook(webhookId);
    if (!deliveriesByWebhook[webhookId]) {
      const response = await fetch(`/api/developer/webhooks/${webhookId}/deliveries`);
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.ok) setDeliveriesByWebhook((current) => ({ ...current, [webhookId]: payload.data ?? [] }));
    }
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>{t("مفاتيح API", "API keys")}</h2>
        </div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">{t("استخدم مفتاح API لإنشاء محادثات وإرسال رسائل وإدارة العملاء برمجياً - راجع قسم التوثيق أدناه.", "Use an API key to create conversations, send messages, and manage customers programmatically - see the documentation section below.")}</p>
          <form className="inline-filter" onSubmit={createKey}>
            <input value={newKeyName} onChange={(event) => setNewKeyName(event.target.value)} placeholder={t("اسم المفتاح (مثال: تكامل سلة)", "Key name (e.g. Salla integration)")} />
            <button className="btn primary" type="submit">{t("إنشاء مفتاح", "Create key")}</button>
          </form>
          {keyError ? <p className="form-error">{keyError}</p> : null}
          {revealedKey ? (
            <div className="developer-reveal">
              <p><b>{t("انسخ هذا المفتاح الآن - لن يظهر مرة أخرى:", "Copy this key now - it will not be shown again:")}</b></p>
              <code style={{ userSelect: "all", wordBreak: "break-all" }}>{revealedKey}</code>
              <div style={{ marginTop: 8 }}><button className="btn soft" type="button" onClick={() => { navigator.clipboard?.writeText(revealedKey); }}>{t("نسخ", "Copy")}</button> <button className="btn soft" type="button" onClick={() => setRevealedKey("")}>{t("إخفاء", "Dismiss")}</button></div>
            </div>
          ) : null}
          <table className="mobile-card-table">
            <thead><tr><th>{t("الاسم", "Name")}</th><th>{t("المفتاح", "Key")}</th><th>{t("أُنشئ", "Created")}</th><th>{t("آخر استخدام", "Last used")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
            <tbody>
              {apiKeys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td data-label={t("المفتاح", "Key")}><code>{key.keyPrefix}…</code></td>
                  <td data-label={t("أُنشئ", "Created")}>{key.createdAt}</td>
                  <td data-label={t("آخر استخدام", "Last used")}>{key.lastUsedAt || t("لم يُستخدم بعد", "Never used")}</td>
                  <td className="row-actions" data-label={t("إجراء", "Action")}><button className="btn danger" type="button" onClick={() => revokeKey(key.id)}>{t("إلغاء", "Revoke")}</button></td>
                </tr>
              ))}
              {!apiKeys.length ? <tr><td colSpan={5}>{loading ? t("جاري التحميل...", "Loading...") : t("لا توجد مفاتيح بعد.", "No keys yet.")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>{t("Webhooks", "Webhooks")}</h2>
        </div>
        <div className="panel-body table-wrap">
          <p className="muted-copy">{t("سجّل رابطاً يستقبل أحداثاً من Linkly (رسالة جديدة، إغلاق محادثة) - كل طلب موقّع بتوقيع HMAC للتحقق من مصدره.", "Register a URL to receive Linkly events (new message, conversation closed) - every request is HMAC-signed so you can verify its origin.")}</p>
          <form className="account-modal-body form-grid" onSubmit={createWebhook} style={{ padding: 0 }}>
            <label>
              <span>{t("رابط الـ Webhook", "Webhook URL")}</span>
              <input type="url" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://example.com/webhooks/linkly" required />
            </label>
            <label>
              <span>{t("الأحداث", "Events")}</span>
              <div className="segment-tag-picker">
                {EVENT_OPTIONS.map((option) => (
                  <label key={option.value} className="segment-tag-option">
                    <input type="checkbox" checked={webhookEvents.includes(option.value)} onChange={() => toggleEvent(option.value)} />
                    <span>{t(option.ar, option.en)}</span>
                  </label>
                ))}
              </div>
            </label>
            {webhookError ? <p className="form-error">{webhookError}</p> : null}
            <button className="btn primary" type="submit">{t("إضافة Webhook", "Add webhook")}</button>
          </form>
          {revealedSecret ? (
            <div className="developer-reveal">
              <p><b>{t("انسخ سر التوقيع الآن - لن يظهر مرة أخرى:", "Copy this signing secret now - it will not be shown again:")}</b></p>
              <code style={{ userSelect: "all", wordBreak: "break-all" }}>{revealedSecret}</code>
              <div style={{ marginTop: 8 }}><button className="btn soft" type="button" onClick={() => { navigator.clipboard?.writeText(revealedSecret); }}>{t("نسخ", "Copy")}</button> <button className="btn soft" type="button" onClick={() => setRevealedSecret("")}>{t("إخفاء", "Dismiss")}</button></div>
            </div>
          ) : null}
          <table className="mobile-card-table">
            <thead><tr><th>{t("الرابط", "URL")}</th><th>{t("الأحداث", "Events")}</th><th>{t("الحالة", "Status")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
            <tbody>
              {webhooks.map((webhook) => (
                <Fragment key={webhook.id}>
                  <tr>
                    <td className="truncate-cell">{webhook.url}</td>
                    <td data-label={t("الأحداث", "Events")}>{webhook.events.map((event) => EVENT_OPTIONS.find((option) => option.value === event)).map((option) => option ? t(option.ar, option.en) : "").join("، ")}</td>
                    <td data-label={t("الحالة", "Status")}>{webhook.active ? t("مفعّل", "Active") : t("موقوف", "Paused")}</td>
                    <td className="row-actions" data-label={t("إجراء", "Action")}>
                      <button className="btn soft" type="button" onClick={() => toggleDeliveries(webhook.id)}>{t("السجل", "Log")}</button>
                      <button className="btn soft" type="button" onClick={() => toggleWebhookActive(webhook)}>{webhook.active ? t("إيقاف", "Pause") : t("تفعيل", "Resume")}</button>
                      <button className="btn danger" type="button" onClick={() => deleteWebhook(webhook)}>{t("حذف", "Delete")}</button>
                    </td>
                  </tr>
                  {expandedWebhook === webhook.id ? (
                    <tr>
                      <td colSpan={4}>
                        <table>
                          <thead><tr><th>{t("الحدث", "Event")}</th><th>{t("رمز HTTP", "HTTP status")}</th><th>{t("النتيجة", "Result")}</th><th>{t("الوقت", "Time")}</th></tr></thead>
                          <tbody>
                            {(deliveriesByWebhook[webhook.id] ?? []).map((delivery) => (
                              <tr key={delivery.id}>
                                <td>{delivery.event}</td>
                                <td>{delivery.httpStatus || "—"}</td>
                                <td>{delivery.success ? t("نجح", "Success") : t("فشل", "Failed")}</td>
                                <td>{delivery.createdAt}</td>
                              </tr>
                            ))}
                            {!(deliveriesByWebhook[webhook.id] ?? []).length ? <tr><td colSpan={4}>{t("لا يوجد سجل تسليم بعد.", "No deliveries yet.")}</td></tr> : null}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {!webhooks.length ? <tr><td colSpan={4}>{loading ? t("جاري التحميل...", "Loading...") : t("لا توجد Webhooks بعد.", "No webhooks yet.")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>{t("توثيق API", "API documentation")}</h2>
        </div>
        <div className="panel-body">
          <p>{t("دليل المطورين الكامل: المصادقة، كل نقطة اتصال بحقولها وأمثلتها، حدود الطلبات، الأخطاء، وWebhooks مع طريقة التحقق من التوقيع. يمكنك مشاركة الرابط مع مبرمجك مباشرة.", "The full developer guide: authentication, every endpoint with fields and examples, rate limits, errors and webhooks with signature verification. You can share the link with your developer.")}</p>
          <p className="muted-copy">{t("الرابط الأساسي للواجهة:", "API base URL:")} <code dir="ltr">https://linklysa.io/api/v1</code></p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn primary" href="/developers" target="_blank" rel="noreferrer">{t("فتح التوثيق الكامل", "Open the full documentation")}</a>
            <a className="btn soft" href="/openapi.json" target="_blank" rel="noreferrer">{t("مواصفات OpenAPI (JSON)", "OpenAPI spec (JSON)")}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
