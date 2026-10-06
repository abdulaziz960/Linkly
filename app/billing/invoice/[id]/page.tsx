import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth";
import { getInvoiceForTenant } from "../../../../lib/subscriptions";
import { getTenantBranding } from "../../../../lib/tenant-branding";
import InvoicePrintButton from "./InvoicePrintButton";
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

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) redirect("/login");

  const { id } = await params;
  const [invoice, branding] = await Promise.all([getInvoiceForTenant(user.tenantId, id), getTenantBranding(user.tenantId)]);

  if (!invoice) {
    return (
      <main className="invoice-page">
        <div className="invoice-card">
          <p className="invoice-not-found">لم يتم العثور على هذه الفاتورة.</p>
          <Link href="/dashboard">العودة إلى لوحة التحكم</Link>
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
  const itemLabelEn = isSubscription ? `Linkly subscription - ${invoice.planName || "plan"}` : "Campaign message top-up";
  const qty = isSubscription ? 1 : invoice.messages;

  const accentStyle = { "--inv-accent": branding.color } as React.CSSProperties;
  const amountText = invoice.amount.toLocaleString("en-US");

  return (
    <main className="invoice-page" style={accentStyle}>
      <div className="invoice-card">
        <div className="invoice-head">
          <div className="invoice-brand">
            {/* Branding logos can be data URLs, which next/image does not support. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {branding.logoDataUrl ? <img src={branding.logoDataUrl} alt="" /> : null}
            <h1>{branding.name}</h1>
          </div>
          <div className="invoice-title">
            <strong>إيصال دفع</strong>
            <span className="invoice-sub">Payment receipt</span>
            <span className={`invoice-status-badge ${isPaid ? "paid" : "pending"}`}>
              {isPaid ? "تم الدفع" : "قيد الانتظار"} <em>{isPaid ? "Paid" : "Pending"}</em>
            </span>
          </div>
        </div>

        <div className="invoice-meta">
          <div>
            <span className="invoice-label">رقم الإيصال <em>Receipt No</em></span>
            <b dir="ltr">{receiptNo}</b>
          </div>
          <div>
            <span className="invoice-label">تاريخ الإصدار <em>Issued</em></span>
            <b dir="ltr">{formatDateOnly(invoice.createdAt)}</b>
          </div>
          <div>
            <span className="invoice-label">طريقة الدفع <em>Payment method</em></span>
            <b>{paymentMethodLabel.ar}<small>{paymentMethodLabel.en}</small></b>
          </div>
          {periodCovered ? (
            <div>
              <span className="invoice-label">الفترة المغطاة <em>Period covered</em></span>
              <b dir="ltr">{periodCovered}</b>
            </div>
          ) : null}
        </div>

        <div className="invoice-billed">
          <span className="invoice-label">صادرة إلى <em>Billed to</em></span>
          <b>{invoice.companyName}</b>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>الوصف <em>Description</em></th>
              <th className="num">الكمية <em>Qty</em></th>
              <th className="num">المبلغ <em>Amount</em></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>{itemLabelAr}</b>
                <small>{itemLabelEn}</small>
              </td>
              <td className="num" dir="ltr">{qty.toLocaleString("en-US")}</td>
              <td className="num"><span dir="ltr">{amountText}</span> ر.س</td>
            </tr>
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="invoice-totals-box">
            <div>
              <span>المجموع الفرعي <em>Subtotal</em></span>
              <b><span dir="ltr">{amountText}</span> ر.س</b>
            </div>
            <div className="invoice-total-paid">
              <span>{isPaid ? "الإجمالي المدفوع" : "الإجمالي المستحق"} <em>{isPaid ? "Total paid" : "Total due"}</em></span>
              <b><span dir="ltr">{amountText}</span> ر.س</b>
            </div>
          </div>
        </div>

        <div className="invoice-foot">
          <span>شكرًا لاشتراكك في {branding.name}.</span>
          <span>Thank you for your subscription</span>
        </div>

        <div className="invoice-actions">
          <InvoicePrintButton />
          <Link className="secondary" href="/dashboard">العودة للوحة التحكم</Link>
        </div>
      </div>
    </main>
  );
}
