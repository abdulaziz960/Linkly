import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { getActivePlans } from "../../lib/plans";
import { getSubscriptionForTenant } from "../../lib/subscriptions";

export const dynamic = "force-dynamic";
import BillingPageClient from "./BillingPageClient";
import "./billing.css";

export const metadata = { title: { absolute: "الباقات والاشتراك | Linkly" } };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) redirect("/login?next=/billing");
  if (user.role !== "مالك الحساب") redirect("/dashboard");
  const [plans, subscription, { expired }] = await Promise.all([getActivePlans(), getSubscriptionForTenant(user.tenantId), searchParams]);
  return <BillingPageClient plans={plans} subscription={subscription} expired={expired === "1"} />;
}
