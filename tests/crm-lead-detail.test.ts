import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-crm-lead-detail.db");
const tenantId = "t-detail";

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
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

async function seed(id: string, firstMessageAt: string) {
  const { prisma } = await import("../lib/prisma");
  await prisma.customer.create({ data: { id: `cust-${id}`, tenantId, name: `عميل ${id}`, phone: `9665000${id}`, initial: "ع" } });
  await prisma.conversation.create({ data: { id: `conv-${id}`, tenantId, customerId: `cust-${id}`, channel: "whatsapp", status: "assigned", assignee: "عزام", lastMessage: "x", lastActivityAt: firstMessageAt } });
  await prisma.message.create({ data: { id: `m-${id}`, conversationId: `conv-${id}`, direction: "in", text: "أبي أستفسر", time: "10:00", createdAt: firstMessageAt, author: "" } });
}

describe("lead timeline", () => {
  it("records stage changes and visit changes, merges notes and assignment lines, newest first", async () => {
    await seed("0001", "2026-11-01T08:00:00.000Z");
    const { prisma } = await import("../lib/prisma");
    const { recordLeadEvent, getLeadTimeline } = await import("../lib/lead-timeline");
    await recordLeadEvent({ tenantId, conversationId: "conv-0001", kind: "stage", from: "جديد", to: "مهتم", actor: "عزام", at: "2026-11-01T09:00:00.000Z" });
    await recordLeadEvent({ tenantId, conversationId: "conv-0001", kind: "stage", from: "مهتم", to: "مؤهل", actor: "عزام", at: "2026-11-01T10:00:00.000Z" });
    await recordLeadEvent({ tenantId: "other", conversationId: "conv-0001", kind: "stage", from: "x", to: "y", at: "2026-11-01T11:00:00.000Z" }); // another workspace's event never shows
    await prisma.message.create({ data: { id: "n1", conversationId: "conv-0001", direction: "note", text: "العميل مهتم بالفلل", time: "x", createdAt: "2026-11-01T09:30:00.000Z", author: "عزام", sourceType: "" } });
    await prisma.message.create({ data: { id: "n2", conversationId: "conv-0001", direction: "note", text: "تم إسناد هذه المحادثة إلى عزام", time: "x", createdAt: "2026-11-01T08:30:00.000Z", author: "", sourceType: "system_assignment" } });
    await prisma.message.create({ data: { id: "n3", conversationId: "conv-0001", direction: "note", text: "ملاحظة للموظف: يبي زيارة", time: "x", createdAt: "2026-11-01T09:45:00.000Z", author: "", sourceType: "crm_ai_note" } });

    const timeline = await getLeadTimeline(tenantId, "conv-0001");
    expect(timeline.map((entry) => [entry.kind, entry.to ?? entry.text])).toEqual([
      ["stage", "مؤهل"],
      ["ai", "ملاحظة للموظف: يبي زيارة"],
      ["note", "العميل مهتم بالفلل"],
      ["stage", "مهتم"],
      ["assign", "تم إسناد هذه المحادثة إلى عزام"]
    ]);
    expect(timeline[0]).toMatchObject({ from: "مهتم", to: "مؤهل", actor: "عزام" });
  });

  it("visits booked, changed and deleted land on the lead's timeline", async () => {
    await seed("0002", "2026-11-01T08:00:00.000Z");
    const { bookVisit, updateVisitStatus, deleteVisit } = await import("../lib/crm-visits");
    const { getLeadTimeline } = await import("../lib/lead-timeline");
    const booked = await bookVisit({ tenantId, date: "2099-01-05", time: "17:00", customerName: "عميل", customerPhone: "96650000002", conversationId: "conv-0002", projectName: "الياسمين", bookedBy: "الذكاء الاصطناعي" });
    if (!booked.ok) throw new Error(booked.message);
    await updateVisitStatus(tenantId, booked.visit.id, "تم الحضور", "عزام");
    await deleteVisit(tenantId, booked.visit.id, "عزام");
    const texts = (await getLeadTimeline(tenantId, "conv-0002")).filter((entry) => entry.kind === "visit").map((entry) => entry.text);
    expect(texts).toHaveLength(3);
    expect(texts.join("\n")).toContain("حجز زيارة يوم 2099-01-05 الساعة 17:00 (الياسمين)");
    expect(texts.join("\n")).toContain("محجوز ← تم الحضور");
    expect(texts.join("\n")).toContain("حذف الزيارة");
  });

  it("stage changes through the lead status API are recorded", async () => {
    await seed("0003", "2026-11-01T08:00:00.000Z");
    const { setLeadStatus } = await import("../lib/tiktok-events");
    const { getLeadTimeline } = await import("../lib/lead-timeline");
    await setLeadStatus({ tenantId, conversationId: "conv-0003", status: "مهتم", actor: "عزام" });
    await setLeadStatus({ tenantId, conversationId: "conv-0003", status: "مهتم", actor: "عزام" }); // no change, no second line
    const stages = (await getLeadTimeline(tenantId, "conv-0003")).filter((entry) => entry.kind === "stage");
    expect(stages).toHaveLength(1);
    expect(stages[0]).toMatchObject({ from: "جديد", to: "مهتم", actor: "عزام" });
  });
});

describe("lead detail", () => {
  it("collects the customer, project, answers, visits and interactions", async () => {
    await seed("0004", "2026-11-02T08:00:00.000Z");
    const { prisma } = await import("../lib/prisma");
    const { createProject } = await import("../lib/crm-projects");
    const { bookVisit } = await import("../lib/crm-visits");
    const { getLeadDetail } = await import("../lib/crm-lead-detail");
    await createProject(tenantId, { name: "الياسمين", details: "فلل" });
    await prisma.lead.create({ data: { id: "lead-4", tenantId, customerId: "cust-0004", conversationId: "conv-0004", source: "api", formName: "مشروع الياسمين", email: "a@b.test", answersJson: JSON.stringify([{ question: "الميزانية", answer: "1,500,000" }]), createdAt: "2026-11-02T08:00:00.000Z" } });
    await prisma.message.create({ data: { id: "m-out-4", conversationId: "conv-0004", direction: "out", text: "هلا فيك", time: "x", createdAt: "2026-11-02T08:05:00.000Z", author: "عزام" } });
    await bookVisit({ tenantId, date: "2099-02-01", time: "10:00", customerName: "عميل", customerPhone: "96650000004", conversationId: "conv-0004", projectName: "الياسمين", bookedBy: "عزام" });

    const detail = await getLeadDetail(tenantId, "conv-0004");
    expect(detail).toMatchObject({
      customer: { name: "عميل 0004", phone: "96650000004", email: "a@b.test" },
      stage: "جديد", assignee: "عزام", project: "الياسمين", firstContactAt: "2026-11-02T08:00:00.000Z",
      answers: [{ question: "الميزانية", answer: "1,500,000" }],
      upcomingVisit: { date: "2099-02-01", time: "10:00" },
      interactions: { incoming: 1, outgoing: 1 }
    });
    expect(detail?.visits).toHaveLength(1);
    expect(await getLeadDetail("other-tenant", "conv-0004")).toBeNull();
  });
});

describe("daily stats", () => {
  it("counts arrivals, bookings, scheduled and attended visits per Riyadh day", async () => {
    const stats = await import("../lib/crm-stats");
    const { prisma } = await import("../lib/prisma");
    const t = "t-stats";
    const now = new Date("2026-11-10T09:00:00Z"); // Riyadh 12:00 on the 10th
    const customer = (id: string) => prisma.customer.create({ data: { id: `c-${id}`, tenantId: t, name: id, phone: `9665111${id}`, initial: "ع" } });
    const conversation = async (id: string, at: string) => {
      await customer(id);
      await prisma.conversation.create({ data: { id: `v-${id}`, tenantId: t, customerId: `c-${id}`, channel: "whatsapp", status: "assigned", assignee: "x", lastMessage: "x", pipelineStage: id === "0003" ? "مؤهل" : "جديد" } });
      await prisma.message.create({ data: { id: `msg-${id}`, conversationId: `v-${id}`, direction: "in", text: "hi", time: "x", createdAt: at, author: "" } });
    };
    // 21:30 UTC on the 9th is already the 10th in Riyadh (UTC+3).
    await conversation("0001", "2026-11-10T06:00:00.000Z");
    await conversation("0002", "2026-11-09T21:30:00.000Z");
    await conversation("0003", "2026-11-08T10:00:00.000Z");
    await conversation("0004", "2026-10-01T10:00:00.000Z"); // before the range

    const { bookVisit, updateVisitStatus } = await import("../lib/crm-visits");
    const a = await bookVisit({ tenantId: t, date: "2026-11-12", time: "10:00", customerName: "a", customerPhone: "96651110001", bookedBy: "x", now });
    const b = await bookVisit({ tenantId: t, date: "2026-11-12", time: "11:00", customerName: "b", customerPhone: "96651110002", bookedBy: "x", now });
    if (!a.ok || !b.ok) throw new Error("booking failed");
    await updateVisitStatus(t, a.visit.id, "تم الحضور");
    await updateVisitStatus(t, b.visit.id, "ملغي");

    const result = await stats.getCrmStats(t, 5, now);
    expect(result.days.map((day) => day.date)).toEqual(["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]);
    const byDate = Object.fromEntries(result.days.map((day) => [day.date, day]));
    expect(byDate["2026-11-10"].newCustomers).toBe(2); // 0001 and 0002 (Riyadh time)
    expect(byDate["2026-11-08"].newCustomers).toBe(1);
    expect(byDate["2026-11-10"].visitsBooked).toBe(2); // both were booked "today"
    expect(result.totals.newCustomers).toBe(3);
    expect(result.stages.find((row) => row.stage === "مؤهل")?.count).toBe(1);
    expect(result.stages.find((row) => row.stage === "جديد")?.count).toBe(3);
    // Scheduled / attended are for the visit day, which is after this range - check with a wider one.
    const wide = await stats.getCrmStats(t, 5, new Date("2026-11-13T09:00:00Z"));
    const visitDay = wide.days.find((day) => day.date === "2026-11-12");
    expect(visitDay).toMatchObject({ visitsScheduled: 1, attended: 1 }); // the cancelled one does not count
  });
});
