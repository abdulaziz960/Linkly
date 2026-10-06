import { getAdminActionLogs } from "../../lib/admin-audit";
import { getAdminPermissions } from "../../lib/admin-auth";
import { getCurrentUser } from "../../lib/auth";
import type { AdminLog } from "../../lib/database";
import { prisma } from "../../lib/prisma";
import { getSubscriptionPayments } from "../../lib/subscriptions";
import { getVisibleSubscriptions } from "../../lib/admin-hidden-clients";
import { ErrorState } from "./ds/primitives";
import AdminPageHeader from "./AdminPageHeader";
import OverviewView from "./OverviewView";

// Server timestamp for "data as of"; read outside render so the component stays pure.
const nowMs = () => Date.now();

export default async function AdminOverviewPage() {
  const generatedAt = nowMs();
  const user = await getCurrentUser();
  const permissions = user ? await getAdminPermissions(user.id) : [];

  // The overview aggregates client and revenue data, so it needs one of those permissions.
  if (!permissions.includes("clients") && !permissions.includes("billing")) {
    return (
      <>
        <AdminPageHeader eyebrow={["نظرة عامة", "Overview"]} title={[`مرحبًا ${user?.name ?? ""}`.trim(), "Welcome"]} description={["استخدم القائمة الجانبية للوصول إلى الأقسام المتاحة لك.", "Use the sidebar to open the sections available to you."]} />
        <ErrorState kind="denied" title="ملخص المنصة غير متاح لصلاحياتك" description="الملخص يعرض بيانات العملاء والإيرادات. الأقسام المسموحة لك ظاهرة في القائمة الجانبية." />
      </>
    );
  }

  const canBilling = permissions.includes("billing");
  const canTeam = permissions.includes("team");
  const canSupport = permissions.includes("support");

  // Only what the member may see is loaded, so restricted data never reaches the page.
  const [subscriptions, payments, logRows, actions, urgentTickets] = await Promise.all([
    getVisibleSubscriptions(),
    canBilling ? getSubscriptionPayments() : Promise.resolve([]),
    // Newest 300 only - the log table can grow without bound.
    prisma.adminLog.findMany({ orderBy: { id: "desc" }, take: 300 }),
    canTeam ? getAdminActionLogs(60) : Promise.resolve([]),
    canSupport
      ? prisma.supportTicket.findMany({
          where: { priority: "urgent", status: { notIn: ["resolved", "closed"] } },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, ticketNumber: true, subject: true, companyName: true, tenantId: true, createdAt: true, status: true }
        })
      : Promise.resolve([])
  ]);

  return (
    <>
      <AdminPageHeader
        eyebrow={["نظرة عامة", "Overview"]}
        title={[`مرحبًا ${user?.name ?? ""}`.trim(), "Welcome"]}
        description={["ملخص حالة المنصة والإيرادات والإجراءات التي تحتاج انتباهك الآن.", "Platform health, revenue and the actions that need your attention."]}
      />
      <OverviewView
        subscriptions={subscriptions}
        payments={payments}
        logs={logRows as AdminLog[]}
        actions={actions}
        urgentTickets={urgentTickets}
        generatedAt={generatedAt}
        showRevenue={canBilling}
        showActivity={canTeam}
      />
    </>
  );
}
