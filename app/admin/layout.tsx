import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getCurrentUser } from "../../lib/auth";
import AdminSidebar from "./AdminSidebar";
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

  return (
    <main className="admin-shell" dir="rtl">
      <AdminSidebar user={user} />
      <section className="admin-main">{children}</section>
    </main>
  );
}
