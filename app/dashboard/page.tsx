import DashboardClient from "./DashboardClient";
import "./dashboard.css";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { getSubscriptionForTenant, getInvoicesForTenant } from "../../lib/subscriptions";
import { getCampaignBalance } from "../../lib/campaign-engine";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardPage() {
  const user = await getCurrentUser({ allowExpired: true });

  if (!user) {
    redirect("/login");
  }

  // Platform admins are never a real tenant's customer-facing dashboard user -
  // login already sends them to /linkly-admin007 (app/api/auth/login/route.ts),
  // so a direct visit to /dashboard must not fall through to whatever tenant
  // their account happens to be attached to.
  if (user.isPlatformAdmin === 1) redirect("/linkly-admin007");

  if (user.subscriptionExpired) redirect("/billing?expired=1");

  const [subscription, invoices, campaignBalance] = await Promise.all([
    getSubscriptionForTenant(user.tenantId),
    getInvoicesForTenant(user.tenantId),
    getCampaignBalance(user.tenantId)
  ]);

  return <DashboardClient initialUser={user} subscription={subscription} invoices={invoices} campaignBalance={campaignBalance} />;
}
