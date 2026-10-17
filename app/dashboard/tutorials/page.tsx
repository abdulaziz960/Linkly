import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth";
import TutorialsClient from "./TutorialsClient";
import "./tutorials.css";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "مركز الشروحات | Linkly" }, robots: { index: false, follow: false } };

export default async function TutorialsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard/tutorials");
  return <TutorialsClient />;
}
