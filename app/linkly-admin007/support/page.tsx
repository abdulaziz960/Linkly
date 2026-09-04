import { getCurrentUser } from "../../../lib/auth";
import SupportInboxView from "./SupportInboxView";
import "./support.css";

export default async function AdminSupportPage() {
  const admin = await getCurrentUser();

  return <SupportInboxView adminId={admin?.id || ""} adminName={admin?.name || ""} />;
}
