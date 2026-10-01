import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-response-sla.db");
const tenantId = "tenant-response-sla";

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

const OLD_ENOUGH = new Date(Date.now() - 40 * 60000).toISOString();

async function seedConversation(params: { id: string; assignee: string; lastDirection: "in" | "out"; lastActivityAt?: string }) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();

  const customerId = `cust-${params.id}`;
  await prisma.customer.create({ data: { id: customerId, name: "عميل تجريبي", phone: "966500000000", initial: "ع", tenantId } });
  const activityAt = params.lastActivityAt ?? OLD_ENOUGH;
  await prisma.conversation.create({
    data: {
      id: params.id,
      customerId,
      channel: "whatsapp",
      lastMessage: "مرحبا",
      status: params.assignee === "بدون موظف" ? "unassigned" : "assigned",
      assignee: params.assignee,
      lastActivityAt: activityAt,
      tenantId
    }
  });
  await prisma.message.create({
    data: {
      id: `msg-${params.id}`,
      conversationId: params.id,
      direction: params.lastDirection,
      text: "مرحبا",
      time: "00:00",
      createdAt: activityAt
    }
  });
}

describe("escalateUnansweredConversations", () => {
  it("escalates a conversation whose last (inbound) message has gone unanswered past the SLA window", async () => {
    const { prisma } = await import("../lib/prisma");
    const { escalateUnansweredConversations } = await import("../lib/response-sla");
    await seedConversation({ id: "conv-sla-unanswered", assignee: "بدون موظف", lastDirection: "in" });

    const result = await escalateUnansweredConversations();
    expect(result.escalated).toBeGreaterThanOrEqual(1);

    const conversation = await prisma.conversation.findUnique({ where: { id: "conv-sla-unanswered" } });
    expect(conversation?.escalatedForMessageId).toBe("msg-conv-sla-unanswered");

    const messages = await prisma.message.findMany({ where: { conversationId: "conv-sla-unanswered", sourceType: "system_escalation" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toContain("تم تصعيد هذه المحادثة تلقائيًا لعدم الرد خلال 30 دقيقة");
  });

  it("still reports isEscalated true after escalating, even though the escalation note itself is now the newest message", async () => {
    const { getConversations } = await import("../lib/database");
    const { escalateUnansweredConversations } = await import("../lib/response-sla");
    await seedConversation({ id: "conv-sla-still-flagged", assignee: "بدون موظف", lastDirection: "in" });

    await escalateUnansweredConversations();

    const conversations = await getConversations(tenantId);
    const conversation = conversations.find((item) => item.id === "conv-sla-still-flagged");
    expect(conversation?.isEscalated).toBe(true);
  });

  it("still escalates when a system note (e.g. an assignment note) landed after the customer's unanswered message", async () => {
    const { prisma } = await import("../lib/prisma");
    const { escalateUnansweredConversations } = await import("../lib/response-sla");
    await seedConversation({ id: "conv-sla-note-after", assignee: "بدون موظف", lastDirection: "in" });
    await prisma.message.create({
      data: {
        id: "note-after-inbound",
        conversationId: "conv-sla-note-after",
        direction: "note",
        text: "تم إسناد هذه المحادثة إلى موظف تلقائيًا بواسطة النظام.",
        time: "00:05",
        createdAt: new Date(Date.now() - 39 * 60000).toISOString(),
        sourceType: "system_assignment"
      }
    });

    const result = await escalateUnansweredConversations();
    expect(result.escalated).toBeGreaterThanOrEqual(1);

    const conversation = await prisma.conversation.findUnique({ where: { id: "conv-sla-note-after" } });
    expect(conversation?.escalatedForMessageId).toBe("msg-conv-sla-note-after");
  });

  it("does not escalate a conversation the agent already replied to (last message is outbound)", async () => {
    const { prisma } = await import("../lib/prisma");
    const { escalateUnansweredConversations } = await import("../lib/response-sla");
    await seedConversation({ id: "conv-sla-replied", assignee: "بدون موظف", lastDirection: "out" });

    await escalateUnansweredConversations();

    const conversation = await prisma.conversation.findUnique({ where: { id: "conv-sla-replied" } });
    expect(conversation?.escalatedForMessageId).toBe("");
  });

  it("does not re-escalate the same unanswered message on a later run", async () => {
    const { prisma } = await import("../lib/prisma");
    const { escalateUnansweredConversations } = await import("../lib/response-sla");
    await seedConversation({ id: "conv-sla-dedup", assignee: "بدون موظف", lastDirection: "in" });

    await escalateUnansweredConversations();
    await escalateUnansweredConversations();

    const messages = await prisma.message.findMany({ where: { conversationId: "conv-sla-dedup", sourceType: "system_escalation" } });
    expect(messages).toHaveLength(1);
  });

  it("does not escalate a conversation still within the SLA window", async () => {
    const { prisma } = await import("../lib/prisma");
    const { escalateUnansweredConversations } = await import("../lib/response-sla");
    await seedConversation({ id: "conv-sla-fresh", assignee: "بدون موظف", lastDirection: "in", lastActivityAt: new Date().toISOString() });

    await escalateUnansweredConversations();

    const conversation = await prisma.conversation.findUnique({ where: { id: "conv-sla-fresh" } });
    expect(conversation?.escalatedForMessageId).toBe("");
  });

  it("resolves the assignee's team lead as an escalation target", async () => {
    const { prisma } = await import("../lib/prisma");
    const { findEscalationTargets } = await import("../lib/response-sla");

    await prisma.userAccount.create({
      data: { id: "user-sla-owner", name: "المالك", email: "owner-sla@test.sa", passwordHash: "x", role: "مالك الحساب", tenantId, createdAt: new Date().toISOString() }
    });
    await prisma.employee.create({ data: { id: "emp-sla-lead", name: "المشرف القائد", role: "مشرف", status: "متصل", permissions: "", email: "lead-sla@test.sa", initial: "م", tenantId, userId: "user-sla-lead" } });
    await prisma.employee.create({ data: { id: "emp-sla-agent", name: "موظف الدعم", role: "موظف دعم", status: "متصل", permissions: "", email: "agent-sla@test.sa", initial: "و", tenantId } });
    await prisma.team.create({ data: { id: "team-sla", tenantId, name: "فريق الدعم", lead: "المشرف القائد", routing: "تلقائي بالتساوي" } });
    await prisma.teamMember.create({ data: { teamId: "team-sla", employeeId: "emp-sla-agent" } });

    const targets = await findEscalationTargets(tenantId, "موظف الدعم");
    expect(targets).toEqual(expect.arrayContaining(["user-sla-owner", "user-sla-lead"]));
    expect(targets).toHaveLength(2);
  });
});
