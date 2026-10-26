import ForgotPasswordPageClient from "./ForgotPasswordPageClient";
import "../login/login.css";

export const metadata = {
  title: { absolute: "استعادة كلمة المرور | Linkly" },
  robots: { index: false, follow: true }
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordPageClient />;
}
