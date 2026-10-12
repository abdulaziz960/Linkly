"use client";

import CustomSelect from "../../components/CustomSelect";
import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type OrderEvent = "created" | "processing" | "shipped" | "delivered" | "cancelled";
type Settings = {
  orderNotifications: Record<OrderEvent, { enabled: boolean; template: string }>;
  abandonedCart: {
    enabled: boolean;
    delayMinutes: number;
    maxReminders: 1 | 2 | 3;
    intervalHours: number;
    minCartValue: number;
    quietHours: { enabled: boolean; start: string; end: string };
    discountCode: string;
    templates: [string, string, string];
    skipIfOrderedDays: number;
  };
  dailyCap: number;
};

const ORDER_EVENTS: OrderEvent[] = ["created", "processing", "shipped", "delivered", "cancelled"];

type Section = "orders" | "carts";

/** Salla / Zid: which notifications go out and how abandoned carts are followed up. Stored now; sending starts once the store is connected. */
export default function StoreSettings({ store }: { store: "salla" | "zid" }) {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<string[]>([]);
  const [section, setSection] = useState<Section>("orders");
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store-integrations/${store}/settings`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; data?: { settings: Settings; warnings: string[] } }) => {
        if (cancelled || !result?.ok || !result.data) return;
        setSettings(result.data.settings);
        setWarnings(result.data.warnings);
      })
      .catch(() => null);
    fetch("/api/templates")
      .then((response) => response.json())
      .then((result: { ok: boolean; data?: Array<{ name: string; status?: string }> }) => {
        if (cancelled || !result?.ok) return;
        setTemplates((result.data || []).filter((template) => template.status === "معتمد").map((template) => template.name));
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [store]);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/store-integrations/${store}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { settings: Settings; warnings: string[] } } | null;
      if (!response.ok || !result?.ok || !result.data) {
        setFeedback({ type: "error", text: result?.error || t("تعذر الحفظ", "Could not save") });
        return;
      }
      setSettings(result.data.settings);
      setWarnings(result.data.warnings);
      setFeedback({ type: "success", text: t("تم الحفظ", "Saved") });
    } catch {
      setFeedback({ type: "error", text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return null;

  const eventLabels: Record<OrderEvent, string> = {
    created: t("تأكيد الطلب", "Order confirmation"),
    processing: t("قيد التجهيز", "Processing"),
    shipped: t("تم الشحن", "Shipped"),
    delivered: t("تم التسليم", "Delivered"),
    cancelled: t("ملغي", "Cancelled")
  };

  const box: React.CSSProperties = { border: "1px solid var(--line, #dfe7e5)", borderRadius: 14, padding: 16, background: "var(--surface, #fff)", display: "grid", gap: 14 };
  const input: React.CSSProperties = { width: "100%", minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", background: "var(--surface, #fff)", color: "inherit", font: "inherit", fontWeight: 600 };
  const fieldLabel: React.CSSProperties = { display: "grid", gap: 6, fontWeight: 700, fontSize: 14 };
  const hint: React.CSSProperties = { fontWeight: 400, fontSize: 12.5, opacity: 0.7, lineHeight: 1.6 };
  const sectionTitle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800 };
  const templateOptions = [{ value: "", label: t("اختر قالبًا", "Choose a template") }, ...templates.map((name) => ({ value: name, label: name }))];

  const cart = settings.abandonedCart;
  function setCart(patch: Partial<Settings["abandonedCart"]>) {
    setSettings((current) => (current ? { ...current, abandonedCart: { ...current.abandonedCart, ...patch } } : current));
  }
  function setOrder(event: OrderEvent, patch: Partial<{ enabled: boolean; template: string }>) {
    setSettings((current) => (current ? { ...current, orderNotifications: { ...current.orderNotifications, [event]: { ...current.orderNotifications[event], ...patch } } } : current));
  }
  const numberField = (value: number, onChange: (next: number) => void, min: number, max: number) => (
    <input dir="ltr" type="number" min={min} max={max} style={input} value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => onChange(Number(event.target.value) || 0)} />
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p className="meta-test-feedback" style={{ margin: 0, lineHeight: 1.8 }}>
        {t("هذه الإعدادات تُحفظ الآن، ولن تُرسل أي رسائل قبل إتمام ربط المتجر. ستُطبَّق تلقائيًا فور تفعيل الربط.", "These settings are saved now; no messages are sent until the store is connected. They apply automatically once the connection is enabled.")}
      </p>

      <div className="pipeline-tabs" role="tablist" style={{ marginTop: 0 }}>
        <button type="button" role="tab" aria-selected={section === "orders"} onClick={() => setSection("orders")}>{t("إشعارات الطلب", "Order notifications")}</button>
        <button type="button" role="tab" aria-selected={section === "carts"} onClick={() => setSection("carts")}>{t("السلات المتروكة", "Abandoned carts")}</button>
      </div>

      {section === "orders" ? (
        <section style={box}>
          <h4 style={sectionTitle}>{t("إشعار العميل على واتساب لكل حالة", "WhatsApp notification per order status")}</h4>
          {ORDER_EVENTS.map((event) => {
            const item = settings.orderNotifications[event];
            const missing = warnings.includes(`order:${event}`);
            return (
              <div key={event} style={{ display: "grid", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, cursor: "pointer" }}>
                  <input type="checkbox" checked={item.enabled} onChange={(e) => setOrder(event, { enabled: e.target.checked })} style={{ width: 18, height: 18 }} />
                  {eventLabels[event]}
                </label>
                {item.enabled ? (
                  <label style={fieldLabel}>
                    {t("القالب", "Template")}
                    <CustomSelect value={item.template} onChange={(value) => setOrder(event, { template: value })} options={templateOptions} />
                    {missing && !item.template ? <span style={{ ...hint, color: "#c0392b", opacity: 1 }}>{t("اختر قالبًا حتى يُرسل هذا الإشعار.", "Choose a template for this notification to be sent.")}</span> : null}
                  </label>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, cursor: "pointer" }}>
            <input type="checkbox" checked={cart.enabled} onChange={(event) => setCart({ enabled: event.target.checked })} style={{ width: 18, height: 18 }} />
            {t("تفعيل تذكير السلات المتروكة", "Send abandoned-cart reminders")}
          </label>

          <section style={box}>
            <h4 style={sectionTitle}>{t("التوقيت والعدد", "Timing and count")}</h4>
            <label style={fieldLabel}>
              {t("أرسل التذكير بعد (دقيقة)", "Send the reminder after (minutes)")}
              {numberField(cart.delayMinutes, (next) => setCart({ delayMinutes: next }), 10, 1440)}
              <span style={hint}>{t("بين 10 دقائق و24 ساعة من ترك السلة.", "Between 10 minutes and 24 hours after the cart was left.")}</span>
            </label>
            <label style={fieldLabel}>
              {t("عدد التذكيرات", "Number of reminders")}
              <CustomSelect value={String(cart.maxReminders)} onChange={(value) => setCart({ maxReminders: Number(value) as 1 | 2 | 3 })} options={[
                { value: "1", label: t("تذكير واحد", "One reminder") },
                { value: "2", label: t("تذكيران", "Two reminders") },
                { value: "3", label: t("ثلاثة تذكيرات", "Three reminders") }
              ]} />
            </label>
            {cart.maxReminders > 1 ? (
              <label style={fieldLabel}>
                {t("الفاصل بين التذكيرات (ساعة)", "Gap between reminders (hours)")}
                {numberField(cart.intervalHours, (next) => setCart({ intervalHours: next }), 1, 168)}
              </label>
            ) : null}
          </section>

          <section style={box}>
            <h4 style={sectionTitle}>{t("لمن يُرسل", "Who gets it")}</h4>
            <label style={fieldLabel}>
              {t("أقل قيمة للسلة (ر.س)", "Minimum cart value (SAR)")}
              {numberField(cart.minCartValue, (next) => setCart({ minCartValue: next }), 0, 1000000)}
              <span style={hint}>{t("0 يعني كل السلات.", "0 means every cart.")}</span>
            </label>
            <label style={fieldLabel}>
              {t("لا ترسل لمن اشترى خلال آخر (يوم)", "Skip customers who ordered in the last (days)")}
              {numberField(cart.skipIfOrderedDays, (next) => setCart({ skipIfOrderedDays: next }), 0, 90)}
              <span style={hint}>{t("0 يعني لا تتخطَّ أحدًا.", "0 means never skip.")}</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, cursor: "pointer" }}>
              <input type="checkbox" checked={cart.quietHours.enabled} onChange={(event) => setCart({ quietHours: { ...cart.quietHours, enabled: event.target.checked } })} style={{ width: 18, height: 18 }} />
              {t("ساعات الهدوء (لا إرسال خلالها)", "Quiet hours (no sending)")}
            </label>
            {cart.quietHours.enabled ? (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label style={fieldLabel}>
                  {t("من", "From")}
                  <input dir="ltr" type="time" style={input} value={cart.quietHours.start} onChange={(event) => setCart({ quietHours: { ...cart.quietHours, start: event.target.value } })} />
                </label>
                <label style={fieldLabel}>
                  {t("إلى", "To")}
                  <input dir="ltr" type="time" style={input} value={cart.quietHours.end} onChange={(event) => setCart({ quietHours: { ...cart.quietHours, end: event.target.value } })} />
                </label>
              </div>
            ) : null}
          </section>

          <section style={box}>
            <h4 style={sectionTitle}>{t("القوالب والخصم", "Templates and discount")}</h4>
            {Array.from({ length: cart.maxReminders }, (_, index) => (
              <label key={index} style={fieldLabel}>
                {t(`قالب التذكير ${index + 1}`, `Reminder ${index + 1} template`)}
                <CustomSelect
                  value={cart.templates[index]}
                  onChange={(value) => {
                    const next = [...cart.templates] as [string, string, string];
                    next[index] = value;
                    setCart({ templates: next });
                  }}
                  options={templateOptions}
                />
                {cart.enabled && warnings.includes(`cart:${index + 1}`) && !cart.templates[index] ? (
                  <span style={{ ...hint, color: "#c0392b", opacity: 1 }}>{t("اختر قالبًا حتى يُرسل هذا التذكير.", "Choose a template for this reminder to be sent.")}</span>
                ) : null}
              </label>
            ))}
            <label style={fieldLabel}>
              {t("كود خصم (اختياري)", "Discount code (optional)")}
              <input dir="ltr" style={input} value={cart.discountCode} onChange={(event) => setCart({ discountCode: event.target.value })} placeholder="COMEBACK10" />
              <span style={hint}>{t("يُضاف في آخر تذكير.", "Added to the last reminder.")}</span>
            </label>
          </section>
        </>
      )}

      <section style={box}>
        <h4 style={sectionTitle}>{t("عام", "General")}</h4>
        <label style={fieldLabel}>
          {t("الحد الأقصى لرسائل المتجر يوميًا", "Maximum store messages per day")}
          {numberField(settings.dailyCap, (next) => setSettings((current) => (current ? { ...current, dailyCap: next } : current)), 0, 100000)}
          <span style={hint}>{t("0 يعني بلا حد. من ألغى اشتراكه في الرسائل التسويقية لا يصله شيء.", "0 means no cap. Customers who opted out of marketing messages never receive anything.")}</span>
        </label>
      </section>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="primary-action" type="button" disabled={busy} onClick={() => void save()}>{t("حفظ", "Save")}</button>
      </div>
      {feedback ? <p className={`meta-test-feedback ${feedback.type}`} style={{ margin: 0 }}>{feedback.text}</p> : null}
    </div>
  );
}
