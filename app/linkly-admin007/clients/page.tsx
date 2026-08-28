import { getSubscriptions } from "../../../lib/subscriptions";
import { getPlans } from "../../../lib/plans";
import AdminPageHeader from "../AdminPageHeader";
import ClientsView from "./ClientsView";

export default async function AdminClientsPage() {
  const [subscriptions, plans] = await Promise.all([getSubscriptions(), getPlans()]);

  return (
    <>
      <AdminPageHeader
        eyebrow={["العملاء", "Clients"]}
        title={["إدارة عملاء Linkly", "Manage Linkly clients"]}
        description={["كل عميل هنا حساب دخول حقيقي فعلي — إنشاء عميل جديد ينشئ حساب دخول حقيقي له فورًا.", "Every client here is a real, live login account — creating a new client creates their real login account immediately."]}
      />
      <ClientsView subscriptions={subscriptions} plans={plans} />
    </>
  );
}
