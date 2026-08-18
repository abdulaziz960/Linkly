import { getSubscriptions } from "../../../lib/subscriptions";
import AlertsView from "./AlertsView";

export default async function AdminAlertsPage() {
  const subscriptions = await getSubscriptions();

  return (
    <>
      <header className="admin-header">
        <div className="admin-header-copy">
          <p>تنبيهات التجديد</p>
          <h1>اشتراكات تحتاج متابعة</h1>
          <span>اشتراكات نشطة قريبة من موعد التجديد أو تجاوزته بالفعل.</span>
        </div>
      </header>
      <AlertsView subscriptions={subscriptions} />
    </>
  );
}
