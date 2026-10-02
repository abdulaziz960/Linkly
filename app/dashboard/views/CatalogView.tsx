"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";

type Product = {
  id: string;
  externalId: string;
  source: "manual" | "api" | "feed";
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  productUrl: string;
  category: string;
  sku: string;
  stock: number;
  active: boolean;
};

type Order = {
  id: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  total: number;
  quantity: number;
  currency: string;
  status: "new" | "awaiting_payment" | "paid" | "cancelled" | "fulfilled";
  paymentUrl: string;
  createdAt: string;
};

type Settings = {
  paymentEnabled: boolean;
  hasGatewayKey: boolean;
  gatewayKeyMode: "live" | "test" | "";
  feedUrl: string;
  feedIntervalMinutes: number;
  feedLastSyncedAt: string;
  feedLastStatus: string;
  feedLastMessage: string;
  canManagePayment: boolean;
};

type ProductForm = {
  id?: string;
  name: string;
  price: string;
  category: string;
  sku: string;
  stock: string;
  imageUrl: string;
  productUrl: string;
  description: string;
  active: boolean;
};

const emptyForm: ProductForm = { name: "", price: "", category: "", sku: "", stock: "", imageUrl: "", productUrl: "", description: "", active: true };

const orderStatuses: Array<Order["status"]> = ["new", "awaiting_payment", "paid", "fulfilled", "cancelled"];

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return { ok: false, error: payload?.error || "حدث خطأ" };
    return { ok: true, data: payload.data as T };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم" };
  }
}

export default function CatalogView() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"products" | "orders" | "settings">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [gatewayKey, setGatewayKey] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [feedInterval, setFeedInterval] = useState(360);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const [productsResult, ordersResult, settingsResult] = await Promise.all([
      api<Product[]>("/api/catalog/products"),
      api<Order[]>("/api/catalog/orders"),
      api<Settings>("/api/catalog/settings")
    ]);
    if (productsResult.ok) setProducts(productsResult.data ?? []);
    if (ordersResult.ok) setOrders(ordersResult.data ?? []);
    if (settingsResult.ok && settingsResult.data) {
      setSettings(settingsResult.data);
      setFeedUrl(settingsResult.data.feedUrl);
      setFeedInterval(settingsResult.data.feedIntervalMinutes);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusLabel = (status: Order["status"]) => ({
    new: t("جديد - بحاجة متابعة", "New - needs follow-up"),
    awaiting_payment: t("بانتظار الدفع", "Awaiting payment"),
    paid: t("مدفوع", "Paid"),
    fulfilled: t("تم التسليم", "Fulfilled"),
    cancelled: t("ملغي", "Cancelled")
  })[status];

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => [product.name, product.category, product.sku].join(" ").toLowerCase().includes(query));
  }, [products, search]);

  function openForm(product?: Product) {
    setFormError("");
    setForm(product ? {
      id: product.id,
      name: product.name,
      price: String(product.price),
      category: product.category,
      sku: product.sku,
      stock: product.stock < 0 ? "" : String(product.stock),
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
      description: product.description,
      active: product.active
    } : emptyForm);
    setFormOpen(true);
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const body = { ...form, stock: form.stock.trim() === "" ? -1 : Number(form.stock) };
    const result = await api<Product>(form.id ? `/api/catalog/products/${form.id}` : "/api/catalog/products", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error || t("تعذر الحفظ", "Could not save"));
      return;
    }
    setFormOpen(false);
    await load();
  }

  async function toggleActive(product: Product) {
    await api(`/api/catalog/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlyActive: true, active: !product.active })
    });
    await load();
  }

  async function removeProduct(product: Product) {
    if (!window.confirm(t(`حذف المنتج "${product.name}"؟`, `Delete "${product.name}"?`))) return;
    await api(`/api/catalog/products/${product.id}`, { method: "DELETE" });
    await load();
  }

  async function changeOrderStatus(order: Order, status: Order["status"]) {
    await api(`/api/catalog/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    await load();
  }

  async function saveSettings(patch: Record<string, unknown>, successMessage: string) {
    setNotice(null);
    const result = await api<Settings>("/api/catalog/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!result.ok) {
      setNotice({ type: "error", message: result.error || t("تعذر حفظ الإعدادات", "Could not save settings") });
      return false;
    }
    setSettings(result.data ?? null);
    setNotice({ type: "success", message: successMessage });
    return true;
  }

  async function syncNow() {
    setSyncing(true);
    setNotice(null);
    const result = await api<{ created: number; updated: number; skipped: number; deactivated: number }>("/api/catalog/sync", { method: "POST" });
    setSyncing(false);
    if (!result.ok) {
      setNotice({ type: "error", message: result.error || t("تعذرت المزامنة", "Sync failed") });
    } else {
      const data = result.data!;
      setNotice({ type: "success", message: t(`تمت المزامنة: ${data.created} جديد، ${data.updated} محدّث، ${data.skipped} متجاهل`, `Synced: ${data.created} new, ${data.updated} updated, ${data.skipped} skipped`) });
    }
    await load();
  }

  const canManagePayment = settings?.canManagePayment ?? false;
  const intervalOptions = [
    { value: "15", label: t("كل 15 دقيقة", "Every 15 minutes") },
    { value: "60", label: t("كل ساعة", "Every hour") },
    { value: "360", label: t("كل 6 ساعات", "Every 6 hours") },
    { value: "1440", label: t("كل 24 ساعة", "Every 24 hours") }
  ];

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>{t("الكتالوج", "Catalog")}</h2>
          <span />
          <div className="row-actions">
            <button className={tab === "products" ? "btn primary" : "btn soft"} type="button" onClick={() => setTab("products")}>{t("المنتجات", "Products")} ({products.length})</button>
            <button className={tab === "orders" ? "btn primary" : "btn soft"} type="button" onClick={() => setTab("orders")}>{t("الطلبات", "Orders")} ({orders.length})</button>
            <button className={tab === "settings" ? "btn primary" : "btn soft"} type="button" onClick={() => setTab("settings")}>{t("الدفع والمزامنة", "Payment & sync")}</button>
          </div>
        </div>
      </div>

      {tab === "products" ? (
        <div className="panel">
          <div className="panel-head">
            <h2>{t("المنتجات", "Products")}</h2>
            <span />
            <button className="btn primary" type="button" onClick={() => openForm()}>{t("إضافة منتج", "Add product")}</button>
          </div>
          <div className="panel-body table-wrap">
            <p className="muted-copy">{t("تظهر المنتجات النشطة للعملاء عبر خطوة \"عرض الكتالوج\" في الرد الآلي. يمكنك إضافتها يدويًا، أو مزامنتها تلقائيًا من موقعك (تبويب الدفع والمزامنة).", "Active products are shown to customers through the \"Show catalog\" step of the auto-reply. Add them by hand, or sync them automatically from your website (Payment & sync tab).")}</p>
            <input className="catalog-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("ابحث بالاسم أو التصنيف أو الرمز", "Search by name, category or SKU")} />
            <table className="mobile-card-table">
              <thead><tr><th>{t("المنتج", "Product")}</th><th>{t("السعر", "Price")}</th><th>{t("التصنيف", "Category")}</th><th>{t("المخزون", "Stock")}</th><th>{t("المصدر", "Source")}</th><th>{t("الحالة", "Status")}</th><th>{t("إجراء", "Action")}</th></tr></thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <span className="catalog-product-cell">
                        {product.imageUrl ? <img src={product.imageUrl} alt="" width={40} height={40} className="catalog-thumb" /> : <span className="catalog-thumb catalog-thumb-empty" aria-hidden="true">▣</span>}
                        <b>{product.name}</b>
                      </span>
                    </td>
                    <td data-label={t("السعر", "Price")}>{product.price} {t("ر.س", "SAR")}</td>
                    <td data-label={t("التصنيف", "Category")}>{product.category || "-"}</td>
                    <td data-label={t("المخزون", "Stock")}>{product.stock < 0 ? t("غير محدد", "Not tracked") : product.stock === 0 ? t("نفد", "Out of stock") : product.stock}</td>
                    <td data-label={t("المصدر", "Source")}>{product.source === "manual" ? t("يدوي", "Manual") : product.source === "feed" ? t("ملف الموقع", "Website feed") : "API"}</td>
                    <td data-label={t("الحالة", "Status")}><span className={product.active ? "state ok" : "state muted"}>{product.active ? t("ظاهر", "Visible") : t("مخفي", "Hidden")}</span></td>
                    <td className="row-actions" data-label={t("إجراء", "Action")}>
                      <button className="btn soft" type="button" onClick={() => openForm(product)}>{t("تعديل", "Edit")}</button>
                      <button className="btn soft" type="button" onClick={() => toggleActive(product)}>{product.active ? t("إخفاء", "Hide") : t("إظهار", "Show")}</button>
                      <button className="btn danger" type="button" onClick={() => removeProduct(product)}>{t("حذف", "Delete")}</button>
                    </td>
                  </tr>
                ))}
                {!filteredProducts.length ? <tr><td colSpan={7}>{loading ? t("جاري التحميل...", "Loading...") : t("لا توجد منتجات بعد. أضف أول منتج أو اربط موقعك.", "No products yet. Add your first product or connect your website.")}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "orders" ? (
        <div className="panel">
          <div className="panel-head"><h2>{t("الطلبات", "Orders")}</h2></div>
          <div className="panel-body table-wrap">
            <table className="mobile-card-table">
              <thead><tr><th>{t("التاريخ", "Date")}</th><th>{t("العميل", "Customer")}</th><th>{t("المنتج", "Product")}</th><th>{t("المبلغ", "Amount")}</th><th>{t("الحالة", "Status")}</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{new Date(order.createdAt).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" })}</td>
                    <td data-label={t("العميل", "Customer")}>{order.customerName || "-"}<br /><small dir="ltr">{order.customerPhone}</small></td>
                    <td data-label={t("المنتج", "Product")}>{order.productName}{order.quantity > 1 ? ` × ${order.quantity}` : ""}</td>
                    <td data-label={t("المبلغ", "Amount")}>{order.total} {t("ر.س", "SAR")}</td>
                    <td data-label={t("الحالة", "Status")}>
                      <CustomSelect
                        value={order.status}
                        ariaLabel={t("حالة الطلب", "Order status")}
                        onChange={(value) => void changeOrderStatus(order, value as Order["status"])}
                        options={orderStatuses.map((status) => ({ value: status, label: statusLabel(status) }))}
                      />
                    </td>
                  </tr>
                ))}
                {!orders.length ? <tr><td colSpan={5}>{loading ? t("جاري التحميل...", "Loading...") : t("لا توجد طلبات بعد.", "No orders yet.")}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "settings" ? (
        <>
          {notice ? <p className={`automation-feedback ${notice.type}`} role="status">{notice.message}</p> : null}

          <div className="panel">
            <div className="panel-head"><h2>{t("الدفع من الواتساب", "Pay from WhatsApp")}</h2></div>
            <div className="panel-body">
              <p>{t("عند التفعيل، يحصل العميل بعد اختيار المنتج على رابط دفع آمن داخل المحادثة. الدفع يتم عبر حساب ميسر الخاص بك أنت، والمبلغ يصل مباشرة لحسابك - لنكلي لا يستلم ولا يحتفظ بأي مبالغ.", "When enabled, the customer gets a secure payment link in the chat after choosing a product. Payment goes through YOUR OWN Moyasar account and the money lands directly with you - Linkly never receives or holds any funds.")}</p>
              <p className="muted-copy">{t("عند الإيقاف، يُسجَّل الطلب ويتواصل معه موظف لإتمام الدفع والتسليم.", "When off, the order is recorded and an employee follows up to complete payment and delivery.")}</p>
              {canManagePayment ? (
                <>
                  <label className="automation-switch">
                    <input
                      type="checkbox"
                      checked={Boolean(settings?.paymentEnabled)}
                      disabled={!settings?.hasGatewayKey}
                      aria-label={t("تفعيل الدفع", "Enable payment")}
                      onChange={(event) => void saveSettings({ paymentEnabled: event.target.checked }, event.target.checked ? t("تم تفعيل الدفع", "Payment enabled") : t("تم إيقاف الدفع", "Payment disabled"))}
                    />
                    <span>{settings?.paymentEnabled ? t("الدفع مفعّل", "Payment on") : t("الدفع متوقف", "Payment off")}</span>
                  </label>
                  <label className="reengagement-field">
                    <span>{t("المفتاح السري من ميسر (Secret Key)", "Moyasar Secret Key")}</span>
                    <input type="password" autoComplete="off" value={gatewayKey} onChange={(event) => setGatewayKey(event.target.value)} placeholder={settings?.hasGatewayKey ? "••••••••••••" : "sk_live_..."} dir="ltr" />
                    <small>
                      {settings?.hasGatewayKey
                        ? t(`مفتاح محفوظ (${settings.gatewayKeyMode === "live" ? "وضع حقيقي" : "وضع تجريبي"}). اكتب مفتاحًا جديدًا لاستبداله.`, `Key saved (${settings.gatewayKeyMode === "live" ? "live mode" : "test mode"}). Enter a new one to replace it.`)
                        : t("من لوحة ميسر ← الإعدادات ← مفاتيح API. يُخزَّن مشفّرًا ولا يظهر مرة أخرى.", "From the Moyasar dashboard → Settings → API keys. Stored encrypted and never shown again.")}
                    </small>
                  </label>
                  <div className="row-actions">
                    <button className="btn primary" type="button" disabled={!gatewayKey.trim()} onClick={async () => { if (await saveSettings({ gatewaySecretKey: gatewayKey.trim() }, t("تم حفظ مفتاح الدفع", "Payment key saved"))) setGatewayKey(""); }}>{t("حفظ المفتاح", "Save key")}</button>
                    {settings?.hasGatewayKey ? <button className="btn danger" type="button" onClick={() => { if (window.confirm(t("حذف مفتاح الدفع وإيقاف الدفع؟", "Remove the payment key and turn payment off?"))) void saveSettings({ clearGatewayKey: true }, t("تم حذف المفتاح", "Key removed")); }}>{t("حذف المفتاح", "Remove key")}</button> : null}
                  </div>
                </>
              ) : (
                <p className="muted-copy">{t("إعدادات الدفع متاحة لمالك الحساب فقط.", "Payment settings are available to the account owner only.")}</p>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>{t("مزامنة المنتجات من موقعك", "Sync products from your website")}</h2></div>
            <div className="panel-body">
              <p>{t("ضع رابط ملف المنتجات في موقعك (JSON أو XML أو CSV - مثل ملف Google Merchant)، وسيسحب لنكلي المنتجات ويحدّثها تلقائيًا. المنتجات التي تُحذف من الملف تُخفى من الكتالوج.", "Enter your website's product file URL (JSON, XML or CSV - e.g. a Google Merchant feed) and Linkly pulls and refreshes the products automatically. Products removed from the file are hidden from the catalog.")}</p>
              <label className="reengagement-field">
                <span>{t("رابط ملف المنتجات", "Product feed URL")}</span>
                <input type="url" value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} placeholder="https://example.com/products.json" dir="ltr" />
              </label>
              <label className="reengagement-field">
                <span>{t("مدة التحديث التلقائي", "Auto-refresh interval")}</span>
                <CustomSelect value={String(feedInterval)} options={intervalOptions} onChange={(value) => setFeedInterval(Number(value))} />
              </label>
              <div className="row-actions">
                <button className="btn primary" type="button" onClick={() => void saveSettings({ feedUrl: feedUrl.trim(), feedIntervalMinutes: feedInterval }, t("تم حفظ إعدادات المزامنة", "Sync settings saved"))}>{t("حفظ", "Save")}</button>
                <button className="btn soft" type="button" disabled={syncing || !settings?.feedUrl} onClick={() => void syncNow()}>{syncing ? t("جاري المزامنة...", "Syncing...") : t("مزامنة الآن", "Sync now")}</button>
              </div>
              {settings?.feedLastSyncedAt ? (
                <p className={settings.feedLastStatus === "error" ? "form-error" : "muted-copy"}>
                  {t("آخر مزامنة:", "Last sync:")} {new Date(settings.feedLastSyncedAt).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" })} - {settings.feedLastMessage}
                </p>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>{t("موقع مبرمج خصيصًا؟ اربطه عبر API", "Custom-built website? Connect via API")}</h2></div>
            <div className="panel-body">
              <p>{t("أنشئ مفتاح API من صفحة \"المطورون\"، ثم أرسل منتجات موقعك إلى لنكلي كلما تغيّرت (حتى 100 منتج في الطلب الواحد). إعادة إرسال نفس externalId تحدّث المنتج بدل تكراره.", "Create an API key on the Developers page, then push your website's products to Linkly whenever they change (up to 100 per request). Re-sending the same externalId updates the product instead of duplicating it.")}</p>
              <pre className="code-block">{`curl -X POST https://linklysa.io/api/v1/products \\
  -H "Authorization: Bearer lk_xxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"products":[{"externalId":"sku-1001","name":"قميص قطن","price":149.5,"imageUrl":"https://example.com/shirt.jpg","productUrl":"https://example.com/p/1001","category":"ملابس","stock":12,"description":"قميص قطن 100%"}]}'

# حذف منتج: DELETE https://linklysa.io/api/v1/products/sku-1001`}</pre>
            </div>
          </div>
        </>
      ) : null}

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("منتج", "Product")} onSubmit={submitProduct} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button><h2>{form.id ? t("تعديل منتج", "Edit product") : t("إضافة منتج", "Add product")}</h2></header>
            <div className="account-modal-body form-grid">
              <label><span>{t("اسم المنتج", "Name")}</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={120} /></label>
              <div className="split-fields">
                <label><span>{t("السعر (ر.س)", "Price (SAR)")}</span><input type="number" min={0} step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label>
                <label><span>{t("المخزون (اتركه فارغًا لعدم التتبع)", "Stock (blank = not tracked)")}</span><input type="number" min={0} value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></label>
              </div>
              <div className="split-fields">
                <label><span>{t("التصنيف", "Category")}</span><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} maxLength={80} /></label>
                <label><span>{t("الرمز (SKU)", "SKU")}</span><input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} maxLength={80} dir="ltr" /></label>
              </div>
              <label><span>{t("رابط الصورة (https)", "Image URL (https)")}</span><input type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." dir="ltr" /></label>
              <label><span>{t("رابط صفحة المنتج في موقعك (اختياري)", "Product page URL on your site (optional)")}</span><input type="url" value={form.productUrl} onChange={(event) => setForm({ ...form, productUrl: event.target.value })} placeholder="https://..." dir="ltr" /></label>
              <label><span>{t("الوصف", "Description")}</span><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={2000} /></label>
              <label className="automation-switch"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>{form.active ? t("ظاهر للعملاء", "Visible to customers") : t("مخفي", "Hidden")}</span></label>
              {formError ? <p className="form-error">{formError}</p> : null}
            </div>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button><button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
