import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth";
import SupportPageClient from "./SupportPageClient";
import "./support.css";

export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "الدعم الفني | Linkly" } };

export default async function SupportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard/support");

  return <SupportPageClient />;
}
