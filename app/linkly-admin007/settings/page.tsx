import { getCurrentUser } from "../../../lib/auth";
import AdminPageHeader from "../AdminPageHeader";
import SettingsView from "./SettingsView";

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();

  return (
    <>
      <AdminPageHeader
        eyebrow={["إعدادات الحساب", "Account settings"]}
        title={["إعدادات حسابك وتفضيلات اللوحة", "Your account and dashboard preferences"]}
        description={["معلومات حسابك، المظهر، التنبيهات والجلسة الحالية.", "Your account details, appearance, notifications and current session."]}
      />
      <SettingsView name={user?.name ?? ""} email={user?.email ?? ""} lastLoginAt={user?.lastLoginAt ?? ""} />
    </>
  );
}
