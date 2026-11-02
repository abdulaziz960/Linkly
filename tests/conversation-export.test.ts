import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-conversation-export.db");
let currentUser: Record<string, unknown> | null = null;

vi.mock("../lib/auth", () => ({ authCookieName: "audiencew_session", getCurrentUser: async () => currentUser }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

describe("period", () => {
  it("accepts a valid period and refuses a missing, reversed or too long one", async () => {
    const { exportPeriod } = await import("../lib/conversation-export");
    const ok = exportPeriod("2026-11-01", "2026-11-07");
    expect(ok).toMatchObject({ from: "2026-11-01", to: "2026-11-07", start: "2026-10-31T21:00:00.000Z" });
    expect(exportPeriod("", "2026-11-07")).toHaveProperty("error");
    expect(exportPeriod("2026-11-08", "2026-11-07")).toHaveProperty("error");
    expect(exportPeriod("2026-01-01", "2026-12-31")).toHaveProperty("error");
    expect(exportPeriod("not-a-date", "2026-11-07")).toHaveProperty("error");
  });
});

describe("export route", () => {
  async function seed() {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    const tenantId = "tenant-export";
    const now = "2026-11-02T09:00:00.000Z";
    for (const [suffix, assignee] of [["a", "سارة"], ["b", "خالد"]] as const) {
      await prisma.customer.create({ data: { id: `cust-${suffix}`, name: `عميل ${suffix}`, phone: `96650000000${suffix === "a" ? 1 : 2}`, initial: "ع", tenantId } });
      await prisma.conversation.create({ data: { id: `conv-${suffix}`, customerId: `cust-${suffix}`, channel: "whatsapp", lastMessage: "x", status: "assigned", assignee, tenantId, lastActivityAt: now } });
      await prisma.conversationTag.create({ data: { conversationId: `conv-${suffix}`, tagName: "مهم" } });
      await prisma.message.createMany({ data: [
        { id: `m1-${suffix}`, conversationId: `conv-${suffix}`, direction: "in", text: `مرحبا <b>${suffix}</b>`, time: "09:00", createdAt: now },
        { id: `m2-${suffix}`, conversationId: `conv-${suffix}`, direction: "out", text: "أهلًا", time: "09:01", createdAt: "2026-11-02T09:01:00.000Z", author: assignee },
        { id: `m3-${suffix}`, conversationId: `conv-${suffix}`, direction: "note", text: "ملاحظة سرية", time: "09:02", createdAt: "2026-11-02T09:02:00.000Z", author: assignee },
        { id: `m4-${suffix}`, conversationId: `conv-${suffix}`, direction: "in", text: "قديمة", time: "09:00", createdAt: "2026-09-01T09:00:00.000Z" }
      ] });
    }
    await prisma.employee.create({ data: { id: "emp-sara", name: "سارة", email: "sara@example.com", role: "موظف دعم", status: "متصل", permissions: "", initial: "س", tenantId } });
    return tenantId;
  }
  const get = (query: string) => new NextRequest(`http://localhost/api/conversations/export?${query}`);

  it("exports only what the person may see, keeps notes out unless asked, and escapes message text", async () => {
    const tenantId = await seed();
    const route = await import("../app/api/conversations/export/route");
    const owner = { id: "u-owner", name: "مالك", email: "owner@example.com", role: "مالك الحساب", tenantId, isPlatformAdmin: 0, sessionVersion: 0, disabled: 0, subscriptionExpired: false };

    currentUser = owner;
    const all = await route.GET(get("from=2026-11-01&to=2026-11-07&format=pdf"));
    expect(all.status).toBe(200);
    const html = await all.text();
    expect(html).toContain("عميل a");
    expect(html).toContain("عميل b");
    expect(html).toContain("المسؤول: سارة");
    expect(html).not.toContain("ملاحظة سرية");
    expect(html).not.toContain("قديمة");
    expect(html).toContain("&lt;b&gt;a&lt;/b&gt;");
    expect(html).not.toContain("<b>a</b>");

    // A customer who wrote on several days (and on another channel) reads as one thread with the date written above each day.
    const { prisma } = await import("../lib/prisma");
    await prisma.conversation.create({ data: { id: "conv-a2", customerId: "cust-a", channel: "instagram", lastMessage: "x", status: "assigned", assignee: "سارة", tenantId, lastActivityAt: "2026-11-04T09:00:00.000Z" } });
    await prisma.message.create({ data: { id: "m1-a2", conversationId: "conv-a2", direction: "in", text: "رجعت أسأل بعد يومين", time: "09:00", createdAt: "2026-11-04T09:00:00.000Z" } });
    const merged = await (await route.GET(get("from=2026-11-01&to=2026-11-07&format=pdf"))).text();
    expect(merged.match(/<h2>عميل a<\/h2>/g)).toHaveLength(1);
    expect(merged).toContain("واتساب، إنستغرام");
    expect(merged.match(/class="day"/g)!.length).toBeGreaterThanOrEqual(3);
    expect(merged.indexOf("أهلًا")).toBeLessThan(merged.indexOf("رجعت أسأل بعد يومين"));
    expect(merged).toContain("نوفمبر 2026");

    const withNotes = await (await route.GET(get("from=2026-11-01&to=2026-11-07&format=pdf&notes=1"))).text();
    expect(withNotes).toContain("ملاحظة سرية");

    // An employee gets only the conversations assigned to them.
    currentUser = { ...owner, id: "u-sara", name: "سارة", email: "sara@example.com", role: "موظف دعم" };
    const mine = await (await route.GET(get("from=2026-11-01&to=2026-11-07&format=pdf"))).text();
    expect(mine).toContain("عميل a");
    expect(mine).not.toContain("عميل b");

    const book = await route.GET(get("from=2026-11-01&to=2026-11-07&format=xlsx"));
    expect(book.headers.get("content-type")).toContain("spreadsheetml");
    expect((await book.arrayBuffer()).byteLength).toBeGreaterThan(1000);

    expect((await route.GET(get("from=2026-11-08&to=2026-11-01"))).status).toBe(400);
    currentUser = null;
    expect((await route.GET(get("from=2026-11-01&to=2026-11-07"))).status).toBe(401);
  });
});
