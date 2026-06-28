import DashboardClient from "./DashboardClient";
import "./dashboard.css";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <DashboardClient initialUser={user} />;
}
