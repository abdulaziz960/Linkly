import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-crm-ai.db");

const sent: string[] = [];
const authors: string[] = [];
vi.mock("../lib/whatsapp-send", () => ({
  isWhatsAppReplyWindowExpired: vi.fn(async () => false),
  sendWhatsAppTextMessage: vi.fn(async (input: { text: string; author?: string }) => { sent.push(input.text); authors.push(input.author ?? ""); return { ok: true }; }),
  sendWhatsAppInteractiveMessage: vi.fn(async () => ({ ok: true })),
  sendWhatsAppUploadedMedia: vi.fn(async () => ({ ok: true }))
}));

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "crm-ai-test-key-not-production");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  sent.length = 0;
  authors.length = 0;
});

/** A workspace with its own AI key (the model's answer is whatever the test needs), a project, a lead and an assigned chat. */
async function setup(tenantId: string, modelAnswer: string, options: { enableAi?: boolean } = {}) {
  const { prisma } = await import("../lib/prisma");
  const { encryptSecret } = await import("../lib/secret-storage");
  const { saveCrmAiSettings, startCrmAiThread } = await import("../lib/crm-ai");
  const now = new Date().toISOString();
  await prisma.aiWorkspaceSetting.create({ data: { tenantId, provider: "openai", model: "gpt-test", enabled: 1, apiKey: encryptSecret("sk-test"), dailyLimit: 100, monthlyLimit: 1000, updatedAt: now } });
  await prisma.subscription.create({ data: { id: `sub-${tenantId}`, tenantId, companyName: "شركة الياسمين", ownerName: "م", ownerEmail: `${tenantId}@x.test`, createdAt: now, updatedAt: now } });
  await prisma.product.create({ data: { id: `p-${tenantId}`, tenantId, name: "مشروع الياسمين", description: "فلل سكنية من 4 غرف مع حديقة خاصة في حي الياسمين", price: 1450000, category: "فلل", createdAt: now, updatedAt: now } });
  await prisma.customer.create({ data: { id: `cust-${tenantId}`, tenantId, name: "فهد", phone: "966501112233", initial: "ف" } });
  await prisma.conversation.create({ data: { id: `conv-${tenantId}`, tenantId, customerId: `cust-${tenantId}`, channel: "whatsapp", status: "assigned", assignee: "عزام", lastMessage: "x" } });
  await prisma.lead.create({ data: { id: `lead-${tenantId}`, tenantId, customerId: `cust-${tenantId}`, conversationId: `conv-${tenantId}`, source: "api", formName: "مشروع الياسمين", answersJson: JSON.stringify([{ question: "الميزانية", answer: "1,500,000" }]), createdAt: now } });
  if (options.enableAi !== false) await saveCrmAiSettings(tenantId, true);
  await startCrmAiThread(tenantId, `conv-${tenantId}`, "عزام");
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: modelAnswer } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })));
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, conversationId: `conv-${tenantId}` };
}

async function customerSays(tenantId: string, conversationId: string, text: string) {
  const { prisma } = await import("../lib/prisma");
  await prisma.message.create({ data: { id: `m-${Math.random().toString(36).slice(2)}`, conversationId, direction: "in", text, time: "10:00", createdAt: new Date().toISOString(), author: "" } });
  const { runChannelBot } = await import("../lib/bot-engine");
  await runChannelBot("whatsapp", { tenantId, conversationId, recipientId: "966501112233", incomingText: text });
}

describe("parseSalesReply", () => {
  it("separates the customer text, the employee note and a handoff", async () => {
    const { parseSalesReply } = await import("../lib/crm-ai");
    expect(parseSalesReply("أبشر، متى يناسبك؟\nNOTE: العميل يبي زيارة")).toEqual({ text: "أبشر، متى يناسبك؟", note: "العميل يبي زيارة", handoff: null, book: null, unit: null });
    expect(parseSalesReply("أبشر، حجزتها لك\nBOOK: 2026-11-12 17:00")).toEqual({ text: "أبشر، حجزتها لك", note: "", handoff: null, book: { date: "2026-11-12", time: "17:00" }, unit: null });
    expect(parseSalesReply("تمام\nBOOK: 2026-13-45 99:99").book).toBeNull(); // an impossible date or time is not a booking
    expect(parseSalesReply("HANDOFF: يطلب موظف")).toEqual({ text: "", note: "", handoff: "يطلب موظف", book: null, unit: null });
    expect(parseSalesReply("NO_ANSWER")).toMatchObject({ text: "", handoff: expect.any(String) });
  });
});

describe("AI continuing a CRM lead's chat as the assigned employee", () => {
  it("answers in a sales tone from the project's facts and leaves the employee a note", async () => {
    const tenantId = "t-crm-ai-1";
    const { fetchMock, conversationId } = await setup(tenantId, "هلا والله فهد، أبشر تشرفنا بزيارتك، أي يوم يناسبك؟\nNOTE: العميل يبي يزور المشروع");
    await customerSays(tenantId, conversationId, "أبي أزور المشروع");

    expect(sent).toEqual(["هلا والله فهد، أبشر تشرفنا بزيارتك، أي يوم يناسبك؟"]);
    const system = JSON.parse(fetchMock.mock.calls[0][1]?.body as string).messages[0].content as string;
    expect(system).toContain("عزام");
    expect(system).toContain("شركة الياسمين");
    expect(system).toContain("Saudi");
    expect(system).toContain("مشروع الياسمين");
    expect(system).toContain("1450000");
    expect(system).toContain("فلل سكنية من 4 غرف");

    const { prisma } = await import("../lib/prisma");
    const notes = await prisma.message.findMany({ where: { conversationId, sourceType: "crm_ai_note" } });
    expect(notes.map((note) => note.text).join()).toContain("العميل يبي يزور المشروع");
    // The reply is authored by the auto-reply (not a person), and the NOTE line never reached the customer.
    expect(authors).toEqual(["الرد الآلي"]);
    expect(sent.join()).not.toContain("NOTE");
  });

  it("stays out for good once an employee replies", async () => {
    const tenantId = "t-crm-ai-2";
    const { fetchMock, conversationId } = await setup(tenantId, "رد");
    const { prisma } = await import("../lib/prisma");
    await prisma.message.create({ data: { id: "m-human", conversationId, direction: "out", text: "هلا فهد، معك عزام", time: "10:01", createdAt: new Date().toISOString(), author: "عزام" } });
    await customerSays(tenantId, conversationId, "كم السعر؟");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
    const { handleCrmAiReply } = await import("../lib/crm-ai");
    expect(await handleCrmAiReply({ tenantId, conversationId, phone: "966501112233" })).toBe(false);
  });

  it("hands over with a human line and a note when the customer asks for a person", async () => {
    const tenantId = "t-crm-ai-3";
    const { conversationId } = await setup(tenantId, "HANDOFF: العميل يسأل هل أنت روبوت");
    await customerSays(tenantId, conversationId, "هل أنت روبوت؟");

    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain("HANDOFF");
    const { prisma } = await import("../lib/prisma");
    const notes = await prisma.message.findMany({ where: { conversationId, sourceType: "crm_ai_note" } });
    expect(notes[0]?.text).toContain("العميل يسأل هل أنت روبوت");
    // Later messages are not answered by the AI any more.
    await customerSays(tenantId, conversationId, "طيب");
    expect(sent).toHaveLength(1);
  });

  it("the fixed hand-over line follows the workspace's chosen tone", async () => {
    const tenantId = "t-crm-ai-tone";
    const { conversationId } = await setup(tenantId, "HANDOFF: يطلب موظفًا");
    const { saveAiTone } = await import("../lib/ai-tone");
    await saveAiTone(tenantId, "formal");
    await customerSays(tenantId, conversationId, "ابي موظف");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/إليكم|معكم|عليكم/);
    expect(sent[0]).not.toMatch(/أبشر|خلني|الحين/);
  });

  it("does nothing when the workspace did not turn it on", async () => {
    const tenantId = "t-crm-ai-4";
    const { fetchMock, conversationId } = await setup(tenantId, "رد", { enableAi: false });
    await customerSays(tenantId, conversationId, "السلام عليكم");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("marks the bot flow as already run so it never greets over the employee", async () => {
    const tenantId = "t-crm-ai-5";
    const { conversationId } = await setup(tenantId, "رد");
    const { prisma } = await import("../lib/prisma");
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).botRanAt).not.toBe("");
  });

  it("reads the profile of the project the customer asks about, not another one's", async () => {
    const tenantId = "t-crm-ai-6";
    const { fetchMock, conversationId } = await setup(tenantId, "هلا فهد، الياسمين فيه فلل 4 غرف");
    const { createProject } = await import("../lib/crm-projects");
    await createProject(tenantId, { name: "الياسمين", aliases: "فلل الياسمين", details: "فلل 4 غرف بمساحة 320 متر، تسليم 2027، الدفع على 5 سنوات", location: "شمال الرياض" });
    await createProject(tenantId, { name: "النخيل", details: "شقق تمليك صغيرة بدون حديقة" });
    await customerSays(tenantId, conversationId, "وش تفاصيل مشروع الياسمين؟");

    const system = JSON.parse(fetchMock.mock.calls[0][1]?.body as string).messages[0].content as string;
    expect(system).toContain("فلل 4 غرف بمساحة 320 متر");
    expect(system).toContain("شمال الرياض");
    expect(system).not.toContain("شقق تمليك صغيرة");
    expect(sent).toHaveLength(1);
  });

  it("asks which project when the customer has not said and there are several profiles", async () => {
    const tenantId = "t-crm-ai-7";
    const { fetchMock, conversationId } = await setup(tenantId, "أي مشروع تقصد؟");
    const { prisma } = await import("../lib/prisma");
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    const { createProject } = await import("../lib/crm-projects");
    await createProject(tenantId, { name: "الياسمين", details: "فلل" });
    await createProject(tenantId, { name: "النخيل", details: "شقق" });
    await customerSays(tenantId, conversationId, "كم السعر؟");
    const system = JSON.parse(fetchMock.mock.calls[0][1]?.body as string).messages[0].content as string;
    expect(system).toContain("Ask which one they mean");
    expect(system).toContain("الياسمين");
    expect(system).toContain("النخيل");
  });

  it("books the visit in the schedule when the customer agrees a day and time - and only then confirms", async () => {
    const tenantId = "t-crm-ai-8";
    const { todayInRiyadh } = await import("../lib/crm-visits");
    const day = new Date(new Date(`${todayInRiyadh()}T00:00:00Z`).getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
    const { fetchMock, conversationId } = await setup(tenantId, `أبشر فهد، حجزت لك زيارة الساعة 5 العصر، تشرفنا\nBOOK: ${day} 17:00`);
    await customerSays(tenantId, conversationId, "تمام أبي أزور بعد 3 أيام الساعة 5");

    expect(sent).toEqual(["أبشر فهد، حجزت لك زيارة الساعة 5 العصر، تشرفنا"]);
    const { listVisits } = await import("../lib/crm-visits");
    const visits = await listVisits(tenantId);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ date: day, time: "17:00", bookedBy: "الذكاء الاصطناعي", employee: "عزام", conversationId, customerPhone: "966501112233", status: "محجوز" });
    // The AI was shown today and the days with room.
    const system = JSON.parse(fetchMock.mock.calls[0][1]?.body as string).messages[0].content as string;
    expect(system).toContain("Days with room");
    expect(system).toContain(day);
    const { prisma } = await import("../lib/prisma");
    const notes = await prisma.message.findMany({ where: { conversationId, sourceType: "crm_ai_note" } });
    expect(notes.map((note) => note.text).join()).toContain("حجز الذكاء الاصطناعي زيارة");
  });

  it("never confirms a visit that could not be saved: a full day gets the open days instead", async () => {
    const tenantId = "t-crm-ai-9";
    const { todayInRiyadh, saveVisitSettings, bookVisit, listVisits } = await import("../lib/crm-visits");
    const day = new Date(new Date(`${todayInRiyadh()}T00:00:00Z`).getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
    const { conversationId } = await setup(tenantId, `تمام فهد، حجزتها لك\nBOOK: ${day} 17:00`);
    await saveVisitSettings(tenantId, 1);
    // An employee already took the only place of that day (a human booking counts too).
    expect(await bookVisit({ tenantId, date: day, time: "10:00", customerName: "سعد", customerPhone: "966509998877", bookedBy: "عزام" })).toMatchObject({ ok: true });
    await customerSays(tenantId, conversationId, "أبي يوم " + day + " الساعة 5");

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("اكتمل");
    expect(sent[0]).not.toContain("حجزتها لك");
    expect(await listVisits(tenantId)).toHaveLength(1); // only the employee's
  });

  it("a booking for a past time is refused and the customer is asked again", async () => {
    const tenantId = "t-crm-ai-10";
    const { conversationId } = await setup(tenantId, "تمام، حجزتها لك\nBOOK: 2020-01-01 10:00");
    await customerSays(tenantId, conversationId, "أبي أزور أمس");
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain("حجزتها");
    const { listVisits } = await import("../lib/crm-visits");
    expect(await listVisits(tenantId)).toHaveLength(0);
  });
});

describe("AI on platform form leads and general inquiries (no CRM employee)", () => {
  async function bare(tenantId: string, flags: { platformLeads?: boolean; inquiries?: boolean }, options: { withKey?: boolean } = {}) {
    const { prisma } = await import("../lib/prisma");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { saveCrmAiSettings, saveCrmAiFlag } = await import("../lib/crm-ai");
    const now = new Date().toISOString();
    if (options.withKey !== false) await prisma.aiWorkspaceSetting.create({ data: { tenantId, provider: "openai", model: "gpt-test", enabled: 1, apiKey: encryptSecret("sk-test"), dailyLimit: 100, monthlyLimit: 1000, updatedAt: now } });
    await prisma.subscription.create({ data: { id: `sub-${tenantId}`, tenantId, companyName: "شركة الياسمين", ownerName: "م", ownerEmail: `${tenantId}@x.test`, createdAt: now, updatedAt: now } });
    await prisma.product.create({ data: { id: `p-${tenantId}`, tenantId, name: "مشروع الياسمين", description: "فلل سكنية من 4 غرف مع حديقة خاصة", price: 1450000, category: "فلل", createdAt: now, updatedAt: now } });
    await prisma.customer.create({ data: { id: `cust-${tenantId}`, tenantId, name: "سارة", phone: "966504445566", initial: "س" } });
    await prisma.conversation.create({ data: { id: `conv-${tenantId}`, tenantId, customerId: `cust-${tenantId}`, channel: "whatsapp", status: "unassigned", assignee: "بدون موظف", lastMessage: "x" } });
    await saveCrmAiSettings(tenantId, true);
    if (flags.platformLeads) await saveCrmAiFlag(tenantId, "platform_leads", true);
    if (flags.inquiries) await saveCrmAiFlag(tenantId, "inquiries", true);
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: "هلا والله سارة، أبشر، أي مشروع يهمك؟" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }))));
    return `conv-${tenantId}`;
  }

  it("a platform lead starts the AI only when that option is on", async () => {
    const { startPlatformLeadAi } = await import("../lib/crm-ai");
    const off = await bare("t-plat-off", {});
    expect(await startPlatformLeadAi("t-plat-off", off)).toBe(false);
    const on = await bare("t-plat-on", { platformLeads: true });
    expect(await startPlatformLeadAi("t-plat-on", on)).toBe(true);
    await customerSays("t-plat-on", on, "وش أسعار الفلل؟");
    expect(sent).toEqual(["هلا والله سارة، أبشر، أي مشروع يهمك؟"]);
    expect(authors).toEqual(["الرد الآلي"]);
  });

  it("a first general inquiry is answered when that option is on, and not otherwise", async () => {
    const off = await bare("t-inq-off", {});
    await customerSays("t-inq-off", off, "السلام عليكم عندكم مشاريع؟");
    expect(sent).toEqual([]);

    const on = await bare("t-inq-on", { inquiries: true });
    await customerSays("t-inq-on", on, "السلام عليكم عندكم مشاريع؟");
    expect(sent).toEqual(["هلا والله سارة، أبشر، أي مشروع يهمك؟"]);
  });

  it("never takes over a chat the bot already ran on, and stays silent without the workspace's own AI key", async () => {
    const { startInquiryAi } = await import("../lib/crm-ai");
    const { prisma } = await import("../lib/prisma");
    const existing = await bare("t-inq-old", { inquiries: true });
    await prisma.conversation.update({ where: { id: existing }, data: { botRanAt: new Date().toISOString() } });
    expect(await startInquiryAi("t-inq-old", existing)).toBe(false);

    const noKey = await bare("t-inq-nokey", { inquiries: true }, { withKey: false });
    expect(await startInquiryAi("t-inq-nokey", noKey)).toBe(false);
  });

  it("answers again when the customer comes back to a conversation that was closed, as a fresh chat", async () => {
    const { prisma } = await import("../lib/prisma");
    const { restartBotFlowIfClosed } = await import("../lib/conversation-lifecycle");
    const id = await bare("t-inq-back", { inquiries: true });
    await prisma.conversation.update({ where: { id }, data: { status: "closed" } });
    await customerSays("t-inq-back", id, "السلام عليكم عندكم مشاريع؟");
    expect(sent).toHaveLength(1);

    // A person took over, answered, and closed the chat; weeks later the customer writes again.
    await prisma.message.create({ data: { id: "m-human-1", conversationId: id, direction: "out", text: "أهلاً أنا نورة", time: "10:00", createdAt: new Date().toISOString(), author: "نورة" } });
    await prisma.$executeRaw`UPDATE crm_ai_threads SET active = 0, ended_reason = 'human_joined' WHERE conversation_id = ${id}`;
    await prisma.conversation.update({ where: { id }, data: { status: "closed" } });
    await prisma.$transaction((tx) => restartBotFlowIfClosed(tx, id));
    sent.length = 0;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await customerSays("t-inq-back", id, "السلام عليكم من جديد");
    expect(sent).toHaveLength(1);

    // And a person who answers in this new round still stops it.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prisma.message.create({ data: { id: "m-human-2", conversationId: id, direction: "out", text: "معك نورة", time: "10:05", createdAt: new Date().toISOString(), author: "نورة" } });
    sent.length = 0;
    await customerSays("t-inq-back", id, "ابي أعرف السعر");
    expect(sent).toEqual([]);
  });

  it("does not restart on a conversation that is still open with a person", async () => {
    const { prisma } = await import("../lib/prisma");
    const id = await bare("t-inq-open", { inquiries: true });
    await customerSays("t-inq-open", id, "السلام عليكم");
    await prisma.$executeRaw`UPDATE crm_ai_threads SET active = 0, ended_reason = 'handoff' WHERE conversation_id = ${id}`;
    await prisma.conversation.update({ where: { id }, data: { status: "assigned", botRanAt: "" } });
    sent.length = 0;
    await customerSays("t-inq-open", id, "طيب والسعر؟");
    expect(sent).toEqual([]);
  });
});
