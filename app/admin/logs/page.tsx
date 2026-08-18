import { getAdminLogs } from "../../../lib/database";
import { getSubscriptions } from "../../../lib/subscriptions";
import LogsView from "./LogsView";

export default async function AdminLogsPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const [{ client }, subscriptions, logs] = await Promise.all([searchParams, getSubscriptions(), getAdminLogs()]);

  return (
    <>
      <header className="admin-header">
        <div className="admin-header-copy">
          <p>السجلات</p>
          <h1>سجل الحركة</h1>
          <span>فلتر السجلات حسب العميل واعرض سجل الحركة كامل لكل حساب.</span>
        </div>
      </header>
      <LogsView subscriptions={subscriptions} logs={logs} initialClient={client || "all"} />
    </>
  );
}
