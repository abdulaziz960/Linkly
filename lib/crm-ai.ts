import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { AI_NO_ANSWER } from "./ai-provider";
import { findKbContext } from "./knowledge-base";
import { humanHasJoined, sendBotText } from "./bot-engine";
import { runWorkspaceAi, getPublicAiSettings } from "./workspace-ai";
import { textSimilarity } from "./text-similarity";
import { formatMessageTime } from "./time";
import { listProjects, matchProject, projectProfileText, type CrmProject } from "./crm-projects";
import { listUnits, matchUnit, setConversationUnit, unitsBrief, type CrmUnit } from "./crm-units";
import { AI_BOOKER, availableDays, bookVisit, isValidDate, isValidTime, todayInRiyadh, upcomingVisitForCustomer, type DayAvailability } from "./crm-visits";

/**
 * The AI that keeps a CRM lead's WhatsApp chat going as the employee it was assigned to.
 *
 * A CRM assigns a lead to an employee (lib/crm-assignment.ts); when the workspace turned this on,
 * every customer message on that conversation is answered here - in a natural Saudi sales tone, from
 * the lead's project facts - until a person on the team replies (then it stays quiet for good), the
 * customer asks for a person, or the AI has nothing reliable to say (it then hands over and leaves a
 * note for the employee). Only the workspace's own AI key is used, with its own limits.
 */

const MAX_AI_REPLIES = 12;
const LOCK_MS = 20_000;
const AI_AUTHOR = "الرد الآلي";
const AI_USER_ID = "crm-ai-reply";

// What the customer sees when the AI hands the chat over: a plain human line, never an error.
const HANDOFF_LINES = [
  "تمام، خلني أراجع الموضوع وأرجع لك بنفسي بإذن الله 🙏",
  "أبشر، دقايق وأرجع لك بالتفاصيل إن شاء الله",
  "حياك الله، خلني أتأكد لك وأرد عليك الحين"
];

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_ai_settings (
      tenant_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_ai_flags (
      tenant_id TEXT NOT NULL,
      flag TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, flag)
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_ai_threads (
      conversation_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      employee TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      replies INTEGER NOT NULL DEFAULT 0,
      ended_reason TEXT NOT NULL DEFAULT '',
      lock_until TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function getCrmAiSettings(tenantId: string) {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ enabled: number }>>`SELECT enabled FROM crm_ai_settings WHERE tenant_id = ${tenantId} LIMIT 1`;
  const ai = await getPublicAiSettings(tenantId).catch(() => null);
  const flags = await prisma.$queryRaw<Array<{ flag: string; enabled: number }>>`SELECT flag, enabled FROM crm_ai_flags WHERE tenant_id = ${tenantId}`;
  const flagOn = (name: string) => flags.some((row) => row.flag === name && row.enabled === 1);
  return {
    enabled: rows[0]?.enabled === 1,
    // Also answer leads that come straight from an ad platform's form (no CRM), after the usual welcome.
    platformLeads: flagOn("platform_leads"),
    // Also answer a customer who writes to us first with a general question (no form, no CRM), from the saved data.
    inquiries: flagOn("inquiries"),
    // The customer-facing reply needs the workspace's AI switched on, with its own key or Linkly's DeepSeek assistant.
    aiReady: Boolean(ai?.enabled && (ai.hasKey || (ai.managedReplies && ai.managedReady)))
  };
}

export async function saveCrmAiSettings(tenantId: string, enabled: boolean) {
  await ensureTables();
  const now = new Date().toISOString();
  await prisma.$executeRaw`DELETE FROM crm_ai_settings WHERE tenant_id = ${tenantId}`;
  await prisma.$executeRaw`INSERT INTO crm_ai_settings (tenant_id, enabled, updated_at) VALUES (${tenantId}, ${enabled ? 1 : 0}, ${now})`;
  return getCrmAiSettings(tenantId);
}

export async function saveCrmAiFlag(tenantId: string, flag: "platform_leads" | "inquiries", enabled: boolean) {
  await ensureTables();
  const now = new Date().toISOString();
  await prisma.$executeRaw`DELETE FROM crm_ai_flags WHERE tenant_id = ${tenantId} AND flag = ${flag}`;
  await prisma.$executeRaw`INSERT INTO crm_ai_flags (tenant_id, flag, enabled, updated_at) VALUES (${tenantId}, ${flag}, ${enabled ? 1 : 0}, ${now})`;
  return getCrmAiSettings(tenantId);
}

/**
 * A customer who writes first with a general question (no form, no CRM): when the owner turned this on, and
 * only on the very first contact (the bot flow has not run), the AI answers from the saved projects, units,
 * knowledge base and visit schedule. Existing conversations are never taken over. Never throws.
 */
export async function startInquiryAi(tenantId: string, conversationId: string): Promise<boolean> {
  try {
    const settings = await getCrmAiSettings(tenantId);
    // Without the workspace's own AI key it could not answer, and the bot flow must stay free to greet.
    if (!settings.enabled || !settings.inquiries || !settings.aiReady) return false;
    if (await readThread(conversationId)) return false;
    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { botRanAt: true } });
    if (!conversation || conversation.botRanAt) return false;
    if (await humanHasJoined(conversationId)) return false;
    return await startCrmAiThread(tenantId, conversationId, "");
  } catch (error) {
    console.error("Inquiry AI start failed", error);
    return false;
  }
}

/**
 * A lead that came straight from an ad platform form (Meta, Snapchat, the leads API without a CRM employee):
 * when the owner turned this on, the AI answers the customer once they reply to the welcome. It speaks as the
 * sales team (no employee name); an existing thread is left alone. Never throws.
 */
export async function startPlatformLeadAi(tenantId: string, conversationId: string): Promise<boolean> {
  try {
    const settings = await getCrmAiSettings(tenantId);
    if (!settings.enabled || !settings.platformLeads || !settings.aiReady) return false;
    if (await readThread(conversationId)) return false;
    return await startCrmAiThread(tenantId, conversationId, "");
  } catch (error) {
    console.error("Platform lead AI start failed", error);
    return false;
  }
}

type Thread = { conversation_id: string; employee: string; active: number; replies: number; lock_until: string };

async function readThread(conversationId: string): Promise<Thread | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Thread[]>`SELECT conversation_id, employee, active, replies, lock_until FROM crm_ai_threads WHERE conversation_id = ${conversationId} LIMIT 1`;
  return rows[0] ?? null;
}

async function endThread(conversationId: string, reason: string) {
  await prisma.$executeRaw`UPDATE crm_ai_threads SET active = 0, ended_reason = ${reason}, updated_at = ${new Date().toISOString()} WHERE conversation_id = ${conversationId}`;
}

async function addNote(conversationId: string, text: string) {
  const now = new Date();
  await prisma.message.create({
    data: {
      id: `crm-ai-note-${randomUUID()}`,
      conversationId,
      direction: "note",
      text,
      time: formatMessageTime(now),
      createdAt: now.toISOString(),
      author: "",
      sourceType: "crm_ai_note"
    }
  }).catch((error) => console.error("CRM AI note failed", error));
}

/**
 * Starts the AI on a conversation a CRM just assigned, when the workspace turned it on. Safe to call
 * again (a resend of the same lead): an existing thread keeps its state, only the employee name follows.
 * The bot flow is marked as already run so it never greets over the employee.
 */
export async function startCrmAiThread(tenantId: string, conversationId: string, employee: string): Promise<boolean> {
  const settings = await getCrmAiSettings(tenantId);
  if (!settings.enabled) return false;
  const now = new Date().toISOString();
  const existing = await readThread(conversationId);
  if (existing) {
    await prisma.$executeRaw`UPDATE crm_ai_threads SET employee = ${employee}, updated_at = ${now} WHERE conversation_id = ${conversationId}`;
  } else {
    await prisma.$executeRaw`INSERT INTO crm_ai_threads (conversation_id, tenant_id, employee, active, replies, started_at, updated_at) VALUES (${conversationId}, ${tenantId}, ${employee}, 1, 0, ${now}, ${now})`;
  }
  await prisma.conversation.updateMany({ where: { id: conversationId, tenantId, botRanAt: "" }, data: { botRanAt: now } });
  return true;
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * What the AI may know about the lead's project. The project profile the owner wrote (found from what the
 * customer is asking about now, else from the lead's own form) comes first; without profiles it falls back to
 * the catalogue item the lead points to. Plus the closest knowledge-base answers and the branches (where a visit
 * happens). With several projects and no clear match it gets the names and asks which one.
 */
export async function buildProjectDossier(tenantId: string, conversationId: string, customerTexts: string[]): Promise<{ text: string; project: CrmProject | null; units: CrmUnit[] }> {
  const lead = await prisma.lead.findFirst({ where: { tenantId, conversationId }, orderBy: { createdAt: "desc" } });
  const leadText = [lead?.formName, lead?.answersJson, ...customerTexts.slice(0, 4)].filter(Boolean).join("\n");
  const [profiles, products, branches] = await Promise.all([
    listProjects(tenantId),
    prisma.product.findMany({ where: { tenantId, active: 1 }, take: 300, orderBy: { name: "asc" } }),
    prisma.branch.findMany({ where: { tenantId, active: 1 }, take: 3 })
  ]);

  const lines: string[] = [];
  // What the customer is asking about now wins over what the form said (they may switch project mid-chat).
  const project = matchProject(profiles, customerTexts.slice(-2).join("\n")) ?? matchProject(profiles, leadText);
  const units = project ? await listUnits(tenantId, project.id) : [];
  if (project) {
    lines.push(projectProfileText(project));
    if (units.length) lines.push(unitsBrief(units));
  } else if (profiles.some((profile) => profile.active)) {
    lines.push(`The business has these projects (the customer has not said clearly which one): ${profiles.filter((profile) => profile.active).map((profile) => profile.name).join("، ")}. Ask which one they mean before giving details.`);
  } else {
    const normalized = leadText.toLowerCase();
    const scored = products
      .map((product) => ({ product, score: normalized.includes(product.name.toLowerCase()) ? 1 : textSimilarity(leadText, product.name) }))
      .sort((x, y) => y.score - x.score);
    const best = scored[0];
    if (best && best.score >= 0.5) {
      const p = best.product;
      lines.push("The lead's project:");
      lines.push(`- Name: ${p.name}`);
      if (p.category) lines.push(`- Type/category: ${p.category}`);
      if (p.price > 0) lines.push(`- Price: ${p.price} ${p.currency}`);
      if (p.description) lines.push(`- Details: ${clip(p.description, 1800)}`);
      if (p.productUrl) lines.push(`- Link: ${p.productUrl}`);
    } else if (products.length) {
      lines.push(`The business offers these projects (the customer has not said clearly which one): ${products.slice(0, 12).map((p) => p.name).join("، ")}. Ask which one they mean before giving details.`);
    }
  }

  const knowledge = await findKbContext(tenantId, [leadText.slice(0, 300), ...customerTexts.slice(0, 2)].join("\n"), 3);
  if (knowledge.length) {
    lines.push("Related business answers:");
    for (const entry of knowledge) lines.push(`- ${entry.question ? `${clip(entry.question, 200)}: ` : ""}${clip(entry.answer, 600)}`);
  }

  if (branches.length) {
    lines.push("Where visits happen:");
    for (const b of branches) lines.push(`- ${b.name}${b.address ? `, ${b.address}` : ""}${b.workingHours ? ` (hours: ${b.workingHours})` : ""}${b.mapUrl ? ` ${b.mapUrl}` : ""}`);
  }
  if (lead?.answersJson) lines.push(`The lead's own form answers: ${clip(lead.answersJson, 800)}`);
  return { text: lines.join("\n"), project, units };
}

const WEEKDAY = new Intl.DateTimeFormat("ar-SA", { weekday: "long", timeZone: "UTC" });
export function dayLabel(date: string) {
  return `${WEEKDAY.format(new Date(`${date}T00:00:00Z`))} ${date}`;
}

/** The schedule the AI is given: today, the customer's existing visit, and which days still have room. */
export function scheduleBrief(today: string, days: DayAvailability[], existing: { date: string; time: string } | null): string {
  const open = days.filter((day) => day.left > 0).slice(0, 10);
  return [
    `Today is ${dayLabel(today)} (Riyadh time).`,
    existing ? `This customer already has a visit booked on ${dayLabel(existing.date)} at ${existing.time}. Do not book another.` : "This customer has no visit booked yet.",
    open.length ? `Days with room for a visit (any other day is full or past): ${open.map((day) => `${dayLabel(day.date)} (${day.left} left)`).join("، ")}.` : "No day in the next two weeks has room: tell the customer the team will confirm a date, and do not book."
  ].join("\n");
}

/** Splits the model output into the customer-facing text, an employee note, a booking request and a handoff reason. */
export function parseSalesReply(raw: string): { text: string; note: string; handoff: string | null; book: { date: string; time: string } | null; unit: string | null } {
  const lines = raw.trim().split("\n");
  const noteLines: string[] = [];
  const keep: string[] = [];
  let book: { date: string; time: string } | null = null;
  let unit: string | null = null;
  for (const line of lines) {
    const unitMatch = /^\s*UNIT\s*:\s*(.{1,120})$/i.exec(line);
    if (unitMatch) {
      unit = unitMatch[1].trim();
      continue;
    }
    const noteMatch = /^\s*NOTE\s*:\s*(.+)$/i.exec(line);
    const bookMatch = /^\s*BOOK\s*:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*$/i.exec(line);
    if (noteMatch) noteLines.push(noteMatch[1].trim());
    else if (bookMatch) {
      if (isValidDate(bookMatch[1]) && isValidTime(bookMatch[2])) book = { date: bookMatch[1], time: bookMatch[2] };
    } else keep.push(line);
  }
  const text = keep.join("\n").trim();
  const note = noteLines.join(" ").slice(0, 400);
  const handoff = /^\s*HANDOFF\b/i.test(text) ? text.replace(/^\s*HANDOFF\s*:?\s*/i, "").trim() || "طلب العميل موظفًا" : null;
  if (text.includes(AI_NO_ANSWER)) return { text: "", note, handoff: handoff ?? "لا توجد إجابة موثوقة", book: null, unit: null };
  return { text: handoff ? "" : text, note, handoff, book: handoff ? null : book, unit: handoff ? null : unit };
}

/**
 * Called for every customer message on WhatsApp. Returns true when the AI took the message (the normal
 * bot must then stay out of it), false when this conversation is not (or no longer) the AI's.
 */
export async function handleCrmAiReply(input: { tenantId: string; conversationId: string; phone: string }): Promise<boolean> {
  const thread = await readThread(input.conversationId);
  if (!thread || thread.active !== 1) return false;

  // A team member answered: the AI stays out for good - the customer never gets both.
  if (await humanHasJoined(input.conversationId)) {
    await endThread(input.conversationId, "human_joined");
    return false;
  }
  if (thread.lock_until && thread.lock_until > new Date().toISOString()) return true;
  const lockUntil = new Date(Date.now() + LOCK_MS).toISOString();
  const claimed = await prisma.$executeRaw`UPDATE crm_ai_threads SET lock_until = ${lockUntil} WHERE conversation_id = ${input.conversationId} AND lock_until = ${thread.lock_until}`;
  if (Number(claimed) !== 1) return true;

  try {
    const handOver = async (reason: string) => {
      await sendBotText("whatsapp", { tenantId: input.tenantId, conversationId: input.conversationId, recipientId: input.phone, text: HANDOFF_LINES[thread.replies % HANDOFF_LINES.length], author: AI_AUTHOR });
      await addNote(input.conversationId, `الذكاء الاصطناعي سلّم المحادثة لك: ${reason}`);
      await prisma.conversation.updateMany({ where: { id: input.conversationId }, data: { unread: { increment: 1 } } });
      await endThread(input.conversationId, "handoff");
    };

    if (thread.replies >= MAX_AI_REPLIES) {
      await handOver("وصل الحد الأقصى لردود الذكاء الاصطناعي في هذه المحادثة");
      return true;
    }

    const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId }, include: { customer: true } });
    if (!conversation) return false;
    const messages = await prisma.message.findMany({
      where: { conversationId: input.conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { direction: true, text: true },
      take: 40
    });
    const ordered = messages.reverse().map((message) => ({ direction: message.direction as "in" | "out" | "note", text: message.text }));
    const customerTexts = ordered.filter((message) => message.direction === "in").map((message) => message.text);
    const [dossier, subscription, existingVisit] = await Promise.all([
      buildProjectDossier(input.tenantId, input.conversationId, customerTexts),
      prisma.subscription.findUnique({ where: { tenantId: input.tenantId }, select: { companyName: true } }),
      upcomingVisitForCustomer(input.tenantId, { conversationId: input.conversationId, phone: input.phone })
    ]);
    const days = await availableDays(input.tenantId, { projectId: dossier.project?.id, projectLimit: dossier.project?.dailyVisitLimit, days: 14 });
    const today = todayInRiyadh();

    const result = await runWorkspaceAi(input.tenantId, AI_USER_ID, input.conversationId, {
      messages: ordered,
      customerName: conversation.customer.name,
      language: "ar",
      operation: "reply",
      salesPersona: { employee: thread.employee || "فريق المبيعات", company: subscription?.companyName || "الشركة", projectInfo: dossier.text, schedule: scheduleBrief(today, days, existingVisit) }
    });

    const raw = result.suggestion?.trim();
    if (!raw) {
      // No AI (switched off, no key, limit reached, provider down): stay silent and leave the chat to the employee.
      await addNote(input.conversationId, `لم يرد الذكاء الاصطناعي على آخر رسالة (${result.reason || "لا يوجد رد"}). المحادثة بانتظارك.`);
      await endThread(input.conversationId, result.reason || "no_reply");
      return false;
    }

    const parsed = parseSalesReply(raw);
    if (parsed.handoff) {
      await handOver(parsed.handoff);
      return true;
    }
    if (!parsed.text) {
      await handOver("لم يجد الذكاء الاصطناعي ردًا مناسبًا");
      return true;
    }
    let outgoing = parsed.text;
    let bookedNote = "";
    if (parsed.book) {
      const booking = await bookVisit({
        tenantId: input.tenantId,
        date: parsed.book.date,
        time: parsed.book.time,
        customerName: conversation.customer.name,
        customerPhone: input.phone,
        conversationId: input.conversationId,
        projectId: dossier.project?.id,
        projectName: dossier.project?.name,
        projectLimit: dossier.project?.dailyVisitLimit,
        bookedBy: AI_BOOKER,
        employee: thread.employee
      });
      if (booking.ok) {
        bookedNote = `حجز الذكاء الاصطناعي زيارة للعميل يوم ${dayLabel(parsed.book.date)} الساعة ${parsed.book.time}${dossier.project ? ` (${dossier.project.name})` : ""}.`;
      } else {
        // The slot could not be saved (full, past, a visit already booked): never confirm it - say so and offer what is open.
        const open = (await availableDays(input.tenantId, { projectId: dossier.project?.id, projectLimit: dossier.project?.dailyVisitLimit, days: 14 })).filter((day) => day.left > 0).slice(0, 3);
        outgoing = booking.reason === "duplicate"
          ? "عندك زيارة محجوزة بنفس اليوم أبشر، وإذا تبي نغيّر الموعد قل لي."
          : booking.reason === "day_full" && open.length
            ? `للأسف ذاك اليوم اكتمل عندنا، المتاح: ${open.map((day) => dayLabel(day.date)).join("، ")}. أي يوم يناسبك؟`
            : "وش اليوم والوقت اللي يناسبك بالضبط؟ أرتّب لك الزيارة بإذن الله.";
      }
    }
    const sent = await sendBotText("whatsapp", { tenantId: input.tenantId, conversationId: input.conversationId, recipientId: input.phone, text: outgoing, author: AI_AUTHOR });
    if (sent && "ok" in sent && sent.ok === false) {
      await addNote(input.conversationId, "تعذر إرسال رد الذكاء الاصطناعي (خارج نافذة 24 ساعة أو خطأ في واتساب). المحادثة بانتظارك.");
      await endThread(input.conversationId, "send_failed");
      return true;
    }
    // The customer said which unit type they want: remember it, so the sale takes the right unit from the stock.
    if (parsed.unit && dossier.units.length) {
      const wanted = matchUnit(dossier.units, parsed.unit);
      if (wanted) await setConversationUnit(input.tenantId, input.conversationId, wanted.id, AI_BOOKER).catch(() => undefined);
    }
    if (bookedNote) await addNote(input.conversationId, bookedNote);
    if (parsed.note) await addNote(input.conversationId, `ملاحظة للموظف: ${parsed.note}`);
    await prisma.$executeRaw`UPDATE crm_ai_threads SET replies = replies + 1, updated_at = ${new Date().toISOString()} WHERE conversation_id = ${input.conversationId}`;
    return true;
  } catch (error) {
    console.error("CRM AI reply failed", error);
    return false;
  } finally {
    await prisma.$executeRaw`UPDATE crm_ai_threads SET lock_until = '' WHERE conversation_id = ${input.conversationId}`.catch(() => undefined);
  }
}
