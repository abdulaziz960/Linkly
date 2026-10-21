"use client";

import CustomSelect from "../../components/CustomSelect";
import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { ORDER_TEMPLATE_EXAMPLES, orderMessageProblem, suggestedOrderMessage, suggestedOrderTemplateName } from "../../../lib/store-template-suggestions";

type OrderEvent = "created" | "processing" | "shipped" | "delivered" | "cancelled";
type StatusGroup = "review" | "processing" | "shipped" | "delivered" | "cancelled" | "other";
type Connection = { status: "connected" | "disconnected"; merchantName: string; merchantId: string };
type Settings = {
  orderNotifications: Record<OrderEvent, { enabled: boolean; template: string }>;
  orderLookup: { enabled: boolean; requirePhoneMatch: boolean; verifyWithLastDigits: boolean; askDigitsText: string; texts: Record<StatusGroup, string>; notFoundText: string; askNumberText: string };
  abandonedCart: {
    enabled: boolean;
    delayMinutes: number;
    maxReminders: 1 | 2 | 3;
    intervalHours: number;
    minCartValue: number;
    quietHours: { enabled: boolean; start: string; end: string };
    discountCode: string;
    uniqueCoupon: { enabled: boolean; percent: number; validHours: number };
    templates: [string, string, string];
    skipIfOrderedDays: number;
  };
  dailyCap: number;
  checkout: { enabled: boolean; shippingMethodId: number; paymentMethodId: number; linkValidHours: number };
};

const ORDER_EVENTS: OrderEvent[] = ["created", "processing", "shipped", "delivered", "cancelled"];

type Section = "connection" | "orders" | "lookup" | "carts" | "checkout";
const STATUS_GROUPS: StatusGroup[] = ["review", "processing", "shipped", "delivered", "cancelled", "other"];

/** Salla / Zid: which notifications go out and how abandoned carts are followed up. Stored now; sending starts once the store is connected. */
export default function StoreSettings({ store }: { store: "salla" | "zid" | "shopify" }) {
  const { t } = useLanguage();
  const [shopDomain, setShopDomain] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<string[]>([]);
  const [pendingTemplates, setPendingTemplates] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<Partial<Record<OrderEvent, { editing: boolean; text: string; busy: boolean; error: string }>>>({});
  const [section, setSection] = useState<Section>("connection");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [productSync, setProductSync] = useState<{ lastAt: string; status: string; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [deliveryOptions, setDeliveryOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [checkoutNote, setCheckoutNote] = useState("");
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [syncNote, setSyncNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function loadConnection() {
    try {
      const response = await fetch(`/api/store-integrations/${store}/connection`, { cache: "no-store" });
      const result = await response.json().catch(() => null) as { ok?: boolean; data?: { connection: Connection; available: boolean } } | null;
      if (response.ok && result?.ok && result.data) {
        setConnection(result.data.connection);
        setAvailable(result.data.available);
      }
    } catch {
      // The tab keeps showing "not connected".
    }
  }

  async function loadProductSync() {
    if (store !== "zid") return;
    const response = await fetch(`/api/store-integrations/${store}/products`, { cache: "no-store" }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { ok?: boolean; data?: { lastAt: string; status: string; message: string } } | null;
    if (result?.ok && result.data) setProductSync(result.data);
  }

  async function loadCheckoutOptions() {
    if (store !== "zid") return;
    setLoadingCheckout(true);
    setCheckoutNote("");
    try {
      const response = await fetch(`/api/store-integrations/${store}/checkout`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { deliveryOptions: Array<{ id: number; name: string }>; deliveryError: string; suggestedPaymentMethodId: number } } | null;
      if (!response.ok || !result?.ok || !result.data) throw new Error(result?.error || t("تعذر جلب خيارات الشحن.", "Could not load the delivery options."));
      setDeliveryOptions(result.data.deliveryOptions);
      if (result.data.deliveryError) setCheckoutNote(result.data.deliveryError);
      const suggested = result.data.suggestedPaymentMethodId;
      setSettings((current) => (current && suggested > 0 && current.checkout.paymentMethodId === 0 ? { ...current, checkout: { ...current.checkout, paymentMethodId: suggested } } : current));
    } catch (error) {
      setCheckoutNote(error instanceof Error ? error.message : t("تعذر جلب خيارات الشحن.", "Could not load the delivery options."));
    } finally {
      setLoadingCheckout(false);
    }
  }

  async function syncProducts() {
    setSyncing(true);
    setSyncNote(null);
    try {
      const response = await fetch(`/api/store-integrations/${store}/products`, { method: "POST" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { message: string } } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || t("تعذرت مزامنة المنتجات.", "Could not sync the products."));
      setSyncNote({ ok: true, text: result.data?.message || t("تمت المزامنة.", "Synced.") });
      await loadProductSync();
    } catch (error) {
      setSyncNote({ ok: false, text: error instanceof Error ? error.message : t("تعذرت مزامنة المنتجات.", "Could not sync the products.") });
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch(`/api/store-integrations/${store}/connection`, { method: "DELETE" });
      await loadConnection();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadConnection();
    void loadProductSync();
    function onMessage(event: MessageEvent) {
      if (event.origin === window.location.origin && (event.data as { type?: string } | null)?.type === "linkly:store-connected") void loadConnection();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

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
  const templateOptions = [
    { value: "", label: t("اختر قالبًا", "Choose a template") },
    ...templates.map((name) => ({ value: name, label: name })),
    ...pendingTemplates.filter((name) => !templates.includes(name)).map((name) => ({ value: name, label: `${name} (${t("قيد مراجعة Meta", "pending Meta review")})` }))
  ];

  const cart = settings.abandonedCart;
  function setCart(patch: Partial<Settings["abandonedCart"]>) {
    setSettings((current) => (current ? { ...current, abandonedCart: { ...current.abandonedCart, ...patch } } : current));
  }
  function setOrder(event: OrderEvent, patch: Partial<{ enabled: boolean; template: string }>) {
    setSettings((current) => (current ? { ...current, orderNotifications: { ...current.orderNotifications, [event]: { ...current.orderNotifications[event], ...patch } } } : current));
  }
  function patchSuggestion(event: OrderEvent, patch: Partial<{ editing: boolean; text: string; busy: boolean; error: string }>) {
    setSuggestion((current) => ({ ...current, [event]: { editing: false, text: "", busy: false, error: "", ...current[event], ...patch } }));
  }

  async function submitSuggestion(event: OrderEvent, message: string) {
    const problem = orderMessageProblem(message);
    if (problem) {
      patchSuggestion(event, { error: problem });
      return;
    }
    patchSuggestion(event, { busy: true, error: "" });
    const base = suggestedOrderTemplateName(store, event);
    try {
      for (const name of [base, `${base}_${Date.now().toString(36)}`]) {
        const response = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, message: message.trim(), type: "خدمة", category: "UTILITY", language: "ar", bodyExamples: ORDER_TEMPLATE_EXAMPLES })
        });
        const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (response.ok && result?.ok) {
          setPendingTemplates((current) => [...current, name]);
          setOrder(event, { template: name });
          patchSuggestion(event, { busy: false, editing: false });
          return;
        }
        if (!/مكرر/.test(result?.error || "")) {
          patchSuggestion(event, { busy: false, error: result?.error || t("تعذر إرسال القالب إلى Meta", "Could not submit the template to Meta") });
          return;
        }
      }
      patchSuggestion(event, { busy: false, error: t("تعذر إرسال القالب: الاسم مستخدم.", "Could not submit: the name is already used.") });
    } catch {
      patchSuggestion(event, { busy: false, error: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    }
  }

  const numberField = (value: number, onChange: (next: number) => void, min: number, max: number) => (
    <input dir="ltr" type="number" min={min} max={max} style={input} value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => onChange(Number(event.target.value) || 0)} />
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {connection?.status !== "connected" ? (
        <p className="meta-test-feedback" style={{ margin: 0, lineHeight: 1.8 }}>
          {t("المتجر غير مرتبط بعد: الإعدادات تُحفظ، ولا تُرسل أي رسائل قبل الربط.", "The store is not connected yet: settings are saved, and nothing is sent until it is.")}
        </p>
      ) : null}

      <div className="pipeline-tabs" role="tablist" style={{ marginTop: 0, flexWrap: "wrap" }}>
        <button type="button" role="tab" aria-selected={section === "connection"} onClick={() => setSection("connection")}>{t("الربط", "Connection")}</button>
        <button type="button" role="tab" aria-selected={section === "orders"} onClick={() => setSection("orders")}>{t("إشعارات الطلب", "Order notifications")}</button>
        <button type="button" role="tab" aria-selected={section === "lookup"} onClick={() => setSection("lookup")}>{t("استعلام الطلبات", "Order lookup")}</button>
        <button type="button" role="tab" aria-selected={section === "carts"} onClick={() => setSection("carts")}>{t("السلات المتروكة", "Abandoned carts")}</button>
        {store === "zid" ? <button type="button" role="tab" aria-selected={section === "checkout"} onClick={() => { setSection("checkout"); void loadCheckoutOptions(); }}>{t("الشراء من واتساب", "Buy from WhatsApp")}</button> : null}
      </div>

      {section === "connection" ? (
        <section style={box}>
          <h4 style={sectionTitle}>{store === "salla" ? t("ربط متجر سلة", "Connect your Salla store") : store === "shopify" ? t("ربط متجر شوبيفاي", "Connect your Shopify store") : t("ربط متجر زد", "Connect your Zid store")}</h4>
          {connection?.status === "connected" ? (
            <p style={{ margin: 0, fontWeight: 700 }}>{t("متصل", "Connected")}{connection.merchantName ? ` — ${connection.merchantName}` : ""}</p>
          ) : (
            <p style={{ margin: 0, opacity: 0.8 }}>{t("غير متصل", "Not connected")}</p>
          )}
          {!available ? (
            <span style={hint}>{store === "shopify" ? t("الربط غير مفعّل بعد على الخادم (بيانات تطبيق شوبيفاي غير مضبوطة). تواصل مع الدعم.", "The connection is not enabled yet on the server (Shopify app credentials are not set). Contact support.") : store === "zid" ? t("الربط غير مفعّل بعد على الخادم (بيانات تطبيق زد غير مضبوطة). تواصل مع الدعم.", "The connection is not enabled yet on the server (Zid app credentials are not set). Contact support.") : t("الربط غير مفعّل بعد على الخادم (بيانات تطبيق سلة غير مضبوطة). تواصل مع الدعم.", "The connection is not enabled on the server yet (the Salla app credentials are not set). Contact support.")}</span>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              {store === "shopify" ? (
                <label style={{ ...fieldLabel, flex: "1 1 260px" }}>
                  {t("نطاق المتجر في شوبيفاي", "Your Shopify store domain")}
                  <input
                    style={input}
                    dir="ltr"
                    value={shopDomain}
                    placeholder="my-store.myshopify.com"
                    onChange={(event) => setShopDomain(event.target.value)}
                  />
                </label>
              ) : null}
              <button
                className="primary-action"
                type="button"
                disabled={busy || (store === "shopify" && !shopDomain.trim())}
                onClick={() => window.open(store === "shopify" ? `/api/shopify/connect?shop=${encodeURIComponent(shopDomain.trim())}` : `/api/${store}/connect`, `${store}-connect`, "width=620,height=760")}
              >
                {connection?.status === "connected" ? t("إعادة الربط", "Reconnect") : t("ربط المتجر", "Connect store")}
              </button>
              {connection?.status === "connected" ? <button className="soft-action" type="button" disabled={busy} onClick={() => void disconnect()}>{t("فصل الربط", "Disconnect")}</button> : null}
            </div>
          )}
          {store === "zid" && connection?.status === "connected" ? (
            <div style={{ display: "grid", gap: 8, paddingTop: 6 }}>
              <h4 style={sectionTitle}>{t("منتجات المتجر", "Store products")}</h4>
              <span style={hint}>{t("اسحب منتجات متجر زد إلى كتالوج لنكلي، وتتحدّث تلقائيًا كل ساعات بعد أول مزامنة. يحتاج صلاحية «المنتجات» في تطبيق زد.", "Pull your Zid products into the Linkly catalog; they refresh automatically every few hours after the first sync. Needs the app's Products scope.")}</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="primary-action" type="button" disabled={syncing} onClick={() => void syncProducts()}>
                  {syncing ? t("جارٍ المزامنة...", "Syncing...") : t("مزامنة المنتجات الآن", "Sync products now")}
                </button>
                {syncNote ? <span className={`automation-feedback ${syncNote.ok ? "success" : "error"}`}>{syncNote.text}</span> : null}
              </div>
              {productSync?.lastAt ? <span style={hint}>{t("آخر مزامنة:", "Last sync:")} {new Date(productSync.lastAt).toLocaleString("ar-SA")} — {productSync.message}</span> : null}
            </div>
          ) : null}
          <span style={hint}>{t("بعد الربط تصل أحداث الطلبات والسلات المتروكة تلقائيًا، وتُطبَّق الإعدادات في التبويبات الأخرى.", "After connecting, order and abandoned-cart events arrive automatically and the settings in the other tabs apply.")}</span>
        </section>
      ) : section === "checkout" ? (
        <section style={box}>
          <h4 style={sectionTitle}>{t("الشراء من واتساب → طلب في زد", "Buying from WhatsApp → an order in Zid")}</h4>
          <span style={hint}>{t("عند الشراء من كتالوج واتساب يُنشأ الطلب في متجر زد ويصل العميل رابط دفع زد. المخزون والشحن والفاتورة من زد، ولا تُستخدم بوابة ميسر.", "A purchase from the WhatsApp catalog creates the order in your Zid store and the customer gets a Zid payment link. Stock, shipping and the invoice are Zid's; no Moyasar gateway is used.")}</span>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, cursor: "pointer" }}>
            <input type="checkbox" checked={settings.checkout.enabled} onChange={(event) => setSettings({ ...settings, checkout: { ...settings.checkout, enabled: event.target.checked } })} style={{ width: 18, height: 18 }} />
            {t("تفعيل الشراء من واتساب", "Turn on buying from WhatsApp")}
          </label>
          <label style={fieldLabel}>
            {t("طريقة الشحن", "Delivery option")}
            <CustomSelect
              value={String(settings.checkout.shippingMethodId || "")}
              placeholder={loadingCheckout ? t("جارٍ التحميل...", "Loading...") : t("اختر طريقة الشحن", "Choose a delivery option")}
              options={[{ value: "", label: t("اختر طريقة الشحن", "Choose a delivery option") }, ...deliveryOptions.map((option) => ({ value: String(option.id), label: option.name }))]}
              onChange={(value) => setSettings({ ...settings, checkout: { ...settings.checkout, shippingMethodId: Number(value) || 0 } })}
            />
            <span style={hint}>{t("خيارات الشحن المضافة في متجرك على زد.", "The delivery options set up in your Zid store.")}</span>
          </label>
          <label style={fieldLabel}>
            {t("رقم طريقة الدفع (رابط الدفع)", "Payment method id (payment link)")}
            <input type="number" min={0} dir="ltr" style={input} value={settings.checkout.paymentMethodId || ""} onChange={(event) => setSettings({ ...settings, checkout: { ...settings.checkout, paymentMethodId: Number(event.target.value) || 0 } })} placeholder="555224" />
            <span style={hint}>{t("يُملأ تلقائيًا إن وجدناه. وإلا خذه من زد: طرق الدفع ← الدفع برابط (ZidPay).", "Filled automatically when found; otherwise take it from Zid: payment methods → payment link (ZidPay).")}</span>
          </label>
          <label style={fieldLabel}>
            {t("صلاحية رابط الدفع (ساعات)", "Payment link valid for (hours)")}
            <input type="number" min={1} max={168} style={input} value={settings.checkout.linkValidHours} onChange={(event) => setSettings({ ...settings, checkout: { ...settings.checkout, linkValidHours: Number(event.target.value) || 24 } })} />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="soft-action" type="button" disabled={loadingCheckout} onClick={() => void loadCheckoutOptions()}>{t("تحديث الخيارات من زد", "Refresh from Zid")}</button>
            {settings.checkout.enabled && (!settings.checkout.shippingMethodId || !settings.checkout.paymentMethodId) ? <span style={{ ...hint, color: "#c0392b", opacity: 1 }}>{t("اختر طريقة الشحن وأدخل رقم طريقة الدفع ليعمل.", "Choose a delivery option and enter the payment method id for it to work.")}</span> : null}
          </div>
          {checkoutNote ? <span className="automation-feedback error">{checkoutNote}</span> : null}
          <span style={hint}>{t("لا يُشترى من واتساب إلا منتج مسحوب من زد (لديه SKU). غيره يُحوَّل لموظف.", "Only a product pulled from Zid (it has a SKU) can be bought from WhatsApp; anything else goes to a person.")}</span>
        </section>
      ) : section === "lookup" ? (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, cursor: "pointer" }}>
            <input type="checkbox" checked={settings.orderLookup.enabled} onChange={(event) => setSettings({ ...settings, orderLookup: { ...settings.orderLookup, enabled: event.target.checked } })} style={{ width: 18, height: 18 }} />
            {t("الرد على سؤال العميل عن حالة طلبه", "Answer customers who ask about their order")}
          </label>
          <section style={box}>
            <label style={{ display: "grid", gap: 4, cursor: "pointer" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}>
                <input type="checkbox" checked={settings.orderLookup.requirePhoneMatch} onChange={(event) => setSettings({ ...settings, orderLookup: { ...settings.orderLookup, requirePhoneMatch: event.target.checked } })} style={{ width: 18, height: 18 }} />
                {t("لا أجيب إلا إذا طابق جوال الطلب جوال المحادثة", "Only answer when the order's phone matches this chat")}
              </span>
              <span style={hint}>{t("موصى به بشدة: يمنع أي شخص من الاستعلام عن طلب غيره.", "Strongly recommended: stops anyone from asking about someone else's order.")}</span>
            </label>
            {settings.orderLookup.requirePhoneMatch ? (
              <>
                <label style={{ display: "grid", gap: 4, cursor: "pointer" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}>
                    <input type="checkbox" checked={settings.orderLookup.verifyWithLastDigits} onChange={(event) => setSettings({ ...settings, orderLookup: { ...settings.orderLookup, verifyWithLastDigits: event.target.checked } })} style={{ width: 18, height: 18 }} />
                    {t("إن سأل من جوال آخر: أطلب آخر 4 أرقام من جوال الطلب", "From another phone: ask for the last 4 digits of the order's phone")}
                  </span>
                  <span style={hint}>{t("يسمح للعميل بالاستعلام من جوال غير المسجّل بعد التحقق، ويمنع تخمين أرقام الطلبات.", "Lets a customer ask from a different phone after verifying, and stops order-number guessing.")}</span>
                </label>
                {settings.orderLookup.verifyWithLastDigits ? (
                  <label style={fieldLabel}>
                    {t("سؤال التحقق", "Verification question")}
                    <textarea style={{ ...input, minHeight: 64, padding: 10 }} value={settings.orderLookup.askDigitsText} onChange={(event) => setSettings({ ...settings, orderLookup: { ...settings.orderLookup, askDigitsText: event.target.value } })} />
                  </label>
                ) : null}
              </>
            ) : null}
            <span style={hint}>{t("المتغيرات المتاحة في النصوص: {{order}} رقم الطلب، {{status}} الحالة، {{name}} الاسم، {{company}} شركة الشحن، {{tracking}} رقم التتبع، {{link}} رابط التتبع.", "Available in the texts: {{order}} order number, {{status}} status, {{name}} name, {{company}} courier, {{tracking}} tracking number, {{link}} tracking link.")}</span>
            {STATUS_GROUPS.map((group) => (
              <label key={group} style={fieldLabel}>
                {{ review: t("قيد المراجعة", "Under review"), processing: t("قيد التجهيز", "Processing"), shipped: t("تم الشحن / جاري التوصيل", "Shipped / out for delivery"), delivered: t("تم التسليم", "Delivered"), cancelled: t("ملغي", "Cancelled"), other: t("حالة أخرى", "Other status") }[group]}
                <textarea style={{ ...input, minHeight: 76, padding: 10 }} value={settings.orderLookup.texts[group]} onChange={(event) => setSettings({ ...settings, orderLookup: { ...settings.orderLookup, texts: { ...settings.orderLookup.texts, [group]: event.target.value } } })} />
              </label>
            ))}
            <label style={fieldLabel}>
              {t("إذا لم يوجد الطلب أو لم يطابق الجوال", "When the order is not found or the phone does not match")}
              <textarea style={{ ...input, minHeight: 64, padding: 10 }} value={settings.orderLookup.notFoundText} onChange={(event) => setSettings({ ...settings, orderLookup: { ...settings.orderLookup, notFoundText: event.target.value } })} />
            </label>
            <label style={fieldLabel}>
              {t("إذا سأل بدون رقم الطلب", "When they ask without an order number")}
              <textarea style={{ ...input, minHeight: 64, padding: 10 }} value={settings.orderLookup.askNumberText} onChange={(event) => setSettings({ ...settings, orderLookup: { ...settings.orderLookup, askNumberText: event.target.value } })} />
            </label>
          </section>
        </>
      ) : section === "orders" ? (
        <section style={box}>
          <h4 style={sectionTitle}>{t("إشعار العميل على واتساب لكل حالة", "WhatsApp notification per order status")}</h4>
          <span style={hint}>{t("متغيرات القالب بالترتيب: {{1}} اسم العميل، {{2}} رقم الطلب، {{3}} الحالة، {{4}} رابط التتبع.", "Template variables in order: {{1}} customer name, {{2}} order number, {{3}} status, {{4}} tracking link.")}</span>
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
                {item.enabled && !item.template ? (() => {
                  const state = suggestion[event];
                  const text = state?.editing ? state.text : suggestedOrderMessage(event);
                  return (
                    <div style={{ border: "1px dashed var(--line, #cfd9d6)", borderRadius: 12, padding: 12, display: "grid", gap: 10, background: "rgba(15,118,110,0.04)" }}>
                      <strong style={{ fontSize: 13 }}>{t("قالب مقترح لهذه الحالة", "Suggested template for this status")}</strong>
                      {state?.editing ? (
                        <textarea style={{ ...input, minHeight: 110, padding: 10 }} value={state.text} onChange={(e) => patchSuggestion(event, { text: e.target.value, error: "" })} />
                      ) : (
                        <p style={{ margin: 0, lineHeight: 1.9, fontSize: 14 }}>{text}</p>
                      )}
                      <span style={hint}>{t("سيُرسل إلى Meta للمراجعة (فئة خدمة). يستغرق الاعتماد عادةً من دقائق إلى 24 ساعة، ويبدأ الإرسال بعد اعتماده.", "It is sent to Meta for review (utility). Approval usually takes minutes to 24 hours; sending starts once approved.")}</span>
                      {state?.error ? <span style={{ ...hint, color: "#c0392b", opacity: 1 }}>{state.error}</span> : null}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" className="primary-action" disabled={state?.busy} onClick={() => void submitSuggestion(event, text)}>
                          {state?.busy ? t("جارٍ الإرسال...", "Submitting...") : state?.editing ? t("إرسال للاعتماد", "Submit for approval") : t("اعتماد", "Approve")}
                        </button>
                        {state?.editing ? (
                          <button type="button" className="soft-action" disabled={state.busy} onClick={() => patchSuggestion(event, { editing: false, error: "" })}>{t("إلغاء التعديل", "Cancel editing")}</button>
                        ) : (
                          <button type="button" className="soft-action" onClick={() => patchSuggestion(event, { editing: true, text, error: "" })}>{t("تعديل", "Edit")}</button>
                        )}
                      </div>
                    </div>
                  );
                })() : null}
                {item.enabled && item.template && pendingTemplates.includes(item.template) ? (
                  <span style={hint}>{t("أُرسل القالب إلى Meta وهو قيد المراجعة. اضغط «حفظ» لتثبيت الاختيار.", "The template was sent to Meta and is under review. Press Save to keep the selection.")}</span>
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
            <span style={hint}>{t("متغيرات القالب بالترتيب: {{1}} اسم العميل، {{2}} قيمة السلة، {{3}} رابط إكمال الطلب، {{4}} كود الخصم.", "Template variables in order: {{1}} customer name, {{2}} cart total, {{3}} link to finish the order, {{4}} discount code.")}</span>
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
            {store === "zid" ? (
              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={cart.uniqueCoupon.enabled}
                    onChange={(event) => setCart({ uniqueCoupon: { ...cart.uniqueCoupon, enabled: event.target.checked } })}
                    style={{ width: 18, height: 18 }}
                  />
                  {t("كوبون خاص لكل عميل في آخر تذكير", "A unique coupon per customer on the last reminder")}
                </label>
                {cart.uniqueCoupon.enabled ? (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <label style={fieldLabel}>
                      {t("نسبة الخصم %", "Discount %")}
                      <input type="number" min={1} max={90} style={input} value={cart.uniqueCoupon.percent} onChange={(event) => setCart({ uniqueCoupon: { ...cart.uniqueCoupon, percent: Number(event.target.value) || 1 } })} />
                    </label>
                    <label style={fieldLabel}>
                      {t("صلاحية الكوبون (ساعات)", "Valid for (hours)")}
                      <input type="number" min={6} max={720} style={input} value={cart.uniqueCoupon.validHours} onChange={(event) => setCart({ uniqueCoupon: { ...cart.uniqueCoupon, validHours: Number(event.target.value) || 48 } })} />
                    </label>
                  </div>
                ) : null}
                <span style={hint}>{t("يحتاج صلاحية «الكوبونات» في تطبيق زد. إن تعذّر إنشاؤه يُستخدم الكود الثابت أدناه.", "Needs the app's Coupons scope. If it can't be created, the shared code below is used.")}</span>
              </div>
            ) : null}
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
