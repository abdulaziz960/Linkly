import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-crm-reports.db");
const tenantId = "t-report";

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

const NOW = new Date("2026-11-10T09:00:00Z"); // Riyadh 12:00 on the 10th

describe("visit report", () => {
  it("counts attendance, no-shows, cancellations and sales by project and employee", async () => {
    const { prisma } = await import("../lib/prisma");
    const { bookVisit, updateVisitStatus } = await import("../lib/crm-visits");
    const { getVisitReport } = await import("../lib/crm-reports");
    const book = async (n: number, input: { date: string; project: string; employee: string; by: string; stage?: string; status?: string }) => {
      const id = `0${n}`;
      await prisma.customer.create({ data: { id: `c-${id}`, tenantId, name: `عميل ${id}`, phone: `9665000000${id}`, initial: "ع" } });
      await prisma.conversation.create({ data: { id: `v-${id}`, tenantId, customerId: `c-${id}`, channel: "whatsapp", status: "assigned", assignee: input.employee, lastMessage: "x", pipelineStage: input.stage ?? "مهتم" } });
      const booked = await bookVisit({ tenantId, date: input.date, time: "10:00", customerName: `عميل ${id}`, customerPhone: `9665000000${id}`, conversationId: `v-${id}`, projectName: input.project, bookedBy: input.by, employee: input.employee, now: new Date("2026-09-01T06:00:00Z") });
      if (!booked.ok) throw new Error(booked.message);
      if (input.status) await updateVisitStatus(tenantId, booked.visit.id, input.status);
    };
    await book(1, { date: "2026-11-05", project: "الياسمين", employee: "عزام", by: "الذكاء الاصطناعي", status: "تم الحضور", stage: "فاز" }); // came and bought
    await book(2, { date: "2026-11-06", project: "الياسمين", employee: "عزام", by: "عزام", status: "تم الحضور" }); // came, did not buy
    await book(3, { date: "2026-11-07", project: "النخيل", employee: "سارة", by: "سارة", status: "لم يحضر" });
    await book(4, { date: "2026-11-08", project: "النخيل", employee: "سارة", by: "الذكاء الاصطناعي", status: "ملغي" });
    await book(5, { date: "2026-11-09", project: "", employee: "", by: "عزام" }); // still booked
    await book(6, { date: "2026-10-01", project: "الياسمين", employee: "عزام", by: "عزام", status: "تم الحضور", stage: "فاز" }); // outside the range

    const report = await getVisitReport(tenantId, 14, NOW);
    expect(report.from).toBe("2026-10-28");
    expect(report.to).toBe("2026-11-10");
    expect(report.totals).toEqual({ booked: 5, attended: 2, noShow: 1, cancelled: 1, sold: 1, byAi: 1, byStaff: 3 });
    expect(report.attendanceRate).toBeCloseTo(2 / 3);
    expect(report.saleRate).toBeCloseTo(1 / 2);
    expect(report.byProject).toEqual([
      { name: "الياسمين", booked: 2, attended: 2, noShow: 0, cancelled: 0, sold: 1 },
      { name: "النخيل", booked: 2, attended: 0, noShow: 1, cancelled: 1, sold: 0 },
      { name: "بدون مشروع", booked: 1, attended: 0, noShow: 0, cancelled: 0, sold: 0 }
    ]);
    expect(report.byEmployee.find((row) => row.name === "عزام")).toEqual({ name: "عزام", booked: 2, attended: 2, noShow: 0, cancelled: 0, sold: 1 });
    expect(report.byEmployee.find((row) => row.name === "سارة")).toMatchObject({ booked: 2, noShow: 1, cancelled: 1 });
    expect(report.byEmployee.find((row) => row.name === "بدون موظف")).toMatchObject({ booked: 1 });
  });

  it("is empty and rate-free for a workspace with no visits, and isolated per workspace", async () => {
    const { getVisitReport } = await import("../lib/crm-reports");
    const report = await getVisitReport("t-report-empty", 30, NOW);
    expect(report.totals).toMatchObject({ booked: 0, attended: 0, sold: 0 });
    expect(report.attendanceRate).toBeNull();
    expect(report.saleRate).toBeNull();
    expect(report.byProject).toEqual([]);
  });
});
