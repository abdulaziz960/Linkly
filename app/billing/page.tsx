import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { getActivePlans } from "../../lib/plans";
import { getSubscriptionForTenant } from "../../lib/subscriptions";
import { isMoyasarLiveMode } from "../../lib/moyasar";
import { getTenantBranding } from "../../lib/tenant-branding";

export const dynamic = "force-dynamic";
import BillingPageClient from "./BillingPageClient";
import BillingOwnerOnlyNotice from "./BillingOwnerOnlyNotice";
import "./billing.css";

export const metadata = { title: { absolute: "الباقات والاشتراك | Linkly" } };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) redirect("/login?next=/billing");
  if (user.role !== "مالك الحساب") {
    // A non-owner with an expired subscription can't be sent back to
    // /dashboard - it immediately redirects them right back here, an
    // infinite loop. Show them why they're blocked instead.
    if (user.subscriptionExpired) {
      const branding = await getTenantBranding(user.tenantId);
      return <BillingOwnerOnlyNotice branding={branding} />;
    }
    redirect("/dashboard");
  }
  const [plans, subscription, { expired }, branding] = await Promise.all([getActivePlans(), getSubscriptionForTenant(user.tenantId), searchParams, getTenantBranding(user.tenantId)]);
  return <BillingPageClient plans={plans} subscription={subscription} expired={expired === "1"} isTestMode={!isMoyasarLiveMode()} branding={branding} />;
}
