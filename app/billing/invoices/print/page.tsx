import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth";
import { getInvoicesForTenant, getSubscriptionForTenant } from "../../../../lib/subscriptions";
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
  const [subscription, allInvoices] = await Promise.all([
    getSubscriptionForTenant(user.tenantId),
    getInvoicesForTenant(user.tenantId)
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

  return (
    <main className="invoice-page">
      <div className="invoice-card">
        <div className="invoice-head">
          <h1>Linkly</h1>
          <div className="invoice-head-meta">
            <div>
              <span>PERIOD <em>الفترة</em></span>
              <b dir="ltr">{periodLabel}</b>
            </div>
            <div>
              <span>ISSUED <em>تاريخ الإصدار</em></span>
              <b>{formatDateOnly(new Date().toISOString())}</b>
            </div>
          </div>
        </div>

        <h2 className="invoice-item-heading">
          <span>{subscription?.companyName || user.tenantId}</span>
          <span>{subscription?.companyName || user.tenantId}</span>
        </h2>

        {invoices.length === 0 ? (
          <p className="invoice-not-found">لا توجد فواتير في هذه الفترة.</p>
        ) : (
          <table className="invoice-table">
            <thead>
              <tr>
                <th>DATE <em>التاريخ</em></th>
                <th>DESCRIPTION <em>الوصف</em></th>
                <th>STATUS <em>الحالة</em></th>
                <th>AMOUNT <em>المبلغ</em></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{formatDateOnly(invoice.createdAt)}</td>
                  <td>
                    <b>{invoice.source === "اشتراك" ? `اشتراك - ${invoice.planName || "باقة"}` : "شحن رسائل حملات"}</b>
                  </td>
                  <td>{invoice.status}</td>
                  <td>{invoice.amount.toLocaleString("en-US")} SAR</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="invoice-totals">
          <div className="invoice-total-paid">
            <span>Total paid <em>إجمالي المدفوع</em></span>
            <b>{totalPaid.toLocaleString("en-US")} SAR</b>
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
