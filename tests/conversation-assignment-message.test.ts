import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-assignment-message.db");
const tenantId = "tenant-assignment-message";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function seedConversation(id: string) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const customerId = `cust-${id}`;
  await prisma.customer.create({ data: { id: customerId, name: "Test customer", phone: "966500000000", initial: "T", tenantId } });
  await prisma.conversation.create({
    data: { id, customerId, channel: "whatsapp", lastMessage: "", status: "unassigned", assignee: "بدون موظف", tenantId }
  });
}

describe("logAssignmentMessage", () => {
  it("writes an in-thread system note attributing the assignment to the assigning person", async () => {
    const { prisma } = await import("../lib/prisma");
    const { logAssignmentMessage } = await import("../lib/conversation-system-messages");
    await seedConversation("conv-assign-manual");

    await logAssignmentMessage({ conversationId: "conv-assign-manual", tenantId, assignee: "نورة أحمد", assignedBy: "عبدالعزيز" });

    const messages = await prisma.message.findMany({ where: { conversationId: "conv-assign-manual" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].direction).toBe("note");
    expect(messages[0].sourceType).toBe("system_assignment");
    expect(messages[0].text).toBe("تم إسناد هذه المحادثة إلى نورة أحمد بواسطة عبدالعزيز.");
  });

  it("attributes an automatic (bot/automation) assignment to the system instead of a person", async () => {
    const { prisma } = await import("../lib/prisma");
    const { logAssignmentMessage } = await import("../lib/conversation-system-messages");
    await seedConversation("conv-assign-auto");

    await logAssignmentMessage({ conversationId: "conv-assign-auto", tenantId, assignee: "فريق المبيعات", assignedBy: "" });

    const messages = await prisma.message.findMany({ where: { conversationId: "conv-assign-auto" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe("تم إسناد هذه المحادثة إلى فريق المبيعات تلقائيًا بواسطة النظام.");
  });

  it("does not write a message when unassigning or when the assignee is empty", async () => {
    const { prisma } = await import("../lib/prisma");
    const { logAssignmentMessage } = await import("../lib/conversation-system-messages");
    await seedConversation("conv-assign-unassign");

    await logAssignmentMessage({ conversationId: "conv-assign-unassign", tenantId, assignee: "بدون موظف", assignedBy: "عبدالعزيز" });
    await logAssignmentMessage({ conversationId: "conv-assign-unassign", tenantId, assignee: "", assignedBy: "عبدالعزيز" });

    const messages = await prisma.message.findMany({ where: { conversationId: "conv-assign-unassign" } });
    expect(messages).toHaveLength(0);
  });
});
