import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { getActivePlans, getPlanByName } from "../../lib/plans";
import { getSubscriptionForTenant } from "../../lib/subscriptions";
import { isMoyasarLiveMode } from "../../lib/moyasar";
import { getTenantBranding } from "../../lib/tenant-branding";

export const dynamic = "force-dynamic";
import BillingPageClient from "./BillingPageClient";
import BillingOwnerOnlyNotice from "./BillingOwnerOnlyNotice";
import AccountSuspendedNotice from "./AccountSuspendedNotice";
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
  // A genuinely expired/suspended owner gets the hard full-screen lock, not
  // the normal plan-browsing page with just a soft banner on top - they
  // can't use the dashboard at all right now, so the page should say so
  // unambiguously and offer nothing but "pay" or "sign out".
  if (user.subscriptionExpired) {
    // The tenant's current plan may have been deactivated for new signups
    // since they subscribed (getActivePlans() alone would then omit it,
    // breaking the "pay to reopen with my existing plan" button below).
    const currentPlan = subscription && !plans.some((plan) => plan.name === subscription.plan)
      ? await getPlanByName(subscription.plan)
      : null;
    return <AccountSuspendedNotice branding={branding} subscription={subscription} plans={currentPlan ? [...plans, currentPlan] : plans} />;
  }
  return <BillingPageClient plans={plans} subscription={subscription} expired={expired === "1"} isTestMode={!isMoyasarLiveMode()} branding={branding} />;
}
