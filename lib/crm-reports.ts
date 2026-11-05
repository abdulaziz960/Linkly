import { prisma } from "./prisma";
import { todayInRiyadh } from "./crm-visits";
import { inventoryByProject } from "./crm-units";
import { listProjects } from "./crm-projects";

/**
 * The visit report: how visits turn into attendance and sales, by project and by employee.
 *
 * A visit counts in the range by its visit day. A customer counts as "sold" when their conversation is now in the
 * closing stage "فاز" - so "of those who came, how many bought" needs no extra bookkeeping. Cancelled visits are
 * shown apart and never count as attended or missed.
 */

export type VisitGroup = { name: string; booked: number; attended: number; noShow: number; cancelled: number; sold: number };
export type VisitReport = {
  from: string;
  to: string;
  totals: Omit<VisitGroup, "name"> & { byAi: number; byStaff: number };
  /** attended / (attended + no-show), and sold / attended - as 0..1, or null when there is nothing to divide. */
  attendanceRate: number | null;
  saleRate: number | null;
  byProject: VisitGroup[];
  byEmployee: VisitGroup[];
  /** The stock of each project: how many units, how many are left, how many were sold. */
  inventory: Array<{ name: string; total: number; available: number; sold: number }>;
};

const AI_BOOKER = "الذكاء الاصطناعي";
const NONE_PROJECT = "بدون مشروع";
const NONE_EMPLOYEE = "بدون موظف";

export async function getVisitReport(tenantId: string, daysBack = 30, now: Date = new Date()): Promise<VisitReport> {
  const span = Math.min(180, Math.max(1, Math.floor(daysBack)));
  const to = todayInRiyadh(now);
  const from = new Date(new Date(`${to}T00:00:00Z`).getTime() - (span - 1) * 86_400_000).toISOString().slice(0, 10);

  const visits = await prisma.$queryRaw<Array<{ project_name: string; conversation_id: string; customer_phone: string; employee: string; status: string; booked_by: string }>>`SELECT project_name, conversation_id, customer_phone, employee, status, booked_by FROM crm_visits WHERE tenant_id = ${tenantId} AND visit_date >= ${from} AND visit_date <= ${to}`.catch(() => []);

  // Who is in the closing stage now (by conversation, or by phone for visits booked without a conversation).
  const conversationIds = [...new Set(visits.map((visit) => visit.conversation_id).filter(Boolean))];
  const phones = [...new Set(visits.filter((visit) => !visit.conversation_id).map((visit) => visit.customer_phone).filter(Boolean))];
  const [byId, byPhone] = await Promise.all([
    conversationIds.length ? prisma.conversation.findMany({ where: { tenantId, id: { in: conversationIds }, pipelineStage: "فاز" }, select: { id: true } }) : [],
    phones.length ? prisma.conversation.findMany({ where: { tenantId, pipelineStage: "فاز", customer: { phone: { in: phones } } }, select: { customer: { select: { phone: true } } } }) : []
  ]);
  const soldConversations = new Set(byId.map((row) => row.id));
  const soldPhones = new Set(byPhone.map((row) => row.customer.phone));

  const blank = (name: string): VisitGroup => ({ name, booked: 0, attended: 0, noShow: 0, cancelled: 0, sold: 0 });
  const projects = new Map<string, VisitGroup>();
  const employees = new Map<string, VisitGroup>();
  const totals = { ...blank(""), byAi: 0, byStaff: 0 } as VisitGroup & { byAi: number; byStaff: number };
  const counted = new Set<string>(); // a customer who came counts once as "sold", however many visits they made

  const add = (group: VisitGroup, status: string, sold: boolean) => {
    group.booked += 1;
    if (status === "تم الحضور") group.attended += 1;
    if (status === "لم يحضر") group.noShow += 1;
    if (status === "ملغي") group.cancelled += 1;
    if (sold) group.sold += 1;
  };
  for (const visit of visits) {
    const customerKey = visit.conversation_id || visit.customer_phone;
    const isSold = (soldConversations.has(visit.conversation_id) || (!visit.conversation_id && soldPhones.has(visit.customer_phone))) && visit.status === "تم الحضور" && !counted.has(customerKey);
    if (isSold) counted.add(customerKey);
    const projectName = visit.project_name || NONE_PROJECT;
    const employeeName = visit.employee || NONE_EMPLOYEE;
    add(projects.get(projectName) ?? projects.set(projectName, blank(projectName)).get(projectName)!, visit.status, isSold);
    add(employees.get(employeeName) ?? employees.set(employeeName, blank(employeeName)).get(employeeName)!, visit.status, isSold);
    add(totals, visit.status, isSold);
    if (visit.status !== "ملغي") {
      if (visit.booked_by === AI_BOOKER) totals.byAi += 1;
      else totals.byStaff += 1;
    }
  }

  const [units, projectRows] = await Promise.all([inventoryByProject(tenantId), listProjects(tenantId)]);
  const inventory = units.map((row) => ({ name: projectRows.find((project) => project.id === row.projectId)?.name ?? "—", total: row.total, available: row.available, sold: row.sold })).sort((a, b) => a.name.localeCompare(b.name));
  const rank = (list: Iterable<VisitGroup>) => [...list].sort((a, b) => b.booked - a.booked || b.attended - a.attended || a.name.localeCompare(b.name));
  const { name: _name, ...totalsOut } = totals; // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    from,
    to,
    totals: totalsOut,
    attendanceRate: totals.attended + totals.noShow ? totals.attended / (totals.attended + totals.noShow) : null,
    saleRate: totals.attended ? totals.sold / totals.attended : null,
    byProject: rank(projects.values()),
    byEmployee: rank(employees.values()),
    inventory
  };
}
