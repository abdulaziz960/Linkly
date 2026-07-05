import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import {
  getAdminLogs,
  getCampaigns,
  getIntegrationSettings,
  getProviderClients,
  getProviderSubscriptions,
  getTemplates
} from "../../lib/database";
import AdminDashboard from "./AdminDashboard";
import "./admin.css";

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "مالك الحساب") {
    redirect("/dashboard");
  }

  const [clients, subscriptions, logs, campaigns, templates, integration] = await Promise.all([
    getProviderClients(),
    getProviderSubscriptions(),
    getAdminLogs(),
    getCampaigns(),
    getTemplates(),
    getIntegrationSettings()
  ]);

  return (
    <AdminDashboard
      user={user}
      clients={clients}
      subscriptions={subscriptions}
      logs={logs}
      campaigns={campaigns}
      templates={templates}
      integration={integration}
    />
  );
}
