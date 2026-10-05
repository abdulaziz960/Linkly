import { notFound } from "next/navigation";
import { getAdminLogs } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { getSubscriptions, getSubscriptionPayments } from "../../../../lib/subscriptions";
import { getTenantGrants } from "../../../../lib/plan-grants";
import { encodeGrantKeys, grantableForPlan, getPlanRestriction, planLimit } from "../../../../lib/plan-access";
import AdminPageHeader from "../../AdminPageHeader";
import ClientEmployeesPanel from "./ClientEmployeesPanel";
import ClientAccessPanel from "./ClientAccessPanel";
import ClientNotesPanel from "./ClientNotesPanel";
import ProfileTabs from "./ProfileTabs";
import { ProfileChannels, ProfileConversations, ProfileTickets, ProfileTimeline, ProfileUsage } from "./ProfileSections";
import { getAdminActionLogs } from "../../../../lib/admin-audit";
import { Badge, EmptyState, LinkButton, Section, StatCard } from "../../ds/primitives";
import { formatNumber, getRenewalAlert } from "../../utils";
import { LOG_TONE, PAYMENT_TONE, billingSummary, newestFirst } from "./profile-data";
import { guardPage } from "../../guard";

const STATUS_TONE = { نشط: "success", تجربة: "warning", متوقف: "danger" } as const;

// Server timestamp for relative times; read outside render so the component stays pure.
const nowMs = () => Date.now();

export default async function AdminClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await guardPage("clients");
  if (denied) return denied;
  const generatedAt = nowMs();
  const { id } = await params;
  const tenantId = decodeURIComponent(id);
  const [subscriptions, payments, logs, employees] = await Promise.all([
    getSubscriptions(),
    getSubscriptionPayments(),
    getAdminLogs(),
    prisma.employee.findMany({ where: { tenantId }, orderBy: { name: "asc" } })
  ]);
  const client = subscriptions.find((item) => item.tenantId === tenantId);
  if (!client) notFound();

  const granted = encodeGrantKeys(await getTenantGrants(tenantId));
  const planRow = await prisma.plan.findUnique({ where: { name: client.plan }, select: { allowedChannels: true, aiDailyLimit: true, aiMonthlyLimit: true } });
  const fmt = (value: number | null) => (value === null ? "غير محدود" : String(value));
  const planDefaults: Record<string, string> = {
    "limit:teams": fmt(planLimit(client.plan, "teams")),
    "limit:products": fmt(planLimit(client.plan, "products")),
    "limit:branches": fmt(planLimit(client.plan, "branches")),
    "limit:kbEntries": fmt(planLimit(client.plan, "kbEntries")),
    "num:botMaxSteps": fmt(getPlanRestriction(client.plan)?.botMaxSteps ?? null),
    "num:aiDaily": String(planRow?.aiDailyLimit ?? 0),
    "num:aiMonthly": String(planRow?.aiMonthlyLimit ?? 0),
    "num:escalationMinutes": "30"
  };

  // Extra profile tabs. Secrets (tokens, passwords) are never selected.
  const [integrations, tickets, byChannel, byStatus, actionLogs] = await Promise.all([
    prisma.integrationSetting.findMany({ where: { tenantId }, select: { id: true, provider: true, status: true, businessName: true } }),
    prisma.supportTicket.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, ticketNumber: true, subject: true, status: true, priority: true, assignedAgentName: true, updatedAt: true }
    }),
    prisma.conversation.groupBy({ by: ["channel"], where: { tenantId }, _count: { _all: true } }),
    prisma.conversation.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } }),
    getAdminActionLogs(400)
  ]);

  const clientPayments = newestFirst(payments.filter((item) => item.tenantId === tenantId));
  const clientLogs = logs.filter((item) => item.clientId === tenantId).reverse();
  const summary = billingSummary(client, clientPayments);
  const renewal = getRenewalAlert(client);

  const overviewTab = (
    <>
      <div className="ds-grid-2" style={{ alignItems: "start" }}>
        <Section title="أحدث المدفوعات" description="آخر خمس عمليات مرتبطة بهذا العميل.">
          <div className="ds-card ds-card-pad">
            {clientPayments.length === 0 ? (
              <EmptyState icon="card" title="لا توجد مدفوعات" description="ستظهر هنا عمليات الدفع عند تنفيذها." />
            ) : (
              <ul className="ds-feed">
                {clientPayments.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <Badge tone={PAYMENT_TONE[item.status] ?? "neutral"}>{item.status}</Badge>
                    <div className="ds-feed-body">
                      <strong>{formatNumber(item.amount)} ر.س · {item.source}</strong>
                      <span>{item.completedAt || item.createdAt} · <bdi dir="ltr">{item.moyasarId || "—"}</bdi></span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section title="أحدث النشاطات" description="آخر خمس أحداث مرتبطة بهذا العميل.">
          <div className="ds-card ds-card-pad">
            {clientLogs.length === 0 ? (
              <EmptyState icon="scroll" title="لا توجد أحداث" description="ستظهر هنا أنشطة الحساب عند حدوثها." />
            ) : (
              <ul className="ds-feed">
                {clientLogs.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <Badge tone={LOG_TONE[item.level] ?? "neutral"}>{item.level}</Badge>
                    <div className="ds-feed-body">
                      <strong>{item.message}</strong>
                      <span>{item.at} · {item.source}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      </div>
    </>
  );

  const tabs = [
    { id: "overview", label: "نظرة عامة", content: overviewTab },
    { id: "access", label: "الصلاحيات والمزايا", content: <ClientAccessPanel tenantId={tenantId} plan={client.plan} grantable={grantableForPlan(client.plan, planRow?.allowedChannels)} granted={granted} defaults={planDefaults} /> },
    { id: "users", label: "المستخدمون", count: employees.length, content: <ClientEmployeesPanel tenantId={tenantId} employees={employees} /> },
    { id: "channels", label: "القنوات", count: integrations.length, content: <ProfileChannels integrations={integrations} /> },
    { id: "usage", label: "الاستخدام والحدود", content: <ProfileUsage employeeCount={client.employeeCount} employeeLimit={client.employeeLimit} campaignBalance={client.campaignBalance} extraUsers={summary.invoice.extraUsers} extraAmount={summary.invoice.extraAmount} /> },
    { id: "conversations", label: "المحادثات", content: <ProfileConversations byChannel={byChannel.map((row) => ({ key: row.channel, count: row._count._all }))} byStatus={byStatus.map((row) => ({ key: row.status, count: row._count._all }))} /> },
    { id: "tickets", label: "التذاكر", count: tickets.length, content: <ProfileTickets tickets={tickets} now={generatedAt} /> },
    { id: "activity", label: "سجل النشاط", content: <ProfileTimeline logs={clientLogs} actions={actionLogs.filter((action) => action.targetId === tenantId).slice(0, 60)} now={generatedAt} tenantId={tenantId} /> },
    { id: "notes", label: "ملاحظات داخلية", content: <ClientNotesPanel tenantId={tenantId} generatedAt={generatedAt} /> }
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow={["ملف العميل", "Client profile"]}
        title={[client.companyName, client.companyName]}
        description={["ملف موحد للاشتراك والفوترة والاستخدام وسجل الحركة.", "A unified profile for subscription, billing, usage, and activity."]}
      />

      <div className="ds-card ds-card-pad ds-profile-hero">
        <span className="ds-avatar" aria-hidden="true">{client.companyName.slice(0, 1) || "ع"}</span>
        <div className="ds-profile-hero-main">
          <div className="ds-profile-hero-title">
            <h2>{client.companyName}</h2>
            <Badge tone={STATUS_TONE[client.status as keyof typeof STATUS_TONE] ?? "neutral"}>{client.status}</Badge>
          </div>
          <p>{client.ownerName} · <bdi dir="ltr">{client.ownerEmail}</bdi></p>
        </div>
        <div className="ds-section-actions">
          <LinkButton href={`/linkly-admin007/logs?client=${client.tenantId}`} variant="outline" icon="scroll">السجل الكامل</LinkButton>
          <LinkButton href={`/linkly-admin007/payments?client=${client.tenantId}`} variant="outline" icon="card">كل المدفوعات</LinkButton>
        </div>
      </div>

      <div className="ds-stat-grid" style={{ marginTop: 16 }}>
        <StatCard label="الباقة" value={client.plan} hint={`الدورة: ${client.billingCycle}`} icon="layers" />
        <StatCard
          label="التجديد"
          value={client.renewalAt || "غير محدد"}
          hint={renewal?.label || "الحالة طبيعية"}
          icon="calendar"
          tone={renewal ? (renewal.tier === "overdue" ? "danger" : "warning") : "neutral"}
        />
        <StatCard
          label="المستخدمون"
          value={`${formatNumber(client.employeeCount)} / ${formatNumber(client.employeeLimit)}`}
          hint={summary.invoice.extraUsers ? `${formatNumber(summary.invoice.extraUsers)} مستخدم فوق الحد` : "ضمن حد الباقة"}
          icon="users"
          tone={summary.invoice.extraUsers ? "warning" : "neutral"}
        />
        <StatCard label="الفاتورة الشهرية" value={`${formatNumber(summary.invoice.total)} ر.س`} hint={summary.invoice.extraAmount ? `تشمل ${formatNumber(summary.invoice.extraAmount)} ر.س مستخدمين إضافيين` : "اشتراك فقط"} icon="receipt" />
        <StatCard label="المحصَّل" value={`${formatNumber(summary.collected)} ر.س`} hint={`${formatNumber(summary.completedCount)} دفعة مكتملة من ${formatNumber(summary.paymentCount)}`} icon="wallet" tone="success" />
        <StatCard label="المستحق" value={`${formatNumber(summary.outstanding)} ر.س`} hint="دفعات قيد الانتظار" icon="clock" tone={summary.outstanding ? "warning" : "neutral"} />
        <StatCard label="المحادثات" value={formatNumber(client.conversationCount)} hint="إجمالي محادثات العميل" icon="message" />
        <StatCard label="رصيد رسائل الحملات" value={formatNumber(client.campaignBalance)} hint="رسالة متاحة" icon="zap" />
      </div>

      <ProfileTabs tabs={tabs} />
    </>
  );
}
