import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth";
import { getInvoiceForTenant } from "../../../../lib/subscriptions";
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

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) redirect("/login");

  const { id } = await params;
  const invoice = await getInvoiceForTenant(user.tenantId, id);

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
  const receiptNo = (invoice.moyasarId || invoice.id).slice(0, 20).toUpperCase();
  const periodCovered = isSubscription
    ? `${formatDateOnly(invoice.createdAt)} - ${formatDateOnly(addOneMonth(invoice.createdAt).toISOString())}`
    : null;
  const itemLabelAr = isSubscription ? `اشتراك Linkly - ${invoice.planName || "باقة"}` : `شحن رسائل حملات`;
  const itemLabelEn = isSubscription ? `Linkly subscription - ${invoice.planName || "plan"}` : "Campaign message top-up";
  const qty = isSubscription ? 1 : invoice.messages;

  return (
    <main className="invoice-page">
      <div className="invoice-card">
        <div className="invoice-head">
          <h1>Linkly</h1>
          <div className="invoice-head-meta">
            <div>
              <span>RECEIPT NO. <em>رقم الإيصال</em></span>
              <b>{receiptNo}</b>
            </div>
            <div>
              <span>ISSUED <em>تاريخ الإصدار</em></span>
              <b>{formatDateOnly(invoice.createdAt)}</b>
            </div>
          </div>
        </div>

        <div className="invoice-section-title">
          <span>PAYMENT RECEIPT</span>
          <span>إيصال دفع</span>
        </div>
        <h2 className="invoice-item-heading">
          <span>{itemLabelEn}</span>
          <span>{itemLabelAr}</span>
        </h2>

        <div className="invoice-meta-grid">
          <div>
            <span>BILLED TO <em>صادرة إلى</em></span>
            <b>{invoice.companyName}</b>
          </div>
          {periodCovered ? (
            <div>
              <span>PERIOD COVERED <em>الفترة المغطاة</em></span>
              <b dir="ltr">{periodCovered}</b>
            </div>
          ) : null}
          <div>
            <span>PAYMENT METHOD <em>طريقة الدفع</em></span>
            <b>Card <em>بطاقة</em></b>
          </div>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>DESCRIPTION <em>الوصف</em></th>
              <th>QTY <em>الكمية</em></th>
              <th>AMOUNT <em>المبلغ</em></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>{itemLabelEn}</b>
                <em>{itemLabelAr}</em>
              </td>
              <td>{qty.toLocaleString("en-US")}</td>
              <td>{invoice.amount.toLocaleString("en-US")} SAR <em>{invoice.amount.toLocaleString("ar")} ريال</em></td>
            </tr>
          </tbody>
        </table>

        <div className="invoice-totals">
          <div>
            <span>Subtotal <em>المجموع الفرعي</em></span>
            <b>{invoice.amount.toLocaleString("en-US")} SAR</b>
          </div>
          <div className="invoice-total-paid">
            <span>Total paid <em>الإجمالي المدفوع</em></span>
            <b>{invoice.amount.toLocaleString("en-US")} SAR</b>
          </div>
        </div>

        <span className={`invoice-status-badge ${isPaid ? "paid" : "pending"}`}>
          {isPaid ? "Paid" : "Pending"} <em>{isPaid ? "تم الدفع" : "قيد الانتظار"}</em>
        </span>

        <div className="invoice-actions">
          <InvoicePrintButton />
          <Link className="secondary" href="/dashboard">العودة للوحة التحكم</Link>
        </div>
      </div>
    </main>
  );
}
