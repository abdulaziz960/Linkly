import { getSubscriptions, getSubscriptionPayments } from "../../../lib/subscriptions";
import AdminPageHeader from "../AdminPageHeader";
import PaymentsView from "./PaymentsView";

export default async function AdminPaymentsPage() {
  const [subscriptions, payments] = await Promise.all([getSubscriptions(), getSubscriptionPayments()]);

  return (
    <>
      <AdminPageHeader
        eyebrow={["المدفوعات", "Payments"]}
        title={["سجل مدفوعات العملاء", "Client payment history"]}
        description={["سجل كل طلبات الدفع عبر Moyasar لكل عميل - اشتراكات وشحن رصيد رسائل الحملات معًا - بحالتها الفعلية.", "A record of every payment request via Moyasar for each client — subscriptions and campaign message balance top-ups together — with its actual status."]}
      />
      <PaymentsView subscriptions={subscriptions} payments={payments} />
    </>
  );
}
