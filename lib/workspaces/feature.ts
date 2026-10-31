// Who may use workspaces ("projects"). The feature is OFF for every account, whatever its plan. It turns on for an account only when
// BOTH are true, and both are decided here on the server (the UI only mirrors the answer):
//   1. the account's plan supports it (Small Enterprises and above), and
//   2. the account was switched on explicitly: either by the platform team from the admin panel (stored with the account), or - for
//      development - by listing its id in WORKSPACES_ENABLED_TENANTS (comma-separated billing tenant ids).
// The whole feature is also behind a deployment switch: WORKSPACES_FEATURE=1, or a non-empty WORKSPACES_ENABLED_TENANTS. Without
// either, nothing here ever touches the database.

/** Plans that can have projects at all. */
export const DEFAULT_ELIGIBLE_PLANS = ["باقة المؤسسات الصغيرة", "باقة المؤسسات الكبيرة", "باقة الشركات"];

/** Extra projects a plan already includes (the account's original workspace is not counted). */
export const INCLUDED_EXTRA_PROJECTS: Record<string, number> = { "باقة المؤسسات الكبيرة": 1 };

/** Added to the account's subscription for every extra project bought beyond what the plan includes (SAR per month, before tax). */
export const EXTRA_PROJECT_PRICE_SAR = 350;

function listFromEnv(name: string): string[] {
  return (process.env[name] ?? "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

export function workspacesAllowList(): string[] {
  return listFromEnv("WORKSPACES_ENABLED_TENANTS");
}

export function workspacesEligiblePlans(): string[] {
  const configured = listFromEnv("WORKSPACES_ELIGIBLE_PLANS");
  return configured.length ? configured : DEFAULT_ELIGIBLE_PLANS;
}

/** Whether the deployment has the feature switched on at all. False until WORKSPACES_FEATURE=1 or the allow list has an entry. */
export function workspacesConfigured(): boolean {
  const flag = (process.env.WORKSPACES_FEATURE ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || workspacesAllowList().length > 0;
}

/** The pure rule: the plan supports projects AND the account was switched on (admin panel flag or allow list). */
export function workspacesAllowedFor(billingTenantId: string, plan: string, enabledByAdmin = false): boolean {
  if (!billingTenantId || !plan) return false;
  if (!workspacesEligiblePlans().includes(plan)) return false;
  return enabledByAdmin || workspacesAllowList().includes(billingTenantId);
}

export type ProjectQuota = { included: number; purchased: number; extraTotal: number; maxProjects: number };

/** How many projects an account may have: its original workspace plus what the plan includes plus what was bought. */
export function projectQuota(plan: string, purchasedExtra: number): ProjectQuota {
  const included = INCLUDED_EXTRA_PROJECTS[plan] ?? 0;
  const purchased = Math.max(0, Math.floor(purchasedExtra) || 0);
  const extraTotal = included + purchased;
  return { included, purchased, extraTotal, maxProjects: 1 + extraTotal };
}

/** Monthly amount added to the subscription for the extra projects that were bought (the ones the plan includes are free). */
export function extraProjectsMonthlyCharge(purchasedExtra: number): number {
  return Math.max(0, Math.floor(purchasedExtra) || 0) * EXTRA_PROJECT_PRICE_SAR;
}
