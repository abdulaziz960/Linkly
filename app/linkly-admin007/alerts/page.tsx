import { getSubscriptions } from "../../../lib/subscriptions";
import AdminPageHeader from "../AdminPageHeader";
import { getRenewalFollowUps } from "../../../lib/renewal-followups";
import AlertsView from "./AlertsView";
import { guardPage } from "../guard";

export default async function AdminAlertsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const denied = await guardPage("clients");
  if (denied) return denied;
  const [subscriptions, filters, followUps] = await Promise.all([getSubscriptions(), searchParams, getRenewalFollowUps()]);

  return (
    <>
      <AdminPageHeader
        eyebrow={["تنبيهات التجديد", "Renewal alerts"]}
        title={["اشتراكات تحتاج متابعة", "Subscriptions that need follow-up"]}
        description={["اشتراكات نشطة قريبة من موعد التجديد أو تجاوزته بالفعل.", "Active subscriptions close to their renewal date or already past it."]}
      />
      <AlertsView subscriptions={subscriptions} initialStatus={filters.status || "all"} initialFollowUps={followUps} />
    </>
  );
}
