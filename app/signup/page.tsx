import SignupPageClient from "./SignupPageClient";
import { cycleFromSlug } from "../../lib/billing-pricing";
import { getActivePlans } from "../../lib/plans";
import { isTrialEligiblePlan, pickTrialPlan } from "../../lib/trial-plan";
import "./signup.css";

export const metadata = {
  title: { absolute: "ابدأ تجربتك | Linkly" },
  robots: { index: false, follow: true }
};

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string; billing?: string }> }) {
  const { plan: planId, billing } = await searchParams;
  const activePlans = await getActivePlans();
  const selectedPlan = planId ? activePlans.find((plan) => plan.id === planId) : undefined;
  // Only the plans a self-serve trial can actually run on (the enterprise tier is sold through a conversation).
  const trialPlans = activePlans.filter((plan) => isTrialEligiblePlan(plan.name)).map((plan) => ({ id: plan.id, name: plan.name }));
  const defaultPlanId = pickTrialPlan(trialPlans, planId)?.id ?? "";
  return <SignupPageClient selectedPlan={selectedPlan ? { id: selectedPlan.id, name: selectedPlan.name } : null} selectedBilling={cycleFromSlug(billing)} plans={trialPlans} defaultPlanId={defaultPlanId} />;
}
