import { prisma } from "./prisma";
import { getAdSource } from "./ad-source";
import { listProjects, matchProject } from "./crm-projects";
import { getConversationUnit, listUnits, type ConversationUnit, type CrmUnit } from "./crm-units";
import { listVisits, upcomingVisitForCustomer, type Visit } from "./crm-visits";
import { getLeadTimeline, type TimelineEntry } from "./lead-timeline";

/** Everything the lead detail panel shows: who the customer is, the project, the visits and the history. */

export type LeadDetail = {
  conversationId: string;
  customer: { name: string; phone: string; email: string };
  stage: string;
  assignee: string;
  channel: string;
  dealValue: number;
  tags: string[];
  firstContactAt: string;
  lastActivityAt: string;
  source: string;
  project: string;
  /** The unit type the customer wants (and whether it was sold), and the unit types of their project to pick from. */
  unit: ConversationUnit;
  projectUnits: CrmUnit[];
  answers: Array<{ question: string; answer: string }>;
  upcomingVisit: Visit | null;
  visits: Visit[];
  timeline: TimelineEntry[];
  interactions: { incoming: number; outgoing: number; recent: Array<{ direction: string; text: string; at: string; author: string }> };
};

function parseAnswers(json: string): Array<{ question: string; answer: string }> {
  try {
    const parsed = JSON.parse(json || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is { question: string; answer: string } => Boolean(item) && typeof (item as { question?: unknown }).question === "string" && typeof (item as { answer?: unknown }).answer === "string")
      .slice(0, 30);
  } catch {
    return [];
  }
}

export async function getLeadDetail(tenantId: string, conversationId: string): Promise<LeadDetail | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: { customer: true, tags: true }
  });
  if (!conversation) return null;

  const [lead, adSource, projects, timeline, messages, counts, first] = await Promise.all([
    prisma.lead.findFirst({ where: { tenantId, conversationId }, orderBy: { createdAt: "desc" } }),
    getAdSource(tenantId, conversationId).catch(() => null),
    listProjects(tenantId),
    getLeadTimeline(tenantId, conversationId),
    prisma.message.findMany({ where: { conversationId, direction: { in: ["in", "out"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, select: { direction: true, text: true, createdAt: true, author: true } }),
    prisma.message.groupBy({ by: ["direction"], where: { conversationId, direction: { in: ["in", "out"] } }, _count: { _all: true } }),
    prisma.message.findFirst({ where: { conversationId, createdAt: { not: "" } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } })
  ]);

  const phone = conversation.customer.phone;
  const [visits, upcomingVisit] = await Promise.all([
    listVisits(tenantId).then((all) => all.filter((visit) => visit.conversationId === conversationId || (phone && visit.customerPhone === phone)).reverse()),
    upcomingVisitForCustomer(tenantId, { conversationId, phone })
  ]);

  const answers = parseAnswers(lead?.answersJson ?? "");
  const leadText = [lead?.formName, ...answers.map((answer) => answer.answer), ...messages.filter((message) => message.direction === "in").map((message) => message.text)].filter(Boolean).join("\n");
  const matchedProject = matchProject(projects, leadText);
  const [unit, projectUnits] = await Promise.all([getConversationUnit(tenantId, conversationId), matchedProject ? listUnits(tenantId, matchedProject.id) : Promise.resolve([] as CrmUnit[])]);
  const project = matchedProject?.name || lead?.formName || answers.find((answer) => /مشروع|project/i.test(answer.question))?.answer || "";

  const count = (direction: string) => counts.find((row) => row.direction === direction)?._count._all ?? 0;
  return {
    conversationId,
    customer: { name: conversation.customer.name, phone, email: lead?.email ?? "" },
    stage: conversation.pipelineStage || "جديد",
    assignee: conversation.assignee,
    channel: conversation.channel,
    dealValue: conversation.dealValue,
    tags: conversation.tags.map((tag) => tag.tagName),
    firstContactAt: first?.createdAt ?? "",
    lastActivityAt: conversation.lastActivityAt,
    source: adSource ? `${adSource.platform}${adSource.headline ? ` · ${adSource.headline}` : ""}` : lead?.source ?? conversation.attrUtmSource ?? "",
    project,
    unit,
    projectUnits,
    answers,
    upcomingVisit,
    visits,
    timeline,
    interactions: { incoming: count("in"), outgoing: count("out"), recent: messages.map((message) => ({ direction: message.direction, text: message.text, at: message.createdAt, author: message.author })) }
  };
}
