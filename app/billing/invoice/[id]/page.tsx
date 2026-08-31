import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth";
import { getInvoiceForTenant } from "../../../../lib/subscriptions";
import { formatDateTime } from "../../../../lib/time";
import InvoicePrintButton from "./InvoicePrintButton";
import "../invoice.css";

export const metadata = { title: { absolute: "فاتورة | Linkly" } };

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

  return (
    <main className="invoice-page">
      <div className="invoice-card">
        <div className="invoice-head">
          <Image src="/assets/linkly-logo.png" alt="Linkly" width={40} height={40} />
          <h1>فاتورة Linkly</h1>
        </div>
        <div className="invoice-rows">
          <div><span>الجهة</span><b>{invoice.companyName}</b></div>
          <div><span>الوصف</span><b>{invoice.description}</b></div>
          <div><span>رقم الفاتورة</span><b>{invoice.moyasarId || invoice.id}</b></div>
          <div><span>تاريخ الإنشاء</span><b>{formatDateTime(invoice.createdAt)}</b></div>
          {invoice.completedAt ? <div><span>تاريخ الدفع</span><b>{formatDateTime(invoice.completedAt)}</b></div> : null}
          <div>
            <span>الحالة</span>
            <span className={`invoice-status-badge ${isPaid ? "paid" : "pending"}`}>{invoice.status}</span>
          </div>
        </div>
        <div className="invoice-total">
          <span>الإجمالي</span>
          <b>{invoice.amount.toLocaleString("ar")} ر.س</b>
        </div>
        <div className="invoice-actions">
          <InvoicePrintButton />
          <Link className="secondary" href="/dashboard">العودة للوحة التحكم</Link>
        </div>
      </div>
    </main>
  );
}
