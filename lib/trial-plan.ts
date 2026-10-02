import { ENTERPRISE_PLAN } from "./plan-access";

/**
 * Which plans a trial can run on. The enterprise tier is sold through a
 * conversation, so a self-serve trial (signup or switching from inside the
 * dashboard) covers the other tiers.
 */
export function isTrialEligiblePlan(planName: string): boolean {
  return planName !== ENTERPRISE_PLAN;
}

/** The plan a new trial starts on: the one the visitor picked if it's trial-eligible, otherwise the first active plan (the entry tier). */
export function pickTrialPlan<T extends { id: string; name: string }>(activePlans: T[], requestedPlanId?: string | null): T | undefined {
  const requested = requestedPlanId ? activePlans.find((plan) => plan.id === requestedPlanId) : undefined;
  if (requested && isTrialEligiblePlan(requested.name)) return requested;
  return activePlans.find((plan) => plan.name.includes("البداية")) || activePlans.find((plan) => isTrialEligiblePlan(plan.name)) || activePlans[0];
}
