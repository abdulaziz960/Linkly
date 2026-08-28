import { getPlans } from "../../../lib/plans";
import { getSubscriptions } from "../../../lib/subscriptions";
import AdminPageHeader from "../AdminPageHeader";
import PlansView from "./PlansView";

export default async function AdminPlansPage() {
  const [plans, subscriptions] = await Promise.all([getPlans(), getSubscriptions()]);

  const subscriberCounts = new Map<string, number>();
  for (const subscription of subscriptions) {
    subscriberCounts.set(subscription.plan, (subscriberCounts.get(subscription.plan) || 0) + 1);
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={["الباقات", "Plans"]}
        title={["إدارة الباقات والأسعار", "Manage plans and pricing"]}
        description={["الباقات المعروضة عند إضافة عميل جديد وسعرها الشهري وحد المستخدمين.", "The plans shown when adding a new client, their monthly price, and their user limit."]}
      />
      <PlansView plans={plans} subscriberCounts={Object.fromEntries(subscriberCounts)} />
    </>
  );
}
