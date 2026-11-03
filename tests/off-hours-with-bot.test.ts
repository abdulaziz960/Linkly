import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-off-hours-with-bot.db");

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

async function setup(tenantId: string) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  await prisma.customer.create({ data: { id: `c-${tenantId}`, name: "عميل", phone: "966500000777", initial: "ع", tenantId } });
  await prisma.conversation.create({ data: { id: `v-${tenantId}`, customerId: `c-${tenantId}`, channel: "website", lastMessage: "x", status: "unassigned", assignee: "بدون موظف", tenantId } });
  // An active schedule on no day at all: the workspace is always "closed".
  await prisma.workSchedule.create({ data: { id: `s-${tenantId}`, tenantId, team: "الكل", days: "-", start: "09:00", end: "17:00", status: "نشط", holidays: "" } });
  await prisma.tenantPreference.upsert({
    where: { tenantId },
    create: { tenantId, offHoursAutoReplyEnabled: 1, offHoursAutoReplyMessage: "نحن خارج الدوام", updatedAt: new Date().toISOString() },
    update: { offHoursAutoReplyEnabled: 1, offHoursAutoReplyMessage: "نحن خارج الدوام" }
  });
  return { prisma, conversationId: `v-${tenantId}` };
}

const notices = async (prisma: Awaited<ReturnType<typeof setup>>["prisma"], conversationId: string) =>
  (await prisma.message.findMany({ where: { conversationId, text: "نحن خارج الدوام" } })).length;

describe("the off-hours notice with a running bot", () => {
  it("is left to the bot when the channel has a bot flow, and sent once from it", async () => {
    const { prisma, conversationId } = await setup("t-bot");
    await prisma.botSettings.create({ data: { id: "bs1", tenantId: "t-bot", channel: "website", enabled: 1, updatedAt: "x" } });
    await prisma.botNode.create({ data: { id: "bn1", tenantId: "t-bot", channel: "website", position: 0, type: "رسالة", title: "ترحيب", content: "{}", createdAt: "x" } });
    const { checkOffHoursAutoReply } = await import("../lib/work-hours");

    await checkOffHoursAutoReply(conversationId, "t-bot");
    expect(await notices(prisma, conversationId)).toBe(0);

    await checkOffHoursAutoReply(conversationId, "t-bot", { fromBot: true });
    await checkOffHoursAutoReply(conversationId, "t-bot", { fromBot: true });
    expect(await notices(prisma, conversationId)).toBe(1);
  });

  it("is sent by the normal path when there is no bot, once a day", async () => {
    const { prisma, conversationId } = await setup("t-nobot");
    const { checkOffHoursAutoReply } = await import("../lib/work-hours");
    await checkOffHoursAutoReply(conversationId, "t-nobot");
    await checkOffHoursAutoReply(conversationId, "t-nobot");
    expect(await notices(prisma, conversationId)).toBe(1);
  });

  it("overlapping deliveries send it only once", async () => {
    const { prisma, conversationId } = await setup("t-race");
    const { checkOffHoursAutoReply } = await import("../lib/work-hours");
    await Promise.all([checkOffHoursAutoReply(conversationId, "t-race"), checkOffHoursAutoReply(conversationId, "t-race")]);
    expect(await notices(prisma, conversationId)).toBe(1);
  });
});
