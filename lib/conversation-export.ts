import { prisma } from "./prisma";
import { messageAttachmentPath } from "./message-attachments";
import { channelNames, type ChannelNameKey } from "../app/channel-names";

// Conversation export: every conversation with activity inside a period, with its messages, customer, tags and assignee.
// What a person may export is exactly what they may see in the inbox (the assignee scope is passed in by the route).

export const EXPORT_MAX_DAYS = 92;
export const EXPORT_MAX_CONVERSATIONS = 1000;
export const EXPORT_MAX_MESSAGES = 30000;

export type ExportOptions = {
  from: string;
  to: string;
  includeNotes: boolean;
  includeAttachments: boolean;
};

export type ExportMessage = {
  at: string;
  sender: string;
  kind: "customer" | "agent" | "note";
  text: string;
  attachment: string;
  attachmentUrl: string;
};

export type ExportConversation = {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  channel: string;
  status: string;
  assignee: string;
  tags: string[];
  firstAt: string;
  lastAt: string;
  messages: ExportMessage[];
};

export type ConversationExport = {
  from: string;
  to: string;
  conversations: ExportConversation[];
  totalMessages: number;
  truncated: boolean;
};

const STATUS_LABELS: Record<string, string> = { assigned: "مسندة", unassigned: "غير مسندة", closed: "مغلقة" };

/** A valid yyyy-mm-dd, else "". */
function dayOf(value: string | null | undefined) {
  const text = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? text : "";
}

/** The period as the full Riyadh days it names, as the UTC instants the stored timestamps compare against. */
export function exportPeriod(fromInput: string | null | undefined, toInput: string | null | undefined): { from: string; to: string; start: string; end: string } | { error: string } {
  const from = dayOf(fromInput);
  const to = dayOf(toInput);
  if (!from || !to) return { error: "حدّد تاريخ البداية والنهاية" };
  if (from > to) return { error: "تاريخ البداية بعد تاريخ النهاية" };
  const start = new Date(`${from}T00:00:00+03:00`);
  const end = new Date(`${to}T23:59:59.999+03:00`);
  if ((end.getTime() - start.getTime()) / 86_400_000 > EXPORT_MAX_DAYS) return { error: `الفترة القصوى ${EXPORT_MAX_DAYS} يومًا في المرة الواحدة` };
  return { from, to, start: start.toISOString(), end: end.toISOString() };
}

function channelLabel(channel: string) {
  return channelNames[channel as ChannelNameKey]?.ar ?? channel;
}

/** The conversations active in the period that the person may see, oldest activity first, with the period's messages. */
export async function loadConversationExport(tenantId: string, assigneeNames: string[] | undefined, period: { from: string; to: string; start: string; end: string }, options: Pick<ExportOptions, "includeNotes" | "includeAttachments">): Promise<ConversationExport> {
  const rows = await prisma.conversation.findMany({
    where: {
      tenantId,
      ...(assigneeNames ? { assignee: { in: assigneeNames } } : {}),
      messages: { some: { createdAt: { gte: period.start, lte: period.end }, ...(options.includeNotes ? {} : { direction: { not: "note" } }) } }
    },
    orderBy: { lastActivityAt: "asc" },
    take: EXPORT_MAX_CONVERSATIONS + 1,
    include: {
      customer: { select: { name: true, phone: true } },
      tags: true,
      messages: {
        where: { createdAt: { gte: period.start, lte: period.end }, ...(options.includeNotes ? {} : { direction: { not: "note" } }) },
        orderBy: { createdAt: "asc" },
        // The body of an inline attachment can be megabytes: the export links to it instead of carrying it.
        omit: { attachmentUrl: true }
      }
    }
  });

  let truncated = rows.length > EXPORT_MAX_CONVERSATIONS;
  let totalMessages = 0;
  const conversations: ExportConversation[] = [];
  for (const row of rows.slice(0, EXPORT_MAX_CONVERSATIONS)) {
    if (totalMessages + row.messages.length > EXPORT_MAX_MESSAGES) { truncated = true; break; }
    totalMessages += row.messages.length;
    const customerName = row.customer.name || row.customer.phone || "عميل";
    conversations.push({
      id: row.id,
      customerId: row.customerId,
      customerName,
      phone: row.customer.phone,
      channel: channelLabel(row.channel),
      status: STATUS_LABELS[row.status] ?? row.status,
      assignee: row.status === "unassigned" ? "" : row.assignee,
      tags: row.tags.map((tag) => tag.tagName),
      firstAt: row.messages[0]?.createdAt ?? "",
      lastAt: row.messages[row.messages.length - 1]?.createdAt ?? "",
      messages: row.messages.map((message) => {
        const kind = message.direction === "in" ? "customer" : message.direction === "note" ? "note" : "agent";
        return {
          at: message.createdAt,
          sender: kind === "customer" ? customerName : kind === "note" ? message.author || "ملاحظة" : message.author || "الفريق",
          kind,
          text: message.text,
          attachment: options.includeAttachments && message.attachmentType ? message.attachmentName || message.attachmentType : "",
          attachmentUrl: options.includeAttachments && message.attachmentType ? messageAttachmentPath(row.id, message.id) : ""
        };
      })
    });
  }
  return { from: period.from, to: period.to, conversations: mergeByCustomer(conversations), totalMessages, truncated };
}

/** One entry per customer: a customer who wrote on several days or channels reads as a single thread, oldest message first. */
export function mergeByCustomer(conversations: ExportConversation[]): ExportConversation[] {
  const byCustomer = new Map<string, ExportConversation[]>();
  for (const conversation of conversations) byCustomer.set(conversation.customerId, [...(byCustomer.get(conversation.customerId) ?? []), conversation]);
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
  return [...byCustomer.values()].map((group) => {
    if (group.length === 1) return group[0];
    const messages = group.flatMap((conversation) => conversation.messages).sort((a, b) => a.at.localeCompare(b.at));
    const latest = [...group].sort((a, b) => b.lastAt.localeCompare(a.lastAt))[0];
    return {
      ...latest,
      id: group.map((conversation) => conversation.id).join("+"),
      channel: unique(group.map((conversation) => conversation.channel)).join("، "),
      assignee: unique(group.map((conversation) => conversation.assignee)).join("، "),
      tags: unique(group.flatMap((conversation) => conversation.tags)),
      firstAt: messages[0]?.at ?? "",
      lastAt: messages[messages.length - 1]?.at ?? "",
      messages
    };
  }).sort((a, b) => a.lastAt.localeCompare(b.lastAt));
}

const DAY_LABEL = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { timeZone: "Asia/Riyadh", weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** The Riyadh calendar day of a stored timestamp, "2026-11-01" ("" when it cannot be read). */
export function riyadhDay(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** "09:48" in Riyadh time. */
export function riyadhTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() + 3 * 3600_000).toISOString().slice(11, 16);
}

/** "الأحد 1 نوفمبر 2026" - the heading above each day of a conversation. */
export function riyadhDayLabel(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DAY_LABEL.format(date);
}

/** "2026-11-01 09:48" in Riyadh time, from a stored ISO timestamp. */
export function riyadhStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const local = new Date(date.getTime() + 3 * 3600_000);
  return `${local.toISOString().slice(0, 10)} ${local.toISOString().slice(11, 16)}`;
}
