import { getSubscriptions } from "../../../lib/subscriptions";
import { getPlans } from "../../../lib/plans";
import AdminPageHeader from "../AdminPageHeader";
import ClientsView from "./ClientsView";

// Server timestamp used for date math in the client view; read outside render so the component stays pure.
const nowMs = () => Date.now();

export default async function AdminClientsPage() {
  const generatedAt = nowMs();
  const [subscriptions, plans] = await Promise.all([getSubscriptions(), getPlans()]);

  return (
    <>
      <AdminPageHeader
        eyebrow={["العملاء", "Clients"]}
        title={["إدارة عملاء Linkly", "Manage Linkly clients"]}
        description={["كل عميل هنا حساب دخول حقيقي فعلي — إنشاء عميل جديد ينشئ حساب دخول حقيقي له فورًا.", "Every client here is a real, live login account — creating a new client creates their real login account immediately."]}
      />
      <ClientsView subscriptions={subscriptions} plans={plans} generatedAt={generatedAt} />
    </>
  );
}
