import { getSubscriptions } from "../../../lib/subscriptions";
import { getHiddenTenantIds } from "../../../lib/admin-hidden-clients";
import { getPlans } from "../../../lib/plans";
import AdminPageHeader from "../AdminPageHeader";
import ClientsView from "./ClientsView";
import { guardPage } from "../guard";

// Server timestamp used for date math in the client view; read outside render so the component stays pure.
const nowMs = () => Date.now();

export default async function AdminClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const denied = await guardPage("clients");
  if (denied) return denied;
  const generatedAt = nowMs();
  const [allSubscriptions, plans, hiddenTenants, filters] = await Promise.all([getSubscriptions(), getPlans(), getHiddenTenantIds(), searchParams]);
  // Test/demo workspaces the team hid stay out of the list (and the totals) unless "المخفية" is opened.
  const showingHidden = filters.hidden === "1";
  const subscriptions = allSubscriptions.filter((subscription) => hiddenTenants.has(subscription.tenantId) === showingHidden);
  const hiddenCount = allSubscriptions.filter((subscription) => hiddenTenants.has(subscription.tenantId)).length;

  return (
    <>
      <AdminPageHeader
        eyebrow={["العملاء", "Clients"]}
        title={["إدارة عملاء Linkly", "Manage Linkly clients"]}
        description={["كل عميل هنا حساب دخول حقيقي فعلي — إنشاء عميل جديد ينشئ حساب دخول حقيقي له فورًا.", "Every client here is a real, live login account — creating a new client creates their real login account immediately."]}
      />
      <ClientsView subscriptions={subscriptions} plans={plans} generatedAt={generatedAt} hiddenCount={hiddenCount} showingHidden={showingHidden} />
    </>
  );
}
