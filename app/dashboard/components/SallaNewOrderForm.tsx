"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Product = { id: string; name: string; sku: string; price: number; currency: string };
type Line = Product & { quantity: number };
type Branch = { id: string; name: string };
type Created = { id: string; reference: string; customerUrl: string };

const METHODS = ["mada", "credit_card", "bank", "cod"] as const;

/** Creates an order in Salla for a customer; the customer pays through Salla's payment link. */
export default function SallaNewOrderForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useLanguage();
  const [customer, setCustomer] = useState({ name: "", mobile: "", email: "" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [methods, setMethods] = useState<string[]>(["mada", "credit_card"]);
  const [delivery, setDelivery] = useState<"none" | "pickup">("none");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [coupon, setCoupon] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const methodLabel: Record<string, string> = {
    mada: t("مدى", "Mada"),
    credit_card: t("بطاقة ائتمانية", "Credit card"),
    bank: t("تحويل بنكي", "Bank transfer"),
    cod: t("الدفع عند الاستلام", "Cash on delivery")
  };

  useEffect(() => {
    fetch("/api/store-integrations/salla/orders/new", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; data?: { branches: Branch[] } }) => {
        if (result?.ok && result.data) setBranches(result.data.branches);
      })
      .catch(() => null);
  }, []);

  async function search() {
    setSearching(true);
    setError("");
    try {
      const response = await fetch(`/api/store-integrations/salla/catalog-search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { products: Product[] } } | null;
      if (!response.ok || !result?.ok || !result.data) setError(result?.error || t("تعذر جلب المنتجات", "Could not load the products"));
      else setResults(result.data.products);
    } catch {
      setError(t("تعذر الاتصال بالخادم", "Could not reach the server"));
    } finally {
      setSearching(false);
    }
  }

  function addProduct(product: Product) {
    setLines((current) => (current.some((line) => line.id === product.id) ? current.map((line) => (line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)) : [...current, { ...product, quantity: 1 }]));
  }

  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/store-integrations/salla/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer, products: lines.map((line) => ({ id: line.id, quantity: line.quantity })), acceptedMethods: methods, delivery: { method: delivery, branchId }, couponCode: coupon })
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: Created } | null;
      if (!response.ok || !result?.ok || !result.data) {
        setError(result?.error || t("تعذر إنشاء الطلب", "Could not create the order"));
        return;
      }
      setCreated(result.data);
      onCreated();
    } catch {
      setError(t("تعذر الاتصال بالخادم", "Could not reach the server"));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="shipment-form">
        <b className="store-order-ok">{t(`تم إنشاء الطلب #${created.reference} في سلة.`, `Order #${created.reference} created in Salla.`)}</b>
        {created.customerUrl ? (
          <>
            <span className="store-orders-hint">{t("أرسل هذا الرابط للعميل ليدفع ويكمل الطلب:", "Send this link to the customer to pay and complete the order:")}</span>
            <input readOnly dir="ltr" value={created.customerUrl} onFocus={(event) => event.currentTarget.select()} />
            <div className="store-order-actions">
              <button type="button" className="primary-action" onClick={() => { void navigator.clipboard?.writeText(created.customerUrl).then(() => setCopied(true)).catch(() => null); }}>{copied ? t("تم النسخ", "Copied") : t("نسخ الرابط", "Copy link")}</button>
            </div>
          </>
        ) : <span>{t("لم ترجع سلة رابط الدفع، افتح الطلب من لوحة سلة.", "Salla did not return a payment link; open the order in Salla.")}</span>}
        <button type="button" className="soft-action" onClick={onClose}>{t("إغلاق", "Close")}</button>
      </div>
    );
  }

  return (
    <div className="shipment-form">
      <b>{t("طلب جديد في سلة", "New Salla order")}</b>
      <div className="shipment-grid">
        <label>{t("اسم العميل", "Customer name")}<input value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label>
        <label>{t("الجوال (مع الرمز، مثل 966500000000)", "Mobile (with country code)")}<input dir="ltr" value={customer.mobile} onChange={(event) => setCustomer({ ...customer, mobile: event.target.value })} /></label>
        <label>{t("البريد الإلكتروني", "Email")}<input dir="ltr" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></label>
      </div>

      <label>
        {t("ابحث عن منتج", "Search for a product")}
        <span style={{ display: "flex", gap: 8 }}>
          <input style={{ flex: 1 }} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} />
          <button type="button" className="soft-action" disabled={searching} onClick={() => void search()}>{searching ? t("جارٍ البحث...", "Searching...") : t("بحث", "Search")}</button>
        </span>
      </label>
      {results.length ? (
        <div className="new-order-results">
          {results.map((product) => (
            <button type="button" key={product.id} onClick={() => addProduct(product)}>
              <span>{product.name}</span>
              <small>{product.price ? `${product.price.toLocaleString("en-US")} ${product.currency}` : ""}</small>
            </button>
          ))}
        </div>
      ) : null}

      {lines.length ? (
        <div className="new-order-lines">
          {lines.map((line) => (
            <div key={line.id}>
              <span>{line.name}</span>
              <input type="number" min={1} max={999} dir="ltr" value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => (item.id === line.id ? { ...item, quantity: Math.max(1, Math.floor(Number(event.target.value)) || 1) } : item)))} />
              <button type="button" className="soft-action" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>{t("حذف", "Remove")}</button>
            </div>
          ))}
          <small>{t("المجموع التقريبي قبل الضريبة والشحن:", "Approximate total before tax and shipping:")} {total.toLocaleString("en-US")}</small>
        </div>
      ) : null}

      <fieldset className="new-order-methods">
        <legend>{t("طرق الدفع المتاحة للعميل", "Payment methods offered to the customer")}</legend>
        {METHODS.map((method) => (
          <label key={method} className="shipment-confirm">
            <input type="checkbox" checked={methods.includes(method)} onChange={(event) => setMethods((current) => (event.target.checked ? [...current, method] : current.filter((item) => item !== method)))} />
            {methodLabel[method]}
          </label>
        ))}
      </fieldset>

      <label>
        {t("التوصيل", "Delivery")}
        <select value={delivery} onChange={(event) => setDelivery(event.target.value as "none" | "pickup")}>
          <option value="none">{t("بدون توصيل الآن (يُحدَّد لاحقًا من سلة)", "No delivery yet (set later in Salla)")}</option>
          <option value="pickup">{t("استلام من الفرع", "Pickup from a branch")}</option>
        </select>
      </label>
      {delivery === "pickup" ? (
        <label>
          {t("الفرع", "Branch")}
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="">{t("اختر الفرع", "Choose a branch")}</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
      ) : null}
      <label>{t("كود الخصم (اختياري)", "Coupon code (optional)")}<input dir="ltr" value={coupon} onChange={(event) => setCoupon(event.target.value)} /></label>
      <span className="store-orders-hint">{t("يُنشأ الطلب بحالة «بانتظار الدفع» ويدفعه العميل من رابط سلة. التوصيل للعنوان يلزم تحديده من سلة أو عبر «تعديل العنوان والمستلم» بعد إنشاء الطلب.", "The order is created as pending payment and the customer pays through Salla's link. Home delivery has to be set in Salla or with “Edit address & recipient” after creating the order.")}</span>
      {error ? <span className="store-orders-error">{error}</span> : null}
      <div className="store-order-actions">
        <button type="button" className="primary-action" disabled={busy || !lines.length || !methods.length} onClick={() => void submit()}>{busy ? t("جارٍ الإنشاء...", "Creating...") : t("إنشاء الطلب", "Create order")}</button>
        <button type="button" className="soft-action" disabled={busy} onClick={onClose}>{t("إلغاء", "Cancel")}</button>
      </div>
    </div>
  );
}
