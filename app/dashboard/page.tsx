import DashboardClient from "./DashboardClient";
import "./dashboard.css";
import "./wa-settings.css";
import "./store-orders.css";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { getSubscriptionForTenant, getInvoicesForTenant } from "../../lib/subscriptions";
import { getCampaignBalance } from "../../lib/campaign-engine";
import { getPlanAccessForTenant } from "../../lib/plan-access-server";
import type { Metadata } from "next";
import { loadWorkspaceViewer } from "../../lib/workspaces/service";
import { buildWorkspaceState } from "../../lib/workspaces/state";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardPage() {
  const user = await getCurrentUser({ allowExpired: true });

  if (!user) {
    redirect("/login");
  }

  if (user.subscriptionExpired) redirect("/billing?expired=1");

  const [subscription, invoices, campaignBalance, planAccess] = await Promise.all([
    getSubscriptionForTenant(user.tenantId),
    getInvoicesForTenant(user.tenantId),
    getCampaignBalance(user.tenantId),
    getPlanAccessForTenant(user.tenantId)
  ]);

  // Multi-project accounts: decided here on the server. An account that is not on the feature gets no state at all (and, for its owner, only
  // the locked "add a project" entry that explains and links to contact).
  const viewer = await loadWorkspaceViewer(user);
  const workspaces = viewer ? await buildWorkspaceState(viewer) : null;
  const workspacesLocked = !viewer && user.role === "مالك الحساب";

  return <DashboardClient initialUser={user} subscription={subscription} invoices={invoices} campaignBalance={campaignBalance} planAccess={planAccess} workspaces={workspaces} workspacesLocked={workspacesLocked} />;
}
