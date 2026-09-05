import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-quick-reply-clustering.db");
const tenantId = "tenant-quick-reply-clustering-test";

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

async function seedOutgoingMessages(conversationId: string, texts: string[]) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();

  await prisma.customer.upsert({
    where: { id: `cust-${conversationId}` },
    update: {},
    create: { id: `cust-${conversationId}`, name: "عميل", phone: `visitor-${conversationId}`, initial: "ع", tenantId }
  });
  await prisma.conversation.upsert({
    where: { id: conversationId },
    update: {},
    create: {
      id: conversationId,
      customerId: `cust-${conversationId}`,
      channel: "website",
      lastMessage: "",
      status: "open",
      assignee: "",
      tenantId
    }
  });

  for (const [index, text] of texts.entries()) {
    await prisma.message.create({
      data: {
        id: `${conversationId}-msg-${index}`,
        conversationId,
        direction: "out",
        text,
        time: "10:00",
        createdAt: new Date(Date.now() - index * 1000).toISOString()
      }
    });
  }
}

describe("syncAutomaticQuickReplies clustering", () => {
  it("groups differently-worded replies with the same meaning into one auto quick reply", async () => {
    const { syncAutomaticQuickReplies } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");

    await seedOutgoingMessages("conv-cluster-a", [
      "شكراً جزيلاً على تواصلكم معنا، نتشرف بخدمتكم دائماً",
      "شكرا كثير على تواصلكم معنا، نتشرف بخدمتكم دائما",
      "شكراً جزيلا على تواصلكم معنا نتشرف بخدمتكم دائماً"
    ]);

    await syncAutomaticQuickReplies(tenantId);

    const autoReplies = await prisma.quickReply.findMany({ where: { tenantId, id: { startsWith: "qr-auto-" } } });
    expect(autoReplies).toHaveLength(1);
    expect(autoReplies[0].usage).toBe(3);
  });

  it("does not create a duplicate for a rephrasing of an already-existing quick reply", async () => {
    const { syncAutomaticQuickReplies } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");

    await prisma.quickReply.create({
      data: {
        id: "qr-manual-existing",
        tenantId,
        shortcut: "/رصيد",
        text: "رصيدك الحالي يظهر في صفحة الحساب، تقدر تراجعه بأي وقت",
        team: "",
        usage: 0
      }
    });

    await seedOutgoingMessages("conv-cluster-existing", [
      "رصيدكم الحالي يظهر بصفحة الحساب وتقدرون تراجعونه أي وقت",
      "رصيدك الحالي يبان في صفحة الحساب، تقدر تشوفه أي وقت",
      "رصيدك الحالي موجود في صفحة الحساب وتقدر تراجعه في أي وقت"
    ]);

    await syncAutomaticQuickReplies(tenantId);

    const autoReplies = await prisma.quickReply.findMany({ where: { tenantId, id: { startsWith: "qr-auto-" } } });
    // Only the unrelated cluster from the previous test should exist - none
    // of these near-duplicates of the manual "رصيد" reply should be added.
    expect(autoReplies).toHaveLength(1);
  });
});
