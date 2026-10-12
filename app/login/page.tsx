import LoginPageClient from "./LoginPageClient";
import { googleSignInConfigured } from "../../lib/google-signin";
import "./login.css";

export const metadata = {
  title: { absolute: "تسجيل الدخول | Linkly" },
  robots: { index: false, follow: false }
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  return <LoginPageClient googleEnabled={googleSignInConfigured()} googleError={google} />;
}
