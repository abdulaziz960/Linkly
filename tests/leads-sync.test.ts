import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-leads-sync.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "عبدالعزيز", email: "a@b.sa", tenantId: "tenant-leads", role: "مالك الحساب" }))
}));

describe("lead status = the stage on the leads page", () => {
  it("one field: the leads page and the conversation panel agree, and both send the TikTok event once", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    await prisma.customer.create({ data: { id: "cust-l1", name: "عميل", phone: "966500002222", initial: "ع", tenantId: "tenant-leads" } });
    await prisma.conversation.create({ data: { id: "conv-l1", customerId: "cust-l1", channel: "whatsapp", lastMessage: "", status: "unassigned", assignee: "بدون موظف", tenantId: "tenant-leads" } });

    const { saveTikTokAdsSettings, getLeadStatus } = await import("../lib/tiktok-events");
    await saveTikTokAdsSettings("tenant-leads", { eventSetId: "DB5QHHRC77U074LG3TQG", accessToken: "tok_" + "k".repeat(20), eventSource: "web", enabled: true });

    const sent: Array<{ event: string; value?: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { data: Array<{ event: string; properties: { value?: unknown } }> };
      sent.push({ event: body.data[0].event, value: body.data[0].properties.value });
      return new Response(JSON.stringify({ code: 0 }));
    }));

    // 1) moved on the leads page (PATCH /api/conversations/[id], what PipelineView calls)
    const { PATCH } = await import("../app/api/conversations/[id]/route");
    const moved = await PATCH(new NextRequest("http://localhost/api/conversations/conv-l1", { method: "PATCH", body: JSON.stringify({ pipelineStage: "مؤهل" }), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "conv-l1" }) });
    expect(moved.status).toBe(200);
    expect(await getLeadStatus("tenant-leads", "conv-l1")).toBe("مؤهل"); // the conversation panel reads the same stage
    expect(sent).toEqual([{ event: "Lead", value: undefined }]);

    // 2) changed from the conversation panel (PUT lead-status) - lands on the same field the leads page shows
    const { PUT } = await import("../app/api/conversations/[id]/lead-status/route");
    const won = await PUT(new NextRequest("http://localhost/api/conversations/conv-l1/lead-status", { method: "PUT", body: JSON.stringify({ status: "فاز", dealValue: 900 }), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "conv-l1" }) });
    expect(won.status).toBe(200);
    const row = await prisma.conversation.findUnique({ where: { id: "conv-l1" } });
    expect(row).toMatchObject({ pipelineStage: "فاز", dealValue: 900 });
    expect(sent.at(-1)).toEqual({ event: "Purchase", value: 900 });

    // 3) moving it back and forward again does not count the sale twice
    await PATCH(new NextRequest("http://localhost/api/conversations/conv-l1", { method: "PATCH", body: JSON.stringify({ pipelineStage: "مهتم" }), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "conv-l1" }) });
    await PATCH(new NextRequest("http://localhost/api/conversations/conv-l1", { method: "PATCH", body: JSON.stringify({ pipelineStage: "فاز" }), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "conv-l1" }) });
    expect(sent.filter((item) => item.event === "Purchase")).toHaveLength(1);
  });
});
