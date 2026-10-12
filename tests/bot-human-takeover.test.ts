import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-bot-human-takeover.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("the AI step stops once a person has replied", () => {
  it("tells people apart from the bot and system notes", async () => {
    const { isHumanAuthor } = await import("../lib/bot-engine");
    expect(isHumanAuthor("نورة القحطاني")).toBe(true);
    for (const author of ["", "نظام", "الرد الآلي", "Linkly", "Google Business", "  ", null, undefined]) expect(isHumanAuthor(author)).toBe(false);
  });

  it("reports a team reply in the conversation", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { humanHasJoined } = await import("../lib/bot-engine");
    await ensureSchema();
    await prisma.customer.create({ data: { id: "cust-h", name: "عميل", phone: "966500000900", initial: "ع", tenantId: "ten-h" } });
    await prisma.conversation.create({ data: { id: "conv-h", customerId: "cust-h", channel: "whatsapp", lastMessage: "x", status: "unassigned", assignee: "بدون موظف", tenantId: "ten-h" } });
    const base = { conversationId: "conv-h", time: "10:00", createdAt: new Date().toISOString() };
    await prisma.message.create({ data: { id: "m1", ...base, direction: "out", text: "ترحيب", author: "نظام" } });
    await prisma.message.create({ data: { id: "m2", ...base, direction: "out", text: "رد آلي", author: "الرد الآلي" } });
    await prisma.message.create({ data: { id: "m3", ...base, direction: "in", text: "سؤال", author: "عميل" } });
    expect(await humanHasJoined("conv-h")).toBe(false);
    await prisma.message.create({ data: { id: "m4", ...base, direction: "out", text: "هلا أنا سارة", author: "سارة" } });
    expect(await humanHasJoined("conv-h")).toBe(true);
  });
});
