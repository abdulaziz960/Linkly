import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { allViewKeys } from "../../../lib/permissions";
import TutorialsClient from "./TutorialsClient";
import "./tutorials.css";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "مركز الشروحات | Linkly" }, robots: { index: false, follow: false } };

export default async function TutorialsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard/tutorials");
  const allowed = (await Promise.all(allViewKeys.map(async (view) => ((await userHasViewPermission(user, view)) ? view : null)))).filter((view): view is NonNullable<typeof view> => view !== null);
  return <TutorialsClient allowedViews={allowed} />;
}
