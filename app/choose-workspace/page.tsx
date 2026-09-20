import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import ChooseWorkspacePageClient from "./ChooseWorkspacePageClient";
import "../login/login.css";

export const metadata = {
  title: { absolute: "اختر الشركة | Linkly" }
};

export default async function ChooseWorkspacePage() {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) redirect("/login");
  if (user.isPlatformAdmin === 1) redirect("/linkly-admin007");

  // Only a real multi-workspace member sees the picker - anyone else who
  // lands here directly (bookmark, back button) just continues in.
  const membershipCount = await prisma.employee.count({ where: { userId: user.id } });
  if (membershipCount <= 1) redirect("/dashboard?view=inbox");

  return <ChooseWorkspacePageClient />;
}
