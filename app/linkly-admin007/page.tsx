import { getAdminLogs } from "../../lib/database";
import { getAdminActionLogs } from "../../lib/admin-audit";
import { getCurrentUser } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { getSubscriptions, getSubscriptionPayments } from "../../lib/subscriptions";
import AdminPageHeader from "./AdminPageHeader";
import OverviewView from "./OverviewView";

// Server timestamp for "data as of"; read outside render so the component stays pure.
const nowMs = () => Date.now();

export default async function AdminOverviewPage() {
  const generatedAt = nowMs();
  const [user, subscriptions, payments, logs, actions, urgentTickets] = await Promise.all([
    getCurrentUser(),
    getSubscriptions(),
    getSubscriptionPayments(),
    getAdminLogs(),
    getAdminActionLogs(60),
    prisma.supportTicket.findMany({
      where: { priority: "urgent", status: { notIn: ["resolved", "closed"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, ticketNumber: true, subject: true, companyName: true, tenantId: true, createdAt: true, status: true }
    })
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
        logs={logs.slice(-300)}
        actions={actions}
        urgentTickets={urgentTickets}
        generatedAt={generatedAt}
      />
    </>
  );
}
