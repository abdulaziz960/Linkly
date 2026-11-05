import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-crm-visit-reminders.db");

const texts: Array<{ to: string; text: string }> = [];
const templates: Array<{ to: string; name: string; values: string[] }> = [];
let windowOpen = true;
vi.mock("../lib/whatsapp-send", () => ({
  isWhatsAppReplyWindowExpired: vi.fn(async () => !windowOpen),
  sendWhatsAppTextMessage: vi.fn(async (input: { to: string; text: string }) => { texts.push({ to: input.to, text: input.text }); return { ok: true }; }),
  sendWhatsAppInteractiveMessage: vi.fn(async () => ({ ok: true })),
  sendWhatsAppUploadedMedia: vi.fn(async () => ({ ok: true }))
}));
vi.mock("../lib/campaign-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/campaign-engine")>()),
  sendWhatsAppTemplate: vi.fn(async (_tenant: string, to: string, name: string, _lang: string, _n: string, _c: string, _h: boolean, _t: string, values: string[]) => { templates.push({ to, name, values }); return { ok: true as const }; })
}));
const pushes: Array<{ ids: string[]; body: string }> = [];
vi.mock("../lib/push-notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/push-notifications")>()),
  notifyUsers: vi.fn(async (ids: string[], payload: { body: string }) => { pushes.push({ ids, body: payload.body }); })
}));

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

afterEach(() => {
  texts.length = 0;
  templates.length = 0;
  pushes.length = 0;
  windowOpen = true;
});

// Riyadh 2026-11-10 09:00 (UTC 06:00).
const NOW = new Date("2026-11-10T06:00:00Z");

async function seed(tenantId: string, visit: { date: string; time: string; phone?: string; conversation?: boolean; employee?: string }) {
  const { prisma } = await import("../lib/prisma");
  const { bookVisit } = await import("../lib/crm-visits");
  const phone = visit.phone ?? "966501112233";
  let conversationId = "";
  if (visit.conversation !== false) {
    conversationId = `conv-${tenantId}-${phone}`;
    await prisma.customer.create({ data: { id: `cust-${tenantId}-${phone}`, tenantId, name: "فهد", phone, initial: "ف" } });
    await prisma.conversation.create({ data: { id: conversationId, tenantId, customerId: `cust-${tenantId}-${phone}`, channel: "whatsapp", status: "assigned", assignee: "عزام", lastMessage: "x" } });
  }
  const booked = await bookVisit({ tenantId, date: visit.date, time: visit.time, customerName: "فهد", customerPhone: phone, conversationId, projectName: "الياسمين", bookedBy: "عزام", employee: visit.employee ?? "عزام", now: new Date("2026-11-01T06:00:00Z") });
  if (!booked.ok) throw new Error(booked.message);
  return { id: booked.visit.id, conversationId };
}

describe("visit reminder settings", () => {
  it("validates the timing and the template", async () => {
    const { saveReminderSettings, getReminderSettings } = await import("../lib/crm-visit-reminders");
    const { prisma } = await import("../lib/prisma");
    expect(await saveReminderSettings("t-r0", { hoursBefore: 5 })).toMatchObject({ ok: false });
    expect(await saveReminderSettings("t-r0", { templateName: "ghost" })).toMatchObject({ ok: false });
    await prisma.template.create({ data: { id: "tpl-r0", tenantId: "t-r0", name: "visit_reminder", category: "UTILITY", language: "ar", status: "معتمد", message: "{{1}}", type: "نص", lastUsed: "", headerType: "NONE" } });
    const saved = await saveReminderSettings("t-r0", { enabled: true, hoursBefore: 24 });
    expect(saved).toMatchObject({ ok: true, settings: { enabled: true, hoursBefore: 24, notifyEmployee: true } });
    expect((await getReminderSettings("t-r0")).enabled).toBe(true);
    expect((await getReminderSettings("t-other")).enabled).toBe(false);
  });
});

describe("sending the reminders", () => {
  it("reminds a visit inside the window once, in plain text, and pushes the employee", async () => {
    const { saveReminderSettings, sendVisitReminders } = await import("../lib/crm-visit-reminders");
    const { prisma } = await import("../lib/prisma");
    const tenantId = "t-r1";
    await prisma.employee.create({ data: { id: "emp-r1", tenantId, name: "عزام", email: "a@r1.test", role: "موظف", status: "متصل", permissions: "[]", initial: "ع", userId: "user-r1" } });
    await seed(tenantId, { date: "2026-11-11", time: "10:00" }); // 25h away: not yet with 24h
    await seed(tenantId, { date: "2026-11-10", time: "20:00", phone: "966502223344" }); // 11h away
    await saveReminderSettings(tenantId, { enabled: true, hoursBefore: 24 });

    expect(await sendVisitReminders(NOW)).toEqual({ sent: 1, failed: 0 });
    expect(texts).toHaveLength(1);
    expect(texts[0].to).toBe("966502223344");
    expect(texts[0].text).toContain("فهد");
    expect(texts[0].text).toContain("اليوم");
    expect(texts[0].text).toContain("20:00");
    expect(texts[0].text).toContain("لمشروع الياسمين");
    expect(pushes).toEqual([{ ids: ["user-r1"], body: expect.stringContaining("20:00") }]);

    // Once only, even if the cron ticks again.
    expect(await sendVisitReminders(new Date(NOW.getTime() + 60_000))).toEqual({ sent: 0, failed: 0 });
    // The 25-hour one is reminded when it comes inside the window.
    expect(await sendVisitReminders(new Date(NOW.getTime() + 2 * 3_600_000))).toEqual({ sent: 1, failed: 0 });
    expect(texts).toHaveLength(2);
    expect(texts[1].to).toBe("966501112233");
  });

  it("uses the approved template when the chat window is closed, and gives up after 3 failed tries", async () => {
    const { saveReminderSettings, sendVisitReminders } = await import("../lib/crm-visit-reminders");
    const { prisma } = await import("../lib/prisma");
    const tenantId = "t-r2";
    await prisma.template.create({ data: { id: "tpl-r2", tenantId, name: "visit_reminder", category: "UTILITY", language: "ar", status: "معتمد", message: "{{1}} {{2}} {{3}} {{4}}", type: "نص", lastUsed: "", headerType: "NONE" } });
    await seed(tenantId, { date: "2026-11-10", time: "15:00" });
    await saveReminderSettings(tenantId, { enabled: true, hoursBefore: 24, templateName: "visit_reminder" });

    windowOpen = false; // the customer has not written for over 24 hours
    expect(await sendVisitReminders(NOW)).toEqual({ sent: 1, failed: 0 });
    expect(texts).toHaveLength(0);
    expect(templates).toEqual([{ to: "966501112233", name: "visit_reminder", values: ["فهد", "اليوم", "15:00", "الياسمين"] }]);

    // No template and a closed window: nothing can be sent, it retries, then stops after 3 tries.
    const other = "t-r3";
    await seed(other, { date: "2026-11-10", time: "16:00" });
    await saveReminderSettings(other, { enabled: true, hoursBefore: 24 });
    const results = [] as Array<{ sent: number; failed: number }>;
    for (let i = 0; i < 5; i += 1) results.push(await sendVisitReminders(new Date(NOW.getTime() + i * 60_000)));
    expect(results.map((result) => result.failed).filter((n) => n > 0).length).toBe(3);
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(0);
  });

  it("skips cancelled visits, disabled workspaces and visits without a phone", async () => {
    const { saveReminderSettings, sendVisitReminders } = await import("../lib/crm-visit-reminders");
    const { updateVisitStatus } = await import("../lib/crm-visits");
    const cancelled = await seed("t-r4", { date: "2026-11-10", time: "14:00" });
    await updateVisitStatus("t-r4", cancelled.id, "ملغي");
    await saveReminderSettings("t-r4", { enabled: true, hoursBefore: 24 });
    await seed("t-r5", { date: "2026-11-10", time: "14:00" }); // reminders left off for this workspace
    expect(await sendVisitReminders(NOW)).toEqual({ sent: 0, failed: 0 });
    expect(texts).toHaveLength(0);
  });
});

describe("renderReminder", () => {
  it("fills the wording and drops the project when there is none", async () => {
    const { renderReminder } = await import("../lib/crm-visit-reminders");
    expect(renderReminder("", { name: "فهد", project: "", day: "غدًا", time: "17:00" })).toBe("هلا فهد 🌷 تذكير بموعد زيارتك غدًا الساعة 17:00. بانتظارك بإذن الله، وإذا تحتاج تغيّر الموعد قل لنا.");
    expect(renderReminder("{name}: {day} {time}", { name: "", project: "x", day: "اليوم", time: "09:00" })).toBe("عميلنا: اليوم 09:00");
  });
});
