import { getAdminLogs } from "../../lib/database";
import { getSubscriptions, getSubscriptionPayments } from "../../lib/subscriptions";
import { getPlans } from "../../lib/plans";
import { getPlatformTeam } from "../../lib/platform-team";
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
      <header className="admin-header">
        <div className="admin-header-copy">
          <p>لوحة التحكم الأساسية</p>
          <h1>إدارة عملاء AudienceW من مكان واحد</h1>
          <span>نظرة عامة سريعة على كل الأرقام المهمة، وتفاصيل كل قسم في صفحته الخاصة من القائمة الجانبية.</span>
        </div>
      </header>

      <OverviewView
        subscriptions={subscriptions}
        paymentsCount={payments.length}
        plansCount={plans.length}
        teamCount={team.length}
        logsCount={logs.length}
      />
    </>
  );
}
