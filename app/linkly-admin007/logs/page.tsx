import { getAdminLogs } from "../../../lib/database";
import { getSubscriptions } from "../../../lib/subscriptions";
import { guardPage } from "../guard";
import AdminPageHeader from "../AdminPageHeader";
import LogsView from "./LogsView";

export default async function AdminLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const denied = await guardPage("tech");
  if (denied) return denied;
  const [filters, subscriptions, logs] = await Promise.all([searchParams, getSubscriptions(), getAdminLogs()]);

  return (
    <>
      <AdminPageHeader
        eyebrow={["السجلات", "Logs"]}
        title={["سجل الحركة", "Activity log"]}
        description={["فلتر السجلات حسب العميل واعرض سجل الحركة كامل لكل حساب.", "Filter logs by client and view the full activity log for each account."]}
      />
      <LogsView key={JSON.stringify(filters)} subscriptions={subscriptions} logs={logs} initialFilters={filters} />
    </>
  );
}
