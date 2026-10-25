import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth";
import { getInvoiceForTenant } from "../../../../lib/subscriptions";
import { getTenantBranding } from "../../../../lib/tenant-branding";
import InvoicePrintButton from "./InvoicePrintButton";
import { planDisplayName } from "../../../../lib/plan-features";
import { paymentTaxBreakdown, SELLER } from "../../../../lib/vat";
import "../invoice.css";

export const metadata = { title: { absolute: "فاتورة | Linkly" } };

function formatDateOnly(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

function addOneMonth(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return date;
  date.setMonth(date.getMonth() + 1);
  return date;
}

/**
 * Human labels for the gateway's payment-method string ("creditcard/mada",
 * "applepay", "stcpay", "manual", ...). Unknown values fall back to "Card".
 */
function paymentMethodDisplay(method: string | undefined, gateway: string | undefined) {
  const value = (method || "").toLowerCase();
  if (gateway === "manual" || value === "manual") return { en: "Manual credit", ar: "إضافة يدوية" };
  if (value.includes("applepay")) return { en: "Apple Pay", ar: "Apple Pay" };
  if (value.includes("stcpay")) return { en: "stc pay", ar: "stc pay" };
  if (value.includes("mada")) return { en: "mada card", ar: "بطاقة مدى" };
  if (value.includes("visa")) return { en: "Visa card", ar: "بطاقة Visa" };
  if (value.includes("master")) return { en: "Mastercard", ar: "بطاقة Mastercard" };
  if (value === "simulated") return { en: "Test payment", ar: "دفع تجريبي" };
  return { en: "Card", ar: "بطاقة" };
}

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string }> }) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) redirect("/login");

  const { id } = await params;
  const en = (await searchParams).lang === "en";
  const bi = (ar: string, english: string) => (en ? english : <>{ar} <em>{english}</em></>);
  const cur = en ? "SAR" : "ر.س";
  const [invoice, branding] = await Promise.all([getInvoiceForTenant(user.tenantId, id), getTenantBranding(user.tenantId)]);

  if (!invoice) {
    return (
      <main className="invoice-page" dir={en ? "ltr" : undefined}>
        <div className="invoice-card">
          <p className="invoice-not-found">{en ? "This invoice was not found." : "لم يتم العثور على هذه الفاتورة."}</p>
          <Link href="/dashboard">{en ? "Back to dashboard" : "العودة إلى لوحة التحكم"}</Link>
        </div>
      </main>
    );
  }

  const isPaid = invoice.status === "مكتمل";
  const isSubscription = invoice.source === "اشتراك";
  const receiptNo = (invoice.gatewayPaymentId || invoice.moyasarId || invoice.id).slice(0, 20).toUpperCase();
  // Confirmed payments carry the exact period they bought (a renewal paid
  // early extends from the previous paid-through date). Older rows and
  // still-pending invoices fall back to "one month from creation".
  const periodCovered = isSubscription
    ? invoice.periodStart && invoice.periodEnd
      ? `${formatDateOnly(invoice.periodStart)} - ${formatDateOnly(invoice.periodEnd)}`
      : `${formatDateOnly(invoice.createdAt)} - ${formatDateOnly(addOneMonth(invoice.createdAt).toISOString())}`
    : null;
  const paymentMethodLabel = paymentMethodDisplay(invoice.paymentMethod, invoice.gateway);
  const itemLabelAr = isSubscription ? `اشتراك Linkly - ${invoice.planName || "باقة"}` : `شحن رسائل حملات`;
  const itemLabelEn = isSubscription ? `Linkly subscription - ${invoice.planName ? planDisplayName(invoice.planName, "en") : "plan"}` : "Campaign message top-up";
  const qty = isSubscription ? 1 : invoice.messages;

  const accentStyle = { "--inv-accent": branding.color } as React.CSSProperties;
  // Tax lines: tax added on top of the price, or (for a payment made before tax was added) the tax inside the amount paid.
  const tax = paymentTaxBreakdown(invoice);
  const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const taxed = tax.mode !== "none";
  const amountText = money(taxed ? tax.net : tax.total);

  return (
    <main className="invoice-page" style={accentStyle} dir={en ? "ltr" : undefined}>
      <div className="invoice-card">
        <div className="invoice-head">
          <div className="invoice-brand">
            {/* Branding logos can be data URLs, which next/image does not support. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {branding.logoDataUrl ? <img src={branding.logoDataUrl} alt="" /> : null}
            <h1>{branding.name}</h1>
          </div>
          <div className="invoice-title">
            <strong>{taxed ? (en ? "Tax invoice" : "فاتورة ضريبية") : (en ? "Payment receipt" : "إيصال دفع")}</strong>
            {en ? null : <span className="invoice-sub">{taxed ? "Tax invoice" : "Payment receipt"}</span>}
            <span className={`invoice-status-badge ${isPaid ? "paid" : "pending"}`}>
              {en ? (isPaid ? "Paid" : "Pending") : <>{isPaid ? "تم الدفع" : "قيد الانتظار"} <em>{isPaid ? "Paid" : "Pending"}</em></>}
            </span>
          </div>
        </div>

        <div className="invoice-meta">
          <div>
            <span className="invoice-label">{bi("رقم الإيصال", "Receipt No")}</span>
            <b dir="ltr">{receiptNo}</b>
          </div>
          <div>
            <span className="invoice-label">{bi("تاريخ الإصدار", "Issued")}</span>
            <b dir="ltr">{formatDateOnly(invoice.createdAt)}</b>
          </div>
          <div>
            <span className="invoice-label">{bi("طريقة الدفع", "Payment method")}</span>
            <b>{en ? paymentMethodLabel.en : <>{paymentMethodLabel.ar}<small>{paymentMethodLabel.en}</small></>}</b>
          </div>
          {periodCovered ? (
            <div>
              <span className="invoice-label">{bi("الفترة المغطاة", "Period covered")}</span>
              <b dir="ltr">{periodCovered}</b>
            </div>
          ) : null}
        </div>

        {taxed ? (
          <div className="invoice-billed invoice-seller">
            <span className="invoice-label">{bi("البائع", "Seller")}</span>
            <b>{SELLER.name}</b>
            <small>{SELLER.address}</small>
            <small>{bi("الرقم الضريبي", "VAT number")}: <span dir="ltr">{SELLER.vatNumber}</span> · {bi("السجل التجاري", "CR")}: <span dir="ltr">{SELLER.crNumber}</span></small>
          </div>
        ) : null}

        <div className="invoice-billed">
          <span className="invoice-label">{bi("صادرة إلى", "Billed to")}</span>
          <b>{invoice.companyName}</b>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>{bi("الوصف", "Description")}</th>
              <th className="num">{bi("الكمية", "Qty")}</th>
              <th className="num">{bi("المبلغ", "Amount")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>{en ? itemLabelEn : itemLabelAr}</b>
                {en ? null : <small>{itemLabelEn}</small>}
              </td>
              <td className="num" dir="ltr">{qty.toLocaleString("en-US")}</td>
              <td className="num"><span dir="ltr">{amountText}</span> {cur}</td>
            </tr>
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="invoice-totals-box">
            <div>
              <span>{taxed ? bi("المجموع قبل الضريبة", "Subtotal (excl. VAT)") : bi("المجموع الفرعي", "Subtotal")}</span>
              <b><span dir="ltr">{amountText}</span> {cur}</b>
            </div>
            {taxed ? (
              <div>
                <span>{bi("ضريبة القيمة المضافة 15%", "VAT 15%")}</span>
                <b><span dir="ltr">{money(tax.vat)}</span> {cur}</b>
              </div>
            ) : null}
            <div className="invoice-total-paid">
              <span>{en ? (isPaid ? "Total paid" : "Total due") : <>{isPaid ? "الإجمالي المدفوع" : "الإجمالي المستحق"} <em>{isPaid ? "Total paid" : "Total due"}</em></>}{taxed ? (en ? " (incl. VAT)" : " (شامل الضريبة)") : ""}</span>
              <b><span dir="ltr">{money(tax.total)}</span> {cur}</b>
            </div>
          </div>
        </div>

        <div className="invoice-foot">
          {en ? <span>Thank you for subscribing to {branding.name}.</span> : <><span>شكرًا لاشتراكك في {branding.name}.</span><span>Thank you for your subscription</span></>}
        </div>

        <div className="invoice-actions">
          <InvoicePrintButton lang={en ? "en" : "ar"} />
          <Link className="secondary" href="/dashboard">{en ? "Back to dashboard" : "العودة للوحة التحكم"}</Link>
        </div>
      </div>
    </main>
  );
}
