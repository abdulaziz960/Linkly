import { getPlans } from "../../../lib/plans";
import { getSubscriptions } from "../../../lib/subscriptions";
import AdminPageHeader from "../AdminPageHeader";
import PlansView from "./PlansView";
import { guardPage } from "../guard";

// The three pre-2026 plans are kept in the database on purpose (lib/database.ts
// deactivates them rather than deleting, so an old subscriber's plan name keeps
// resolving), but once nobody is on one it is only clutter in this list. It
// reappears automatically if a subscriber is ever on it again.
const RETIRED_PLAN_NAMES = new Set(["باقة البداية", "باقة النمو", "باقة الأعمال"]);

export default async function AdminPlansPage() {
  const denied = await guardPage("billing");
  if (denied) return denied;
  const [plans, subscriptions] = await Promise.all([getPlans(), getSubscriptions()]);

  const subscriberCounts = new Map<string, number>();
  for (const subscription of subscriptions) {
    subscriberCounts.set(subscription.plan, (subscriberCounts.get(subscription.plan) || 0) + 1);
  }

  const visiblePlans = plans.filter((plan) => !(RETIRED_PLAN_NAMES.has(plan.name) && plan.active !== 1 && !subscriberCounts.get(plan.name)));

  return (
    <>
      <AdminPageHeader
        eyebrow={["الباقات", "Plans"]}
        title={["إدارة الباقات والأسعار", "Manage plans and pricing"]}
        description={["الباقات المعروضة عند إضافة عميل جديد وسعرها الشهري وحد المستخدمين.", "The plans shown when adding a new client, their monthly price, and their user limit."]}
      />
      <PlansView plans={visiblePlans} subscriberCounts={Object.fromEntries(subscriberCounts)} />
    </>
  );
}
