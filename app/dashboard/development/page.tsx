import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth";
import DevelopmentPageClient from "./DevelopmentPageClient";
import "./development.css";

export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "تطوير المنصة | Linkly" } };

export default async function DevelopmentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard/development");

  return <DevelopmentPageClient />;
}
