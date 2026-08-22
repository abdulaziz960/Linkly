import DashboardClient from "./DashboardClient";
import "./dashboard.css";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardPage() {
  const user = await getCurrentUser({ allowExpired: true });

  if (!user) {
    redirect("/login");
  }

  if (user.subscriptionExpired) redirect("/billing?expired=1");

  return <DashboardClient initialUser={user} />;
}
