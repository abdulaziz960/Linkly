import { getCurrentUser } from "../../../lib/auth";
import AdminPageHeader from "../AdminPageHeader";
import SupportInboxView from "./SupportInboxView";
import "./support.css";

export default async function AdminSupportPage() {
  const admin = await getCurrentUser();

  return (
    <>
      <AdminPageHeader
        eyebrow={["الدعم الفني", "Support"]}
        title={["صندوق الدعم الفني", "Support inbox"]}
        description={["تذاكر العملاء مرتّبة حسب الحالة والأولوية، مع الرد والإسناد من نفس الصفحة.", "Customer tickets by status and priority, with replies and assignment in one place."]}
      />
      <SupportInboxView adminId={admin?.id || ""} adminName={admin?.name || ""} />
    </>
  );
}
