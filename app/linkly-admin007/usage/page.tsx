import { getTenantUsageStats } from "../../../lib/admin-usage";
import AdminPageHeader from "../AdminPageHeader";
import UsageView from "./UsageView";
import { guardPage } from "../guard";

export default async function AdminUsagePage() {
  const denied = await guardPage(["clients", "tech"]);
  if (denied) return denied;
  const rows = await getTenantUsageStats();

  return (
    <>
      <AdminPageHeader
        eyebrow={["الاستخدام", "Usage"]}
        title={["الاستخدام والتكلفة لكل عميل", "Usage and cost per client"]}
        description={[
          "حجم الرسائل واستهلاك الذكاء الاصطناعي وتكلفته لآخر 30 يومًا لكل حساب.",
          "Message volume, AI consumption, and AI cost over the last 30 days, per account."
        ]}
      />
      <UsageView rows={rows} />
    </>
  );
}
