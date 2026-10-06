import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth";
import { getInvoicesForTenant, getSubscriptionForTenant } from "../../../../lib/subscriptions";
import { getTenantBranding } from "../../../../lib/tenant-branding";
import InvoicePrintButton from "../../invoice/[id]/InvoicePrintButton";
import "../../invoice/invoice.css";

export const metadata = { title: { absolute: "كشف الفواتير | Linkly" } };

function formatDateOnly(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

export default async function InvoicesStatementPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) redirect("/login");

  const { from, to } = await searchParams;
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

  const totalPaid = invoices.filter((invoice) => invoice.status === "مكتمل").reduce((sum, invoice) => sum + invoice.amount, 0);
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
            <strong>كشف الفواتير</strong>
            <span className="invoice-sub">Invoice statement</span>
          </div>
        </div>

        <div className="invoice-meta cols-3">
          <div>
            <span className="invoice-label">الفترة <em>Period</em></span>
            <b dir="ltr">{periodLabel}</b>
          </div>
          <div>
            <span className="invoice-label">تاريخ الإصدار <em>Issued</em></span>
            <b dir="ltr">{formatDateOnly(new Date().toISOString())}</b>
          </div>
          <div>
            <span className="invoice-label">عدد الفواتير <em>Invoices</em></span>
            <b dir="ltr">{invoices.length.toLocaleString("en-US")}</b>
          </div>
        </div>

        <div className="invoice-billed">
          <span className="invoice-label">صادر إلى <em>Billed to</em></span>
          <b>{clientName}</b>
        </div>

        {invoices.length === 0 ? (
          <p className="invoice-not-found">لا توجد فواتير في هذه الفترة.</p>
        ) : (
          <table className="invoice-table">
            <thead>
              <tr>
                <th>التاريخ <em>Date</em></th>
                <th>الوصف <em>Description</em></th>
                <th>الحالة <em>Status</em></th>
                <th className="num">المبلغ <em>Amount</em></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td dir="ltr" style={{ textAlign: "start", whiteSpace: "nowrap" }}>{formatDateOnly(invoice.createdAt)}</td>
                  <td>
                    <b>{invoice.source === "اشتراك" ? `اشتراك - ${invoice.planName || "باقة"}` : "شحن رسائل حملات"}</b>
                  </td>
                  <td>{invoice.status}</td>
                  <td className="num"><span dir="ltr">{invoice.amount.toLocaleString("en-US")}</span> ر.س</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="invoice-totals">
          <div className="invoice-totals-box">
            <div className="invoice-total-paid">
              <span>إجمالي المدفوع <em>Total paid</em></span>
              <b><span dir="ltr">{totalPaid.toLocaleString("en-US")}</span> ر.س</b>
            </div>
          </div>
        </div>

        <div className="invoice-actions">
          <InvoicePrintButton />
          <Link className="secondary" href="/dashboard">العودة للوحة التحكم</Link>
        </div>
      </div>
    </main>
  );
}
