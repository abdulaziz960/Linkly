import { getAdminActionLogs } from "../../../lib/admin-audit";
import AdminPageHeader from "../AdminPageHeader";
import AdminActionsView from "./AdminActionsView";

export default async function AdminActionsPage() {
  const actions = await getAdminActionLogs();

  return (
    <>
      <AdminPageHeader
        eyebrow={["الأمان", "Security"]}
        title={["إجراءات الأدمن", "Admin actions"]}
        description={[
          "سجل من نفّذ كل إجراء حسّاس على المنصة - مين علّق حساب، مين غيّر باقة، مين أصدر فاتورة أو استرداد.",
          "A record of who performed every sensitive platform action - who suspended an account, who changed a plan, who issued an invoice or refund."
        ]}
      />
      <AdminActionsView actions={actions} />
    </>
  );
}
