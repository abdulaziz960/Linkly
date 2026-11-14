import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-leads-import.db");
const session = { id: "owner-1", tenantId: "t-import", role: "مالك الحساب", name: "المالك" };
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => session) }));

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  await (await import("../lib/database")).ensureSchema();
});
afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

// A Zoho-style export: Arabic headers, a mobile and a landline column, quoted cells with commas, a repeated number.
const CSV = [
  "مُعرف السجل,الاسم الأول,اسم العائلة,العميل المحتمل Name,البريد الإلكتروني,هاتف,الهاتف المحمول,مصدر العميل المحتمل,حالة العميل المحتمل,اسم المشروع,وقت الإنشاء",
  '1,,"علي, الغامدي",علي الغامدي,ali@example.com,,+966 53 922 0332,TikTok Ads,غير مهتم,خام 19,2026-04-30 14:26:01',
  "2,شار,أحمد,شار أحمد,,+966561613431,,Snap Ads,غير مهتم,خام 18,2026-05-08 09:16:35",
  "3,,,سعد,,,0552633380,TikTok Ads,مهتم,خام 19,",
  "4,,,سعد مكرر,,,055 263 3380,TikTok Ads,مهتم,خام 19,",
  "5,,,بدون رقم,x@example.com,,,TikTok Ads,جديد,خام 19,",
  "6,,,رقم خطأ,,,12345,TikTok Ads,جديد,خام 19,",
  "7,,,حالة غريبة,,,0501234567,Snap Ads,عميل كبير بالعمر,خام 18,"
].join("\n");

describe("leads file import", () => {
  it("reads quoted CSV cells and finds the columns by their Arabic or English names", async () => {
    const { analyzeTable, parseCsv } = await import("../lib/leads-import");
    expect(parseCsv('a,"b, c","d ""q"""\n1,2,3')).toEqual([["a", "b, c", 'd "q"'], ["1", "2", "3"]]);
    const analysis = analyzeTable(parseCsv(CSV));
    expect(analysis.total).toBe(7);
    expect(analysis.valid.map((row) => row.phone)).toEqual(["966539220332", "966561613431", "966552633380", "966501234567"]);
    expect(analysis.valid[0]).toMatchObject({ name: "علي الغامدي", email: "ali@example.com", status: "غير مهتم", project: "خام 19", source: "TikTok Ads" });
    expect(analysis.duplicates).toBe(1);
    expect(analysis.invalid.map((row) => row.line)).toEqual([6, 7]);
    expect(analysis.statuses).toEqual([{ value: "غير مهتم", count: 2 }, { value: "مهتم", count: 1 }, { value: "عميل كبير بالعمر", count: 1 }]);
  });

  it("maps a status to the stage of the same name or its usual meaning", async () => {
    const { suggestStage } = await import("../lib/leads-import");
    const stages = ["جديد", "مهتم", "مؤهل", "عرض سعر", "تم الحجز", "فاز", "خسر"];
    expect(suggestStage("غير مهتم", stages)).toBe("خسر");
    expect(suggestStage("مهتم", stages)).toBe("مهتم");
    expect(suggestStage("تم البيع", stages)).toBe("فاز");
    expect(suggestStage("عميل كبير بالعمر", stages)).toBe("جديد");
    expect(suggestStage("", stages)).toBe("جديد");
  });

  it("saves customers and leads in the file's stage, with project and source, without opening a conversation to anyone", async () => {
    const { POST } = await import("../app/api/customers/import/route");
    const send = (mode: string, stageMap?: Record<string, string>) => {
      const body = new FormData();
      body.set("file", new File([CSV], "leads.csv", { type: "text/csv" }));
      body.set("mode", mode);
      if (stageMap) body.set("stageMap", JSON.stringify(stageMap));
      return POST(new NextRequest("http://localhost/api/customers/import", { method: "POST", body }));
    };

    const preview = await (await send("preview")).json();
    expect(preview.data).toMatchObject({ total: 7, valid: 4, duplicates: 1, invalidCount: 2 });
    expect(preview.data.statuses.find((item: { value: string }) => item.value === "غير مهتم").stage).toBe("خسر");

    const committed = await (await send("commit", { "عميل كبير بالعمر": "مؤهل" })).json();
    expect(committed.data).toMatchObject({ created: 4, existing: 0, failed: 0 });

    const { prisma } = await import("../lib/prisma");
    const customers = await prisma.customer.findMany({ where: { tenantId: "t-import" } });
    expect(customers).toHaveLength(4);
    const lost = await prisma.conversation.findMany({ where: { tenantId: "t-import", pipelineStage: "خسر" } });
    expect(lost).toHaveLength(2);
    const all = await prisma.conversation.findMany({ where: { tenantId: "t-import" } });
    expect(all.every((conversation) => conversation.status === "closed" && conversation.unread === 0 && conversation.assignee === "بدون موظف")).toBe(true);
    expect(all.find((conversation) => conversation.pipelineStage === "مؤهل")).toBeTruthy();
    expect(await prisma.message.count({ where: { conversationId: { in: all.map((conversation) => conversation.id) } } })).toBe(0);
    const lead = await prisma.lead.findFirst({ where: { tenantId: "t-import", phone: "966539220332" } });
    expect(lead).toMatchObject({ formName: "خام 19", source: "TikTok Ads", email: "ali@example.com" });
    expect(JSON.parse(lead!.answersJson)).toContainEqual({ question: "الحالة في النظام السابق", answer: "غير مهتم" });

    // Uploading the same file again changes nothing.
    const again = await (await send("commit")).json();
    expect(again.data).toMatchObject({ created: 0, existing: 4 });
    expect(await prisma.customer.count({ where: { tenantId: "t-import" } })).toBe(4);
  });

  it("is for the owner and supervisors only, and needs a phone column", async () => {
    const { POST } = await import("../app/api/customers/import/route");
    const previous = session.role;
    const post = (csv: string) => {
      const body = new FormData();
      body.set("file", new File([csv], "x.csv"));
      body.set("mode", "preview");
      return POST(new NextRequest("http://localhost/api/customers/import", { method: "POST", body }));
    };
    session.role = "موظف دعم";
    expect((await post(CSV)).status).toBe(403);
    session.role = previous;
    expect((await post("الاسم,الحالة\nعلي,جديد")).status).toBe(400);
  });
});
