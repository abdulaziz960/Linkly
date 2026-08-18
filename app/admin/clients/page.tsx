import { getSubscriptions } from "../../../lib/subscriptions";
import { getPlans } from "../../../lib/plans";
import ClientsView from "./ClientsView";

export default async function AdminClientsPage() {
  const [subscriptions, plans] = await Promise.all([getSubscriptions(), getPlans()]);

  return (
    <>
      <header className="admin-header">
        <div className="admin-header-copy">
          <p>العملاء</p>
          <h1>إدارة عملاء AudienceW</h1>
          <span>كل عميل هنا حساب دخول حقيقي فعلي — إنشاء عميل جديد ينشئ حساب دخول حقيقي له فورًا.</span>
        </div>
      </header>
      <ClientsView subscriptions={subscriptions} plans={plans} />
    </>
  );
}
