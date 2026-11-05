import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-crm-units.db");

const sent: string[] = [];
vi.mock("../lib/whatsapp-send", () => ({
  isWhatsAppReplyWindowExpired: vi.fn(async () => false),
  sendWhatsAppTextMessage: vi.fn(async (input: { text: string }) => { sent.push(input.text); return { ok: true }; }),
  sendWhatsAppInteractiveMessage: vi.fn(async () => ({ ok: true })),
  sendWhatsAppUploadedMedia: vi.fn(async () => ({ ok: true }))
}));

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "crm-units-test-key-not-production");
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
});

async function seedProject(tenantId: string) {
  const { createProject } = await import("../lib/crm-projects");
  const created = await createProject(tenantId, { name: "الياسمين", details: "فلل وشقق" });
  if (!created.ok) throw new Error(created.error);
  return created.project;
}
async function seedConversation(tenantId: string, id: string, stage = "مؤهل") {
  const { prisma } = await import("../lib/prisma");
  await prisma.customer.create({ data: { id: `c-${id}`, tenantId, name: `عميل ${id}`, phone: `9665${id}`, initial: "ع" } });
  await prisma.conversation.create({ data: { id: `v-${id}`, tenantId, customerId: `c-${id}`, channel: "whatsapp", status: "assigned", assignee: "عزام", lastMessage: "x", pipelineStage: stage } });
  return `v-${id}`;
}

describe("unit stock", () => {
  it("validates and manages unit types of a project", async () => {
    const { createUnit, updateUnit, deleteUnit, listUnits } = await import("../lib/crm-units");
    const project = await seedProject("t-u1");
    expect(await createUnit("t-u1", "no-such-project", { name: "فيلا", total: 5 })).toMatchObject({ ok: false, code: 404 });
    expect(await createUnit("t-u1", project.id, { name: "ف", total: 5 })).toMatchObject({ ok: false });
    expect(await createUnit("t-u1", project.id, { name: "فيلا", total: -1 })).toMatchObject({ ok: false });
    expect(await createUnit("t-u1", project.id, { name: "فيلا", total: 5, available: 9 })).toMatchObject({ ok: false }); // more available than the total

    const villa = await createUnit("t-u1", project.id, { name: "فيلا 4 غرف", area: "320 م²", priceText: "1.4 مليون", total: 40, available: 12 });
    if (!villa.ok) throw new Error(villa.error);
    expect(villa.unit).toMatchObject({ name: "فيلا 4 غرف", total: 40, available: 12, area: "320 م²" });
    expect(await createUnit("t-u1", project.id, { name: "فيلا 4 غرف", total: 1 })).toMatchObject({ ok: false, code: 409 });
    expect((await createUnit("t-u1", project.id, { name: "شقة", total: 10 })).ok).toBe(true); // available defaults to the total

    expect(await updateUnit("t-u1", villa.unit.id, { available: 50 })).toMatchObject({ ok: false });
    expect(await updateUnit("t-u1", villa.unit.id, { available: 7 })).toMatchObject({ ok: true, unit: { available: 7 } });
    expect(await updateUnit("t-u1", villa.unit.id, { total: 5 })).toMatchObject({ ok: true, unit: { total: 5, available: 5 } }); // available follows a lower total
    expect(await listUnits("t-u1", project.id)).toHaveLength(2);
    expect(await listUnits("other", project.id)).toHaveLength(0);
    expect(await deleteUnit("other", villa.unit.id)).toBe(false);
    expect(await deleteUnit("t-u1", villa.unit.id)).toBe(true);
  });

  it("takes one unit when the customer moves to sold, gives it back when they leave, and never twice", async () => {
    const { createUnit, listUnits, setConversationUnit, applyUnitOnStageChange, getConversationUnit } = await import("../lib/crm-units");
    const { getLeadTimeline } = await import("../lib/lead-timeline");
    const project = await seedProject("t-u2");
    const villa = await createUnit("t-u2", project.id, { name: "فيلا", total: 3, available: 2 });
    if (!villa.ok) throw new Error(villa.error);
    const conversationId = await seedConversation("t-u2", "0001");

    expect(await setConversationUnit("t-u2", conversationId, villa.unit.id, "عزام")).toEqual({ ok: true });
    await applyUnitOnStageChange({ tenantId: "t-u2", conversationId, from: "مؤهل", to: "فاز", actor: "عزام" });
    expect((await listUnits("t-u2", project.id))[0].available).toBe(1);
    expect(await getConversationUnit("t-u2", conversationId)).toMatchObject({ name: "فيلا", sold: true });
    // The same change again takes nothing more.
    await applyUnitOnStageChange({ tenantId: "t-u2", conversationId, from: "مؤهل", to: "فاز" });
    expect((await listUnits("t-u2", project.id))[0].available).toBe(1);
    // A sold link cannot be swapped.
    expect(await setConversationUnit("t-u2", conversationId, null)).toMatchObject({ ok: false, code: 409 });

    await applyUnitOnStageChange({ tenantId: "t-u2", conversationId, from: "فاز", to: "مهتم", actor: "عزام" });
    expect((await listUnits("t-u2", project.id))[0].available).toBe(2); // back, never above the total
    expect(await getConversationUnit("t-u2", conversationId)).toMatchObject({ sold: false });

    const texts = (await getLeadTimeline("t-u2", conversationId)).filter((entry) => entry.kind === "unit").map((entry) => entry.text).join("\n");
    expect(texts).toContain("الوحدة المهتم بها: فيلا");
    expect(texts).toContain("بيعت وحدة «فيلا» (المتاح الآن 1)");
    expect(texts).toContain("أُعيدت وحدة «فيلا» إلى المخزون");
  });

  it("says so in the timeline when there is no unit chosen or nothing left, and takes nothing", async () => {
    const { createUnit, listUnits, setConversationUnit, applyUnitOnStageChange } = await import("../lib/crm-units");
    const { getLeadTimeline } = await import("../lib/lead-timeline");
    const project = await seedProject("t-u3");
    const gone = await createUnit("t-u3", project.id, { name: "شقة", total: 4, available: 0 });
    if (!gone.ok) throw new Error(gone.error);

    const none = await seedConversation("t-u3", "0002");
    await applyUnitOnStageChange({ tenantId: "t-u3", conversationId: none, from: "مؤهل", to: "فاز" });
    expect((await getLeadTimeline("t-u3", none)).map((entry) => entry.text).join()).toContain("لم تُحدَّد وحدة");

    const soldOut = await seedConversation("t-u3", "0003");
    await setConversationUnit("t-u3", soldOut, gone.unit.id);
    await applyUnitOnStageChange({ tenantId: "t-u3", conversationId: soldOut, from: "مؤهل", to: "فاز" });
    expect((await listUnits("t-u3", project.id))[0].available).toBe(0);
    expect((await getLeadTimeline("t-u3", soldOut)).map((entry) => entry.text).join()).toContain("لا يوجد متاح من «شقة»");
    // Leaving "sold" must not add a unit that was never taken.
    await applyUnitOnStageChange({ tenantId: "t-u3", conversationId: soldOut, from: "فاز", to: "مهتم" });
    expect((await listUnits("t-u3", project.id))[0].available).toBe(0);
  });

  it("the lead status API moves the stock too", async () => {
    const { createUnit, listUnits, setConversationUnit } = await import("../lib/crm-units");
    const { setLeadStatus } = await import("../lib/tiktok-events");
    const project = await seedProject("t-u4");
    const unit = await createUnit("t-u4", project.id, { name: "فيلا", total: 2 });
    if (!unit.ok) throw new Error(unit.error);
    const conversationId = await seedConversation("t-u4", "0004", "جديد");
    await setConversationUnit("t-u4", conversationId, unit.unit.id);
    await setLeadStatus({ tenantId: "t-u4", conversationId, status: "فاز", actor: "عزام" });
    expect((await listUnits("t-u4", project.id))[0].available).toBe(1);
  });

  it("deleting a project removes its units and links", async () => {
    const { createUnit, listUnits } = await import("../lib/crm-units");
    const { deleteProject } = await import("../lib/crm-projects");
    const project = await seedProject("t-u5");
    await createUnit("t-u5", project.id, { name: "فيلا", total: 2 });
    expect(await deleteProject("t-u5", project.id)).toBe(true);
    expect(await listUnits("t-u5")).toHaveLength(0);
  });
});

describe("the AI and the stock", () => {
  async function setup(tenantId: string, modelAnswer: string) {
    const { prisma } = await import("../lib/prisma");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { saveCrmAiSettings, startCrmAiThread } = await import("../lib/crm-ai");
    const { createUnit } = await import("../lib/crm-units");
    const now = new Date().toISOString();
    await prisma.aiWorkspaceSetting.create({ data: { tenantId, provider: "openai", model: "gpt-test", enabled: 1, apiKey: encryptSecret("sk-test"), dailyLimit: 100, monthlyLimit: 1000, updatedAt: now } });
    const project = await seedProject(tenantId);
    const villa = await createUnit(tenantId, project.id, { name: "فيلا بغرفتين", total: 10, available: 3 });
    await createUnit(tenantId, project.id, { name: "شقة 3 غرف", total: 20, available: 0 });
    if (!villa.ok) throw new Error(villa.error);
    const conversationId = await seedConversation(tenantId, "0009");
    await saveCrmAiSettings(tenantId, true);
    await startCrmAiThread(tenantId, conversationId, "عزام");
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: modelAnswer } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })));
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, conversationId, villa: villa.unit };
  }

  it("is given the real stock, answers from it, and remembers the unit type the customer wants", async () => {
    const tenantId = "t-u6";
    const { fetchMock, conversationId, villa } = await setup(tenantId, "هلا والله، باقي عندنا 3 فلل بغرفتين\nUNIT: فيلا بغرفتين");
    const { prisma } = await import("../lib/prisma");
    await prisma.message.create({ data: { id: "m-ask", conversationId, direction: "in", text: "هل بقي فيلا بغرفتين في الياسمين؟", time: "x", createdAt: new Date().toISOString(), author: "" } });
    const { runChannelBot } = await import("../lib/bot-engine");
    await runChannelBot("whatsapp", { tenantId, conversationId, recipientId: "96659999", incomingText: "هل بقي فيلا بغرفتين في الياسمين؟" });

    const system = JSON.parse(fetchMock.mock.calls[0][1]?.body as string).messages[0].content as string;
    expect(system).toContain("فيلا بغرفتين: 3 available of 10");
    expect(system).toContain("شقة 3 غرف: sold out");
    expect(sent).toEqual(["هلا والله، باقي عندنا 3 فلل بغرفتين"]); // the UNIT line never reaches the customer
    const { getConversationUnit } = await import("../lib/crm-units");
    expect(await getConversationUnit(tenantId, conversationId)).toMatchObject({ unitId: villa.id, sold: false });
  });
});
