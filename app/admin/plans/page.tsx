import { getPlans } from "../../../lib/plans";
import PlansView from "./PlansView";

export default async function AdminPlansPage() {
  const plans = await getPlans();

  return (
    <>
      <header className="admin-header">
        <div className="admin-header-copy">
          <p>الباقات</p>
          <h1>إدارة الباقات والأسعار</h1>
          <span>الباقات المعروضة عند إضافة عميل جديد وسعرها الشهري وحد المستخدمين.</span>
        </div>
      </header>
      <PlansView plans={plans} />
    </>
  );
}
