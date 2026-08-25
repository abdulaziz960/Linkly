import LoginPageClient from "./LoginPageClient";
import "./login.css";

export const metadata = {
  title: { absolute: "تسجيل الدخول | Linkly" },
  robots: { index: false, follow: false }
};

export default function LoginPage() {
  return <LoginPageClient />;
}
