import { formatNumber } from "../../../../lib/format";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth";
import { getInvoicesForTenant, getSubscriptionForTenant } from "../../../../lib/subscriptions";
import { getTenantBranding } from "../../../../lib/tenant-branding";
import InvoicePrintButton from "../../invoice/[id]/InvoicePrintButton";
import { billingLabel } from "../../../../lib/billing-labels";
import { planDisplayName } from "../../../../lib/plan-features";
import { paymentTaxBreakdown, SELLER } from "../../../../lib/vat";
import "../../invoice/invoice.css";

export const metadata = { title: { absolute: "كشف الفواتير | Linkly" } };

function formatDateOnly(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

export default async function InvoicesStatementPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; lang?: string }> }) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) redirect("/login");

  const { from, to, lang: langParam } = await searchParams;
  const en = langParam === "en";
  const bi = (ar: string, english: string) => (en ? english : <>{ar} <em>{english}</em></>);
  const cur = en ? "SAR" : "ر.س";
  const [subscription, allInvoices, branding] = await Promise.all([
    getSubscriptionForTenant(user.tenantId),
    getInvoicesForTenant(user.tenantId),
    getTenantBranding(user.tenantId)
  ]);

  const invoices = allInvoices.filter((invoice) => {
    const invoiceDate = invoice.createdAt.slice(0, 10);
    if (from && invoiceDate < from) return false;
    if (to && invoiceDate > to) return false;
    return true;
  });

  const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const paidTax = invoices.filter((invoice) => invoice.status === "مكتمل").map((invoice) => paymentTaxBreakdown(invoice));
  const totalNet = paidTax.reduce((sum, row) => sum + row.net, 0);
  const totalVat = paidTax.reduce((sum, row) => sum + row.vat, 0);
  const totalPaid = paidTax.reduce((sum, row) => sum + row.total, 0);
  // Reflect the actual coverage: an explicit from/to wins, otherwise fall
  // back to the earliest/latest invoice actually included rather than a
  // vague "all time" label.
  const invoiceDates = invoices.map((invoice) => invoice.createdAt).sort();
  const earliest = from || invoiceDates[0];
  const latest = to || invoiceDates[invoiceDates.length - 1];
  const periodLabel = earliest && latest ? `${formatDateOnly(earliest)} - ${formatDateOnly(latest)}` : formatDateOnly(new Date().toISOString());

  const accentStyle = { "--inv-accent": branding.color } as React.CSSProperties;
  const clientName = subscription?.companyName || user.tenantId;

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
            <strong>{en ? "Invoice statement" : "كشف الفواتير"}</strong>
            {en ? null : <span className="invoice-sub">Invoice statement</span>}
          </div>
        </div>

        <div className="invoice-meta cols-3">
          <div>
            <span className="invoice-label">{bi("الفترة", "Period")}</span>
            <b dir="ltr">{periodLabel}</b>
          </div>
          <div>
            <span className="invoice-label">{bi("تاريخ الإصدار", "Issued")}</span>
            <b dir="ltr">{formatDateOnly(new Date().toISOString())}</b>
          </div>
          <div>
            <span className="invoice-label">{bi("عدد الفواتير", "Invoices")}</span>
            <b dir="ltr">{formatNumber(invoices.length)}</b>
          </div>
        </div>

        <div className="invoice-billed invoice-seller">
          <span className="invoice-label">{bi("البائع", "Seller")}</span>
          <b>{SELLER.name}</b>
          <small>{bi("الرقم الضريبي", "VAT number")}: <span dir="ltr">{SELLER.vatNumber}</span></small>
        </div>

        <div className="invoice-billed">
          <span className="invoice-label">{bi("صادر إلى", "Billed to")}</span>
          <b>{clientName}</b>
        </div>

        {invoices.length === 0 ? (
          <p className="invoice-not-found">{en ? "No invoices in this period." : "لا توجد فواتير في هذه الفترة."}</p>
        ) : (
          <table className="invoice-table">
            <thead>
              <tr>
                <th>{bi("التاريخ", "Date")}</th>
                <th>{bi("الوصف", "Description")}</th>
                <th>{bi("الحالة", "Status")}</th>
                <th className="num">{bi("قبل الضريبة", "Excl. VAT")}</th>
                <th className="num">{bi("الضريبة 15%", "VAT 15%")}</th>
                <th className="num">{bi("الإجمالي", "Total")}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td dir="ltr" style={{ textAlign: "start", whiteSpace: "nowrap" }}>{formatDateOnly(invoice.createdAt)}</td>
                  <td>
                    <b>{invoice.source === "اشتراك" ? en ? `Subscription - ${invoice.planName ? planDisplayName(invoice.planName, "en") : "plan"}` : `اشتراك - ${invoice.planName || "باقة"}` : en ? "Campaign message top-up" : "شحن رسائل حملات"}</b>
                  </td>
                  <td>{billingLabel(invoice.status, en ? "en" : "ar")}</td>
                  <td className="num"><span dir="ltr">{money(paymentTaxBreakdown(invoice).net)}</span> {cur}</td>
                  <td className="num"><span dir="ltr">{money(paymentTaxBreakdown(invoice).vat)}</span> {cur}</td>
                  <td className="num"><span dir="ltr">{money(paymentTaxBreakdown(invoice).total)}</span> {cur}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="invoice-totals">
          <div className="invoice-totals-box">
            <div>
              <span>{bi("المجموع قبل الضريبة", "Subtotal (excl. VAT)")}</span>
              <b><span dir="ltr">{money(totalNet)}</span> {cur}</b>
            </div>
            <div>
              <span>{bi("ضريبة القيمة المضافة", "VAT")}</span>
              <b><span dir="ltr">{money(totalVat)}</span> {cur}</b>
            </div>
            <div className="invoice-total-paid">
              <span>{bi("إجمالي المدفوع (شامل الضريبة)", "Total paid (incl. VAT)")}</span>
              <b><span dir="ltr">{money(totalPaid)}</span> {cur}</b>
            </div>
          </div>
        </div>

        <div className="invoice-actions">
          <InvoicePrintButton lang={en ? "en" : "ar"} />
          <Link className="secondary" href="/dashboard">{en ? "Back to dashboard" : "العودة للوحة التحكم"}</Link>
        </div>
      </div>
    </main>
  );
}
