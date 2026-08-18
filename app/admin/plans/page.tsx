import { getPlans } from "../../../lib/plans";
import { getSubscriptions } from "../../../lib/subscriptions";
import PlansView from "./PlansView";

export default async function AdminPlansPage() {
  const [plans, subscriptions] = await Promise.all([getPlans(), getSubscriptions()]);

  const subscriberCounts = new Map<string, number>();
  for (const subscription of subscriptions) {
    subscriberCounts.set(subscription.plan, (subscriberCounts.get(subscription.plan) || 0) + 1);
  }

  return (
    <>
      <header className="admin-header">
        <div className="admin-header-copy">
          <p>الباقات</p>
          <h1>إدارة الباقات والأسعار</h1>
          <span>الباقات المعروضة عند إضافة عميل جديد وسعرها الشهري وحد المستخدمين.</span>
        </div>
      </header>
      <PlansView plans={plans} subscriberCounts={Object.fromEntries(subscriberCounts)} />
    </>
  );
}
