import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getCurrentUser } from "../../lib/auth";
import AdminShell from "./AdminShell";
import { getAdminPermissions } from "../../lib/admin-auth";
import { THEME_COOKIE } from "./ds/prefs";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.isPlatformAdmin !== 1) {
    redirect("/dashboard");
  }

  const permissions = await getAdminPermissions(user.id);

  // The theme comes from a cookie so the first paint is already correct.
  const store = await cookies();
  const theme = store.get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";

  return (
    <main className="admin-shell" dir="rtl" lang="ar" data-theme={theme}>
      <AdminShell user={user} permissions={permissions}>{children}</AdminShell>
    </main>
  );
}
