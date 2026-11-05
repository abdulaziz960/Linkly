import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-crm-visits.db");

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

// A fixed "now" (Riyadh noon, 2026-11-10) so the dates below never go stale.
const NOW = new Date("2026-11-10T09:00:00Z");
const book = async (tenantId: string, overrides: Record<string, unknown> = {}) => {
  const { bookVisit } = await import("../lib/crm-visits");
  return bookVisit({ tenantId, date: "2026-11-12", time: "17:00", customerName: "فهد", customerPhone: "966501112233", bookedBy: "الذكاء الاصطناعي", now: NOW, ...overrides } as never);
};

describe("visit schedule", () => {
  it("validates the date and time and refuses the past", async () => {
    expect(await book("t-v1", { date: "2026-13-01" })).toMatchObject({ ok: false, reason: "invalid_date" });
    expect(await book("t-v1", { time: "25:00" })).toMatchObject({ ok: false, reason: "invalid_time" });
    expect(await book("t-v1", { date: "2026-11-09" })).toMatchObject({ ok: false, reason: "past" });
    expect(await book("t-v1", { date: "2026-11-10", time: "10:00" })).toMatchObject({ ok: false, reason: "past" }); // earlier today
    expect(await book("t-v1", { customerName: "", customerPhone: "" })).toMatchObject({ ok: false, reason: "no_customer" });
    expect(await book("t-v1", { date: "2026-11-10", time: "20:00" })).toMatchObject({ ok: true }); // later today is fine
  });

  it("enforces the daily limit and never lets two bookings take the last place", async () => {
    const { saveVisitSettings, listVisits } = await import("../lib/crm-visits");
    expect(await saveVisitSettings("t-v2", 3)).toEqual({ ok: true, dailyLimit: 3 });
    expect(await saveVisitSettings("t-v2", 0)).toMatchObject({ ok: false });

    // Five customers race for 3 places.
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => book("t-v2", { customerPhone: `96650000000${n}`, customerName: `عميل ${n}` })));
    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect(results.filter((result) => !result.ok && result.reason === "day_full")).toHaveLength(2);
    expect(await listVisits("t-v2", { from: "2026-11-12", to: "2026-11-12" })).toHaveLength(3);
    // Another day is open, and another workspace is unaffected.
    expect(await book("t-v2", { date: "2026-11-13", customerPhone: "966500000009" })).toMatchObject({ ok: true });
    expect(await book("t-v3", { customerPhone: "966500000001" })).toMatchObject({ ok: true });
  });

  it("a cancelled visit gives its place back, and a customer cannot hold two visits in one day", async () => {
    const { saveVisitSettings, updateVisitStatus } = await import("../lib/crm-visits");
    await saveVisitSettings("t-v4", 1);
    const first = await book("t-v4", { customerPhone: "966501111111" });
    if (!first.ok) throw new Error(first.message);
    expect(await book("t-v4", { customerPhone: "966502222222" })).toMatchObject({ ok: false, reason: "day_full" });
    expect(await updateVisitStatus("t-v4", first.visit.id, "ملغي")).toEqual({ ok: true });
    expect(await updateVisitStatus("t-v4", first.visit.id, "غير صحيح")).toMatchObject({ ok: false });
    // A cancelled visit cannot silently take its place back (the day may be full by now).
    expect(await updateVisitStatus("t-v4", first.visit.id, "محجوز")).toMatchObject({ ok: false });
    const second = await book("t-v4", { customerPhone: "966502222222" });
    expect(second.ok).toBe(true);
    expect(await book("t-v4", { customerPhone: "966502222222", date: "2026-11-12", time: "19:00" })).toMatchObject({ ok: false, reason: "duplicate" });
  });

  it("a project can have its own limit that only counts its own visits", async () => {
    const { saveVisitSettings, availableDays } = await import("../lib/crm-visits");
    await saveVisitSettings("t-v5", 10);
    expect(await book("t-v5", { projectId: "p-a", projectName: "الياسمين", projectLimit: 1, customerPhone: "966503000001" })).toMatchObject({ ok: true });
    expect(await book("t-v5", { projectId: "p-a", projectName: "الياسمين", projectLimit: 1, customerPhone: "966503000002" })).toMatchObject({ ok: false, reason: "day_full", limit: 1 });
    // Another project (no limit of its own) still has the workspace's 10.
    expect(await book("t-v5", { projectId: "p-b", projectName: "النخيل", customerPhone: "966503000003" })).toMatchObject({ ok: true });

    const days = await availableDays("t-v5", { projectId: "p-a", projectLimit: 1, days: 3, now: NOW });
    expect(days.map((day) => day.date)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(days[2]).toMatchObject({ booked: 1, limit: 1, left: 0 });
    expect(days[0].left).toBe(1);
  });

  it("finds a customer's upcoming visit by phone or conversation", async () => {
    const { upcomingVisitForCustomer } = await import("../lib/crm-visits");
    await book("t-v6", { customerPhone: "966504000001", conversationId: "conv-x" });
    expect(await upcomingVisitForCustomer("t-v6", { phone: "966504000001" }, NOW)).toMatchObject({ date: "2026-11-12", time: "17:00" });
    expect(await upcomingVisitForCustomer("t-v6", { conversationId: "conv-x" }, NOW)).toMatchObject({ date: "2026-11-12" });
    expect(await upcomingVisitForCustomer("t-v6", { phone: "966509999999" }, NOW)).toBeNull();
    expect(await upcomingVisitForCustomer("t-other", { phone: "966504000001" }, NOW)).toBeNull();
  });
});
