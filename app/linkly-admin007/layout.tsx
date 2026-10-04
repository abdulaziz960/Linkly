import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getCurrentUser } from "../../lib/auth";
import AdminShell from "./AdminShell";
import { SIDEBAR_COOKIE, THEME_COOKIE } from "./ds/prefs";
import "./admin.css";

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

  // Theme and sidebar state come from cookies so the first paint is already correct.
  const store = await cookies();
  const theme = store.get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
  const collapsed = store.get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <main className="admin-shell" dir="rtl" lang="ar" data-theme={theme} data-collapsed={collapsed ? "true" : undefined}>
      <AdminShell user={user}>{children}</AdminShell>
    </main>
  );
}
