import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { getAdminLogs } from "../../lib/database";
import { getSubscriptions } from "../../lib/subscriptions";
import AdminDashboard from "./AdminDashboard";
import "./admin.css";

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.isPlatformAdmin !== 1) {
    redirect("/dashboard");
  }

  const [subscriptions, logs] = await Promise.all([getSubscriptions(), getAdminLogs()]);

  return <AdminDashboard user={user} subscriptions={subscriptions} logs={logs} />;
}
