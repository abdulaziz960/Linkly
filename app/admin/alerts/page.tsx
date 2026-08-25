import { getSubscriptions } from "../../../lib/subscriptions";
import AdminPageHeader from "../AdminPageHeader";
import AlertsView from "./AlertsView";

export default async function AdminAlertsPage() {
  const subscriptions = await getSubscriptions();

  return (
    <>
      <AdminPageHeader
        eyebrow={["تنبيهات التجديد", "Renewal alerts"]}
        title={["اشتراكات تحتاج متابعة", "Subscriptions that need follow-up"]}
        description={["اشتراكات نشطة قريبة من موعد التجديد أو تجاوزته بالفعل.", "Active subscriptions close to their renewal date or already past it."]}
      />
      <AlertsView subscriptions={subscriptions} />
    </>
  );
}
