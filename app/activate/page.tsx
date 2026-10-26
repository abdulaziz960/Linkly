import ActivatePageClient from "./ActivatePageClient";
import "../login/login.css";

export const metadata = {
  title: { absolute: "تفعيل الحساب | Linkly" },
  robots: { index: false, follow: true }
};

export default function ActivatePage() {
  return <ActivatePageClient />;
}
