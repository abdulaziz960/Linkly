import { getAdminLogs } from "../../lib/database";
import { getSubscriptions, getSubscriptionPayments } from "../../lib/subscriptions";
import { getPlans } from "../../lib/plans";
import { getPlatformTeam } from "../../lib/platform-team";
import AdminPageHeader from "./AdminPageHeader";
import OverviewView from "./OverviewView";

export default async function AdminOverviewPage() {
  const [subscriptions, payments, plans, team, logs] = await Promise.all([
    getSubscriptions(),
    getSubscriptionPayments(),
    getPlans(),
    getPlatformTeam(),
    getAdminLogs()
  ]);

  return (
    <>
      <AdminPageHeader
        eyebrow={["لوحة التحكم الأساسية", "Core dashboard"]}
        title={["إدارة عملاء Linkly من مكان واحد", "Manage Linkly clients from one place"]}
        description={["نظرة عامة سريعة على كل الأرقام المهمة، وتفاصيل كل قسم في صفحته الخاصة من القائمة الجانبية.", "A quick overview of every key number, with details for each section on its own sidebar page."]}
      />

      <OverviewView
        subscriptions={subscriptions}
        payments={payments}
        plansCount={plans.length}
        teamCount={team.length}
        logs={logs}
      />
    </>
  );
}
