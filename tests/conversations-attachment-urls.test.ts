import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-conversations-attachments.db");
const tenantId = "tenant-attachment-urls-test";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
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

describe("getConversations attachment urls", () => {
  it("replaces inline base64 media with a short url and leaves external urls alone", async () => {
    const { ensureSchema, getConversations } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();

    const bigDataUrl = `data:image/png;base64,${Buffer.alloc(300_000, 1).toString("base64")}`;
    await prisma.customer.create({ data: { id: "cust-1", name: "Test", phone: "0500000000", initial: "T", tenantId } });
    await prisma.conversation.create({ data: { id: "conv-1", customerId: "cust-1", lastMessage: "x", status: "open", assignee: "بدون موظف", tenantId, lastActivityAt: new Date().toISOString() } });
    await prisma.message.createMany({
      data: [
        { id: "msg-inline", conversationId: "conv-1", direction: "in", text: "pic", time: "10:00", createdAt: new Date().toISOString(), attachmentType: "image", attachmentUrl: bigDataUrl, attachmentName: "a.png", attachmentMime: "image/png" },
        { id: "msg-external", conversationId: "conv-1", direction: "in", text: "cdn", time: "10:01", createdAt: new Date().toISOString(), attachmentType: "image", attachmentUrl: "https://cdn.example.test/a.png", attachmentName: "b.png", attachmentMime: "image/png" }
      ]
    });

    const [conversation] = await getConversations(tenantId);
    const inline = conversation.messages.find((m) => m.id === "msg-inline");
    const external = conversation.messages.find((m) => m.id === "msg-external");

    expect(inline?.attachment?.url).toBe("/api/conversations/conv-1/messages/msg-inline/attachment");
    expect(external?.attachment?.url).toBe("https://cdn.example.test/a.png");
    expect(JSON.stringify(conversation).length).toBeLessThan(5_000);
  });
});
