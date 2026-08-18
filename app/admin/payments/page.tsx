import { getSubscriptions, getSubscriptionPayments } from "../../../lib/subscriptions";
import PaymentsView from "./PaymentsView";

export default async function AdminPaymentsPage() {
  const [subscriptions, payments] = await Promise.all([getSubscriptions(), getSubscriptionPayments()]);

  return (
    <>
      <header className="admin-header">
        <div className="admin-header-copy">
          <p>المدفوعات</p>
          <h1>سجل مدفوعات العملاء</h1>
          <span>سجل كل طلبات الدفع عبر Moyasar لكل عميل، بحالتها الفعلية.</span>
        </div>
      </header>
      <PaymentsView subscriptions={subscriptions} payments={payments} />
    </>
  );
}
