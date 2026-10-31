import { priceForCycle, type BillingCycle } from "../billing-pricing";
import { extraProjectsMonthlyCharge, workspacesConfigured } from "./feature";
import { billingTenantFor } from "./store";
import { getWorkspaceAddon } from "./addon-store";

/**
 * What the extra projects add to ONE payment of the account's subscription, in riyals before tax, for a billing cycle (the same cycle
 * discount as the plan applies). Zero for an account without extra projects, and for every account while the feature is off.
 */
export async function extraProjectsCharge(tenantId: string, billingCycle: BillingCycle): Promise<number> {
  if (!workspacesConfigured()) return 0;
  const billing = await billingTenantFor(tenantId);
  const addon = await getWorkspaceAddon(billing);
  if (!addon.enabled && addon.extraProjects === 0) return 0;
  return priceForCycle(extraProjectsMonthlyCharge(addon.extraProjects), billingCycle);
}
