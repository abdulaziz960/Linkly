import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { planFeatures } from "../../lib/plan-features";
import { getActivePlans, getPlanByName } from "../../lib/plans";
import { getSubscriptionForTenant } from "../../lib/subscriptions";
import { isMoyasarLiveMode } from "../../lib/moyasar";
import { getTenantBranding } from "../../lib/tenant-branding";
import { getShopifyPlanPrices, isShopifyBilled } from "../../lib/shopify-billing";
import { isSallaBilled } from "../../lib/salla-billing";
import { getScheduledPlan } from "../../lib/scheduled-plan";
import SallaManagedNotice from "./SallaManagedNotice";
import { getWorkspaceAddon } from "../../lib/workspaces/addon-store";
import { billingTenantFor } from "../../lib/workspaces/store";
import { EXTRA_PROJECT_PRICE_SAR, extraProjectsMonthlyCharge } from "../../lib/workspaces/feature";

export const dynamic = "force-dynamic";
import BillingPageClient from "./BillingPageClient";
import BillingOwnerOnlyNotice from "./BillingOwnerOnlyNotice";
import AccountSuspendedNotice from "./AccountSuspendedNotice";
import "./billing.css";

export const metadata = { title: { absolute: "الباقات والاشتراك | Linkly" } };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ expired?: string; shopify?: string }> }) {
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
  const [plans, subscription, { expired, shopify: shopifyResult }, branding] = await Promise.all([getActivePlans(), getSubscriptionForTenant(user.tenantId), searchParams, getTenantBranding(user.tenantId)]);
  // A workspace opened from Salla's app store is billed by Salla: nothing to buy here.
  if (await isSallaBilled(user.tenantId)) {
    return <SallaManagedNotice branding={branding} plan={subscription?.plan || ""} renewalAt={subscription?.renewalAt || ""} active={!user.subscriptionExpired} />;
  }
  // A workspace opened from a Shopify install pays through Shopify, in US dollars (lib/shopify-billing.ts).
  const shopifyPrices = await isShopifyBilled(user.tenantId) ? await getShopifyPlanPrices() : null;
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
    return <AccountSuspendedNotice branding={branding} subscription={subscription} plans={currentPlan ? [...plans, currentPlan] : plans} shopifyPrices={shopifyPrices} />;
  }
  // Multi-project accounts: what the extra projects add to each payment (nothing for every other account).
  const extra = await getWorkspaceAddon(await billingTenantFor(user.tenantId));
  const extraProjects = extra.extraProjects > 0 ? { count: extra.extraProjects, unitPrice: EXTRA_PROJECT_PRICE_SAR, monthly: extraProjectsMonthlyCharge(extra.extraProjects) } : null;
  return <BillingPageClient extraProjects={extraProjects} plans={plans.filter((plan) => !planFeatures[plan.name]?.custom || plan.name === subscription?.plan)} subscription={subscription} expired={expired === "1"} isTestMode={!isMoyasarLiveMode()} branding={branding} shopifyPrices={shopifyPrices} shopifyResult={shopifyResult || ""} scheduledPlan={await getScheduledPlan(user.tenantId).catch(() => null)} />;
}
